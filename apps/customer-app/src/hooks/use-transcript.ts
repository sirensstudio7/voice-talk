"use client";

import { useVoiceStore } from "@/store/voice-store";

export function useTranscript() {
  const transcript = useVoiceStore((state) => state.transcript);
  const assistantDisplayText = useVoiceStore((state) => state.assistantDisplayText);
  
  // Combine stored transcript messages with the currently streaming assistant text
  const messages = [...transcript];
  
  if (assistantDisplayText) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === "assistant" && !useVoiceStore.getState().forceNewAssistantBubble) {
      // Append to the last assistant bubble if we're not forcing a new one
      messages[messages.length - 1] = {
        ...lastMessage,
        text: assistantDisplayText,
      };
    } else {
      // Otherwise, add it as a new bubble
      messages.push({
        role: "assistant",
        text: assistantDisplayText,
      });
    }
  }

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAssistantTyping = latestMessage?.role === "assistant" && assistantDisplayText !== "";

  return {
    messages,
    latestMessage,
    isAssistantTyping,
  };
}
