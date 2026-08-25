package presenter

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ParsedSlide mirrors pptx-parser.ts's ParsedSlide shape.
type ParsedSlide struct {
	SlideNumber int
	Title       string
	Texts       []string
	Notes       string
}

var slideFileRe = regexp.MustCompile(`(?i)^ppt/slides/slide(\d+)\.xml$`)
var notesFileRe = regexp.MustCompile(`(?i)^ppt/notesSlides/notesSlide(\d+)\.xml$`)
var textRunRe = regexp.MustCompile(`(?s)<a:t[^>]*>(.*?)</a:t>`)

// parsePptxBuffer is a deliberate lightweight text scraper over the OOXML
// zip, not a structural PPTX parser — no shape/table/chart layout
// awareness, no image extraction. This matches
// apps-legacy/server/src/services/pptx-parser.ts's own documented
// limitation exactly (it uses a regex text-run scraper over JSZip, not a
// real XML parser either).
func parsePptxBuffer(data []byte) ([]ParsedSlide, error) {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("pptx: open zip: %w", err)
	}

	type slideFile struct {
		number int
		file   *zip.File
	}
	var slideFiles []slideFile
	notesFiles := make(map[int]*zip.File)

	for _, f := range zr.File {
		if m := slideFileRe.FindStringSubmatch(f.Name); m != nil {
			n, _ := strconv.Atoi(m[1])
			slideFiles = append(slideFiles, slideFile{number: n, file: f})
			continue
		}
		if m := notesFileRe.FindStringSubmatch(f.Name); m != nil {
			n, _ := strconv.Atoi(m[1])
			notesFiles[n] = f
		}
	}

	if len(slideFiles) == 0 {
		return nil, errors.New("no slides found in PPTX file")
	}

	sort.Slice(slideFiles, func(i, j int) bool { return slideFiles[i].number < slideFiles[j].number })

	slides := make([]ParsedSlide, 0, len(slideFiles))
	for _, sf := range slideFiles {
		xmlContent, err := readZipFile(sf.file)
		if err != nil {
			return nil, fmt.Errorf("pptx: read slide %d: %w", sf.number, err)
		}
		texts := extractTextRuns(xmlContent)

		notes := ""
		if nf, ok := notesFiles[sf.number]; ok {
			notesXML, err := readZipFile(nf)
			if err == nil {
				notes = strings.Join(extractTextRuns(notesXML), " ")
			}
		}

		title := ""
		if len(texts) > 0 {
			title = texts[0]
		}
		if title == "" {
			title = fmt.Sprintf("Slide %d", sf.number)
		}

		slides = append(slides, ParsedSlide{SlideNumber: sf.number, Title: title, Texts: texts, Notes: notes})
	}

	return slides, nil
}

func readZipFile(f *zip.File) (string, error) {
	rc, err := f.Open()
	if err != nil {
		return "", err
	}
	defer func() { _ = rc.Close() }()
	data, err := io.ReadAll(rc)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func extractTextRuns(xmlContent string) []string {
	matches := textRunRe.FindAllStringSubmatch(xmlContent, -1)
	texts := make([]string, 0, len(matches))
	for _, m := range matches {
		text := decodeXMLEntities(m[1])
		text = collapseWhitespace(text)
		if text != "" {
			texts = append(texts, text)
		}
	}
	return texts
}

func decodeXMLEntities(s string) string {
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", `"`)
	s = strings.ReplaceAll(s, "&apos;", "'")
	s = strings.ReplaceAll(s, "&amp;", "&")
	return s
}

var whitespaceRe = regexp.MustCompile(`\s+`)

func collapseWhitespace(s string) string {
	return strings.TrimSpace(whitespaceRe.ReplaceAllString(s, " "))
}

// detectFileType mirrors detectPresentationFileType — extension first,
// MIME substring fallback. Returns ("", false) for anything unrecognized.
// Callers that want the .ppt-rejected-at-upload deviation (see the
// Phase 1 plan) check the returned type themselves; this function stays a
// faithful, reusable primitive that still recognizes "ppt" the way
// legacy's detector does.
func detectFileType(fileName, mimeType string) (string, bool) {
	lower := strings.ToLower(fileName)
	switch {
	case strings.HasSuffix(lower, ".pptx"):
		return "pptx", true
	case strings.HasSuffix(lower, ".ppt"):
		return "ppt", true
	case strings.HasSuffix(lower, ".pdf"):
		return "pdf", true
	case strings.HasSuffix(lower, ".docx"):
		return "docx", true
	case strings.HasSuffix(lower, ".txt"):
		return "txt", true
	}

	mime := strings.ToLower(mimeType)
	switch {
	case strings.Contains(mime, "presentationml"):
		return "pptx", true
	case strings.Contains(mime, "application/vnd.ms-powerpoint"):
		return "ppt", true
	case strings.Contains(mime, "application/pdf"):
		return "pdf", true
	case strings.Contains(mime, "wordprocessingml"):
		return "docx", true
	case strings.HasPrefix(mime, "text/"):
		return "txt", true
	}

	return "", false
}
