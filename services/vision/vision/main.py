from __future__ import annotations

import asyncio
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import cv2

from vision.config import parse_args
from vision.detector import PersonDetector, PersonDetection
from vision.gesture_detector import WaveDetector
from vision.state_machine import (
    PresenceStateMachine,
    TriggerMode,
    VisionEvent,
    parse_trigger_mode,
    uses_hand_detection,
)
from vision.ws_client import VisionWebSocketClient


def resize_for_inference(frame, target_width: int):
    height, width = frame.shape[:2]
    if width <= target_width:
        return frame
    target_height = max(1, int(height * (target_width / width)))
    return cv2.resize(frame, (target_width, target_height), interpolation=cv2.INTER_AREA)


def crop_person_frame(frame, primary: PersonDetection, padding: float = 0.15):
    """Crop to the detected person with padding so hand landmarks are easier to find."""
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = primary.bbox
    pad_x = (x2 - x1) * padding
    pad_y = (y2 - y1) * padding
    left = max(0, int((x1 - pad_x) * width))
    top = max(0, int((y1 - pad_y) * height))
    right = min(width, int((x2 + pad_x) * width))
    bottom = min(height, int((y2 + pad_y) * height))
    if right <= left or bottom <= top:
        return frame
    return frame[top:bottom, left:right]


def render_debug_frame(
    frame,
    primary: Optional[PersonDetection],
    session_active: bool,
) -> None:
    preview = cv2.resize(frame, (640, 360), interpolation=cv2.INTER_AREA)
    ph, pw = preview.shape[:2]

    if primary:
        x1, y1, x2, y2 = primary.bbox
        cv2.rectangle(
            preview,
            (int(x1 * pw), int(y1 * ph)),
            (int(x2 * pw), int(y2 * ph)),
            (0, 255, 0),
            2,
        )
        label = "detected"
    else:
        label = "scanning"

    if session_active:
        label = "session active (still scanning)"

    cv2.putText(
        preview,
        label,
        (10, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.imshow("Vision Debug", preview)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        raise KeyboardInterrupt


async def run_service() -> None:
    config = parse_args()
    detector = PersonDetector(
        model_name=config.model_name,
        confidence_threshold=config.confidence_threshold,
        zone_width_ratio=config.zone_width_ratio,
        min_bbox_height_ratio=config.min_bbox_height_ratio,
        max_bbox_height_ratio=config.max_bbox_height_ratio,
        inference_size=config.inference_size,
    )

    session_active = False
    detection_distance_m = config.detection_distance_m
    trigger_mode = config.greeting_trigger_mode
    loop = asyncio.get_running_loop()
    event_queue: asyncio.Queue[VisionEvent] = asyncio.Queue()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yolo")

    last_primary: Optional[PersonDetection] = None
    detect_inflight = False
    shutdown_requested = False

    def queue_event(event: VisionEvent) -> None:
        loop.call_soon_threadsafe(event_queue.put_nowait, event)

    state_machine = PresenceStateMachine(
        greeting_delay_seconds=config.greeting_delay_seconds,
        emit=queue_event,
        trigger_mode=trigger_mode,
    )

    wave_detector: Optional[WaveDetector] = None
    if uses_hand_detection(parse_trigger_mode(trigger_mode)):
        wave_detector = WaveDetector()

    ws_client = VisionWebSocketClient(
        ws_url=config.ws_url,
        business_slug=config.business_slug,
        kiosk_id=config.kiosk_id,
    )

    def on_server_message(msg: dict) -> None:
        nonlocal session_active, detection_distance_m, trigger_mode, wave_detector
        msg_type = msg.get("type")
        if msg_type == "vision.session.active":
            session_active = True
            state_machine.notify_session_active()
        elif msg_type == "vision.session.released":
            # Conversation finished or greeting failed — re-arm for the next visitor
            # even if someone is still in frame.
            session_active = False
            state_machine.notify_session_ended()
        elif msg_type == "vision.session.ended":
            session_active = False
            state_machine.notify_session_ended()
        elif msg_type == "vision.config":
            config_payload = msg.get("config") or {}
            delay = config_payload.get("greeting_delay_seconds")
            distance = config_payload.get("detection_distance_m")
            mode = config_payload.get("greeting_trigger_mode")
            if isinstance(delay, (int, float)):
                state_machine.greeting_delay_seconds = float(delay)
            if isinstance(distance, (int, float)):
                detection_distance_m = detector.update_detection_distance(float(distance))
            if isinstance(mode, str) and mode in (
                TriggerMode.PRESENCE.value,
                TriggerMode.GESTURE.value,
                TriggerMode.RAISE_HAND.value,
            ):
                parsed = parse_trigger_mode(mode)
                trigger_mode = mode
                state_machine.trigger_mode = parsed
                if uses_hand_detection(parsed) and wave_detector is None:
                    wave_detector = WaveDetector()
                elif not uses_hand_detection(parsed) and wave_detector is not None:
                    wave_detector.close()
                    wave_detector = None
            if msg.get("session_active") is True:
                session_active = True
                state_machine.notify_session_active()
            elif msg.get("session_active") is False:
                session_active = False
                state_machine.notify_session_ended()
            print(
                f"[vision] config updated delay={state_machine.greeting_delay_seconds}s "
                f"distance={detection_distance_m}m mode={trigger_mode}",
                file=sys.stderr,
                flush=True,
            )

    ws_client.on_message = on_server_message

    cap = cv2.VideoCapture(config.camera_index)
    if not cap.isOpened():
        print(f"Failed to open camera index {config.camera_index}", file=sys.stderr)
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.camera_width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.camera_height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    frame_interval = 1.0 / max(config.fps_target, 1)
    preview_interval = 1.0 / 15.0
    last_detect_at = 0.0
    last_preview_at = 0.0

    async def process_events() -> None:
        while True:
            event = await event_queue.get()
            print(
                f"[vision] {event.type} track={event.track_id}",
                file=sys.stderr,
                flush=True,
            )
            await ws_client.emit_event(event.type, event.track_id)

    async def detect_persons(frame):
        inference_frame = resize_for_inference(frame, config.inference_width)
        return await loop.run_in_executor(executor, detector.detect, inference_frame)

    last_gesture_track_id: Optional[int] = None

    async def run_detection(frame) -> None:
        nonlocal last_primary, detect_inflight, last_gesture_track_id
        try:
            detections = await detect_persons(frame)
            primary = detector.pick_primary(detections)
            last_primary = primary

            if wave_detector is not None:
                if primary is None:
                    wave_detector.reset()
                    last_gesture_track_id = None
                elif last_gesture_track_id is not None and primary.track_id != last_gesture_track_id:
                    wave_detector.reset()
                if primary is not None:
                    last_gesture_track_id = primary.track_id

            wave_detected = False
            hand_raised = False
            if (
                wave_detector is not None
                and primary is not None
                and uses_hand_detection(state_machine.trigger_mode)
            ):
                try:
                    hand_frame = crop_person_frame(frame, primary)
                    gesture = wave_detector.detect(hand_frame)
                    wave_detected = gesture.wave_detected
                    hand_raised = gesture.hand_raised
                    if config.debug and (gesture.hand_raised or gesture.wave_detected):
                        print(
                            f"[vision] mode={state_machine.trigger_mode.value} "
                            f"hand raised={gesture.hand_raised} wave={gesture.wave_detected}",
                            file=sys.stderr,
                            flush=True,
                        )
                except Exception as exc:
                    print(f"[vision] gesture detection error: {exc}", file=sys.stderr, flush=True)

            state_machine.on_frame(
                primary,
                wave_detected=wave_detected,
                hand_raised=hand_raised,
            )

            if config.debug and detections and not primary:
                for det in detections:
                    print(
                        f"[vision] rejected track={det.track_id} "
                        f"h={det.height_ratio:.2f} zone={det.in_zone} "
                        f"dist_ok={det.distance_ok} conf={det.confidence:.2f}",
                        file=sys.stderr,
                    )
        finally:
            detect_inflight = False

    async def capture_loop() -> None:
        nonlocal last_detect_at, last_preview_at, shutdown_requested, detect_inflight
        while not shutdown_requested:
            ok, frame = cap.read()
            if not ok:
                await asyncio.sleep(0.05)
                continue

            now = time.time()

            # Preview runs independently — never blocked by YOLO or session state.
            if config.debug and now - last_preview_at >= preview_interval:
                last_preview_at = now
                try:
                    render_debug_frame(frame, last_primary, session_active)
                except KeyboardInterrupt:
                    shutdown_requested = True
                    await ws_client.shutdown()
                    break

            if detect_inflight:
                await asyncio.sleep(0.005)
                continue

            if now - last_detect_at < frame_interval:
                await asyncio.sleep(0.005)
                continue

            last_detect_at = now
            detect_inflight = True
            asyncio.create_task(run_detection(frame.copy()))
            await asyncio.sleep(0)

    try:
        await asyncio.gather(process_events(), capture_loop(), ws_client.run_forever())
    finally:
        cap.release()
        executor.shutdown(wait=False)
        if wave_detector is not None:
            wave_detector.close()
        if config.debug:
            cv2.destroyAllWindows()
        await ws_client.shutdown()


def main() -> None:
    asyncio.run(run_service())


if __name__ == "__main__":
    main()
