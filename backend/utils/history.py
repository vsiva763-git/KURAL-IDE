from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Dict, List, Optional

_VALID_ROLES = {"architect", "builder", "user"}
_HISTORY: List[Dict[str, str]] = []


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


def format_for_gemini(history: Optional[List[Dict[str, str]]] = None) -> List[str]:
    messages = history if history is not None else _HISTORY
    formatted = []
    for item in messages:
        role = item.get("role", "user")
        msg_type = item.get("type", "general")
        content = item.get("content", "")
        formatted.append(f"Role: {role}\nType: {msg_type}\nMessage: {content}")
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
