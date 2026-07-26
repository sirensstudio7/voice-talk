from __future__ import annotations

import asyncio
import json
import sys
from typing import Any, Callable, Optional

import websockets
from websockets.client import WebSocketClientProtocol


class VisionWebSocketClient:
    def __init__(
        self,
        ws_url: str,
        business_slug: str,
        kiosk_id: str,
        on_message: Optional[Callable[[dict[str, Any]], None]] = None,
    ) -> None:
        self.ws_url = ws_url
        self.business_slug = business_slug
        self.kiosk_id = kiosk_id
        self.on_message = on_message
        self._ws: Optional[WebSocketClientProtocol] = None
        self._send_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._running = False

    def _build_url(self) -> str:
        separator = "&" if "?" in self.ws_url else "?"
        return (
            f"{self.ws_url}{separator}business={self.business_slug}"
            f"&kiosk_id={self.kiosk_id}"
        )

    async def connect(self) -> None:
        url = self._build_url()
        self._ws = await websockets.connect(url, ping_interval=20, ping_timeout=60)
        await self._ws.send(
            json.dumps({"type": "vision.hello", "kiosk_id": self.kiosk_id})
        )

    async def _run_session(self) -> None:
        if not self._ws:
            await self.connect()

        assert self._ws is not None

        async def sender() -> None:
            while self._running:
                payload = await self._send_queue.get()
                if payload is None:
                    break
                try:
                    await self._ws.send(json.dumps(payload))
                except Exception:
                    break

        async def receiver() -> None:
            assert self._ws is not None
            async for raw in self._ws:
                try:
                    payload = json.loads(raw)
                    if self.on_message:
                        self.on_message(payload)
                except json.JSONDecodeError:
                    continue

        await asyncio.gather(sender(), receiver())

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            try:
                await self.connect()
                print("[vision] connected to hub", file=sys.stderr)
                await self._run_session()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                print(f"[vision] hub disconnected ({exc}), retrying in 2s…", file=sys.stderr)
                await asyncio.sleep(2)
            finally:
                await self.close()

    async def emit_event(self, event_type: str, track_id: Optional[int] = None) -> None:
        payload: dict[str, Any] = {
            "type": "vision.event",
            "event": event_type,
            "kiosk_id": self.kiosk_id,
        }
        if track_id is not None:
            payload["track_id"] = track_id
        await self._send_queue.put(payload)

    async def close(self) -> None:
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    async def shutdown(self) -> None:
        self._running = False
        await self._send_queue.put(None)
        await self.close()
