import { describe, expect, test } from "bun:test";
import {
  buildSessionGreetingPrompt,
  buildVisionGoodbyePrompt,
  buildVisionGreetingPrompt,
  buildVisionSilenceFollowUpPrompt,
} from "../src/services/config-builder.js";

/**
 * Regression guard for the silent-greeting incident (TKT-014).
 *
 * `gemini-3.1-flash-live-preview` returns no audio and no transcript when a
 * model-turn prompt contains the Indonesian word "singkat", which wedged every
 * session at "Alex is joining…". "pendek" is safe. These tests run without
 * services so CI catches a reintroduction immediately.
 */
const MODEL_TURN_PROMPTS: Array<[string, string]> = [
  ["session greeting (ordering)", buildSessionGreetingPrompt("id", "Sunrise Coffee", "Alex", true)],
  ["session greeting (questions)", buildSessionGreetingPrompt("id", "Sunrise Coffee", "Alex", false)],
  ["vision greeting", buildVisionGreetingPrompt("id", "Sunrise Coffee", "Alex")],
  ["vision greeting (raise hand)", buildVisionGreetingPrompt("id", "Sunrise Coffee", "Alex", "raise_hand")],
  ["vision greeting (gesture)", buildVisionGreetingPrompt("id", "Sunrise Coffee", "Alex", "gesture")],
  ["vision silence follow-up", buildVisionSilenceFollowUpPrompt("id")],
  ["vision goodbye", buildVisionGoodbyePrompt("id")],
];

describe("model-turn prompt guards", () => {
  test('no Indonesian prompt contains the unsafe word "singkat"', () => {
    for (const [name, prompt] of MODEL_TURN_PROMPTS) {
      expect({ name, unsafe: prompt.toLowerCase().includes("singkat") }).toEqual({
        name,
        unsafe: false,
      });
    }
  });

  test("greeting prompts keep the business and assistant identity", () => {
    const session = buildSessionGreetingPrompt("id", "Sunrise Coffee", "Alex", true);
    expect(session).toContain("Sunrise Coffee");
    expect(session).toContain("Alex");
    expect(session).toContain("pendek");

    const vision = buildVisionGreetingPrompt("id", "Sunrise Coffee", "Alex");
    expect(vision).toContain("Sunrise Coffee");
    expect(vision).toContain("Alex");
    expect(vision).toContain("Ucapkan:");
  });

  test("wrap-up prompts still instruct one short sentence and ending", () => {
    const followUp = buildVisionSilenceFollowUpPrompt("id");
    expect(followUp).toContain("satu kalimat pendek");
    expect(followUp.toLowerCase()).toContain("jangan ulangi");

    const goodbye = buildVisionGoodbyePrompt("id");
    expect(goodbye).toContain("satu atau dua kalimat pendek");
    expect(goodbye.toLowerCase()).toContain("akhiri percakapan");
  });

  test("English prompts stay English and avoid the unsafe word", () => {
    const greeting = buildSessionGreetingPrompt("en", "Sunrise Coffee", "Alex", true);
    expect(greeting).toContain("one or two short spoken sentences");
    expect(greeting.toLowerCase()).not.toContain("singkat");
  });
});
