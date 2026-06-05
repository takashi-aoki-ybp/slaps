import os
import sys
import json
import requests

# Load env file if exists
try:
    with open(".env.production.local", "r") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                os.environ[k] = v.strip().replace('"', '').replace("'", "")
except:
    pass

API_KEY = os.environ.get("OPENROUTER_API_KEY")

def guess_metadata_fallback(title):
    # Rule-based fallback if API is not available
    t = title.lower()
    
    # Guess Region
    if any(k in t for k in ["zorn", "libro", "小林勝行", "舐達麻", "punpee", "kreva", "kohh", "bad hop"]):
        region = "jp"
    elif any(k in t for k in ["gazo", "pnl", "ninho"]):
        region = "fr"
    elif any(k in t for k in ["dave", "skepta", "stormzy"]):
        region = "uk"
    elif any(k in t for k in ["keith ape", "jay park", "zico"]):
        region = "kr"
    else:
        region = "us" # default to US
        
    # Guess Era
    if any(k in t for k in ["90s", "199", "still d.r.e.", "slam", "shook"]):
        era = "90s"
    elif any(k in t for k in ["00s", "200"]):
        era = "00s"
    elif any(k in t for k in ["10s", "humble", "201"]):
        era = "10s"
    else:
        era = "20s" # default to 20s
        
    return {"region": region, "era": era, "fallback": True}

def guess_metadata(title):
    if not API_KEY:
        return guess_metadata_fallback(title)
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    prompt = (
        f"Analyze the following hip-hop track title and guess its region (us, jp, uk, fr, kr, other) "
        f"and era (90s, 00s, 10s, 20s). Respond in raw JSON format with keys 'region' and 'era'.\n"
        f"Title: {title}\n"
        f"Example output:\n"
        f'{{"region": "us", "era": "90s"}}'
    )
    payload = {
        "model": "google/gemini-2.5-flash",
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=5)
        res.raise_for_status()
        result_json = res.json()
        text = result_json["choices"][0]["message"]["content"]
        return json.loads(text.strip())
    except Exception as e:
        print(f"API Error: {e}", file=sys.stderr)
        # Fallback if API fails (e.g. 402 Payment Required or Timeout)
        return guess_metadata_fallback(title)

# Test titles
test_songs = [
    "LIBRO - 雨降りの月曜",
    "Kendrick Lamar - HUMBLE.",
    "Dr. Dre ft. Snoop Dogg - Still D.R.E.",
    "ZORN - 家庭の事情",
    "Gazo - Haine"
]

print("--- Gemini API Autocomplete Metadata Test (with Fallback) ---")
for song in test_songs:
    print(f"Song: {song}")
    res = guess_metadata(song)
    print(f"Result: {json.dumps(res, ensure_ascii=False)}")
    print("-" * 40)
