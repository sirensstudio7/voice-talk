from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional

from vision.detector import PersonDetection


class VisionState(str, Enum):
    IDLE = "IDLE"
    PERSON_DETECTED = "PERSON_DETECTED"
    WAITING = "WAITING"


class TriggerMode(str, Enum):
    PRESENCE = "presence"
    GESTURE = "gesture"
    RAISE_HAND = "raise_hand"


def parse_trigger_mode(trigger_mode: str) -> TriggerMode:
    if trigger_mode == TriggerMode.GESTURE.value:
        return TriggerMode.GESTURE
    if trigger_mode == TriggerMode.RAISE_HAND.value:
        return TriggerMode.RAISE_HAND
    return TriggerMode.PRESENCE


def uses_hand_detection(trigger_mode: TriggerMode) -> bool:
    return trigger_mode in (TriggerMode.GESTURE, TriggerMode.RAISE_HAND)


@dataclass
class VisionEvent:
    type: str
    track_id: Optional[int] = None
    timestamp: float = field(default_factory=time.time)


class PresenceStateMachine:
    def __init__(
        self,
        greeting_delay_seconds: float,
        emit: Callable[[VisionEvent], None],
        trigger_mode: str = "presence",
        gesture_hold_seconds: float = 0.4,
    ) -> None:
        self.greeting_delay_seconds = greeting_delay_seconds
        self.trigger_mode = parse_trigger_mode(trigger_mode)
        self.gesture_hold_seconds = gesture_hold_seconds
        self.emit = emit
        self.state = VisionState.IDLE
        self.active_track_id: Optional[int] = None
        self.presence_started_at: Optional[float] = None
        self.gesture_started_at: Optional[float] = None
        self.raise_hand_streak: int = 0
        self.confirmed = False

    def reset(self) -> None:
        self.state = VisionState.IDLE
        self.active_track_id = None
        self.presence_started_at = None
        self.gesture_started_at = None
        self.raise_hand_streak = 0
        self.confirmed = False

    def on_frame(
        self,
        primary: Optional[PersonDetection],
        wave_detected: bool = False,
        hand_raised: bool = False,
    ) -> None:
        now = time.time()

        if primary is None:
            if self.state != VisionState.IDLE:
                if self.active_track_id is not None:
                    self.emit(VisionEvent(type="PERSON_EXIT", track_id=self.active_track_id))
                if not self.confirmed and self.state == VisionState.WAITING:
                    pass  # exit before confirm — return to idle silently
                self.reset()
            return

        track_id = primary.track_id

        if self.state == VisionState.IDLE:
            self.state = VisionState.PERSON_DETECTED
            self.active_track_id = track_id
            self.presence_started_at = now
            self.gesture_started_at = None
            self.raise_hand_streak = 0
            self.emit(VisionEvent(type="PERSON_ENTER", track_id=track_id))
            self.state = VisionState.WAITING
            return

        if self.active_track_id != track_id:
            # Different person took priority — restart dwell/gesture timer
            self.emit(VisionEvent(type="PERSON_EXIT", track_id=self.active_track_id))
            self.active_track_id = track_id
            self.presence_started_at = now
            self.gesture_started_at = None
            self.raise_hand_streak = 0
            self.confirmed = False
            self.emit(VisionEvent(type="PERSON_ENTER", track_id=track_id))
            self.state = VisionState.WAITING
            return

        if self.state == VisionState.WAITING and not self.confirmed:
            if self.trigger_mode == TriggerMode.GESTURE:
                if wave_detected:
                    self.confirmed = True
                    self.emit(VisionEvent(type="PERSON_CONFIRMED", track_id=track_id))
            elif self.trigger_mode == TriggerMode.RAISE_HAND:
                if hand_raised:
                    self.raise_hand_streak += 1
                    if self.raise_hand_streak >= 2:
                        self.confirmed = True
                        self.emit(VisionEvent(type="PERSON_CONFIRMED", track_id=track_id))
                else:
                    self.raise_hand_streak = max(0, self.raise_hand_streak - 1)
            else:
                elapsed = now - (self.presence_started_at or now)
                if elapsed >= self.greeting_delay_seconds:
                    self.confirmed = True
                    self.emit(VisionEvent(type="PERSON_CONFIRMED", track_id=track_id))

    def notify_session_active(self) -> None:
        """Mark current presence as handled so the same visitor is not re-confirmed."""
        self.confirmed = True

    def notify_session_ended(self) -> None:
        """Reset after conversation ends so a new visitor can trigger."""
        self.reset()
