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

def get_underground_recommendations_fallback():
    # Mock underground recommendations representing diverse regions
    return [
        {
            "name": "Little Simz - Introvert",
            "region": "uk",
            "era": "20s",
            "description_ja": "壮大なオーケストラと研ぎ澄まされたリリックが融合した、UKを代表する名作コンシャスラップ。",
            "conscious_turnt": 1.5,
            "fallback": True
        },
        {
            "name": "Shing02 - Luv(sic) Part 2",
            "region": "jp",
            "era": "00s",
            "description_ja": "Nujabesのメロウなビートに乗せて語られる、普遍的な愛のメッセージ。ジャパニーズヒップホップの至宝。",
            "conscious_turnt": 1.0,
            "fallback": True
        },
        {
            "name": "Joey Bada$$ - Paper Trail$",
            "region": "us",
            "era": "10s",
            "description_ja": "90年代ゴールデンエラへの回帰を感じさせる、鋭いリリシズムとクラシックなブーンバップサウンド。",
            "conscious_turnt": 2.0,
            "fallback": True
        },
        {
            "name": "Gazo ft. Freeze Corleone - Drill FR 4",
            "region": "fr",
            "era": "20s",
            "description_ja": "フランス独自のダークなドリルシーンを牽引する、強烈なベースと硬派なフローの掛け合い。",
            "conscious_turnt": 4.5,
            "fallback": True
        },
        {
            "name": "BewhY - GOTTASADAE",
            "region": "kr",
            "era": "10s",
            "description_ja": "圧倒的なライムデリバリーと、合唱を取り入れたシアトリカルなビートが心揺さぶる韓国の傑作ラップ。",
            "conscious_turnt": 3.5,
            "fallback": True
        }
    ]

def get_underground_recommendations():
    if not API_KEY:
        return get_underground_recommendations_fallback()
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    prompt = (
        "Generate a list of 5 high-quality, underground or lesser-known hip-hop tracks from around the world. "
        "The list should be diverse in terms of country (e.g., US, JP, UK, FR, KR, DE, etc.). "
        "For each track, provide the artist and song name, the region code (us, jp, uk, fr, kr, or other), "
        "the era (90s, 00s, 10s, 20s), a brief description in Japanese of why it is a 'slap' (why it is great), "
        "and a conscious-turnt vibe score (0.0 to 5.0). "
        "Respond in raw JSON format as a list of objects with keys: 'name', 'region', 'era', 'description_ja', 'conscious_turnt'. "
        "Make sure the response is a JSON list wrapped inside a root JSON object under the key 'tracks', like this: "
        '{"tracks": [{"name": "...", "region": "...", "era": "...", "description_ja": "...", "conscious_turnt": 2.5}]}'
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
        data = json.loads(text.strip())
        return data.get("tracks", data)
    except Exception:
        # Fallback if API fails (402 or Timeout)
        return get_underground_recommendations_fallback()

print("--- Gemini API Weekly Underground Curator Test (with Fallback) ---")
res = get_underground_recommendations()
if isinstance(res, list):
    for i, item in enumerate(res, 1):
        print(f"[{i}] {item.get('name')}")
        print(f"    Region: {item.get('region')} | Era: {item.get('era')} | Vibe: {item.get('conscious_turnt')}")
        print(f"    Description: {item.get('description_ja')}")
        if item.get("fallback"):
            print("    *Loaded via Mock Fallback*")
        print("-" * 60)
else:
    print(f"Error: {res}")
