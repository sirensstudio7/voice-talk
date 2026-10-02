import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/**
 * TKT-012: revoked and expired share tokens must be detectable (public routes
 * map them to 410) and rotation must issue a fresh token.
 *
 * Opt-in like the smoke tests: SMOKE_TESTS=1 + DATABASE_URL.
 */
const hasDb =
  process.env.SMOKE_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

suite("presentation share lifecycle", () => {
  test("revoke, heal and expire", async () => {
    const { db } = await import("../src/db/client.js");
    const { businesses, presentations } = await import("../src/db/schema.js");
    const {
      ensurePresentationShareToken,
      loadPresentationByShareToken,
      presentationShareGone,
      revokePresentationShareToken,
      rotatePresentationShareToken,
    } = await import("../src/services/presentation-share.js");

    const [business] = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, "sunrise-coffee"))
      .limit(1);
    expect(business).toBeDefined();

    const [row] = await db
      .insert(presentations)
      .values({ businessId: business!.id, title: "Share lifecycle probe", status: "ready" })
      .returning();

    try {
      const created = await ensurePresentationShareToken(row!.id);
      expect(created?.shareToken).toBeTruthy();
      expect(presentationShareGone(created!)).toBeNull();
      expect((await loadPresentationByShareToken(created!.shareToken!))?.id).toBe(row!.id);

      const revoked = await revokePresentationShareToken(row!.id);
      expect(presentationShareGone(revoked!)).toBe("revoked");

      // ensure() self-heals a revoked link with a fresh token.
      const healed = await ensurePresentationShareToken(row!.id);
      expect(healed?.shareToken).toBeTruthy();
      expect(healed!.shareToken).not.toBe(created!.shareToken);
      expect(presentationShareGone(healed!)).toBeNull();

      // Old token no longer resolves after rotation.
      expect(await loadPresentationByShareToken(created!.shareToken!)).toBeFalsy();

      const rotated = await rotatePresentationShareToken(row!.id);
      expect(rotated!.shareToken).not.toBe(healed!.shareToken);

      // Expiry is enforced server-side from the stored timestamp.
      await db
        .update(presentations)
        .set({ shareTokenExpiresAt: new Date(Date.now() - 1_000) })
        .where(eq(presentations.id, row!.id));
      const expired = await loadPresentationByShareToken(rotated!.shareToken!);
      expect(presentationShareGone(expired!)).toBe("expired");
    } finally {
      await db.delete(presentations).where(eq(presentations.id, row!.id));
    }
  });
});
