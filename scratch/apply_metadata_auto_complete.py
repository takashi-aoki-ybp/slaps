import json
import os
import re
import sys
from datetime import datetime

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

JP_ARTISTS = [
    "zorn", "libro", "小林勝行", "舐達麻", "punpee", "kreva", "kohh", "bad hop", "salu", 
    "lex", "gadoro", "anarchy", "jjj", "kid fresino", "仙人掌", "韻シスト", "awich", 
    "ak-69", "creepy nuts", "r-指定", "illmore", "febb", "omsb", "psg", "norikiyo", 
    "gezan", "shing02", "nujabes", "evisbeat", "bas", "唾奇", "sweet william", "goku green",
    "stuts", "tofubeats", "bim", "kzm", "io", "young juju", "flashbacks", "issugi", "bes",
    "buddha brand", "king giddra", "muro", "seeda", "scars", "shakka zombie", "rhymester"
]

FR_ARTISTS = ["gazo", "pnl", "ninho", "damso", "booba", "nekfeu", "jul", "orelsan", "lomepal", "kaaris", "rohvff", "iam", "suprême ntm", "ntm"]
UK_ARTISTS = ["dave", "skepta", "stormzy", "central cee", "j hus", "slowthai", "little simz", "knucks", "loyle carner", "gigs", "wretch 32", "akala", "casisdead"]
KR_ARTISTS = ["keith ape", "jay park", "zico", "bewhy", "changmo", "woo wonjae", "giriboy", "kid milli", "justhis", "epik high", "drunken tiger", "dynamic duo"]

def guess_era_from_date(date_str):
    if not date_str:
        return None
    try:
        # Get year from timestamp (e.g. 2021-08-12...)
        year = int(date_str[:4])
        if 1990 <= year <= 1999:
            return "90s"
        elif 2000 <= year <= 2009:
            return "00s"
        elif 2010 <= year <= 2019:
            return "10s"
        elif 2020 <= year <= 2029:
            return "20s"
    except:
        pass
    return None

def guess_metadata_rule_based(song):
    title = song.get("name", "").lower()
    desc = song.get("description", "")
    if isinstance(desc, dict):
        desc = " ".join(desc.values())
    desc = desc.lower() if desc else ""
    
    # Combined search text
    search_text = f"{title} {desc}"
    
    # 1. Guess Region
    region = song.get("region")
    if not region or region == "null":
        if any(a in search_text for a in JP_ARTISTS):
            region = "jp"
        elif any(a in search_text for a in FR_ARTISTS):
            region = "fr"
        elif any(a in search_text for a in UK_ARTISTS):
            region = "uk"
        elif any(a in search_text for a in KR_ARTISTS):
            region = "kr"
        else:
            region = "us" # default to US if undetermined

    # 2. Guess Era
    era = song.get("era")
    if not era or era == "null":
        # Try guessing from publish_at or created_at
        era = guess_era_from_date(song.get("publish_at")) or guess_era_from_date(song.get("created_at"))
        
        if not era:
            # Look for years in title/description
            years_90 = re.findall(r"\b(199\d)\b", search_text)
            years_00 = re.findall(r"\b(200\d)\b", search_text)
            years_10 = re.findall(r"\b(201\d)\b", search_text)
            years_20 = re.findall(r"\b(202\d)\b", search_text)
            
            if years_90 or "90s" in search_text or "90's" in search_text:
                era = "90s"
            elif years_00 or "00s" in search_text or "00's" in search_text or "2000s" in search_text:
                era = "00s"
            elif years_10 or "10s" in search_text or "10's" in search_text or "2010s" in search_text:
                era = "10s"
            elif years_20 or "20s" in search_text or "20's" in search_text or "2020s" in search_text:
                era = "20s"
            else:
                era = "20s" # Default fallback

    return {"region": region, "era": era}

def main():
    songs_path = "data/songs.json"
    if not os.path.exists(songs_path):
        print(f"Error: {songs_path} not found")
        sys.exit(1)
        
    with open(songs_path, "r", encoding="utf-8") as f:
        songs = json.load(f)
        
    updated_count = 0
    print(f"Loaded {len(songs)} songs from {songs_path}")
    
    for song in songs:
        orig_region = song.get("region")
        orig_era = song.get("era")
        
        need_region = not orig_region or orig_region == "null" or orig_region == ""
        need_era = not orig_era or orig_era == "null" or orig_era == ""
        
        if need_region or need_era:
            guesses = guess_metadata_rule_based(song)
            
            if need_region:
                song["region"] = guesses["region"]
            if need_era:
                song["era"] = guesses["era"]
                
            updated_count += 1
            print(f"Updated: {song['name']}")
            print(f"  Before -> Region: {orig_region}, Era: {orig_era}")
            print(f"  After  -> Region: {song['region']}, Era: {song['era']}")
            print("-" * 50)
            
    if updated_count > 0:
        with open(songs_path, "w", encoding="utf-8") as f:
            json.dump(songs, f, indent=2, ensure_ascii=False)
        print(f"Successfully completed autocompletion. Updated {updated_count} songs in {songs_path}.")
    else:
        print("No missing metadata found. All songs already have region and era.")

if __name__ == "__main__":
    main()
