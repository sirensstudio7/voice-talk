import { describe, expect, test } from "bun:test";

/**
 * Object-storage round trip. Opt-in via STORAGE_TESTS=1 plus the S3_*
 * variables (and REDIS_URL/DATABASE_URL, which env.ts requires), so it never
 * writes to a real bucket by accident. The target buckets must already exist:
 *
 *   docker run -d --name s3mock -p 9090:9090 \
 *     -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=payment-qr adobe/s3mock
 *   S3_ENDPOINT=http://127.0.0.1:9090 S3_ACCESS_KEY_ID=t S3_SECRET_ACCESS_KEY=t \
 *   S3_REGION=us-east-1 S3_PUBLIC_BASE_URL=http://media.test \
 *   REDIS_URL=redis://127.0.0.1:6399 STORAGE_TESTS=1 bun test tests/storage.test.ts
 */
const enabled =
  process.env.STORAGE_TESTS === "1" &&
  Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_PUBLIC_BASE_URL,
  );
const suite = enabled ? describe : describe.skip;

suite("object storage", () => {
  const bucket = "payment-qr";
  const key = `storage-tests/${crypto.randomUUID()}/round-trip.txt`;
  const payload = "round-trip-payload";

  test("upload, download via path and URL, then delete", async () => {
    const storage = await import("../src/storage/index.js");

    const url = await storage.uploadToStorage(bucket, key, Buffer.from(payload), "text/plain");
    expect(url.endsWith(`/${bucket}/${key}`)).toBe(true);

    const viaPath = await storage.downloadFromStorage(bucket, key);
    expect(viaPath?.toString()).toBe(payload);

    const viaUrl = await storage.downloadFromStorage(bucket, url);
    expect(viaUrl?.toString()).toBe(payload);

    const missing = await storage.downloadFromStorage(bucket, `${key}.nope`);
    expect(missing).toBeNull();

    await storage.deleteStorageObject(bucket, key);
    expect(await storage.downloadFromStorage(bucket, key)).toBeNull();
  });
});
