import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { env, hasObjectStorage } from "../env.js";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

export const PHOTO_BUCKET = "lorescale-photos";
export const PHOTO_BRANDING_BUCKET = "photo-branding";
export const PRESENTATION_BUCKET = "presentation-assets";
export const MAX_PRESENTATION_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * S3-compatible object storage (Cloudflare R2 in production).
 *
 * Everything lives in a single physical bucket (S3_BUCKET) under a prefix
 * named after the logical bucket, so one public domain serves all uploads:
 * `https://<S3_PUBLIC_BASE_URL>/<bucket>/<path>`. Without S3 configured the
 * local disk is used, which is the development and test path — production
 * requires object storage in env.ts because container disks are ephemeral.
 */
let s3: Bun.S3Client | null = null;

function getS3(): Bun.S3Client | null {
  if (!hasObjectStorage()) return null;
  if (!s3) {
    s3 = new Bun.S3Client({
      endpoint: env.S3_ENDPOINT!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      region: env.S3_REGION,
    });
  }
  return s3;
}

/** Object key inside the physical bucket: logical bucket acts as prefix. */
function objectKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

function publicBase(): string {
  return (env.S3_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

async function writeLocal(bucket: string, path: string, data: Buffer): Promise<void> {
  const localPath = join(UPLOAD_ROOT, bucket, path);
  await mkdir(join(localPath, ".."), { recursive: true });
  await writeFile(localPath, data);
}

export async function uploadToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const client = getS3();
  if (client) {
    await client.write(objectKey(bucket, path), data, {
      bucket: env.S3_BUCKET!,
      type: contentType,
    });
    return `${publicBase()}/${objectKey(bucket, path)}`;
  }
  await writeLocal(bucket, path, data);
  return `/uploads/${bucket}/${path}`;
}

/** Upload without returning a public URL — returns the object path for private buckets. */
export async function uploadPrivateToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const client = getS3();
  if (client) {
    await client.write(objectKey(bucket, path), data, {
      bucket: env.S3_BUCKET!,
      type: contentType,
    });
  } else {
    await writeLocal(bucket, path, data);
  }
  return path;
}

export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getS3();
  if (client) {
    return client
      .file(objectKey(bucket, path), { bucket: env.S3_BUCKET! })
      .presign({ expiresIn: expiresInSeconds });
  }

  // Local-dev: temporary tokenized path resolved by the download API.
  return `/uploads/${bucket}/${path}`;
}

export async function downloadFromStorage(bucket: string, pathOrUrl: string): Promise<Buffer | null> {
  const client = getS3();
  let path = pathOrUrl;

  if (pathOrUrl.startsWith("http")) {
    const base = publicBase();
    if (base && pathOrUrl.startsWith(`${base}/${bucket}/`)) {
      path = decodeURIComponent(pathOrUrl.slice(`${base}/${bucket}/`.length));
    } else {
      // Public URLs written before a storage migration still encode bucket
      // and object path; anything else is fetched verbatim.
      const marker = `/object/public/${bucket}/`;
      const markerIndex = pathOrUrl.indexOf(marker);
      if (markerIndex >= 0) {
        path = decodeURIComponent(pathOrUrl.slice(markerIndex + marker.length));
      } else {
        const response = await fetch(pathOrUrl).catch(() => null);
        if (!response?.ok) return null;
        return Buffer.from(await response.arrayBuffer());
      }
    }
  } else if (pathOrUrl.startsWith(`/uploads/${bucket}/`)) {
    path = pathOrUrl.slice(`/uploads/${bucket}/`.length);
  }

  if (client) {
    const object = client.file(objectKey(bucket, path), { bucket: env.S3_BUCKET! });
    if (!(await object.exists())) return null;
    return Buffer.from(await object.arrayBuffer());
  }

  try {
    return await readFile(join(UPLOAD_ROOT, bucket, path));
  } catch {
    return null;
  }
}

export async function deleteStorageObject(bucket: string, path: string): Promise<void> {
  const client = getS3();
  if (client) {
    await client.delete(objectKey(bucket, path), { bucket: env.S3_BUCKET! });
    return;
  }
  await rm(join(UPLOAD_ROOT, bucket, path), { force: true });
}

export async function deleteFromStorage(bucket: string, prefix: string): Promise<void> {
  const client = getS3();
  if (client) {
    const fullPrefix = `${objectKey(bucket, prefix)}/`;
    let startAfter: string | undefined;
    for (;;) {
      const page = await client.list(
        { prefix: fullPrefix, maxKeys: 1000, ...(startAfter ? { startAfter } : {}) },
        { bucket: env.S3_BUCKET! },
      );
      const contents = page.contents ?? [];
      for (const object of contents) {
        await client.delete(object.key, { bucket: env.S3_BUCKET! });
      }
      if (!page.isTruncated || contents.length === 0) break;
      startAfter = contents[contents.length - 1]!.key;
    }
    return;
  }
  await rm(join(UPLOAD_ROOT, bucket, prefix), { recursive: true, force: true });
}

export function getUploadRoot(): string {
  return UPLOAD_ROOT;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024;
