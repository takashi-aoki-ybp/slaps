const fs = require('fs');
const path = require('path');

const targetSongs = [
  { youtube_id: "YjC0vvPGiKk", name: "BewhY - GOTTASADAE" },
  { youtube_id: "2jTshYqJpG8", name: "Gazo ft. Freeze Corleone - Drill FR 4" },
  { youtube_id: "N1yMLZ_d1tI", name: "Joey Bada$$ - Paper Trail$" },
  { youtube_id: "f0Tq1qS5z7k", name: "Shing02 - Luv(sic) Part 2" },
  { youtube_id: "h1cKt-1JzE0", name: "Little Simz - Introvert" },
  { youtube_id: "u36Zp_L2h4k", name: "Sexyy Red - Pound Town" },
  { youtube_id: "jTglS3RUSgA", name: "Time Machine - Personal Ads" }
];

async function checkYoutubeOEmbed(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  try {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 400 || res.status === 401) {
      return { valid: false };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false };
  }
}

async function searchYouTube(query, oldId) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) return null;
    const html = await response.text();
    
    // Extract video IDs
    const regex = /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/g;
    let match;
    const candidates = [];
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      if (id !== oldId && !candidates.includes(id)) {
        candidates.push(id);
      }
      if (candidates.length >= 10) break; // Get top 10
    }
    
    // Also try watch match fallback
    const watchRegex = /\/watch\?v=([A-Za-z0-9_-]{11})/g;
    while ((match = watchRegex.exec(html)) !== null) {
      const id = match[1];
      if (id !== oldId && !candidates.includes(id)) {
        candidates.push(id);
      }
      if (candidates.length >= 20) break;
    }
    
    return candidates;
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log("Searching alternative videos on YouTube for 7 dead songs...");
  
  const results = [];
  
  for (const song of targetSongs) {
    console.log(`\nChecking alternatives for: "${song.name}" (old ID: ${song.youtube_id})...`);
    
    const candidates = await searchYouTube(song.name, song.youtube_id);
    if (!candidates || candidates.length === 0) {
      console.log("  -> No candidates found.");
      results.push({ song, alternative: null });
      continue;
    }
    
    console.log(`  -> Found ${candidates.length} candidates. Verifying oEmbed validity...`);
    
    let alternative = null;
    for (const id of candidates) {
      const verify = await checkYoutubeOEmbed(id);
      if (verify.valid) {
        alternative = id;
        console.log(`  -> SUCCESS! Found valid alternative: ${id}`);
        break;
      }
    }
    
    results.push({ song, alternative });
  }
  
  console.log("\n=================================");
  console.log("SEARCH COMPLETED.");
  console.log(JSON.stringify(results, null, 2));
  console.log("=================================\n");
}

run().catch(console.error);
