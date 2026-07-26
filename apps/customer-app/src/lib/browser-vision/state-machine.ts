import type { GreetingTriggerMode, PersonDetection } from "./types";

export type VisionEvent = {
  type: string;
  track_id?: number;
};

type VisionState = "IDLE" | "PERSON_DETECTED" | "WAITING";

function parseTriggerMode(triggerMode: string): GreetingTriggerMode {
  if (triggerMode === "gesture") return "gesture";
  if (triggerMode === "raise_hand") return "raise_hand";
  return "presence";
}

export class PresenceStateMachine {
  private greetingDelaySeconds: number;
  private triggerMode: GreetingTriggerMode;
  private emit: (event: VisionEvent) => void;
  private state: VisionState = "IDLE";
  private activeTrackId: number | null = null;
  private presenceStartedAt: number | null = null;
  private raiseHandStreak = 0;
  private confirmed = false;

  constructor(
    greetingDelaySeconds: number,
    emit: (event: VisionEvent) => void,
    triggerMode: string = "presence",
  ) {
    this.greetingDelaySeconds = greetingDelaySeconds;
    this.triggerMode = parseTriggerMode(triggerMode);
    this.emit = emit;
  }

  setTriggerMode(triggerMode: string): void {
    this.triggerMode = parseTriggerMode(triggerMode);
  }

  setGreetingDelaySeconds(seconds: number): void {
    this.greetingDelaySeconds = seconds;
  }

  reset(): void {
    this.state = "IDLE";
    this.activeTrackId = null;
    this.presenceStartedAt = null;
    this.raiseHandStreak = 0;
    this.confirmed = false;
  }

  onFrame(
    primary: PersonDetection | null,
    waveDetected = false,
    handRaised = false,
  ): void {
    const now = Date.now() / 1000;

    if (primary === null) {
      if (this.state !== "IDLE") {
        if (this.activeTrackId !== null) {
          this.emit({ type: "PERSON_EXIT", track_id: this.activeTrackId });
        }
        this.reset();
      }
      return;
    }

    const trackId = primary.track_id;

    if (this.state === "IDLE") {
      this.state = "PERSON_DETECTED";
      this.activeTrackId = trackId;
      this.presenceStartedAt = now;
      this.raiseHandStreak = 0;
      this.emit({ type: "PERSON_ENTER", track_id: trackId });
      this.state = "WAITING";
      return;
    }

    if (this.activeTrackId !== trackId) {
      if (this.activeTrackId !== null) {
        this.emit({ type: "PERSON_EXIT", track_id: this.activeTrackId });
      }
      this.activeTrackId = trackId;
      this.presenceStartedAt = now;
      this.raiseHandStreak = 0;
      this.confirmed = false;
      this.emit({ type: "PERSON_ENTER", track_id: trackId });
      this.state = "WAITING";
      return;
    }

    if (this.state === "WAITING" && !this.confirmed) {
      if (this.triggerMode === "gesture") {
        if (waveDetected) {
          this.confirmed = true;
          this.emit({ type: "PERSON_CONFIRMED", track_id: trackId });
        }
      } else if (this.triggerMode === "raise_hand") {
        if (handRaised) {
          this.raiseHandStreak += 1;
          if (this.raiseHandStreak >= 2) {
            this.confirmed = true;
            this.emit({ type: "PERSON_CONFIRMED", track_id: trackId });
          }
        } else {
          this.raiseHandStreak = Math.max(0, this.raiseHandStreak - 1);
        }
      } else {
        const elapsed = now - (this.presenceStartedAt ?? now);
        if (elapsed >= this.greetingDelaySeconds) {
          this.confirmed = true;
          this.emit({ type: "PERSON_CONFIRMED", track_id: trackId });
        }
      }
    }
  }

  notifySessionActive(): void {
    this.confirmed = true;
  }

  notifySessionEnded(): void {
    this.reset();
  }
}
