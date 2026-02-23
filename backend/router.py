from __future__ import annotations

from typing import Dict, List

ARCHITECT_FALLBACK_CHAIN = [
    "gemini",
    "mistral",
    "groq",
]

BUILDER_FALLBACK_CHAIN = [
    "openrouter",
    "mistral",
]

FALLBACK_ERRORS = [
    "429",
    "413",
    "504",
    "rate_limit",
    "quota",
    "exceeded",
    "limit",
    "timeout",
    "timed out",
    "gateway timeout",
]


def should_fallback(error_message: str) -> bool:
    error_lower = (error_message or "").lower()
    return any(code in error_lower for code in FALLBACK_ERRORS)


def call_with_fallback(
    agent_type: str,
    history: List[Dict],
    message: str,
    preferred_model: str | None = None,
) -> Dict:
    from agents.architect import get_architect_response
    from agents.builder import get_builder_response

    base_chain = ARCHITECT_FALLBACK_CHAIN if agent_type == "architect" else BUILDER_FALLBACK_CHAIN
    chain: List[str] = []
    if preferred_model:
        chain.append(preferred_model.lower())
    for model in base_chain:
        if model not in chain:
            chain.append(model)
    last_error = None

    for index, model in enumerate(chain):
        try:
            print(f"[Kural IDE] Trying {model} for {agent_type}...")
            if agent_type == "architect":
                response = get_architect_response(model, history, message)
            else:
                response = get_builder_response(model, history, message)

            return {
                "response": response,
                "model_used": model,
                "fallback_used": index != 0,
            }
        except Exception as exc:
            error_str = str(exc)
            print(f"[Kural IDE] {model} failed: {error_str}")
            last_error = error_str
            if should_fallback(error_str):
                continue
            raise

    raise RuntimeError(
        f"All models exhausted for {agent_type}. Last error: {last_error}. Please wait and try again."
    )
