/**
 * Reads a single uploaded file out of an Elysia multipart body.
 *
 * Elysia parses `multipart/form-data` into a plain object whose file fields are
 * web `File` values, whereas the handlers were written against Fastify's
 * `request.file()`. The returned shape keeps Fastify's property names
 * (`filename`, `mimetype`, `toBuffer()`) so the upload handlers read the same
 * either way.
 *
 * Like `request.file()`, this takes the first file part regardless of its field
 * name — the clients posting here do not agree on one.
 */
export type UploadedFile = {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
};

export function readUploadedFile(body: unknown): UploadedFile | undefined {
  if (!body || typeof body !== "object") return undefined;

  for (const value of Object.values(body as Record<string, unknown>)) {
    if (value instanceof File) {
      return {
        filename: value.name,
        mimetype: value.type,
        toBuffer: async () => Buffer.from(await value.arrayBuffer()),
      };
    }
  }
  return undefined;
}
