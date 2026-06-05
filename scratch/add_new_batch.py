#!/usr/bin/env python3
import json
import os

SONGS_PATH = "/Users/aokitakashi/.gemini/antigravity/scratch/slaps/data/songs.json"

NEW_SONGS = [
    {
        "youtube_id": "6awx5kmTONo",
        "name": "クラムボン featuring ILL-BOSSTINO - あかり from HERE",
        "description": {
            "ja": "クラムボンの美しい演奏にTHA BLUE HERBのBOSSが放つ魂の言葉が交錯する奇跡のコラボレーション",
            "en": "A miraculous collaboration between Clammbon's beautiful performance and the soulful poetry of THA BLUE HERB's BOSS"
        },
        "region": "jp",
        "era": "10s",
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/6awx5kmTONo/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "IRDoeQZ12-Y",
        "name": "STUTS & 松たか子 with 3exes - Presence I feat. KID FRESINO",
        "description": {
            "ja": "STUTSの絶妙なトラックメイクに松たか子のボーカル、そしてKID FRESINOの極上なフローが絡み合う大ヒット曲",
            "en": "A hit track blending STUTS's exquisite beat production, Matsu Takako's vocals, and KID FRESINO's brilliant flow"
        },
        "region": "jp",
        "era": "20s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/IRDoeQZ12-Y/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "vO2Su3erRIA",
        "name": "A Tribe Called Quest - We The People....",
        "description": {
            "ja": "ATCQ最後の名盤のリード曲。力強い社会的メッセージを込めた伝説の帰還アンセム",
            "en": "The lead track of ATCQ's final masterpiece, delivering a strong social message in a legendary return anthem"
        },
        "region": "us",
        "era": "10s",
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/vO2Su3erRIA/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "sevZEOUXpw4",
        "name": "Dilated Peoples - Worst Comes To Worst",
        "description": {
            "ja": "Alchemistプロデュースのクラシックビートに乗せ、ウィリアム・ベルのサンプリングが光るアンダーグラウンドの金字塔",
            "en": "An underground monument featuring William Bell samples on Alchemist's legendary production"
        },
        "region": "us",
        "era": "00s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/sevZEOUXpw4/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "8XK7nzAW_b0",
        "name": "DJ Shadow - Rocket Fuel ft. De La Soul",
        "description": {
            "ja": "DJ Shadowの荒ぶるブレイクビーツにDe La Soulのファンキーなマイクパスが交差する疾走感あるハイエナジー曲",
            "en": "DJ Shadow's fast-paced breakbeats meets De La Soul's funky mic passes in this high-energy gem"
        },
        "region": "us",
        "era": "10s",
        "conscious_turnt": 4.0,
        "thumbnail": "https://img.youtube.com/vi/8XK7nzAW_b0/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "VC4ORS5n9Hg",
        "name": "Nas - Nas Is Like",
        "description": {
            "ja": "DJ PremierがNasの声を切り刻み構築した、90年代東海岸HIPHOPの完成形にして頂点",
            "en": "Constructed by DJ Premier chopping Nas's vocals, this represents the peak of 90s East Coast HIPHOP"
        },
        "region": "us",
        "era": "90s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/VC4ORS5n9Hg/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "qmj1q67NDAk",
        "name": "Gang Starr - Full Clip",
        "description": {
            "ja": "故Big Lへのシャウトから始まる、Premierの最高傑作ビートの一つにして不動のクラシック",
            "en": "Starting with a tribute to the late Big L, this is one of Premier's finest beats and an eternal classic"
        },
        "region": "us",
        "era": "90s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/qmj1q67NDAk/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "ithYB82y0Sk",
        "name": "Black Eyed Peas - Yesterday",
        "description": {
            "ja": "初期Black Eyed Peasへの回帰。往年のHIPHOP黄金期の名曲たちをサンプリングした愛溢れる一曲",
            "en": "A return to BEP's hiphop roots, sampling various golden-era classics with deep respect"
        },
        "region": "us",
        "era": "10s",
        "conscious_turnt": 3.0,
        "thumbnail": "https://img.youtube.com/vi/ithYB82y0Sk/mqdefault.jpg",
        "user_name": "青木 喬"
    },
    {
        "youtube_id": "WCYy8jpp7R8",
        "name": "Method Man, Redman - Da Rockwilder",
        "description": {
            "ja": "Method ManとRedmanの狂気的なコンビネーションが炸裂する、わずか2分間の極濃アンセム",
            "en": "A highly dense 2-minute anthem showcasing the wild and insane combination of Method Man and Redman"
        },
        "region": "us",
        "era": "90s",
        "conscious_turnt": 4.0,
        "thumbnail": "https://img.youtube.com/vi/WCYy8jpp7R8/mqdefault.jpg",
        "user_name": "青木 喬"
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
