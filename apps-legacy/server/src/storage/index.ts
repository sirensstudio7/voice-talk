import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import { env, hasSupabaseStorage } from "../env.js";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

export const PHOTO_BUCKET = "lorescale-photos";
export const PHOTO_BRANDING_BUCKET = "photo-branding";
export const PRESENTATION_BUCKET = "presentation-assets";
export const MAX_PRESENTATION_UPLOAD_BYTES = 50 * 1024 * 1024;

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!hasSupabaseStorage()) return null;
  if (!supabase) {
    supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as unknown as typeof WebSocket },
    });
  }
  return supabase;
}

export async function uploadToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const client = getSupabase();
  if (client) {
    await client.storage.from(bucket).remove([path]).catch(() => undefined);
    const { error } = await client.storage.from(bucket).upload(path, data, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const { data: publicData } = client.storage.from(bucket).getPublicUrl(path);
    return publicData.publicUrl;
  }

  const localPath = join(UPLOAD_ROOT, bucket, path);
  await mkdir(join(localPath, ".."), { recursive: true });
  await writeFile(localPath, data);
  return `/uploads/${bucket}/${path}`;
}

/** Upload without returning a public URL — returns the object path for private buckets. */
export async function uploadPrivateToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const client = getSupabase();
  if (client) {
    await client.storage.from(bucket).remove([path]).catch(() => undefined);
    const { error } = await client.storage.from(bucket).upload(path, data, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(error.message);
    return path;
  }

  const localPath = join(UPLOAD_ROOT, bucket, path);
  await mkdir(join(localPath, ".."), { recursive: true });
  await writeFile(localPath, data);
  return path;
}

export async function createSignedDownloadUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Failed to create signed URL");
    }
    return data.signedUrl;
  }

  // Local-dev: temporary tokenized path resolved by the download API.
  return `/uploads/${bucket}/${path}`;
}

export async function downloadFromStorage(bucket: string, pathOrUrl: string): Promise<Buffer | null> {
  const client = getSupabase();
  let path = pathOrUrl;

  if (pathOrUrl.startsWith("http")) {
    try {
      const url = new URL(pathOrUrl);
      const marker = `/object/public/${bucket}/`;
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        path = decodeURIComponent(url.pathname.slice(idx + marker.length));
      } else {
        const res = await fetch(pathOrUrl);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      }
    } catch {
      return null;
    }
  } else if (pathOrUrl.startsWith(`/uploads/${bucket}/`)) {
    path = pathOrUrl.slice(`/uploads/${bucket}/`.length);
  }

  if (client) {
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  try {
    return await readFile(join(UPLOAD_ROOT, bucket, path));
  } catch {
    return null;
  }
}

export async function deleteStorageObject(bucket: string, path: string): Promise<void> {
  const client = getSupabase();
  if (client) {
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw new Error(error.message);
    return;
  }
  await rm(join(UPLOAD_ROOT, bucket, path), { force: true });
}

export async function deleteFromStorage(bucket: string, prefix: string): Promise<void> {
  const client = getSupabase();
  if (client) {
    const paths = new Set<string>();

    const { data: files, error: listError } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
    });
    if (listError) {
      throw new Error(listError.message);
    }

    for (const file of files ?? []) {
      if (file.name) {
        paths.add(`${prefix}/${file.name}`);
      }
    }

    // Fallback for uploads that used the standard background filename convention.
    for (const extension of Object.values(ALLOWED_IMAGE_TYPES)) {
      paths.add(`${prefix}/background${extension}`);
    }

    if (paths.size > 0) {
      const { error: removeError } = await client.storage.from(bucket).remove([...paths]);
      if (removeError) {
        throw new Error(removeError.message);
      }
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
