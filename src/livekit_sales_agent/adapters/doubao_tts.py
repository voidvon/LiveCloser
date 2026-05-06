from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DoubaoTtsConfig:
    app_id: str
    access_token: str
    ws_url: str
    voice_type: str
    sample_rate: int = 24000


class DoubaoTtsAdapter:
    """
    Placeholder for a future LiveKit TTS adapter.

    Implement this when you are ready to replace the temporary TTS descriptor
    with Doubao's streaming TTS over WebSocket.
    """

    def __init__(self, config: DoubaoTtsConfig):
        self.config = config

    async def synthesize_stream(self, text: str) -> None:
        raise NotImplementedError("Implement Doubao streaming TTS here.")
