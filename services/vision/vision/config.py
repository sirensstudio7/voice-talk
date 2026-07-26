from __future__ import annotations

import argparse
import os
from dataclasses import dataclass


@dataclass
class VisionConfig:
    business_slug: str
    kiosk_id: str
    ws_url: str
    camera_index: int
    model_name: str
    greeting_delay_seconds: float
    greeting_trigger_mode: str
    detection_distance_m: float
    zone_width_ratio: float
    min_bbox_height_ratio: float
    max_bbox_height_ratio: float
    confidence_threshold: float
    fps_target: int
    camera_width: int
    camera_height: int
    inference_width: int
    inference_size: int
    debug: bool


def parse_args() -> VisionConfig:
    parser = argparse.ArgumentParser(description="VoiceTalk vision presence service")
    parser.add_argument("--business", required=True, help="Business slug")
    parser.add_argument("--kiosk-id", default="default", help="Kiosk identifier")
    parser.add_argument(
        "--ws-url",
        default=os.environ.get("VISION_WS_URL", "ws://localhost:8000/ws/vision"),
        help="Fastify vision WebSocket URL",
    )
    parser.add_argument("--camera", type=int, default=0, help="Camera device index")
    parser.add_argument("--model", default="yolo11n.pt", help="YOLO model weights")
    parser.add_argument("--greeting-delay", type=float, default=3.0)
    parser.add_argument(
        "--trigger-mode",
        choices=("presence", "gesture", "raise_hand"),
        default=os.environ.get("VISION_TRIGGER_MODE", "presence"),
        help="Greeting trigger: presence (dwell), gesture (wave), or raise_hand (hold hand up)",
    )
    parser.add_argument("--detection-distance", type=float, default=2.0)
    parser.add_argument("--zone-width", type=float, default=0.7)
    parser.add_argument("--confidence", type=float, default=0.5)
    parser.add_argument("--fps", type=int, default=8, help="Target detection FPS (default 8)")
    parser.add_argument("--camera-width", type=int, default=640)
    parser.add_argument("--camera-height", type=int, default=480)
    parser.add_argument("--inference-width", type=int, default=480, help="Resize frame width before YOLO")
    parser.add_argument("--inference-size", type=int, default=416, help="YOLO imgsz (smaller = faster)")
    parser.add_argument("--debug", action="store_true", help="Show debug window (adds some lag)")
    args = parser.parse_args()

    # Map detection distance (meters) to minimum bbox height ratio.
    # Farther max distance → smaller minimum box (ignore tiny/distant figures).
    # No upper cap: closer visitors always qualify.
    distance = max(1.0, min(args.detection_distance, 2.5))
    min_ratio = 0.12 + (2.5 - distance) * 0.08
    max_ratio = 0.95

    return VisionConfig(
        business_slug=args.business,
        kiosk_id=args.kiosk_id,
        ws_url=args.ws_url,
        camera_index=args.camera,
        model_name=args.model,
        greeting_delay_seconds=args.greeting_delay,
        greeting_trigger_mode=args.trigger_mode,
        detection_distance_m=distance,
        zone_width_ratio=args.zone_width,
        min_bbox_height_ratio=min_ratio,
        max_bbox_height_ratio=max_ratio,
        confidence_threshold=args.confidence,
        fps_target=args.fps,
        camera_width=args.camera_width,
        camera_height=args.camera_height,
        inference_width=args.inference_width,
        inference_size=args.inference_size,
        debug=args.debug,
    )
