import os
import json
import requests

# Load env file
try:
    with open(".env.local", "r") as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                os.environ[k] = v.strip().replace('"', '').replace("'", "")
except Exception as e:
    print(f"Error loading env: {e}")

url = os.environ.get("KV_REST_API_URL")
token = os.environ.get("KV_REST_API_TOKEN")

if not url or not token:
    print("KV credentials not found in env")
    exit(1)

# LRANGE slaps:songs 0 -1
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
payload = ["LRANGE", "slaps:songs", "0", "-1"]

res = requests.post(url, headers=headers, json=payload)
if res.status_code != 200:
    print(f"Failed to fetch KV data: {res.text}")
    exit(1)

raw_list = res.json().get("result", [])
print(f"KV songs count: {len(raw_list)}")

db_songs = []
for item in raw_list:
    try:
        db_songs.append(json.loads(item))
    except Exception as e:
        print(f"JSON load error: {e}")

# Load songs.json
with open("data/songs.json", "r", encoding="utf-8") as f:
    local_songs = json.load(f)

print(f"Local songs count: {len(local_songs)}")

# Merge logic from api/songs.js
local_map = {s["youtube_id"]: s for s in local_songs}
db_map = {s["youtube_id"]: s for s in db_songs}

all_ids = set(list(db_map.keys()) + list(local_map.keys()))
merged = []
for id in all_ids:
    if id in db_map:
        merged.append(db_map[id])
    else:
        merged.append(local_map[id])

print(f"Merged total songs: {len(merged)}")

from collections import Counter
merged_regions = Counter(s.get("region") for s in merged)
merged_eras = Counter(s.get("era") for s in merged)

print("Merged Regions:", merged_regions)
print("Merged Eras:", merged_eras)

# Find songs with region='other'
other_songs = [s for s in merged if s.get("region") == "other" or s.get("region") == "OTHER"]
print(f"Number of 'other' region songs in merged: {len(other_songs)}")
for idx, s in enumerate(other_songs[:10]):
    print(f"{idx+1}. {s.get('name')} (Region: {s.get('region')}, Era: {s.get('era')})")

# Let's count how many songs have region='other' in KV specifically
kv_other_songs = [s for s in db_songs if s.get("region") == "other" or s.get("region") == "OTHER"]
print(f"Number of 'other' region songs in KV: {len(kv_other_songs)}")
