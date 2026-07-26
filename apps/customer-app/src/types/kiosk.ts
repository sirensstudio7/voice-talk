export type KioskPhase =
  | "idle"
  | "waiting"
  | "greeting"
  | "listening"
  | "thinking"
  | "talking"
  | "goodbye";

export type GreetingTriggerMode = "presence" | "gesture" | "raise_hand";

export type VisionSource = "auto" | "python" | "browser";

export type VisionConfig = {
  camera_trigger_enabled: boolean;
  vision_source: VisionSource;
  greeting_trigger_mode: GreetingTriggerMode;
  greeting_delay_seconds: number;
  detection_distance_m: number;
  cooldown_seconds: number;
  lost_timeout_seconds: number;
  silence_timeout_seconds: number;
  auto_goodbye_timeout_seconds: number;
  greeting_script: string;
  goodbye_script: string;
};

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  camera_trigger_enabled: false,
  vision_source: "auto",
  greeting_trigger_mode: "presence",
  greeting_delay_seconds: 3,
  detection_distance_m: 2,
  cooldown_seconds: 30,
  lost_timeout_seconds: 5,
  silence_timeout_seconds: 15,
  auto_goodbye_timeout_seconds: 10,
  greeting_script: "Hello, welcome. How may I assist you today?",
  goodbye_script: "Thank you. Have a wonderful day.",
};
