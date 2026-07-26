#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT/models"
MODEL_FILE="$MODEL_DIR/hand_landmarker.task"
URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

mkdir -p "$MODEL_DIR"
if [ -f "$MODEL_FILE" ]; then
  echo "Hand landmarker model already exists at $MODEL_FILE"
  exit 0
fi

echo "Downloading hand landmarker model..."
curl -fsSL -o "$MODEL_FILE" "$URL"
echo "Saved to $MODEL_FILE"
