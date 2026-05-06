from __future__ import annotations

import asyncio
import gzip
import json
import time
import uuid
import weakref
from dataclasses import dataclass
from typing import Any

import aiohttp
from livekit import rtc
from livekit.agents import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectOptions,
    stt,
    utils,
)


_SAMPLE_RATE = 16000
_NUM_CHANNELS = 1

_FULL_CLIENT_REQUEST = 0x1
_AUDIO_ONLY_REQUEST = 0x2
_FULL_SERVER_RESPONSE = 0x9
_ERROR_RESPONSE = 0xF

_NO_SEQUENCE = 0x0
_NEGATIVE_SEQUENCE = 0x2

_JSON_SERIALIZATION = 0x1
_GZIP_COMPRESSION = 0x1


@dataclass
class DoubaoSttConfig:
    api_key: str | None
    resource_id: str | None
    app_id: str | None
    access_token: str | None
    cluster: str | None
    ws_url: str
    uid: str
    language: str = "zh-CN"
    model_name: str = "bigmodel"
    sample_rate: int = _SAMPLE_RATE


class DoubaoSTT(stt.STT):
    def __init__(self, config: DoubaoSttConfig) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=True,
                offline_recognize=False,
            )
        )
        self._config = config
        self._session: aiohttp.ClientSession | None = None
        self._streams = weakref.WeakSet[DoubaoSpeechStream]()

    @property
    def model(self) -> str:
        return self._config.resource_id or self._config.cluster or self._config.model_name

    @property
    def provider(self) -> str:
        return "volcengine"

    def stream(
        self,
        *,
        language: str | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> DoubaoSpeechStream:
        stream = DoubaoSpeechStream(
            stt=self,
            conn_options=conn_options,
            language=language or self._config.language,
        )
        self._streams.add(stream)
        return stream

    async def _recognize_impl(
        self,
        buffer: object,
        *,
        language: str | None = None,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        del buffer, language, conn_options
        raise NotImplementedError("Doubao STT currently supports streaming only.")

    async def aclose(self) -> None:
        for stream in list(self._streams):
            await stream.aclose()

        if self._session is not None:
            await self._session.close()
            self._session = None

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            timeout = aiohttp.ClientTimeout(total=None, connect=15)
            self._session = aiohttp.ClientSession(timeout=timeout)

        return self._session


class DoubaoSpeechStream(stt.RecognizeStream):
    def __init__(
        self,
        *,
        stt: DoubaoSTT,
        conn_options: APIConnectOptions,
        language: str,
    ) -> None:
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=stt._config.sample_rate)
        self._stt = stt
        self._config = stt._config
        self._language = language
        self._request_id = uuid.uuid4().hex

    async def _run(self) -> None:
        ws = await self._connect()
        try:
            send = asyncio.create_task(self._send_audio(ws), name="doubao-stt-send")
            recv = asyncio.create_task(self._recv_events(ws), name="doubao-stt-recv")
            done, pending = await asyncio.wait(
                {send, recv},
                return_when=asyncio.FIRST_EXCEPTION,
            )

            for task in done:
                exc = task.exception()
                if exc is not None:
                    raise exc

            for task in pending:
                await task
        finally:
            await ws.close()

    async def _connect(self) -> aiohttp.ClientWebSocketResponse:
        connect_id = uuid.uuid4().hex
        headers = self._build_headers(connect_id)
        session = self._stt._ensure_session()

        try:
            started = time.perf_counter()
            ws = await session.ws_connect(
                self._config.ws_url,
                headers=headers,
                autoping=True,
                heartbeat=20,
                timeout=self._conn_options.timeout,
            )
            self._report_connection_acquired(time.perf_counter() - started, False)
            await ws.send_bytes(self._build_init_frame())
            self.start_time = time.time()
            return ws
        except TimeoutError as exc:
            raise APITimeoutError() from exc
        except aiohttp.ClientResponseError as exc:
            raise APIStatusError(
                exc.message or "failed to connect to Doubao STT",
                status_code=exc.status,
            ) from exc
        except aiohttp.ClientError as exc:
            raise APIConnectionError("failed to connect to Doubao STT") from exc

    def _build_headers(self, connect_id: str) -> dict[str, str]:
        headers = {
            "User-Agent": "LiveKit Agents",
            "X-Api-Connect-Id": connect_id,
        }
        if self._config.api_key and self._config.resource_id:
            headers["X-Api-Key"] = self._config.api_key
            headers["X-Api-Resource-Id"] = self._config.resource_id
            return headers

        if self._config.app_id and self._config.access_token and self._config.cluster:
            headers["X-Api-App-Key"] = self._config.app_id
            headers["X-Api-Access-Key"] = self._config.access_token
            headers["X-Api-Resource-Id"] = self._config.cluster
            return headers

        raise APIConnectionError("Doubao STT credentials are incomplete")

    async def _send_audio(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        audio_bstream = utils.audio.AudioByteStream(
            sample_rate=self._config.sample_rate,
            num_channels=_NUM_CHANNELS,
            samples_per_channel=self._config.sample_rate // 10,
        )

        async for data in self._input_ch:
            frames: list[rtc.AudioFrame] = []
            if isinstance(data, rtc.AudioFrame):
                frames.extend(audio_bstream.write(data.data.tobytes()))
            elif isinstance(data, self._FlushSentinel):
                frames.extend(audio_bstream.flush())
            else:
                continue

            for frame in frames:
                await ws.send_bytes(self._build_audio_frame(frame.data.tobytes(), last=False))

        for frame in audio_bstream.flush():
            await ws.send_bytes(self._build_audio_frame(frame.data.tobytes(), last=False))

        await ws.send_bytes(self._build_audio_frame(b"", last=True))

    async def _recv_events(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        last_text = ""

        while True:
            msg = await ws.receive()
            if msg.type in {
                aiohttp.WSMsgType.CLOSED,
                aiohttp.WSMsgType.CLOSE,
                aiohttp.WSMsgType.CLOSING,
            }:
                return

            if msg.type == aiohttp.WSMsgType.ERROR:
                raise APIConnectionError("Doubao STT websocket error")

            if msg.type != aiohttp.WSMsgType.BINARY:
                continue

            payload = self._parse_frame(msg.data)
            if not payload:
                continue

            payload_msg = payload.get("payload_msg") or payload
            code = int(payload_msg.get("code", 0) or 0)
            if code and code != 1000:
                raise APIStatusError(
                    payload_msg.get("message", "Doubao STT request failed"),
                    status_code=code,
                    body=payload_msg,
                )

            result = payload_msg.get("result") or {}
            text = (result.get("text") or "").strip()
            utterances = result.get("utterances") or []
            is_final = any(bool(item.get("definite")) for item in utterances)

            if text and text != last_text:
                event_type = (
                    stt.SpeechEventType.FINAL_TRANSCRIPT
                    if is_final
                    else stt.SpeechEventType.INTERIM_TRANSCRIPT
                )
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=event_type,
                        request_id=self._request_id,
                        alternatives=[
                            stt.SpeechData(
                                text=text,
                                language=self._language,
                            )
                        ],
                    )
                )
                last_text = text

    def _build_init_frame(self) -> bytes:
        payload = {
            "user": {
                "uid": self._config.uid,
            },
            "audio": {
                "format": "pcm",
                "rate": self._config.sample_rate,
                "bits": 16,
                "channel": 1,
                "codec": "raw",
                "language": self._language,
            },
            "request": {
                "reqid": self._request_id,
                "model_name": self._config.model_name,
                "sequence": 1,
                "show_utterances": True,
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": False,
            },
        }

        body = gzip.compress(json.dumps(payload).encode("utf-8"))
        header = bytes([0x11, _FULL_CLIENT_REQUEST << 4, 0x11, 0x00])
        return header + len(body).to_bytes(4, "big") + body

    def _build_audio_frame(self, chunk: bytes, *, last: bool) -> bytes:
        flags = _NEGATIVE_SEQUENCE if last else _NO_SEQUENCE
        header = bytes(
            [
                0x11,
                (_AUDIO_ONLY_REQUEST << 4) | flags,
                _GZIP_COMPRESSION,
                0x00,
            ]
        )
        body = gzip.compress(chunk)
        return header + len(body).to_bytes(4, "big") + body

    def _parse_frame(self, data: bytes) -> dict[str, Any]:
        if len(data) < 8:
            return {}

        header_size = (data[0] & 0x0F) * 4
        message_type = data[1] >> 4
        serialization = data[2] >> 4
        compression = data[2] & 0x0F
        body = data[header_size:]

        if message_type == _ERROR_RESPONSE:
            if len(body) >= 8:
                payload_size = int.from_bytes(body[4:8], "big", signed=False)
                payload = body[8 : 8 + payload_size]
                try:
                    decoded = payload.decode("utf-8", errors="ignore")
                    return json.loads(decoded)
                except Exception:
                    pass
            return {
                "code": -1,
                "message": body.decode("utf-8", errors="ignore"),
            }

        if message_type != _FULL_SERVER_RESPONSE or len(body) < 8:
            return {}

        payload_size = int.from_bytes(body[4:8], "big", signed=False)
        payload = body[8 : 8 + payload_size]
        if compression == _GZIP_COMPRESSION and payload:
            payload = gzip.decompress(payload)

        if serialization == _JSON_SERIALIZATION and payload:
            try:
                return json.loads(payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                return {}

        return {}
