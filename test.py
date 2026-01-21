import os
import sys

# Helper to load .env file manually
def load_env():
    if os.path.exists('.env'):
        with open('.env') as f:
            for line in f:
                if line.strip() and not line.startswith('#'):
                    parts = line.strip().split('=', 1)
                    if len(parts) == 2:
                        key, value = parts
                        if value.startswith('"') and value.endswith('"'):
                            value = value[1:-1]
                        os.environ[key] = value

load_env()

API_KEY = os.environ.get("GEMINI_API_KEY")

if not API_KEY:
    print("❌ Error: GEMINI_API_KEY not found in environment variables.")
    exit(1)

print(f"🔑 Testing API Key: {API_KEY[:6]}...{API_KEY[-4:]}")
print(f"🐍 Python Executable: {sys.executable}")

# Try importing the new SDK
try:
    print("Trying: from google import genai")
    from google import genai
    
    print("✅ Library 'google-genai' loaded.")
    client = genai.Client(api_key=API_KEY)
    
    print("📡 Sending request to Gemini (gemini-3-flash-preview)...")
    # Note: 'gemini-1.5-flash' might be mapped differently in new SDK, using generic call
    response = client.models.generate_content(
        model="gemini-3-flash-preview", 
        contents="Hello, reply with 'OK' if you see this."
    )
    print("\n✅ Success! Gemini 3 Flash Preview is working.")
    print(f"🤖 Response: {response.text}")

except ImportError as e1:
    print(f"⚠️ Failed to import 'google.genai': {e1}")
    print("Trying fallback: import google.generativeai as genai (Old SDK)")
    
    try:
        import google.generativeai as genai
        
        genai.configure(api_key=API_KEY)
        print("✅ Library 'google-generativeai' loaded.")
        
        model = genai.GenerativeModel('gemini-3-flash-preview')
        print("📡 Sending request to Gemini (gemini-3-flash-preview)...")
        response = model.generate_content("Hello, reply with 'OK' if you see this.")
        
        print("\n✅ Success! Gemini 3 Flash Preview is working via Old SDK.")
        print(f"🤖 Response: {response.text}")
        
    except ImportError as e2:
        print(f"\n❌ FAST FAIL: Could not import any Gemini library.")
        print(f"1. google.genai error: {e1}")
        print(f"2. google.generativeai error: {e2}")
        print("Run: pip install google-genai google-generativeai")
        
except Exception as e:
    print(f"\n❌ Error during execution:\n{e}")
