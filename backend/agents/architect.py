import os
from typing import Dict, List

import google.generativeai as genai
from groq import Groq
import anthropic

from utils.history import format_for_gemini, format_for_groq


ARCHITECT_PROMPT = (
    "You are a senior software architect named Kural Architect. \n"
    "Your ONLY responsibilities are:\n\n"
    "1. Analyze the project idea given by the user\n"
    "2. Decide the best technology stack with clear reasoning\n"
    "3. Break the project into small, specific, sequential tasks\n"
    "4. Give ONE task at a time to the Builder\n"
    "5. Review the Builder's completed code\n"
    "6. Correct the Builder if they go wrong\n"
    "7. NEVER write code yourself — only plan, direct, and review\n\n"
    "When generating a plan, always structure your response as:\n\n"
    "TECH STACK:\n"
    "- Frontend: [technology and reason]\n"
    "- Backend: [technology and reason]  \n"
    "- Database: [technology and reason]\n\n"
    "TASKS:\n"
    "Task 1: [specific instruction]\n"
    "Task 2: [specific instruction]\n"
    "...\n\n"
    "When giving a task to Builder, be specific and brief like a Kural.\n"
    "When reviewing Builder output, check for bugs, consistency, and quality."
)


_GEMINI_MODEL = "gemini-1.5-flash"
_GROQ_MODEL = "llama3-70b-8192"
_CLAUDE_MODEL = "claude-3-5-sonnet-20240620"


genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))


def _call_gemini(history: List[Dict[str, str]]) -> str:
    model = genai.GenerativeModel(
        model_name=_GEMINI_MODEL,
        system_instruction=ARCHITECT_PROMPT,
    )
    contents = format_for_gemini(history)
    response = model.generate_content(contents)
    return response.text or ""


def _call_groq(history: List[Dict[str, str]]) -> str:
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return "GROQ_API_KEY is not set."
    client = Groq(api_key=api_key)
    messages = [{"role": "system", "content": ARCHITECT_PROMPT}]
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
        max_tokens=1000,
        system=ARCHITECT_PROMPT,
        messages=messages,
    )
    return response.content[0].text if response.content else ""


def get_architect_response(model_name: str, history: List[Dict[str, str]], current_message: str) -> str:
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
