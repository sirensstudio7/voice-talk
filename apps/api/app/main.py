from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.gemini_live import (
    ACTIVITY_END,
    ACTIVITY_START,
    AUDIO_STREAM_END,
    GeminiLive,
)
from app.order_store import OrderStore
from app.seed import BUSINESS_NAME, PRODUCTS, build_system_instruction
from app.tools import build_tool_declarations, build_tool_mapping

load_dotenv(Path(__file__).resolve().parents[3] / ".env")
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")


def get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-live-preview")


app = FastAPI(title="EVA Voice API")


@app.on_event("startup")
async def log_config() -> None:
    logger.info("Gemini model: %s", get_gemini_model())
    logger.info("API key configured: %s", bool(GEMINI_API_KEY))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": get_gemini_model()}


@app.get("/menu")
async def menu() -> dict:
    return {
        "business": BUSINESS_NAME,
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "price": p.price,
                "category": p.category,
                "description": p.description,
                "image_url": p.image_url,
            }
            for p in PRODUCTS
        ],
    }


@app.websocket("/ws/session")
async def session_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info("Session websocket connected")

    if not GEMINI_API_KEY:
        await websocket.send_json({"type": "error", "error": "GEMINI_API_KEY is not configured."})
        await websocket.close()
        return

    order_store = OrderStore()
    audio_input_queue: asyncio.Queue = asyncio.Queue()

    async def audio_output_callback(data: bytes) -> None:
        await websocket.send_bytes(data)

    async def audio_interrupt_callback() -> None:
        await websocket.send_json({"type": "audio.interrupted"})

    async def order_update_callback(order: dict) -> None:
        await websocket.send_json({"type": "order.updated", "order": order})

    gemini_client = GeminiLive(
        api_key=GEMINI_API_KEY,
        model=get_gemini_model(),
        system_instruction=build_system_instruction(),
        tools=build_tool_declarations(),
        tool_mapping=build_tool_mapping(order_store),
    )

    async def receive_from_client() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message.get("bytes"):
                    await audio_input_queue.put(message["bytes"])
                elif message.get("text"):
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")
                    if msg_type == "session.end":
                        break
                    if msg_type == "audio.activity_start":
                        await audio_input_queue.put(ACTIVITY_START)
                    elif msg_type == "audio.activity_end":
                        await audio_input_queue.put(ACTIVITY_END)
                    elif msg_type == "audio.stream_end":
                        await audio_input_queue.put(AUDIO_STREAM_END)
        except WebSocketDisconnect:
            logger.info("Client disconnected")
        except Exception as exc:  # noqa: BLE001
            logger.error("Client receive error: %s", exc)

    receive_task = asyncio.create_task(receive_from_client())

    await websocket.send_json({"type": "session.status", "status": "connecting"})
    await websocket.send_json({"type": "order.updated", "order": order_store.snapshot()})

    try:
        await websocket.send_json({"type": "session.status", "status": "connected"})
        async for event in gemini_client.start_session(
            audio_input_queue=audio_input_queue,
            audio_output_callback=audio_output_callback,
            audio_interrupt_callback=audio_interrupt_callback,
            order_update_callback=order_update_callback,
        ):
            if event.get("type") == "tool_call":
                result = event.get("result")
                if isinstance(result, dict) and result.get("order"):
                    continue
            await websocket.send_json(event)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Gemini session failed")
        await websocket.send_json({"type": "error", "error": str(exc)})
    finally:
        receive_task.cancel()
        await websocket.send_json({"type": "session.status", "status": "disconnected"})
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
