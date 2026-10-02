import { describe, expect, test } from "bun:test";

/**
 * TKT-004: a `voice.force_end` fanout message must complete a session that is
 * registered on the receiving instance, and be a harmless no-op otherwise.
 * Pure unit test: the runtime is in-memory and has no service imports.
 */
describe("voice force-end fanout", () => {
  test("completes a locally registered session with the given reason", async () => {
    const { handleRemoteVoiceForceEnd, registerActiveVoiceSession, unregisterActiveVoiceSession } =
      await import("../src/services/voice-session-runtime.js");

    const reasons: string[] = [];
    registerActiveVoiceSession("test-force-end-1", (reason) => reasons.push(reason));
    try {
      expect(
        handleRemoteVoiceForceEnd({ voiceSessionId: "test-force-end-1", reason: "admin" }),
      ).toBe(true);
      expect(reasons).toEqual(["admin"]);
    } finally {
      unregisterActiveVoiceSession("test-force-end-1");
    }
  });

  test("unknown or malformed payloads are ignored", async () => {
    const { handleRemoteVoiceForceEnd } = await import(
      "../src/services/voice-session-runtime.js"
    );
    expect(handleRemoteVoiceForceEnd({})).toBe(false);
    expect(handleRemoteVoiceForceEnd({ voiceSessionId: 42 })).toBe(false);
    expect(handleRemoteVoiceForceEnd({ voiceSessionId: "not-registered" })).toBe(false);
  });

  test("defaults the reason when the payload omits it", async () => {
    const { handleRemoteVoiceForceEnd, registerActiveVoiceSession, unregisterActiveVoiceSession } =
      await import("../src/services/voice-session-runtime.js");

    const reasons: string[] = [];
    registerActiveVoiceSession("test-force-end-2", (reason) => reasons.push(reason));
    try {
      expect(handleRemoteVoiceForceEnd({ voiceSessionId: "test-force-end-2" })).toBe(true);
      expect(reasons).toEqual(["admin"]);
    } finally {
      unregisterActiveVoiceSession("test-force-end-2");
    }
  });
});
