/**
 * Client-side background image compression for faster customer-page loads.
 * Resizes to a kiosk-friendly max edge and encodes WebP (JPEG fallback) at high quality.
 */

export type CompressImageOptions = {
  /** Longest side in CSS pixels (default 2048). */
  maxEdge?: number;
  /** Encoder quality 0–1 (default 0.82). */
  quality?: number;
};

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_QUALITY = 0.82;

function supportWebpEncoding(): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try another file."));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function scaledSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compress an image for upload. Returns the original file when compression
 * would not help (or the browser cannot encode).
 */
export async function compressImageForUpload(
  file: File,
  options: CompressImageOptions = {},
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const outputType = supportWebpEncoding() ? "image/webp" : "image/jpeg";
  const extension = outputType === "image/webp" ? "webp" : "jpg";

  const image = await loadImage(file);
  const { width, height } = scaledSize(image.naturalWidth, image.naturalHeight, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // White fill so transparent PNGs don’t become black in JPEG/WebP.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, outputType, quality);

  // Keep the original when it’s already smaller (e.g. a tiny optimized WebP).
  if (blob.size >= file.size && file.type !== "image/png" && file.type !== "image/gif") {
    return file;
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "background";
  return new File([blob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}
