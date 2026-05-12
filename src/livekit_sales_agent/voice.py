from __future__ import annotations

from livekit.agents import stt, tts

from livekit_sales_agent.adapters.doubao_stt import DoubaoSTT, DoubaoSttConfig
from livekit_sales_agent.adapters.doubao_tts import DoubaoTTS, DoubaoTtsConfig
from livekit_sales_agent.config import SttModelSettings, TtsModelSettings


def _create_stt(profile: SttModelSettings) -> stt.STT:
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


def build_stt(
    profile: SttModelSettings | None,
    *,
    fallback_profiles: list[SttModelSettings] | None = None,
) -> stt.STT | None:
    if profile is None:
        return None

    stt_instances = [_create_stt(profile)]
    for fallback_profile in fallback_profiles or []:
        stt_instances.append(_create_stt(fallback_profile))

    if len(stt_instances) == 1:
        return stt_instances[0]

    return stt.FallbackAdapter(
        stt=stt_instances,
        attempt_timeout=8.0,
        max_retry_per_stt=1,
        retry_interval=2.0,
    )


def _create_tts(profile: TtsModelSettings) -> tts.TTS:
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


def build_tts(
    profile: TtsModelSettings | None,
    *,
    fallback_profiles: list[TtsModelSettings] | None = None,
) -> tts.TTS | None:
    if profile is None:
        return None

    tts_instances = [_create_tts(profile)]
    for fallback_profile in fallback_profiles or []:
        tts_instances.append(_create_tts(fallback_profile))

    if len(tts_instances) == 1:
        return tts_instances[0]

    return tts.FallbackAdapter(
        tts=tts_instances,
        max_retry_per_tts=1,
        sample_rate=profile.sample_rate,
    )
