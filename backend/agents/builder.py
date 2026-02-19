import os
from typing import Dict, List

import google.generativeai as genai
from groq import Groq
import anthropic

from utils.history import format_for_gemini, format_for_groq


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
    "When completing a task always end with:\n"
    "STATUS: COMPLETE\n"
    "NEXT: Ready for next task\n\n"
    "When blocked always end with:\n"
    "STATUS: BLOCKED\n"
    "REASON: [specific reason]"
)


_GEMINI_MODEL = "gemini-1.5-flash"
_GROQ_MODEL = "llama3-70b-8192"
_CLAUDE_MODEL = "claude-3-5-sonnet-20240620"


genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))


def _call_gemini(history: List[Dict[str, str]]) -> str:
    model = genai.GenerativeModel(
        model_name=_GEMINI_MODEL,
        system_instruction=BUILDER_PROMPT,
    )
    contents = format_for_gemini(history)
    response = model.generate_content(contents)
    return response.text or ""


def _call_groq(history: List[Dict[str, str]]) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return "GROQ_API_KEY is not set."
    client = Groq(api_key=api_key)
    messages = [{"role": "system", "content": BUILDER_PROMPT}]
    messages.extend(format_for_groq(history))
    completion = client.chat.completions.create(
        model=_GROQ_MODEL,
        messages=messages,
    )
    return completion.choices[0].message.content or ""


def _call_claude(history: List[Dict[str, str]]) -> str:
    api_key = os.getenv("CLAUDE_API_KEY", "")
    if not api_key:
        return "CLAUDE_API_KEY is not set."
    client = anthropic.Anthropic(api_key=api_key)
    messages = []
    for item in history:
        role = "user" if item.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": item.get("content", "")})
    response = client.messages.create(
        model=_CLAUDE_MODEL,
        max_tokens=1500,
        system=BUILDER_PROMPT,
        messages=messages,
    )
    return response.content[0].text if response.content else ""


def get_builder_response(model_name: str, history: List[Dict[str, str]], current_message: str) -> str:
    if current_message:
        history = history + [
            {
                "role": "user",
                "content": current_message,
                "type": "input",
            }
        ]
    choice = (model_name or "gemini").lower()
    if choice == "groq":
        return _call_groq(history)
    if choice == "claude":
        return _call_claude(history)
    if choice == "gpt4o":
        return "GPT-4o is not configured on the backend."
    return _call_gemini(history)
