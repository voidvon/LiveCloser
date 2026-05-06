from __future__ import annotations

from livekit.agents import stt, tts

from livekit_sales_agent.adapters.doubao_stt import DoubaoSTT, DoubaoSttConfig
from livekit_sales_agent.adapters.doubao_tts import DoubaoTTS, DoubaoTtsConfig
from livekit_sales_agent.config import Settings


def build_stt(settings: Settings) -> stt.STT | None:
    if not settings.stt_descriptor:
        return None

    if settings.uses_doubao_stt:
        return DoubaoSTT(
            DoubaoSttConfig(
                api_key=settings.doubao_api_key,
                resource_id=settings.doubao_stt_resource_id,
                app_id=settings.doubao_app_id,
                access_token=settings.doubao_access_token,
                cluster=settings.doubao_stt_cluster,
                ws_url=settings.doubao_stt_ws_url,
                uid=settings.doubao_uid,
                language=settings.doubao_stt_language,
            )
        )

    raise ValueError(f"Unsupported STT_DESCRIPTOR: {settings.stt_descriptor}")


def build_tts(settings: Settings) -> tts.TTS | None:
    if not settings.tts_descriptor:
        return None

    if settings.uses_doubao_tts:
        return DoubaoTTS(
            DoubaoTtsConfig(
                api_key=settings.doubao_api_key,
                resource_id=settings.doubao_tts_resource_id,
                app_id=settings.doubao_app_id,
                access_token=settings.doubao_access_token,
                cluster=settings.doubao_tts_cluster,
                voice_type=settings.doubao_tts_voice_type or "",
                http_url=settings.doubao_tts_http_url,
                uid=settings.doubao_uid,
                encoding=settings.doubao_tts_encoding,
                sample_rate=settings.doubao_tts_sample_rate,
                speed_ratio=settings.doubao_tts_speed_ratio,
                volume_ratio=settings.doubao_tts_volume_ratio,
                pitch_ratio=settings.doubao_tts_pitch_ratio,
            )
        )

    raise ValueError(f"Unsupported TTS_DESCRIPTOR: {settings.tts_descriptor}")
