from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass

import aiohttp
from livekit.agents import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectOptions,
    tts,
)


@dataclass
class DoubaoTtsConfig:
    api_key: str | None
    resource_id: str | None
    app_id: str | None
    access_token: str | None
    cluster: str | None
    voice_type: str
    http_url: str
    uid: str
    encoding: str = "mp3"
    sample_rate: int = 24000
    speed_ratio: float = 1.0
    volume_ratio: float = 1.0
    pitch_ratio: float = 1.0


class DoubaoTTS(tts.TTS):
    def __init__(self, config: DoubaoTtsConfig) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=config.sample_rate,
            num_channels=1,
        )
        self._config = config
        self._session: aiohttp.ClientSession | None = None

    @property
    def model(self) -> str:
        return self._config.resource_id or self._config.cluster or self._config.voice_type

    @property
    def provider(self) -> str:
        return "volcengine"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return DoubaoChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            timeout = aiohttp.ClientTimeout(total=45, connect=15)
            self._session = aiohttp.ClientSession(timeout=timeout)

        return self._session


class DoubaoChunkedStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts: DoubaoTTS,
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts = tts
        self._config = tts._config

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = uuid.uuid4().hex
        payload = {
            "user": {
                "uid": self._config.uid,
            },
            "audio_params": {
                "format": self._config.encoding,
                "sample_rate": self._config.sample_rate,
                "speech_rate": _ratio_to_percent(self._config.speed_ratio),
                "loudness_rate": _ratio_to_percent(self._config.volume_ratio),
            },
            "req_params": {
                "text": self.input_text,
                "speaker": self._config.voice_type,
                "emotion": "happy",
            },
        }
        headers = self._build_headers(request_id)

        try:
            session = self._tts._ensure_session()
            async with session.post(
                self._config.http_url,
                json=payload,
                headers=headers,
                timeout=self._conn_options.timeout + 30,
            ) as response:
                if response.status >= 400:
                    body = await response.text()
                    raise APIStatusError(
                        "Doubao TTS request failed",
                        status_code=response.status,
                        body=body,
                    )
                body = await response.read()
                decoded_audio = _extract_audio_payload(body)

                output_emitter.initialize(
                    request_id=request_id,
                    sample_rate=self._config.sample_rate,
                    num_channels=1,
                    mime_type=f"audio/{self._config.encoding}",
                )
                output_emitter.push(decoded_audio)
        except TimeoutError as exc:
            raise APITimeoutError() from exc
        except aiohttp.ClientError as exc:
            raise APIConnectionError("failed to connect to Doubao TTS") from exc
        output_emitter.flush()

    def _build_headers(self, request_id: str) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "X-Api-Request-Id": request_id,
        }
        if self._config.api_key and self._config.resource_id:
            headers["X-Api-Key"] = self._config.api_key
            headers["X-Api-Resource-Id"] = self._config.resource_id
            return headers

        if self._config.app_id and self._config.access_token and self._config.cluster:
            headers["X-Api-App-Id"] = self._config.app_id
            headers["X-Api-Access-Key"] = self._config.access_token
            headers["X-Api-Resource-Id"] = self._config.cluster
            return headers

        raise APIConnectionError("Doubao TTS credentials are incomplete")


def _ratio_to_percent(value: float) -> int:
    return max(-50, min(100, round((value - 1.0) * 100)))


def _extract_audio_payload(body: bytes) -> bytes:
    stripped = body.lstrip()
    if stripped.startswith(b"{"):
        audio_parts: list[bytes] = []
        terminal_status: dict | None = None
        for line in stripped.decode("utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            code = int(item.get("code", 0) or 0)
            if code not in (0, 3000, 20000000):
                raise APIStatusError(
                    item.get("message", "Doubao TTS request failed"),
                    status_code=code,
                    body=item,
                )
            if item.get("data"):
                audio_parts.append(base64.b64decode(item["data"]))
            terminal_status = item

        if not audio_parts:
            raise APIStatusError(
                "Doubao TTS returned empty audio payload",
                body=terminal_status,
            )

        return b"".join(audio_parts)

    return body
