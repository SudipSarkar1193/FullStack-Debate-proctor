import os
from dotenv import load_dotenv
from google import genai

load_dotenv()
api_key = os.getenv("API_KEY")

if not api_key:
    print("❌ Error: API_KEY not found in .env")
    exit()

print(f"🔑 Checking models for API Key: {api_key[:5]}...")
print("-" * 30)

client = genai.Client(api_key=api_key)

try:
    for m in client.models.list():
        print(f"✅ AVAILABLE: {m.name}")
except Exception as e:
    print(f"❌ Error listing models: {e}")