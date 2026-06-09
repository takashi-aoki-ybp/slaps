const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '../.env.prod.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const prefix = process.env.DB_PREFIX || 'prod:';

async function kvFetch(command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error: ${res.statusText}`);
  const data = await res.json();
  return data.result;
}

// -------------------------------------------------------------
// CLASSIFICATION DICTIONARIES & LOGIC
// -------------------------------------------------------------

// Artist region mapping lists
const JP_ARTISTS = [
  "zorn", "libro", "小林勝行", "舐達麻", "punpee", "kreva", "kohh", "bad hop", "salu", 
  "lex", "gadoro", "anarchy", "jjj", "kid fresino", "仙人掌", "韻シスト", "awich", 
  "ak-69", "creepy nuts", "r-指定", "illmore", "febb", "omsb", "psg", "norikiyo", 
  "gezan", "shing02", "nujabes", "evisbeats", "bas", "唾奇", "sweet william", "goku green",
  "stuts", "tofubeats", "bim", "kzm", "io", "young juju", "flashbacks", "issugi", "bes",
  "buddha brand", "king giddra", "muro", "seeda", "scars", "shakka zombie", "rhymester",
  "yzerr", "tiji jojo", "g-k.i.d", "zot on the wave", "dj chari", "dj tatsuki", "watson", 
  "eyden", "kandytown", "keiju", "gottz", "mud", "ryohu", "holly q", "kikumaru", 
  "¥ellow bucks", "yellow bucks", "lana", "jp the wavy", "crystal kay", "shurkn pap", 
  "kohjiya", "kvi baba", "elione", "guca owl", "c.o.s.a.", "monyhorse", "zeebra", "candee", 
  "yelladigos", "katsuyuki", "dj krush", "tha blue herb", "志人", "なのるなもない", "変態紳士クラブ",
  "千葉雄喜", "般若", "tohji", "chico carlito", "tokona-x", "fncy", "steruss", "shuren the fire",
  "武", "dada", "vividboooy", "torauma", "petz", "jin dogg", "wilywnka", "hideyoshi", "generations",
  "ua", "スカートとpunpee", "rau def", "hokuto", "s7ick chicks", "ish-one", "lisa lil vinci",
  "jajajajajapapapapa", "kandytown「last week」", "柊人", "rawax", "クラムボン"
];

const FR_ARTISTS = ["gazo", "pnl", "ninho", "damso", "booba", "nekfeu", "jul", "orelsan", "lomepal", "kaaris", "rohvff", "iam", "suprême ntm", "ntm", "drill fr"];
const UK_ARTISTS = ["dave", "skepta", "stormzy", "central cee", "j hus", "slowthai", "little simz", "knucks", "loyle carner", "gigs", "wretch 32", "akala", "casisdead", "mura masa", "coldcut", "amon tobin", "dj food", "flowdan", "jorja smith"];
const KR_ARTISTS = ["keith ape", "jay park", "zico", "bewhy", "changmo", "woo wonjae", "giriboy", "kid milli", "justhis", "epik high", "drunken tiger", "dynamic duo", "g-dragon", "하입프린세스", "princess"];

// Manual exact overrides for specific YouTube IDs
const MANUAL_OVERRIDES = {
  // Biz Markie - Just A Friend (Should be US, 90s, Conscious)
  "9aofoBrFNdg": { region: "us", era: "90s", conscious_turnt: 1.5 },
  // Ante Up Remix (Should be US, 00s, Turnt)
  "PLT68mI5Pwc": { region: "us", era: "00s", conscious_turnt: 5.0 },
  // Sarkodie - Adonai (Ghanaian artist -> other)
  "ipZvlG-wwWk": { region: "other", era: "20s", conscious_turnt: 2.0 },
  // Hanumankind - Big Dawgs (Indian artist -> other)
  "hOHKltAiKXQ": { region: "other", era: "20s", conscious_turnt: 4.5 },
  // Westside gunn & Conway The Machine (US, 10s or 20s, Turnt/Gritty Boom-Bap)
  "jjQs6T-m57g": { region: "us", era: "10s", conscious_turnt: 4.0 },
  // The Bug - Pressure ft. Flowdan (UK Grime)
  "eN9k6Dz1SX0": { region: "uk", era: "20s", conscious_turnt: 4.0 },
  // BAD HOP - Hood Gospel (Fix era 15s -> 10s/20s, released 2019/2020)
  "-o-zH8hn1kQ": { region: "jp", era: "20s", conscious_turnt: 2.0 },
  // Black Eyed Peas - Yesterday (Fix era 15s -> 15 is 10s)
  "ithYB82y0Sk": { region: "us", era: "10s", conscious_turnt: 1.5 },
  // Mura Masa - All Around The World ft. Desiigner (Mura Masa is UK, Desiigner is US, let's categorize under UK)
  "Z9doCz9P6Pw": { region: "uk", era: "10s", conscious_turnt: 4.0 },
  // Mura Masa - Love$ick ft. A$AP Rocky (UK production)
  "ZJM4AQSbZDk": { region: "uk", era: "10s", conscious_turnt: 1.5 }
};

// Words to classify conscious/turnt ratings (if score is 2.5/3.0 or not set)
const CONSCIOUS_KEYWORDS = [
  "tribe called quest", "de la soul", "pharcyde", "gang starr", "common", "pete rock", "cl smooth", 
  "j. cole", "j.cole", "jid", "j.i.d", "curren", "alchemist", "billy woods", "kendrick lamar", "joey bada", "shing02", 
  "nujabes", "evisbeats", "zorn", "kandytown", "keiju", "ryohu", "io", "stuts", "punpee", 
  "kid fresino", "唾奇", "sweet william", "guca owl", "omsb", "田我流", "libro", "小林勝行", 
  "dj krush", "tha blue herb", "lauryn hill", "fugees", "roots", "madvillain", "mf doom", 
  "aesop rock", "cannibal ox", "mr. lif", "deltron 3030", "志人", "なのるなもない", "oddtaxi",
  "mac miller", "vince staples", "little simz", "loyle carner", "knucks", "dave", "slowthai",
  "dilated peoples", "nas", "outkast", "speech", "arrested development", "warren g", "coolio",
  "fugees", "soul of mischief", "digable planets", "lauryn", "common", "black star", "mos def",
  "talib kweli", "blue herb", "shing", "nujabes", "reiharakami", "harakami", "steruss", "柊人", "rawax", "あかり"
];

const TURNT_KEYWORDS = [
  "2pac", "busta rhymes", "bad hop", "yzerr", "t-pablow", "g-k.i.d", "tiji jojo", "watson", 
  "eyden", "yellow bucks", "lana", "jp the wavy", "jin dogg", "dada", "monyhorse", 
  "wilywnka", "jinmenusagi", "awich", "travis scott", "drake", "migos", "playboi carti", 
  "lil uzi", "lil nas", "rick ross", "megan thee stallion", "sexyy red", "dizzee rascal", 
  "giggs", "onyx", "dmx", "house of pain", "cypress hill", "naughty by nature", "50 cent", 
  "gazo", "pnl", "ninho", "freeze corleone", "skepta", "stormzy", "central cee", "jay park", 
  "keith ape", "bewhy", "drill", "trap", "club", "hype", "banger", "surround sound", "tokona-x",
  "chiba", "千葉雄喜", "チーム友達", "anarchy", "般若", "tohji", "aklo", "petz", "reichi", "bonbero",
  "t.i.", "young nudy", "offset", "gunna", "kodak black", "coi leray", "bia", "baby keem", "cardi b",
  "future", "pusha t", "schoolboy q", "mobb deep", "public enemy", "juvenile", "master p", "ghostface",
  "big l", "big pun", "snoop dogg", "ice cube", "redman", "cam'ron", "foxy brown", "dj quik", "too $hort", "e-40",
  "xzibit", "mc lyte", "black sheep", "das efx", "lil wayne", "three 6 mafia", "run the jewels", "el-p", "g-dragon"
];

function classifySongCorrectly(song) {
  const id = song.youtube_id;
  const name = song.name || '';
  const nameLower = name.toLowerCase();
  
  let descText = '';
  if (song.description) {
    if (typeof song.description === 'object') {
      descText = Object.values(song.description).join(' ').toLowerCase();
    } else {
      descText = String(song.description).toLowerCase();
    }
  }
  const fullText = `${nameLower} ${descText}`;

  // 1. Check manual override first
  if (MANUAL_OVERRIDES[id]) {
    return { ...song, ...MANUAL_OVERRIDES[id] };
  }

  // 2. Classify Region
  let region = song.region || '';
  if (!region || region === 'other' || region === 'null' || region === '') {
    // Guess region based on keywords
    if (JP_ARTISTS.some(artist => fullText.includes(artist.toLowerCase()))) {
      region = 'jp';
    } else if (FR_ARTISTS.some(artist => fullText.includes(artist.toLowerCase()))) {
      region = 'fr';
    } else if (UK_ARTISTS.some(artist => fullText.includes(artist.toLowerCase()))) {
      region = 'uk';
    } else if (KR_ARTISTS.some(artist => fullText.includes(artist.toLowerCase()))) {
      region = 'kr';
    } else {
      // Default region is us for Hip Hop unless specified
      region = 'us';
    }
  }

  // Double check if region is JP but clearly UK/US artist
  if (region === 'jp') {
    const isActuallyUK = UK_ARTISTS.some(artist => nameLower.includes(artist.toLowerCase()));
    const isActuallyKR = KR_ARTISTS.some(artist => nameLower.includes(artist.toLowerCase()));
    const isActuallyFR = FR_ARTISTS.some(artist => nameLower.includes(artist.toLowerCase()));
    if (isActuallyUK) region = 'uk';
    else if (isActuallyKR) region = 'kr';
    else if (isActuallyFR) region = 'fr';
  }

  // 3. Classify Era
  let era = song.era || '';
  // Clean invalid eras like "15s"
  if (era === '15s' || era === 'other' || !era || era === 'null' || era === '') {
    // Guess from text or publication date
    const dateStr = song.publish_at || song.created_at || '';
    if (dateStr) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      if (year >= 1990 && year <= 1999) era = '90s';
      else if (year >= 2000 && year <= 2009) era = '00s';
      else if (year >= 2010 && year <= 2019) era = '10s';
      else if (year >= 2020 && year <= 2029) era = '20s';
    }
    
    if (!era) {
      // Regex check years
      const years90 = fullText.match(/\b(199\d)\b/);
      const years00 = fullText.match(/\b(200\d)\b/);
      const years10 = fullText.match(/\b(201\d)\b/);
      const years20 = fullText.match(/\b(202\d)\b/);

      if (years90 || fullText.includes("90s") || fullText.includes("90's")) era = '90s';
      else if (years00 || fullText.includes("00s") || fullText.includes("00's") || fullText.includes("2000s")) era = '00s';
      else if (years10 || fullText.includes("10s") || fullText.includes("10's") || fullText.includes("2010s")) era = '10s';
      else if (years20 || fullText.includes("20s") || fullText.includes("20's") || fullText.includes("2020s")) era = '20s';
      else {
        era = '20s'; // Fallback default
      }
    }
  }

  // 4. Classify conscious_turnt (Resolve intermediate/missing values)
  let mood = song.conscious_turnt;
  if (mood === undefined || mood === null || mood === 2.5 || mood === 3.0 || mood === 3) {
    // Force conscious vs turnt
    const hasConscious = CONSCIOUS_KEYWORDS.some(kw => fullText.includes(kw));
    const hasTurnt = TURNT_KEYWORDS.some(kw => fullText.includes(kw));

    if (hasConscious && !hasTurnt) {
      mood = 1.5;
    } else if (hasTurnt && !hasConscious) {
      mood = 4.5;
    } else if (hasConscious && hasTurnt) {
      // Both match, default to conscious if 90s/00s, else turnt for 10s/20s
      mood = (era === '90s' || era === '00s') ? 1.5 : 4.5;
    } else {
      // No keyword matches, determine by era and region
      if (region === 'jp') {
        mood = 1.5; // Mellow J-rap default
      } else {
        mood = (era === '90s' || era === '00s') ? 1.5 : 4.5;
      }
    }
  }

  return {
    ...song,
    region,
    era,
    conscious_turnt: mood
  };
}

// -------------------------------------------------------------
// MAIN RUNNER
// -------------------------------------------------------------

async function run() {
  const writeMode = process.argv.includes('--write');
  console.log(`=== SLAPS COMPLETE METADATA AUDIT & ALIGNMENT ===`);
  console.log(`Mode: ${writeMode ? '★ WRITE MODE (Updating Local & KV DB!)' : '☆ DRY-RUN MODE (Preview only)'}`);
  console.log(`KV Database Prefix: "${prefix}"`);

  // 1. Fetch current local songs
  const localSongsPath = path.join(__dirname, '../data/songs.json');
  if (!fs.existsSync(localSongsPath)) {
    console.error("Local songs.json not found!");
    process.exit(1);
  }
  const localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));

  // 2. Fetch current KV songs
  const songsKey = `${prefix}slaps:songs`;
  console.log(`Fetching songs from KV key: ${songsKey}...`);
  const rawKvList = await kvFetch(['LRANGE', songsKey, 0, -1]);
  let kvSongs = [];
  if (rawKvList && Array.isArray(rawKvList)) {
    kvSongs = rawKvList.map(item => JSON.parse(item));
  } else {
    console.error("Warning: Failed to fetch KV songs or empty.");
  }

  console.log(`Loaded ${localSongs.length} local songs.`);
  console.log(`Loaded ${kvSongs.length} KV songs.`);

  // 3. Classify ALL songs in both datasets
  const localResult = [];
  let localChangedCount = 0;
  
  for (const song of localSongs) {
    const updated = classifySongCorrectly(song);
    
    // Check if changed
    if (song.region !== updated.region || song.era !== updated.era || song.conscious_turnt !== updated.conscious_turnt) {
      console.log(`[Local Change] "${song.name}" (${song.youtube_id}):`);
      if (song.region !== updated.region) console.log(`  - Region: "${song.region}" -> "${updated.region}"`);
      if (song.era !== updated.era) console.log(`  - Era: "${song.era}" -> "${updated.era}"`);
      if (song.conscious_turnt !== updated.conscious_turnt) console.log(`  - Mood: ${song.conscious_turnt} -> ${updated.conscious_turnt}`);
      localChangedCount++;
    }
    localResult.push(updated);
  }

  const kvResult = [];
  let kvChangedCount = 0;

  for (const song of kvSongs) {
    const updated = classifySongCorrectly(song);

    // Check if changed
    if (song.region !== updated.region || song.era !== updated.era || song.conscious_turnt !== updated.conscious_turnt) {
      console.log(`[KV Change] "${song.name}" (${song.youtube_id}):`);
      if (song.region !== updated.region) console.log(`  - Region: "${song.region}" -> "${updated.region}"`);
      if (song.era !== updated.era) console.log(`  - Era: "${song.era}" -> "${updated.era}"`);
      if (song.conscious_turnt !== updated.conscious_turnt) console.log(`  - Mood: ${song.conscious_turnt} -> ${updated.conscious_turnt}`);
      kvChangedCount++;
    }
    kvResult.push(updated);
  }

  console.log(`\nProposed Changes Summary:`);
  console.log(`- Local updates: ${localChangedCount} songs`);
  console.log(`- KV updates: ${kvChangedCount} songs`);
  console.log(`- Total: ${localChangedCount + kvChangedCount} updates.`);

  if (localChangedCount === 0 && kvChangedCount === 0) {
    console.log("No updates needed. Everything matches properly.");
    return;
  }

  // 4. Apply changes if write mode
  if (writeMode) {
    // Update local file
    if (localChangedCount > 0) {
      fs.writeFileSync(localSongsPath, JSON.stringify(localResult, null, 2), 'utf8');
      console.log(`Successfully updated local songs.json.`);
    }

    // Update KV database
    if (kvChangedCount > 0) {
      console.log(`Updating KV database...`);
      // Delete old key
      await kvFetch(['DEL', songsKey]);
      // Write in chunks of 50
      const chunkSize = 50;
      const jsonStrings = kvResult.map(s => JSON.stringify(s));
      for (let i = 0; i < jsonStrings.length; i += chunkSize) {
        const chunk = jsonStrings.slice(i, i + chunkSize);
        await kvFetch(['RPUSH', songsKey, ...chunk]);
      }
      console.log(`Successfully updated Vercel KV songs key: ${songsKey}`);
    }
  } else {
    console.log("\n☆ This was a DRY-RUN. Run with '--write' flag to apply these changes.");
  }
}

run().catch(console.error);
