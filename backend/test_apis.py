import os
import requests
from dotenv import load_dotenv
import sys
sys.path.insert(0, os.path.dirname(__file__))
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

def test_gemini():
    import google.generativeai as genai
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel("gemini-2.5-flash")
    response = model.generate_content("Say exactly: Gemini working")
    print(f"✅ Gemini: {response.text.strip()}")

def test_openrouter():
    response = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Kural IDE"
        },
        json={
            "model": "deepseek/deepseek-r1-0528:free",
            "messages": [{"role": "user", "content": "Say exactly: DeepSeek working"}],
            "max_tokens": 20
        }
    )
    print(f"✅ OpenRouter DeepSeek: {response.json()['choices'][0]['message']['content'].strip()}")

def test_mistral():
    response = requests.post(
        "https://api.mistral.ai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.getenv('MISTRAL_API_KEY')}",
            "Content-Type": "application/json"
        },
        json={
            "model": "codestral-latest",
            "messages": [{"role": "user", "content": "Say exactly: Mistral working"}],
            "max_tokens": 20
        }
    )
    print(f"✅ Mistral: {response.json()['choices'][0]['message']['content'].strip()}")

print("Testing all APIs for Kural IDE...")
print("----------------------------------")
try: test_gemini()
except Exception as e: print(f"❌ Gemini failed: {e}")
try: test_openrouter()
except Exception as e: print(f"❌ OpenRouter failed: {e}")
try: test_mistral()
except Exception as e: print(f"❌ Mistral failed: {e}")
print("----------------------------------")
print("All tests complete. Fix any failures before running Kural IDE.")
