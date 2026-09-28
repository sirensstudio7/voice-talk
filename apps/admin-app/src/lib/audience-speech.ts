type SpeechRecognitionCtor = new () => AudienceSpeechRecognition;

export type AudienceSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: AudienceSpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export type AudienceSpeechResultEvent = {
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & {
      isFinal: boolean;
    }
  >;
};

export function createAudienceSpeechRecognition(): AudienceSpeechRecognition | null {
  const SpeechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = SpeechWindow.SpeechRecognition || SpeechWindow.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function audienceSpeechLang(language: string | null | undefined): string {
  return String(language ?? "id").toLowerCase().startsWith("id") ? "id-ID" : "en-US";
}

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // already stopped
    }
  });
}

export async function requestAudienceMicrophone(): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    const err = new Error("insecure") as Error & { code: string };
    err.code = "insecure";
    throw err;
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error("no-media") as Error & { code: string };
    err.code = "no-media";
    throw err;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
}

/** User-facing copy, or null to ignore the error. */
export function audienceSpeechErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "no-speech":
      return "Didn't catch that — tap the mic and try again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Allow the microphone to ask by voice.";
    case "audio-capture":
      return "Couldn't access the microphone. Close other apps using it, or type your question.";
    case "network":
      return "Voice service is unavailable. Check your connection or type your question.";
    case "language-not-supported":
      return "This browser doesn't support voice in that language. Type your question instead.";
    case "insecure":
      return "Voice needs https or localhost. Type your question instead.";
    default:
      return "Couldn't hear the question. Tap the mic and try again.";
  }
}

export function transcriptFromSpeechEvent(event: AudienceSpeechResultEvent): {
  interim: string;
  finalText: string;
} {
  let interim = "";
  let finalText = "";
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = result?.[0]?.transcript?.trim() ?? "";
    if (!piece) continue;
    if (result.isFinal) {
      finalText = finalText ? `${finalText} ${piece}` : piece;
    } else {
      interim = interim ? `${interim} ${piece}` : piece;
    }
  }
  return { interim, finalText };
}
