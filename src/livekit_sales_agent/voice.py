from __future__ import annotations

from livekit.agents import stt, tts

from livekit_sales_agent.adapters.doubao_stt import DoubaoSTT, DoubaoSttConfig
from livekit_sales_agent.adapters.doubao_tts import DoubaoTTS, DoubaoTtsConfig
from livekit_sales_agent.config import SttModelSettings, TtsModelSettings


def build_stt(profile: SttModelSettings | None) -> stt.STT | None:
    if profile is None:
        return None

    provider = profile.provider.strip().lower()
    if provider == "doubao":
        return DoubaoSTT(
            DoubaoSttConfig(
                api_key=profile.api_key or None,
                resource_id=profile.resource_id or None,
                app_id=profile.app_id or None,
                access_token=profile.access_token or None,
                cluster=profile.cluster or None,
                ws_url=profile.ws_url,
                uid=profile.uid,
                language=profile.language,
            )
        )

    raise ValueError(f"Unsupported STT provider: {profile.provider}")


def build_tts(profile: TtsModelSettings | None) -> tts.TTS | None:
    if profile is None:
        return None

    provider = profile.provider.strip().lower()
    if provider == "doubao":
        return DoubaoTTS(
            DoubaoTtsConfig(
                api_key=profile.api_key or None,
                resource_id=profile.resource_id or None,
                app_id=profile.app_id or None,
                access_token=profile.access_token or None,
                cluster=profile.cluster or None,
                voice_type=profile.voice_type,
                http_url=profile.http_url,
                uid=profile.uid,
                encoding=profile.encoding,
                sample_rate=profile.sample_rate,
                speed_ratio=profile.speed_ratio,
                volume_ratio=profile.volume_ratio,
                pitch_ratio=profile.pitch_ratio,
            )
        )

    raise ValueError(f"Unsupported TTS provider: {profile.provider}")
