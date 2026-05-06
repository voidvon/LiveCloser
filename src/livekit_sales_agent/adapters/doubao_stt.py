from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DoubaoSttConfig:
    app_id: str
    access_token: str
    ws_url: str
    sample_rate: int = 16000


class DoubaoSttAdapter:
    """
    Placeholder for a future LiveKit STT adapter.

    Implement this when you are ready to replace the temporary STT descriptor
    with Doubao's streaming ASR over WebSocket.
    """

    def __init__(self, config: DoubaoSttConfig):
        self.config = config

    async def stream_transcriptions(self) -> None:
        raise NotImplementedError("Implement Doubao streaming ASR here.")
