from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

import httpx

from livekit_sales_agent.config import ChatModelSettings


@dataclass
class RewriteMessage:
    role: str
    content: str


@dataclass
class RewriteResult:
    reply: str
    candidate_content: Optional[str]


class DocumentRewriteService:
    def __init__(self, *, model: ChatModelSettings):
        self._model = model

    def rewrite(
        self,
        *,
        file_name: str,
        content: str,
        instruction: str,
        history: list[RewriteMessage],
        selected_text: Optional[str] = None,
    ) -> RewriteResult:
        if not instruction.strip():
            raise ValueError("改写指令不能为空")
        if not self._model.model:
            raise ValueError("当前未配置会话模型")
        if not self._model.base_url:
            raise ValueError("当前未配置会话模型 base URL")
        if not self._model.api_key:
            raise ValueError("当前未配置会话模型 API Key")

        messages = [
            {
                "role": "system",
                "content": (
                    "你是一个文档整理与改写助手。"
                    "你只能基于当前给出的文档内容和对话上下文回答，不得编造外部事实。"
                    "如果用户要求总结、解释、梳理，reply 应直接给出说明，candidate_content 可为空。"
                    "如果用户要求重写、润色、整理结构、改写成 Markdown，"
                    "请在 candidate_content 中返回完整的新正文，而不是片段。"
                    "始终返回 JSON 对象，格式为 "
                    '{"reply":"给用户看的说明","candidate_content":"完整候选正文或 null"}。'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"当前文件名：{file_name}\n"
                    f"当前选中文本：{selected_text or '无'}\n"
                    "当前完整文档内容如下：\n"
                    f"{content}"
                ),
            },
        ]

        for item in history[-8:]:
            role = item.role.strip().lower()
            if role not in {"user", "assistant"}:
                continue
            message_content = item.content.strip()
            if not message_content:
                continue
            messages.append({"role": role, "content": message_content})

        messages.append({"role": "user", "content": instruction.strip()})

        payload: dict[str, object] = {
            "model": self._model.model,
            "messages": messages,
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }
        if self._model.is_deepseek_v4:
            payload["thinking"] = {"type": "disabled"}

        response = httpx.post(
            f"{self._model.base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {self._model.api_key}"},
            json=payload,
            timeout=90,
        )
        response.raise_for_status()
        raw_payload = response.json()
        message_content = _extract_message_content(raw_payload)
        data = _parse_json_object(message_content)

        reply = data.get("reply")
        candidate_content = data.get("candidate_content")
        if not isinstance(reply, str) or not reply.strip():
            raise ValueError("模型返回缺少 reply 字段")
        if candidate_content is not None and not isinstance(candidate_content, str):
            raise ValueError("模型返回的 candidate_content 字段格式不正确")

        normalized_candidate = candidate_content.strip() if isinstance(candidate_content, str) else None
        return RewriteResult(
            reply=reply.strip(),
            candidate_content=normalized_candidate or None,
        )


def _extract_message_content(payload: object) -> str:
    if not isinstance(payload, dict):
        raise ValueError("模型响应格式不正确")
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("模型响应缺少 choices")
    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise ValueError("模型响应 choices 格式不正确")
    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise ValueError("模型响应缺少 message")
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                text_parts.append(item["text"])
        if text_parts:
            return "".join(text_parts)
    raise ValueError("模型响应缺少文本内容")


def _parse_json_object(content: str) -> dict[str, object]:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1]).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("模型返回的结果不是有效 JSON") from exc
    if not isinstance(parsed, dict):
        raise ValueError("模型返回的 JSON 不是对象")
    return parsed
