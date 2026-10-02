import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearBrandingAssetCache,
  getBrandingAsset,
} from "../src/services/photo-asset-cache.js";

/**
 * TKT-009: branding assets are loaded once per settings version, bounded, and
 * not cached above the size cap. A fake loader replaces object storage.
 */
describe("photo branding asset cache", () => {
  beforeEach(() => {
    clearBrandingAssetCache();
  });

  test("same path and version loads once", async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return Buffer.from("frame");
    };

    const first = await getBrandingAsset("sunrise/frame.png", 1, load);
    const second = await getBrandingAsset("sunrise/frame.png", 1, load);

    expect(first?.toString()).toBe("frame");
    expect(second?.toString()).toBe("frame");
    expect(loads).toBe(1);
  });

  test("a new settings version is a new cache entry", async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return Buffer.from(`v${loads}`);
    };

    await getBrandingAsset("sunrise/logo.png", 1, load);
    const updated = await getBrandingAsset("sunrise/logo.png", 2, load);

    expect(loads).toBe(2);
    expect(updated?.toString()).toBe("v2");
  });

  test("assets above the size cap are not cached", async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return Buffer.alloc(5 * 1024 * 1024);
    };

    await getBrandingAsset("sunrise/huge.png", 1, load);
    await getBrandingAsset("sunrise/huge.png", 1, load);

    expect(loads).toBe(2);
  });

  test("missing assets are not cached as hits", async () => {
    let loads = 0;
    const load = async () => {
      loads += 1;
      return null;
    };

    expect(await getBrandingAsset("sunrise/missing.png", 1, load)).toBeNull();
    expect(await getBrandingAsset("sunrise/missing.png", 1, load)).toBeNull();
    expect(loads).toBe(2);
  });
});
