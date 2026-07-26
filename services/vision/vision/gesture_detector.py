from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "hand_landmarker.task"


@dataclass
class GestureResult:
    wave_detected: bool
    hand_raised: bool


class WaveDetector:
    """Detect a raised-hand wave using MediaPipe Hand Landmarker + motion history."""

    def __init__(
        self,
        history_len: int = 14,
        min_amplitude: float = 0.045,
        min_reversals: int = 2,
        min_step: float = 0.007,
        raised_max_y: float = 0.82,
    ) -> None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                f"Missing hand landmarker model at {MODEL_PATH}. "
                "Run: bash scripts/download-hand-model.sh"
            )

        self.history_len = history_len
        self.min_amplitude = min_amplitude
        self.min_reversals = min_reversals
        self.min_step = min_step
        self.raised_max_y = raised_max_y
        self._timestamp_ms = 0
        self._wrist_x_history: deque[float | None] = deque(maxlen=history_len)

        options = vision.HandLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(MODEL_PATH)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.25,
            min_hand_presence_confidence=0.25,
            min_tracking_confidence=0.25,
        )
        self._landmarker = vision.HandLandmarker.create_from_options(options)

    def reset(self) -> None:
        self._wrist_x_history.clear()

    def detect(self, frame_bgr: np.ndarray) -> GestureResult:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        if not rgb.flags["C_CONTIGUOUS"]:
            rgb = np.ascontiguousarray(rgb)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        self._timestamp_ms += 33
        result = self._landmarker.detect_for_video(mp_image, self._timestamp_ms)

        if not result.hand_landmarks:
            self._wrist_x_history.append(None)
            return GestureResult(wave_detected=False, hand_raised=False)

        wrist_x, wrist_y = self._pick_raised_wrist(result.hand_landmarks)
        if wrist_x is None or wrist_y is None:
            self._wrist_x_history.append(None)
            return GestureResult(wave_detected=False, hand_raised=False)

        self._wrist_x_history.append(wrist_x)
        wave_detected = self._detect_wave()
        return GestureResult(wave_detected=wave_detected, hand_raised=True)

    def _pick_raised_wrist(self, hand_landmarks_list) -> tuple[float | None, float | None]:
        """Prefer the highest (smallest y) raised hand in frame."""
        best: tuple[float | None, float | None] = (None, None)
        best_y = 1.0

        for hand_landmarks in hand_landmarks_list:
            wrist = hand_landmarks[0]
            if wrist.y > self.raised_max_y:
                continue
            if wrist.y < best_y:
                best_y = wrist.y
                best = (wrist.x, wrist.y)

        return best

    def _detect_wave(self) -> bool:
        valid = [x for x in self._wrist_x_history if x is not None]
        if len(valid) < 8:
            return False

        amplitude = max(valid) - min(valid)
        if amplitude < self.min_amplitude:
            return False

        reversals = 0
        for index in range(2, len(valid)):
            delta_prev = valid[index - 1] - valid[index - 2]
            delta_next = valid[index] - valid[index - 1]
            if (
                delta_prev * delta_next < 0
                and abs(delta_prev) >= self.min_step
                and abs(delta_next) >= self.min_step
            ):
                reversals += 1

        return reversals >= self.min_reversals

    def close(self) -> None:
        self._landmarker.close()
