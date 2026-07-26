"""Verify dwell and wave gesture triggers emit PERSON_CONFIRMED."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from vision.detector import PersonDetection
from vision.gesture_detector import WaveDetector
from vision.state_machine import PresenceStateMachine, VisionEvent


def fake_person(track_id: int = 1) -> PersonDetection:
    return PersonDetection(
        track_id=track_id,
        bbox=(0.3, 0.2, 0.7, 0.85),
        confidence=0.9,
        center_x=0.5,
        center_y=0.5,
        height_ratio=0.65,
        in_zone=True,
        distance_ok=True,
    )


class TestPresenceStateMachine(unittest.TestCase):
    def test_person_confirmed_after_greeting_delay(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(greeting_delay_seconds=3.0, emit=events.append)

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person())

        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1002.9):
            sm.on_frame(fake_person())
        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1003.0):
            sm.on_frame(fake_person())
        self.assertEqual([e.type for e in events], ["PERSON_ENTER", "PERSON_CONFIRMED"])

    def test_gesture_mode_confirms_on_wave(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(
            greeting_delay_seconds=3.0,
            emit=events.append,
            trigger_mode="gesture",
        )

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person())
        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1000.2):
            sm.on_frame(fake_person(), wave_detected=True)
        self.assertEqual([e.type for e in events], ["PERSON_ENTER", "PERSON_CONFIRMED"])

    def test_gesture_mode_wave_on_first_frame_waits_for_enter(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(greeting_delay_seconds=3.0, emit=events.append, trigger_mode="gesture")

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person(), wave_detected=True)
        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1000.1):
            sm.on_frame(fake_person(), wave_detected=True)
        self.assertEqual([e.type for e in events], ["PERSON_ENTER", "PERSON_CONFIRMED"])

    def test_presence_mode_ignores_wave(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(greeting_delay_seconds=3.0, emit=events.append)

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person(), wave_detected=True)
        with patch("vision.state_machine.time.time", return_value=1001.0):
            sm.on_frame(fake_person(), wave_detected=True)

        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

    def test_raise_hand_mode_confirms_after_hold(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(
            greeting_delay_seconds=3.0,
            emit=events.append,
            trigger_mode="raise_hand",
            gesture_hold_seconds=0.4,
        )

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person())
        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1000.1):
            sm.on_frame(fake_person(), hand_raised=True)
        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

        with patch("vision.state_machine.time.time", return_value=1000.2):
            sm.on_frame(fake_person(), hand_raised=True)
        self.assertEqual([e.type for e in events], ["PERSON_ENTER", "PERSON_CONFIRMED"])

    def test_raise_hand_mode_resets_hold_when_hand_drops(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(
            greeting_delay_seconds=3.0,
            emit=events.append,
            trigger_mode="raise_hand",
            gesture_hold_seconds=0.4,
        )

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person())
        with patch("vision.state_machine.time.time", return_value=1000.1):
            sm.on_frame(fake_person(), hand_raised=True)
        with patch("vision.state_machine.time.time", return_value=1000.2):
            sm.on_frame(fake_person(), hand_raised=False)
        with patch("vision.state_machine.time.time", return_value=1000.3):
            sm.on_frame(fake_person(), hand_raised=True)

        self.assertEqual([e.type for e in events], ["PERSON_ENTER"])

    def test_exit_before_delay_resets_without_confirm(self) -> None:
        events: list[VisionEvent] = []
        sm = PresenceStateMachine(greeting_delay_seconds=3.0, emit=events.append)

        with patch("vision.state_machine.time.time", return_value=1000.0):
            sm.on_frame(fake_person())
        with patch("vision.state_machine.time.time", return_value=1001.0):
            sm.on_frame(None)

        self.assertEqual([e.type for e in events], ["PERSON_ENTER", "PERSON_EXIT"])
        self.assertEqual(sm.state.value, "IDLE")


class TestWaveDetector(unittest.TestCase):
    def test_detects_side_to_side_wave(self) -> None:
        detector = WaveDetector(history_len=14, min_amplitude=0.04, min_reversals=2, min_step=0.005)
        xs = [0.40, 0.45, 0.50, 0.55, 0.50, 0.45, 0.40, 0.45, 0.50]
        for x in xs:
            detector._wrist_x_history.append(x)
        self.assertTrue(detector._detect_wave())

    def test_rejects_small_motion(self) -> None:
        detector = WaveDetector()
        for x in [0.49, 0.50, 0.51, 0.50, 0.49, 0.50, 0.51, 0.50]:
            detector._wrist_x_history.append(x)
        self.assertFalse(detector._detect_wave())


if __name__ == "__main__":
    unittest.main()
