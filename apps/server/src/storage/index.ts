import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { env, hasSupabaseStorage } from "../env.js";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!hasSupabaseStorage()) return null;
  if (!supabase) {
    supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
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

export async function deleteFromStorage(bucket: string, prefix: string): Promise<void> {
  const client = getSupabase();
  if (client) {
    const { data: files } = await client.storage.from(bucket).list(prefix);
    if (files?.length) {
      await client.storage
        .from(bucket)
        .remove(files.map((f) => `${prefix}/${f.name}`));
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
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
