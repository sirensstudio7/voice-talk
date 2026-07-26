# VoiceTalk Vision Service

Python sidecar for person detection and presence- or gesture-based conversation triggers.

## Requirements

- Python 3.11+
- USB webcam (1080p recommended)
- Optional GPU for faster YOLO inference
- MediaPipe Hand Landmarker (installed via `requirements.txt`) for hand-wave gesture mode

## Setup

```bash
cd services/vision
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
bash scripts/download-hand-model.sh
```

## Run

```bash
python main.py \
  --business YOUR_BUSINESS_SLUG \
  --ws-url ws://localhost:8000/ws/vision \
  --camera 0
```

From the monorepo root:

```bash
npm run vision:dev
```

## Debug overlay

Add `--debug` to show bounding boxes in a local OpenCV window.

## Greeting trigger modes

Configure in **Admin → Vision Settings → Greeting trigger** (synced over `vision.config` WebSocket):

| Mode | CLI flag | Behavior |
|------|----------|----------|
| `presence` (default) | `--trigger-mode presence` | Person in zone for greeting delay → greet |
| `gesture` | `--trigger-mode gesture` | Person in zone + raised-hand wave → greet |

The CLI `--trigger-mode` is overridden when the server pushes updated vision settings.

## Privacy

- Processes frames in memory only
- No image or video storage
- Person-class detection only (no face recognition)
