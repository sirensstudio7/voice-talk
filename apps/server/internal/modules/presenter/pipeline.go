package presenter

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// pipelineRunner tracks in-flight processing runs per presentation via a
// real context.CancelFunc, rather than legacy's cooperative
// Set<string>-of-cancelled-ids polling — same cooperative-cancellation
// behavior (checked between steps via ctx.Err()), idiomatic Go instead of
// a hand-rolled flag. Like legacy, this is process-local: a multi-replica
// deployment would need a distributed lock instead (a known, documented
// limitation carried over intentionally — see the Phase 1 plan).
type pipelineRunner struct {
	mu      sync.Mutex
	running map[string]context.CancelFunc
}

func newPipelineRunner() *pipelineRunner {
	return &pipelineRunner{running: make(map[string]context.CancelFunc)}
}

// start registers presentationID as running, cancelling any prior run for
// the same id first when force is true. Returns the context to run with,
// and false if a run is already in flight and force is false (matching
// enqueuePresentationProcessing's silent no-op).
func (pr *pipelineRunner) start(presentationID string, force bool) (context.Context, bool) {
	pr.mu.Lock()
	defer pr.mu.Unlock()

	if cancel, ok := pr.running[presentationID]; ok {
		if !force {
			return nil, false
		}
		cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	pr.running[presentationID] = cancel
	return ctx, true
}

func (pr *pipelineRunner) finish(presentationID string) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	delete(pr.running, presentationID)
}

func (pr *pipelineRunner) cancel(presentationID string) {
	pr.mu.Lock()
	defer pr.mu.Unlock()
	if cancel, ok := pr.running[presentationID]; ok {
		cancel()
		delete(pr.running, presentationID)
	}
}

// enqueueProcessing fires the pipeline in the background — matches
// enqueuePresentationProcessing's fire-and-forget contract; callers get
// the just-updated (still "processing") presentation row immediately,
// not the finished result.
func (m *Module) enqueueProcessing(presentationID, businessID string, force bool) {
	ctx, ok := m.runner.start(presentationID, force)
	if !ok {
		return
	}
	go func() {
		defer m.runner.finish(presentationID)
		if err := m.processPresentation(ctx, presentationID, businessID); err != nil {
			if errors.Is(err, context.Canceled) {
				return // cancelPresentationProcessing already wrote the draft status
			}
			m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("presenter pipeline failed")
			_ = m.store.SetPresentationStatus(context.Background(), store.SetPresentationStatusParams{
				ID: presentationID, BusinessID: businessID, Status: "failed", ProcessingStep: "failed", ProcessingError: err.Error(),
			})
		}
	}()
}

func (m *Module) cancelProcessing(ctx context.Context, presentationID, businessID string) error {
	m.runner.cancel(presentationID)
	return m.store.SetPresentationStatus(ctx, store.SetPresentationStatusParams{
		ID: presentationID, BusinessID: businessID, Status: "draft", ProcessingStep: "", ProcessingError: "Preparation stopped.",
	})
}

// processPresentation is the pipeline: PPTX → parsed slides → deterministic
// scripts → "ready". Ported step-for-step from processPresentation in
// presentation-pipeline.ts (see the research notes in the Phase 1 plan) —
// notably, it makes zero LLM calls; scripts come from
// buildTalkingPointsFromSlide, not the (legacy-unused) LLM script
// generator.
func (m *Module) processPresentation(ctx context.Context, presentationID, businessID string) error {
	// Move off "queued" immediately so a hung download/parse can't look
	// stuck forever — same ordering rationale as legacy.
	if err := m.store.SetPresentationStatus(ctx, store.SetPresentationStatusParams{
		ID: presentationID, BusinessID: businessID, Status: "processing", ProcessingStep: "parsing",
	}); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	presentation, err := m.store.GetPresentation(ctx, store.GetPresentationParams{ID: presentationID, BusinessID: businessID})
	if err != nil {
		return err
	}

	files, err := m.store.ListPresentationFiles(ctx, presentationID)
	if err != nil {
		return err
	}
	primary, ok := pickPrimaryFile(files)
	if !ok {
		return errors.New("no presentation file uploaded")
	}

	slides, err := m.parsePrimaryFile(ctx, presentation, primary, files)
	if err != nil {
		return err
	}

	if err := ctx.Err(); err != nil {
		return err
	}
	if err := m.store.SetPresentationStatus(ctx, store.SetPresentationStatusParams{
		ID: presentationID, BusinessID: businessID, Status: "processing", ProcessingStep: "scripting",
	}); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	gc := buildDefaultGreetingClosing(presentation.Language, presentation.Title)

	if err := m.store.DeletePresentationSlides(ctx, presentationID); err != nil {
		return err
	}
	if err := m.store.DeleteNonKnowledgeEmbeddings(ctx, presentationID); err != nil {
		return err
	}

	var totalDuration int32
	inserted := make([]store.PresentationSlide, 0, len(slides))
	for _, ps := range slides {
		contentJSON, _ := marshalSlideContent(ps.Texts)
		script := buildTalkingPointsFromSlide(ps.Title, ps.Texts, ps.Notes)
		duration := estimateScriptDurationSeconds(script)
		totalDuration += duration

		row, err := m.store.CreatePresentationSlide(ctx, store.CreatePresentationSlideParams{
			ID: uuid.NewString(), PresentationID: presentationID, SlideNumber: int32(ps.SlideNumber),
			Title: ps.Title, ContentJson: contentJSON, Notes: ps.Notes, Script: script, DurationSeconds: duration,
		})
		if err != nil {
			return err
		}
		inserted = append(inserted, row)
	}

	if err := ctx.Err(); err != nil {
		return err
	}

	if err := m.store.CompletePresentationProcessing(ctx, store.CompletePresentationProcessingParams{
		ID: presentationID, BusinessID: businessID,
		GreetingScript: gc.Greeting, ClosingScript: gc.Closing,
		EstimatedDuration: totalDuration, TotalSlides: int32(len(inserted)),
	}); err != nil {
		return err
	}

	// Fire-and-forget: Q&A indexing runs after "ready" so it never blocks
	// the user-visible status transition — matches legacy exactly.
	// Thumbnail generation is cut in this phase (no Go equivalent to the
	// LibreOffice-backed renderer legacy uses — see the Phase 1 plan).
	go func() {
		indexCtx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()
		if err := m.indexPresentationContent(indexCtx, presentationID, inserted, files); err != nil {
			m.deps.Log.Error().Err(err).Str("presentation_id", presentationID).Msg("presenter Q&A indexing failed")
		}
	}()

	return nil
}

func pickPrimaryFile(files []store.PresentationFile) (store.PresentationFile, bool) {
	if len(files) == 0 {
		return store.PresentationFile{}, false
	}
	for _, f := range files {
		if f.FileType == "pptx" {
			return f, true
		}
	}
	for _, f := range files {
		if f.FileType == "txt" {
			return f, true
		}
	}
	return files[0], true
}

func findCompanionPptx(files []store.PresentationFile) (store.PresentationFile, bool) {
	for _, f := range files {
		if f.FileType == "pptx" {
			return f, true
		}
	}
	return store.PresentationFile{}, false
}

func (m *Module) parsePrimaryFile(ctx context.Context, presentation store.Presentation, primary store.PresentationFile, files []store.PresentationFile) ([]ParsedSlide, error) {
	switch primary.FileType {
	case "ppt":
		// Defense in depth — upload already rejects .ppt (see the Phase 1
		// plan's deliberate deviation), so this should be unreachable.
		return nil, errors.New("legacy .ppt is not supported. Please upload .pptx")

	case "pptx":
		return m.downloadAndParsePptx(ctx, primary.StoragePath)

	case "pdf", "docx":
		if companion, ok := findCompanionPptx(files); ok {
			return m.downloadAndParsePptx(ctx, companion.StoragePath)
		}
		data, err := m.downloadWithTimeout(ctx, primary.StoragePath)
		if err != nil {
			return nil, err
		}
		notes := string(data)
		if len(notes) > 4000 {
			notes = notes[:4000]
		}
		return []ParsedSlide{{
			SlideNumber: 1,
			Title:       fmt.Sprintf("Supporting document uploaded (%s)", primary.FileName),
			Notes:       notes,
		}}, nil

	default:
		data, err := m.downloadWithTimeout(ctx, primary.StoragePath)
		if err != nil {
			return nil, err
		}
		text := string(data)
		if len(text) > 8000 {
			text = text[:8000]
		}
		title := presentation.Title
		if title == "" {
			title = primary.FileName
		}
		return []ParsedSlide{{SlideNumber: 1, Title: title, Texts: []string{text}}}, nil
	}
}

func (m *Module) downloadAndParsePptx(ctx context.Context, storagePath string) ([]ParsedSlide, error) {
	data, err := m.downloadWithTimeout(ctx, storagePath)
	if err != nil {
		return nil, err
	}
	return parsePptxBuffer(data)
}

func (m *Module) downloadWithTimeout(ctx context.Context, storagePath string) ([]byte, error) {
	dlCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	return m.deps.Storage.Download(dlCtx, storagePath)
}

func marshalSlideContent(texts []string) (string, error) {
	if texts == nil {
		texts = []string{}
	}
	b, err := json.Marshal(slideContent{Texts: texts})
	return string(b), err
}
