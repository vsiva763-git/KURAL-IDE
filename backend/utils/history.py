from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import re
from typing import Dict, List, Optional

_VALID_ROLES = {"architect", "builder", "user"}
_HISTORY: List[Dict[str, str]] = []
MODEL_TOKEN_LIMITS = {
    "gemini": 30000,
    "groq": 4000,
    "claude": 50000,
    "mistral": 8000,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_message(role: str, content: str, message_type: str = "general") -> None:
    role_normalized = role.lower()
    if role_normalized not in _VALID_ROLES:
        role_normalized = "user"
    _HISTORY.append(
        {
            "role": role_normalized,
            "content": content,
            "timestamp": _now_iso(),
            "type": message_type,
        }
    )


def add_message_compressed(role: str, content: str, message_type: str = "general") -> None:
    compressed_content = content
    if "```" in content and message_type == "code":
        code_blocks = re.findall(r"```[\w]*\n[\s\S]*?```", content)
        text_only = re.sub(r"```[\w]*\n[\s\S]*?```", "[CODE BLOCK]", content)
        total_lines = sum(len(block.split("\n")) for block in code_blocks)
        compressed_content = (
            f"{text_only}\n"
            f"[Code written: {len(code_blocks)} block(s), ~{total_lines} lines total]"
        )
    add_message(role, compressed_content, message_type)


def set_history(history: List[Dict[str, str]]) -> None:
    _HISTORY.clear()
    for item in history:
        role = item.get("role", "user")
        content = item.get("content", "")
        message_type = item.get("type", "general")
        timestamp = item.get("timestamp") or _now_iso()
        _HISTORY.append(
            {
                "role": role,
                "content": content,
                "timestamp": timestamp,
                "type": message_type,
            }
        )


def clear_history() -> None:
    _HISTORY.clear()


def get_history() -> List[Dict[str, str]]:
    return deepcopy(_HISTORY)


def get_last_n_messages(limit: int) -> List[Dict[str, str]]:
    if limit <= 0:
        return []
    return deepcopy(_HISTORY[-limit:])


def _estimate_tokens(messages: List[Dict[str, str]]) -> int:
    total_chars = sum(len(item.get("content", "")) for item in messages)
    return total_chars // 4


def get_trimmed_history(
    max_tokens: int = 4000,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    messages = history if history is not None else _HISTORY
    if not messages:
        return []

    first_messages = messages[:2]
    last_messages = messages[-8:] if len(messages) > 2 else []

    seen = set()
    combined: List[Dict[str, str]] = []
    for msg in first_messages + last_messages:
        key = msg.get("content", "")[:50]
        if key not in seen:
            seen.add(key)
            combined.append(msg)

    if _estimate_tokens(combined) <= max_tokens:
        return deepcopy(combined)

    fallback = messages[:1] + messages[-5:] if len(messages) > 6 else list(messages)

    while len(fallback) > 1 and _estimate_tokens(fallback) > max_tokens:
        del fallback[1]

    return deepcopy(fallback)


def get_trimmed_history_for_model(
    model_name: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    limit = MODEL_TOKEN_LIMITS.get((model_name or "").lower(), 6000)
    return get_trimmed_history(max_tokens=limit, history=history)


def format_for_gemini(history: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, object]]:
    messages = history if history is not None else _HISTORY
    formatted: List[Dict[str, object]] = []
    for item in messages:
        role = "user" if item.get("role") == "user" else "model"
        content = item.get("content", "")
        formatted.append(
            {
                "role": role,
                "parts": [{"text": content}],
            }
        )
    return formatted


def format_for_groq(history: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, str]]:
    messages = history if history is not None else _HISTORY
    formatted: List[Dict[str, str]] = []
    for item in messages:
        role = item.get("role", "user")
        msg_type = item.get("type", "general")
        content = item.get("content", "")
        if role == "user":
            formatted.append({"role": "user", "content": content})
        else:
            formatted.append(
                {
                    "role": "assistant",
                    "content": f"[{role.upper()} | {msg_type}] {content}",
                }
            )
    return formatted
