from __future__ import annotations

import asyncio
import inspect
import logging
import traceback

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

ACTIVITY_START = object()
ACTIVITY_END = object()
AUDIO_STREAM_END = object()


class GeminiLive:
    def __init__(
        self,
        api_key: str,
        model: str,
        system_instruction: str,
        tools: list[types.Tool],
        tool_mapping: dict,
        input_sample_rate: int = 16000,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.system_instruction = system_instruction
        self.tools = tools
        self.tool_mapping = tool_mapping
        self.input_sample_rate = input_sample_rate
        self.client = genai.Client(api_key=api_key)

    async def start_session(
        self,
        audio_input_queue: asyncio.Queue,
        audio_output_callback,
        audio_interrupt_callback=None,
        order_update_callback=None,
    ):
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part(text=self.system_instruction)]
            ),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            tools=self.tools,
        )

        logger.info("Connecting to Gemini Live model=%s", self.model)
        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            logger.info("Gemini Live session opened")

            async def send_audio() -> None:
                try:
                    while True:
                        chunk = await audio_input_queue.get()
                        if chunk is ACTIVITY_START:
                            await session.send_realtime_input(
                                activity_start=types.ActivityStart()
                            )
                            logger.debug("Sent activity_start")
                        elif chunk is ACTIVITY_END:
                            await session.send_realtime_input(
                                activity_end=types.ActivityEnd()
                            )
                            logger.debug("Sent activity_end")
                        elif chunk is AUDIO_STREAM_END:
                            await session.send_realtime_input(audio_stream_end=True)
                            logger.info("Sent audio_stream_end")
                        elif isinstance(chunk, (bytes, bytearray)) and len(chunk) > 0:
                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=bytes(chunk),
                                    mime_type=f"audio/pcm;rate={self.input_sample_rate}",
                                )
                            )
                        else:
                            logger.debug("Skipped empty audio chunk")
                except asyncio.CancelledError:
                    logger.debug("send_audio cancelled")
                except Exception as exc:  # noqa: BLE001
                    logger.error("send_audio error: %s\n%s", exc, traceback.format_exc())

            event_queue: asyncio.Queue = asyncio.Queue()

            async def receive_loop() -> None:
                try:
                    while True:
                        async for response in session.receive():
                            server_content = response.server_content
                            tool_call = response.tool_call

                            if server_content:
                                if server_content.model_turn:
                                    for part in server_content.model_turn.parts:
                                        if part.inline_data and part.inline_data.data:
                                            if inspect.iscoroutinefunction(audio_output_callback):
                                                await audio_output_callback(part.inline_data.data)
                                            else:
                                                audio_output_callback(part.inline_data.data)

                                if (
                                    server_content.input_transcription
                                    and server_content.input_transcription.text
                                ):
                                    text = server_content.input_transcription.text.rstrip()
                                    if text.strip():
                                        logger.info("User transcript: %s", text)
                                        await event_queue.put(
                                            {
                                                "type": "transcript.user",
                                                "text": text,
                                            }
                                        )

                                if (
                                    server_content.output_transcription
                                    and server_content.output_transcription.text
                                ):
                                    text = server_content.output_transcription.text.rstrip()
                                    if text.strip():
                                        logger.info("Assistant transcript: %s", text)
                                        await event_queue.put(
                                            {
                                                "type": "transcript.assistant",
                                                "text": text,
                                            }
                                        )

                                if server_content.turn_complete:
                                    await event_queue.put({"type": "turn_complete"})

                                if server_content.interrupted:
                                    if audio_interrupt_callback:
                                        if inspect.iscoroutinefunction(audio_interrupt_callback):
                                            await audio_interrupt_callback()
                                        else:
                                            audio_interrupt_callback()
                                    await event_queue.put({"type": "interrupted"})

                            if tool_call:
                                function_responses = []
                                for fc in tool_call.function_calls:
                                    func_name = fc.name
                                    args = dict(fc.args or {})
                                    result: dict | str

                                    if func_name in self.tool_mapping:
                                        try:
                                            tool_func = self.tool_mapping[func_name]
                                            if inspect.iscoroutinefunction(tool_func):
                                                result = await tool_func(**args)
                                            else:
                                                loop = asyncio.get_running_loop()
                                                result = await loop.run_in_executor(
                                                    None, lambda: tool_func(**args)
                                                )
                                        except Exception as exc:  # noqa: BLE001
                                            result = {"error": str(exc)}
                                    else:
                                        result = {"error": f"Unknown tool '{func_name}'."}

                                    function_responses.append(
                                        types.FunctionResponse(
                                            name=func_name,
                                            id=fc.id,
                                            response={"result": result},
                                        )
                                    )

                                    await event_queue.put(
                                        {
                                            "type": "tool_call",
                                            "name": func_name,
                                            "args": args,
                                            "result": result,
                                        }
                                    )

                                    if order_update_callback and isinstance(result, dict):
                                        order = result.get("order")
                                        if order:
                                            await order_update_callback(order)

                                await session.send_tool_response(
                                    function_responses=function_responses
                                )
                except asyncio.CancelledError:
                    logger.debug("receive_loop cancelled")
                except Exception as exc:  # noqa: BLE001
                    logger.error("receive_loop error: %s\n%s", exc, traceback.format_exc())
                    await event_queue.put({"type": "error", "error": str(exc)})
                finally:
                    await event_queue.put(None)

            send_audio_task = asyncio.create_task(send_audio())
            receive_task = asyncio.create_task(receive_loop())

            try:
                while True:
                    event = await event_queue.get()
                    if event is None:
                        break
                    yield event
            finally:
                send_audio_task.cancel()
                receive_task.cancel()
