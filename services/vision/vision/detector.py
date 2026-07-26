from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from ultralytics import YOLO


PERSON_CLASS_ID = 0


@dataclass
class PersonDetection:
    track_id: int
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 normalized 0-1
    confidence: float
    center_x: float
    center_y: float
    height_ratio: float
    in_zone: bool
    distance_ok: bool


class PersonDetector:
    def __init__(
        self,
        model_name: str,
        confidence_threshold: float,
        zone_width_ratio: float,
        min_bbox_height_ratio: float,
        max_bbox_height_ratio: float,
        inference_size: int = 416,
    ) -> None:
        self.model = YOLO(model_name)
        self.confidence_threshold = confidence_threshold
        self.zone_width_ratio = zone_width_ratio
        self.min_bbox_height_ratio = min_bbox_height_ratio
        self.max_bbox_height_ratio = max_bbox_height_ratio
        self.inference_size = inference_size

    def detect(self, frame: np.ndarray) -> list[PersonDetection]:
        height, width = frame.shape[:2]
        results = self.model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[PERSON_CLASS_ID],
            conf=self.confidence_threshold,
            verbose=False,
            imgsz=self.inference_size,
        )

        detections: list[PersonDetection] = []
        if not results:
            return detections

        result = results[0]
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return detections

        zone_left = (1.0 - self.zone_width_ratio) / 2.0
        zone_right = 1.0 - zone_left

        for index, box in enumerate(boxes):
            track_id_raw = box.id
            track_id = int(track_id_raw.item()) if track_id_raw is not None else -(index + 1)
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            conf = float(box.conf[0].item())

            nx1, ny1, nx2, ny2 = x1 / width, y1 / height, x2 / width, y2 / height
            center_x = (nx1 + nx2) / 2.0
            center_y = (ny1 + ny2) / 2.0
            height_ratio = ny2 - ny1

            in_zone = zone_left <= center_x <= zone_right and 0.0 <= center_y <= 1.0
            # Require minimum size (within max detection distance). Closer visitors
            # produce larger boxes and should still count — laptop webcams often fill
            # most of the frame during local testing.
            distance_ok = height_ratio >= self.min_bbox_height_ratio

            detections.append(
                PersonDetection(
                    track_id=track_id,
                    bbox=(nx1, ny1, nx2, ny2),
                    confidence=conf,
                    center_x=center_x,
                    center_y=center_y,
                    height_ratio=height_ratio,
                    in_zone=in_zone,
                    distance_ok=distance_ok,
                )
            )

        return detections

    def update_detection_distance(self, distance_m: float) -> float:
        distance = max(1.0, min(distance_m, 2.5))
        self.min_bbox_height_ratio = 0.12 + (2.5 - distance) * 0.08
        return distance

    @staticmethod
    def pick_primary(detections: list[PersonDetection]) -> Optional[PersonDetection]:
        eligible = [d for d in detections if d.in_zone and d.distance_ok]
        if not eligible:
            return None

        def sort_key(d: PersonDetection) -> tuple[float, float]:
            center_distance = abs(d.center_x - 0.5)
            return (center_distance, -d.height_ratio)

        return min(eligible, key=sort_key)
