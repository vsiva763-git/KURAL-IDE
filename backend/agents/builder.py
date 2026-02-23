import os
from typing import Dict, List

import google.generativeai as genai
from groq import Groq
import anthropic
import requests

from utils.history import (
    format_for_gemini,
    format_for_groq,
    get_trimmed_history,
    get_trimmed_history_for_model,
)


BUILDER_PROMPT = (
    "You are a focused software developer named Kural Builder.\n"
    "Your ONLY responsibilities are:\n\n"
    "1. Receive task instructions from the Architect\n"
    "2. Write clean, working, complete code for that specific task\n"
    "3. Always wrap your code in triple backticks with language name\n"
    "4. Report clearly when a task is done\n"
    "5. Report clearly if you are blocked and why\n"
    "6. NEVER make architectural decisions — only execute precisely\n"
    "7. NEVER ask what technology to use — follow Architect's instructions\n\n"
    "CRITICAL CODING RULES:\n"
    "- ALWAYS write plain HTML, CSS, and JavaScript only\n"
    "- NEVER write React, Vue, TypeScript, or any framework code\n"
    "- NEVER write terminal commands like npm, npx, cd, mkdir\n"
    "- NEVER write import statements or module syntax\n"
    "- ALL code must work when pasted directly into an HTML file\n"
    "- For each task write ONE complete self-contained HTML file\n"
    "- Include all CSS inside <style> tags in the HTML file\n"
    "- Include all JavaScript inside <script> tags in the HTML file\n"
    "- The code will be rendered directly in a browser iframe\n\n"
    "When completing a task always end with:\n"
    "STATUS: COMPLETE\n"
    "NEXT: Ready for next task\n\n"
    "When blocked always end with:\n"
    "STATUS: BLOCKED\n"
    "REASON: [specific reason]"
)


_GEMINI_MODEL = "gemini-1.5-flash"
_GEMINI_FALLBACK_MODELS = [
    _GEMINI_MODEL,
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
]
_GROQ_MODEL = "llama-3.3-70b-versatile"
_CLAUDE_MODEL = "claude-3-5-sonnet-20240620"
_MISTRAL_MODEL = "codestral-latest"
_OPENROUTER_MODEL = "deepseek/deepseek-r1-0528:free"
_REQUEST_TIMEOUT_SECONDS = int(os.getenv("MODEL_HTTP_TIMEOUT", "20"))


genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))


def _call_gemini(history: List[Dict[str, str]]) -> str:
    trimmed = get_trimmed_history_for_model("gemini", history)
    contents = format_for_gemini(trimmed)
    errors: List[str] = []
    seen = set()

    for model_name in _GEMINI_FALLBACK_MODELS:
        if model_name in seen:
            continue
        seen.add(model_name)
        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=BUILDER_PROMPT,
            )
            response = model.generate_content(contents)
            return response.text or ""
        except Exception as exc:
            errors.append(f"{model_name}: {exc}")
    raise RuntimeError(
        "Gemini request failed for all configured model IDs. "
        f"Details: {' | '.join(errors)}"
    )


def _call_groq(history: List[Dict[str, str]]) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")
    trimmed = get_trimmed_history_for_model("groq", history)
    try:
        client = Groq(api_key=api_key)
        messages = [{"role": "system", "content": BUILDER_PROMPT}]
        messages.extend(format_for_groq(trimmed))
        completion = client.chat.completions.create(
            model=_GROQ_MODEL,
            messages=messages,
        )
        return completion.choices[0].message.content or ""
    except Exception as exc:
        raise RuntimeError(f"Groq request failed: {exc}") from exc


def _call_claude(history: List[Dict[str, str]]) -> str:
    api_key = os.getenv("CLAUDE_API_KEY", "")
    if not api_key:
        raise RuntimeError("CLAUDE_API_KEY is not set.")
    trimmed = get_trimmed_history_for_model("claude", history)
    try:
        client = anthropic.Anthropic(api_key=api_key)
        messages = []
        for item in trimmed:
            role = "user" if item.get("role") == "user" else "assistant"
            messages.append({"role": role, "content": item.get("content", "")})
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1500,
            system=BUILDER_PROMPT,
            messages=messages,
        )
        return response.content[0].text if response.content else ""
    except Exception as exc:
        raise RuntimeError(f"Claude request failed: {exc}") from exc


def _call_mistral(history: List[Dict[str, str]], message: str) -> str:
    api_key = os.getenv("MISTRAL_API_KEY", "")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY is not set.")
    trimmed = get_trimmed_history(4000, history)
    messages = [{"role": "system", "content": BUILDER_PROMPT}]
    for item in trimmed:
        role = "user" if item.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": item.get("content", "")})
    if message:
        messages.append({"role": "user", "content": message})
    response = requests.post(
        "https://api.mistral.ai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": _MISTRAL_MODEL,
            "messages": messages,
            "max_tokens": 2000,
        },
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Mistral error {response.status_code}: {response.text}")
    return response.json()["choices"][0]["message"]["content"]


def _call_openrouter(history: List[Dict[str, str]], message: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is not set")

    trimmed = get_trimmed_history(4000, history)
    messages = [{"role": "system", "content": BUILDER_PROMPT}]
    for item in trimmed:
        role = "user" if item.get("role") == "user" else "assistant"
        messages.append({
            "role": role,
            "content": item.get("content", ""),
        })
    if message:
        messages.append({"role": "user", "content": message})

    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Kural IDE",
        },
        json={
            "model": _OPENROUTER_MODEL,
            "messages": messages,
            "max_tokens": 2000,
        },
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )

    if response.status_code != 200:
        raise RuntimeError(f"OpenRouter error {response.status_code}: {response.text}")

    return response.json()["choices"][0]["message"]["content"]


def get_builder_response(model_name: str, history: List[Dict[str, str]], current_message: str) -> str:
    if current_message:
        history = history + [
            {
                "role": "user",
                "content": current_message,
                "type": "input",
            }
        ]
    choice = (model_name or "openrouter").lower()
    if choice == "groq":
        return _call_groq(history)
    if choice == "claude":
        return _call_claude(history)
    if choice == "gemini":
        return _call_gemini(history)
    if choice == "mistral":
        return _call_mistral(history, current_message)
    if choice == "openrouter":
        return _call_openrouter(history, current_message)
    if choice == "gpt4o":
        return "GPT-4o is not configured on the backend."
    return _call_openrouter(history, current_message)
