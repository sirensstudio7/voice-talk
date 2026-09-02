import { Type } from "@google/genai";

export const FAQ_END_REASONS = [
  "question_answered",
  "patient_goodbye",
  "out_of_scope",
] as const;

export type FaqEndReason = (typeof FAQ_END_REASONS)[number] | "idle_timeout" | "manual" | "disconnected";

export function buildFaqToolDeclarations() {
  return [
    {
      functionDeclarations: [
        {
          name: "end_conversation",
          description:
            "End the FAQ conversation when the patient or customer is clearly done and has no more questions.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              reason: {
                type: Type.STRING,
                description:
                  'Why the conversation is ending: "question_answered", "patient_goodbye", or "out_of_scope".',
              },
            },
            required: ["reason"],
          },
        },
      ],
    },
  ];
}

export function buildFaqToolMapping(callbacks: {
  onEndConversation?: (reason: string) => void;
}): Record<string, (args: Record<string, unknown>) => Record<string, unknown>> {
  return {
    end_conversation: (args) => {
      const rawReason = String(args.reason ?? "question_answered").trim();
      const reason = FAQ_END_REASONS.includes(rawReason as (typeof FAQ_END_REASONS)[number])
        ? rawReason
        : "question_answered";
      callbacks.onEndConversation?.(reason);
      return { success: true, ended: true, reason };
    },
  };
}
