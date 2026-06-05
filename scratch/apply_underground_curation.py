import json
import os
import sys

# Pre-defined curated underground tracks with verified YouTube IDs
CURATED_TRACKS = [
    {
        "youtube_id": "h1cKt-1JzE0",
        "name": "Little Simz - Introvert",
        "region": "uk",
        "era": "20s",
        "description": {
            "ja": "壮大なオーケストラと研ぎ澄まされたリリックが融合した、UKを代表する名作コンシャスラップ。",
            "en": "A majestic orchestral arrangement paired with razor-sharp lyricism, establishing Little Simz at the forefront of UK conscious rap."
        },
        "conscious_turnt": 1.5,
        "thumbnail": "https://img.youtube.com/vi/h1cKt-1JzE0/mqdefault.jpg",
        "user_name": "Editor",
        "status": "published"
    },
    {
        "youtube_id": "f0Tq1qS5z7k",
        "name": "Shing02 - Luv(sic) Part 2",
        "region": "jp",
        "era": "00s",
        "description": {
            "ja": "Nujabesのメロウなビートに乗せて語られる、普遍的な愛のメッセージ。ジャパニーズヒップホップの至宝。",
            "en": "Spitting timeless messages of love over Nujabes' signature mellow beats. A cornerstone of Japanese hip-hop history."
        },
        "conscious_turnt": 1.0,
        "thumbnail": "https://img.youtube.com/vi/f0Tq1qS5z7k/mqdefault.jpg",
        "user_name": "Editor",
        "status": "published"
    },
    {
        "youtube_id": "N1yMLZ_d1tI",
        "name": "Joey Bada$$ - Paper Trail$",
        "region": "us",
        "era": "10s",
        "description": {
            "ja": "90年代ゴールデンエラへの回帰を感じさせる、鋭いリリシズムとクラシックなブーンバップサウンド。",
            "en": "A throw back to the 90s golden era boom-bap, featuring sharp lyricism and vintage production."
        },
        "conscious_turnt": 2.0,
        "thumbnail": "https://img.youtube.com/vi/N1yMLZ_d1tI/mqdefault.jpg",
        "user_name": "Editor",
        "status": "published"
    },
    {
        "youtube_id": "2jTshYqJpG8",
        "name": "Gazo ft. Freeze Corleone - Drill FR 4",
        "region": "fr",
        "era": "20s",
        "description": {
            "ja": "フランス独自のダークなドリルシーンを牽引する、強烈なベースと硬派なフローの掛け合い。",
            "en": "Leading the dark French drill scene with hard-hitting bass and uncompromising flows."
        },
        "conscious_turnt": 4.5,
        "thumbnail": "https://img.youtube.com/vi/2jTshYqJpG8/mqdefault.jpg",
        "user_name": "Editor",
        "status": "published"
    },
    {
        "youtube_id": "YjC0vvPGiKk",
        "name": "BewhY - GOTTASADAE",
        "region": "kr",
        "era": "10s",
        "description": {
            "ja": "圧倒的なライムデリバリーと、合唱を取り入れたシアトリカルなビートが心揺さぶる韓国の傑作ラップ。",
            "en": "Flawless rhyme delivery meets theatrical choral-driven production, showing the absolute peak of Korean hip-hop."
        },
        "conscious_turnt": 3.5,
        "thumbnail": "https://img.youtube.com/vi/YjC0vvPGiKk/mqdefault.jpg",
        "user_name": "Editor",
        "status": "published"
    }
]

def main():
    songs_path = "data/songs.json"
    if not os.path.exists(songs_path):
        print(f"Error: {songs_path} not found")
        sys.exit(1)
        
    with open(songs_path, "r", encoding="utf-8") as f:
        songs = json.load(f)
        
    existing_ids = {s.get("youtube_id") for s in songs}
    added_count = 0
    
    print(f"Current track count: {len(songs)}")
    
    for track in CURATED_TRACKS:
        yid = track["youtube_id"]
        if yid not in existing_ids:
            # Add to the beginning of the list as editor choices
            songs.insert(0, track)
            added_count += 1
            print(f"Added new underground track: {track['name']} ({yid})")
        else:
            print(f"Track already exists: {track['name']} ({yid})")
            
    if added_count > 0:
        with open(songs_path, "w", encoding="utf-8") as f:
            json.dump(songs, f, indent=2, ensure_ascii=False)
        print(f"Successfully added {added_count} curated underground tracks to {songs_path}.")
    else:
        print("No new tracks added. All curated tracks already exist in the catalog.")

if __name__ == "__main__":
    main()
