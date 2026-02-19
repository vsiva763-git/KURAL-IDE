# Kural IDE

Kural IDE is an AI-powered development environment with two collaborating agents: Architect and Builder.

## Project Structure

```
frontend/
	index.html
	style.css
	app.js
	assets/
backend/
	server.py
	agents/
	utils/
	requirements.txt
.env
.gitignore
start.sh
```

## Setup

1. Install backend dependencies:

```
pip install -r backend/requirements.txt
```

2. Add your API keys to .env:

```
GEMINI_API_KEY=your_gemini_key_here
GROQ_API_KEY=your_groq_key_here
CLAUDE_API_KEY=your_claude_key_here
```

3. Start backend and frontend:

```
bash start.sh
```

4. Open the frontend at `http://localhost:3000`.

## Notes

- Backend runs on port 5000 by default.
- The frontend uses `http://localhost:5000` for API calls unless served by the backend.