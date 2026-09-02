export type BrowserVisionEventType =
  | "PERSON_ENTER"
  | "PERSON_EXIT"
  | "PERSON_CONFIRMED"
  | "PERSON_LOST";

export type PersonDetection = {
  track_id: number;
  center_x: number;
  center_y: number;
  height_ratio: number;
  in_zone: boolean;
  distance_ok: boolean;
};

export type GreetingTriggerMode = "presence" | "gesture" | "raise_hand";
