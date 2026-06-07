#!/usr/bin/env python3
import json
import os

SONGS_PATH = "/Users/aokitakashi/.gemini/antigravity/scratch/slaps/data/songs.json"

NEW_SONGS = [
    {
        "youtube_id": "7TfaU1ciA3g",
        "name": "LIBRO - 運命が君に会いにきた",
        "description": {
            "ja": "LIBROの温かく詩的なメロディセンスが光る、優しく語りかける名曲",
            "en": "LIBRO's warm, poetic melody shines in this comforting classic"
        },
        "region": "jp",
        "era": "10s",
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/7TfaU1ciA3g/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "k9kiy1Frn68",
        "name": "LIBRO - 小道を行けば",
        "description": {
            "ja": "日常の情景を鮮やかに切り取る、LIBRO節全開の歩行用ジャズラップ",
            "en": "Breezy walking jazz-rap in typical LIBRO fashion, capturing daily scenes"
        },
        "region": "jp",
        "era": "00s",
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/k9kiy1Frn68/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "yEpKC0wXy4M",
        "name": "LIBRO - 雨降りの月曜",
        "description": {
            "ja": "日本語ラップ史に残る金字塔。憂鬱な月曜日を優しく彩るクラシック",
            "en": "A monumental jazz-rap masterpiece that beautifully colors a gloomy rainy Monday"
        },
        "region": "jp",
        "era": "90s",
        "conscious_turnt": 1.0,
        "thumbnail": "https://img.youtube.com/vi/yEpKC0wXy4M/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "KZZmR87QZZw",
        "name": "RAWAX - CONTINUE THE SAGA (Prod. LIBRO)",
        "description": {
            "ja": "RAWAXの強靭なライムとLIBROによるエモーショナルなブームバップビートの融合",
            "en": "Powerful boom-bap fusion combining RAWAX's sharp rhymes with LIBRO's emotional beats"
        },
        "region": "jp",
        "era": "20s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/KZZmR87QZZw/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "wbUkdjvokO0",
        "name": "LIBRO - リアルスクリーン",
        "description": {
            "ja": "LIBROが日常のリアルと向き合う、ストレートで心に響くリリック",
            "en": "Straightforward and heart-striking lyrics of LIBRO facing the reality of daily life"
        },
        "region": "jp",
        "era": "10s",
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/wbUkdjvokO0/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "5xALUzAYYTI",
        "name": "LIBRO - マイクロフォンコントローラー feat. 漢 a.k.a. GAMI, MEGA-G",
        "description": {
            "ja": "漢 a.k.a. GAMI、MEGA-Gという実力派ラッパーを迎えた、極上のマイク・リレー",
            "en": "An exquisite mic-relay track featuring heavyweight rappers Kan a.k.a. GAMI and MEGA-G"
        },
        "region": "jp",
        "era": "10s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/5xALUzAYYTI/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    },
    {
        "youtube_id": "zv--cE_G7Y0",
        "name": "小林勝行 - 108 bars",
        "description": {
            "ja": "神戸の鬼才・小林勝行が自己を剥き出しにし、狂気と魂をぶつける圧巻の108小説",
            "en": "A breathtaking 108-bar self-exposure by Kobe's genius Kobayashi Katsuyuki, bursting with raw soul"
        },
        "region": "jp",
        "era": "10s",
        "conscious_turnt": 1.0,
        "thumbnail": "https://img.youtube.com/vi/zv--cE_G7Y0/mqdefault.jpg",
        "user_name": "青木 喬 takashi aoki"
    }
]

if not os.path.exists(SONGS_PATH):
    print(f"Error: {SONGS_PATH} not found.")
    exit(1)

with open(SONGS_PATH, "r", encoding="utf-8") as f:
    songs = json.load(f)

existing_ids = {s["youtube_id"] for s in songs}

added = 0
for song in NEW_SONGS:
    if song["youtube_id"] in existing_ids:
        print(f"Skip (already exists): {song['name']}")
        continue
    # publish_at or created_at を設定する
    # 最新順のLATESTで一番上に表示させるため、現在のタイムスタンプを設定
    import datetime
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    song["publish_at"] = now_str
    song["created_at"] = now_str
    
    songs.append(song)
    added += 1
    print(f"Added: {song['name']}")

if added > 0:
    with open(SONGS_PATH, "w", encoding="utf-8") as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)
    print(f"Successfully added {added} songs. Total: {len(songs)}")
else:
    print("No songs were added.")
