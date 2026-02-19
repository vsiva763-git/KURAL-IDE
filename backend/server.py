import os
from typing import Dict, List

from flask import Flask, jsonify, request, send_from_directory, abort
from flask_cors import CORS
from dotenv import load_dotenv

from agents.architect import get_architect_response
from agents.builder import get_builder_response
from utils.extract import extract_code_blocks
from utils.history import (
    add_message,
    clear_history,
    get_history,
    set_history,
)

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
load_dotenv(os.path.join(ROOT_DIR, ".env"))

app = Flask(__name__)
CORS(app)

ACTIVE_MODELS = {
    "architect": "gemini",
    "builder": "gemini",
}


def _sync_history(payload_history: List[Dict[str, str]] | None) -> None:
    if payload_history is not None:
        set_history(payload_history)


def _error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:filename>")
def frontend_assets(filename: str):
    if filename.endswith(".env") or filename.endswith(".py"):
        abort(404)
    file_path = os.path.join(FRONTEND_DIR, filename)
    if not os.path.isfile(file_path):
        abort(404)
    return send_from_directory(FRONTEND_DIR, filename)


@app.post("/api/architect")
def api_architect():
    payload = request.get_json(silent=True) or {}
    _sync_history(payload.get("history"))
    message = payload.get("message", "")
    if not message:
        return _error("message is required")
    response_text = get_architect_response(ACTIVE_MODELS["architect"], get_history(), message)
    add_message("user", message, "project_idea")
    add_message("architect", response_text, "plan")
    return jsonify({"response": response_text, "history": get_history()})


@app.post("/api/builder")
def api_builder():
    payload = request.get_json(silent=True) or {}
    _sync_history(payload.get("history"))
    message = payload.get("message", "")
    if not message:
        return _error("message is required")
    response_text = get_builder_response(ACTIVE_MODELS["builder"], get_history(), message)
    add_message("user", message, "task")
    add_message("builder", response_text, "code")
    return jsonify(
        {
            "response": response_text,
            "codeBlocks": extract_code_blocks(response_text),
            "history": get_history(),
        }
    )


@app.post("/api/switch-model")
def api_switch_model():
    payload = request.get_json(silent=True) or {}
    panel = (payload.get("panel") or "").lower()
    model = (payload.get("model") or "").lower()
    if panel not in ACTIVE_MODELS:
        return _error("panel must be architect or builder")
    if not model:
        return _error("model is required")
    ACTIVE_MODELS[panel] = model
    return jsonify({"panel": panel, "model": model})


@app.post("/api/clear")
def api_clear():
    clear_history()
    return jsonify({"status": "cleared"})


@app.get("/api/history")
def api_history():
    return jsonify({"history": get_history()})


@app.post("/api/user-intervention")
def api_user_intervention():
    payload = request.get_json(silent=True) or {}
    _sync_history(payload.get("history"))
    target = (payload.get("panel") or "").lower()
    message = payload.get("message", "")
    if target not in ACTIVE_MODELS:
        return _error("panel must be architect or builder")
    if not message:
        return _error("message is required")
    correction = f"USER CORRECTION ({target.upper()}): {message}"
    add_message("user", correction, "correction")
    if target == "architect":
        response_text = get_architect_response(ACTIVE_MODELS["architect"], get_history(), "")
        add_message("architect", response_text, "correction")
    else:
        response_text = get_builder_response(ACTIVE_MODELS["builder"], get_history(), "")
        add_message("builder", response_text, "correction")
    return jsonify({"response": response_text, "history": get_history()})


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
