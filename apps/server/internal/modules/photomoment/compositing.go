package photomoment

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png" // registers PNG decoding for image.Decode (branding assets)
	"strings"

	"github.com/rwcarlsen/goexif/exif"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"

	"github.com/sirensstudio7/voice-talk/apps/server/internal/store"
)

// Compositing constants. No libvips/CGo dependency — pure-Go image/draw +
// golang.org/x/image, per the Phase 1 plan's scope cuts.
const (
	maxCompositeWidth    = 1600
	compositeJPEGQuality = 90
	thumbnailWidth       = 480
	thumbnailJPEGQuality = 75
	logoWidthFraction    = 0.18
	logoOffsetFraction   = 0.04
	bannerHeightFraction = 0.12
	campaignTextMaxLen   = 80
)

// applyBranding decodes the guest's uploaded photo (correcting EXIF
// orientation), resizes it to a sane max width, and layers the business's
// frame/logo/campaign-text branding on top. logoBytes/frameBytes may each
// be nil, in which case that layer is skipped. Returns a re-encoded JPEG.
func applyBranding(raw []byte, settings store.PhotoSetting, logoBytes, frameBytes []byte) ([]byte, error) {
	img, err := decodeWithOrientation(raw)
	if err != nil {
		return nil, fmt.Errorf("decode photo: %w", err)
	}

	canvas := toNRGBA(capWidth(img, maxCompositeWidth))
	bounds := canvas.Bounds()

	if len(frameBytes) > 0 {
		if frame, _, err := image.Decode(bytes.NewReader(frameBytes)); err == nil {
			scaled := scaleTo(frame, bounds.Dx(), bounds.Dy())
			draw.Draw(canvas, bounds, scaled, image.Point{}, draw.Over)
		}
	}

	if len(logoBytes) > 0 {
		if logo, _, err := image.Decode(bytes.NewReader(logoBytes)); err == nil {
			logoW := int(float64(bounds.Dx()) * logoWidthFraction)
			logoH := logoW * logo.Bounds().Dy() / max(logo.Bounds().Dx(), 1)
			scaledLogo := scaleTo(logo, logoW, logoH)
			offsetX := int(float64(bounds.Dx()) * logoOffsetFraction)
			offsetY := int(float64(bounds.Dy()) * logoOffsetFraction)
			dstRect := image.Rect(offsetX, offsetY, offsetX+logoW, offsetY+logoH)
			draw.Draw(canvas, dstRect, scaledLogo, image.Point{}, draw.Over)
		}
	}

	if text := strings.TrimSpace(settings.CampaignText.String); text != "" {
		drawCampaignBanner(canvas, truncateRunes(text, campaignTextMaxLen))
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, canvas, &jpeg.Options{Quality: compositeJPEGQuality}); err != nil {
		return nil, fmt.Errorf("encode composited jpeg: %w", err)
	}
	return buf.Bytes(), nil
}

// makeThumbnail scales an already-composited JPEG down to a gallery-sized
// thumbnail.
func makeThumbnail(jpegBytes []byte) ([]byte, error) {
	img, err := jpeg.Decode(bytes.NewReader(jpegBytes))
	if err != nil {
		return nil, fmt.Errorf("decode for thumbnail: %w", err)
	}
	b := img.Bounds()
	h := thumbnailWidth * b.Dy() / max(b.Dx(), 1)
	thumb := scaleTo(img, thumbnailWidth, h)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, thumb, &jpeg.Options{Quality: thumbnailJPEGQuality}); err != nil {
		return nil, fmt.Errorf("encode thumbnail: %w", err)
	}
	return buf.Bytes(), nil
}

func drawCampaignBanner(canvas *image.NRGBA, text string) {
	b := canvas.Bounds()
	bannerH := int(float64(b.Dy()) * bannerHeightFraction)
	bannerRect := image.Rect(b.Min.X, b.Max.Y-bannerH, b.Max.X, b.Max.Y)
	draw.Draw(canvas, bannerRect, &image.Uniform{C: color.NRGBA{A: 160}}, image.Point{}, draw.Over)

	face := basicfont.Face7x13
	drawer := &font.Drawer{Dst: canvas, Src: image.NewUniform(color.White), Face: face}
	textWidth := drawer.MeasureString(text).Ceil()
	x := (b.Dx() - textWidth) / 2
	if x < 4 {
		x = 4
	}
	baseline := bannerRect.Min.Y + bannerH/2 + face.Height/2 - 2
	drawer.Dot = fixed.P(x, baseline)
	drawer.DrawString(text)
}

func truncateRunes(s string, maxLen int) string {
	r := []rune(s)
	if len(r) <= maxLen {
		return s
	}
	return string(r[:maxLen])
}

func scaleTo(src image.Image, w, h int) image.Image {
	w, h = max(w, 1), max(h, 1)
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	return dst
}

func capWidth(img image.Image, maxW int) image.Image {
	b := img.Bounds()
	if b.Dx() <= maxW {
		return img
	}
	h := maxW * b.Dy() / max(b.Dx(), 1)
	return scaleTo(img, maxW, h)
}

func toNRGBA(img image.Image) *image.NRGBA {
	b := img.Bounds()
	dst := image.NewNRGBA(b)
	draw.Draw(dst, b, img, b.Min, draw.Src)
	return dst
}

// decodeWithOrientation decodes an uploaded JPEG and corrects its pixel
// data for any EXIF orientation tag — most phone cameras write photos
// with orientation metadata rather than pre-rotated pixels, so skipping
// this would produce sideways/mirrored output for real users.
func decodeWithOrientation(raw []byte) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	orientation := readExifOrientation(raw)
	if orientation <= 1 {
		return img, nil
	}
	return applyExifOrientation(toNRGBA(img), orientation), nil
}

func readExifOrientation(raw []byte) int {
	x, err := exif.Decode(bytes.NewReader(raw))
	if err != nil {
		return 1
	}
	tag, err := x.Get(exif.Orientation)
	if err != nil {
		return 1
	}
	v, err := tag.Int(0)
	if err != nil {
		return 1
	}
	return v
}

// applyExifOrientation applies the standard EXIF orientation transform
// (values 2-8; 1 is a no-op handled by the caller) to bring the image
// upright.
func applyExifOrientation(img *image.NRGBA, orientation int) *image.NRGBA {
	switch orientation {
	case 2:
		return flipH(img)
	case 3:
		return rotate180(img)
	case 4:
		return flipV(img)
	case 5:
		return flipH(rotate90CW(img))
	case 6:
		return rotate90CW(img)
	case 7:
		return flipV(rotate90CW(img))
	case 8:
		return rotate270CW(img)
	default:
		return img
	}
}

func rotate90CW(src *image.NRGBA) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.SetNRGBA(h-1-y, x, src.NRGBAAt(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate270CW(src *image.NRGBA) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, h, w))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.SetNRGBA(y, w-1-x, src.NRGBAAt(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func rotate180(src *image.NRGBA) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.SetNRGBA(w-1-x, h-1-y, src.NRGBAAt(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipH(src *image.NRGBA) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.SetNRGBA(w-1-x, y, src.NRGBAAt(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

func flipV(src *image.NRGBA) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			dst.SetNRGBA(x, h-1-y, src.NRGBAAt(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}
