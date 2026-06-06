import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Node.js ESM helper
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env file
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  });
}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.error('Error: KV credentials not found in env');
  process.exit(1);
}

const JP_ARTISTS = [
  "zorn", "libro", "小林勝行", "舐達麻", "punpee", "kreva", "kohh", "bad hop", "salu", 
  "lex", "gadoro", "anarchy", "jjj", "kid fresino", "仙人掌", "韻シスト", "awich", 
  "ak-69", "creepy nuts", "r-指定", "illmore", "febb", "omsb", "psg", "norikiyo", 
  "gezan", "shing02", "nujabes", "evisbeat", "bas", "唾奇", "sweet william", "goku green",
  "stuts", "tofubeats", "bim", "kzm", "io", "young juju", "flashbacks", "issugi", "bes",
  "buddha brand", "king giddra", "muro", "seeda", "scars", "shakka zombie", "rhymester",
  "yzerr", "tiji jojo", "g-k.i.d", "zot on the wave", "dj chari", "dj tatsuki", "watson", 
  "eyden", "kandytown", "keiju", "gottz", "mud", "ryohu", "holly q", "kikumaru", 
  "¥ellow bucks", "yellow bucks", "lana", "jp the wavy", "crystal kay", "shurkn pap", 
  "kohjiya", "kvi baba", "elione", "guca owl", "c.o.s.a.", "monyhorse", "zeebra", "candee", 
  "yelladigos", "katsuyuki"
];

const FR_ARTISTS = ["gazo", "pnl", "ninho", "damso", "booba", "nekfeu", "jul", "orelsan", "lomepal", "kaaris", "rohvff", "iam", "suprême ntm", "ntm"];
const UK_ARTISTS = ["dave", "skepta", "stormzy", "central cee", "j hus", "slowthai", "little simz", "knucks", "loyle carner", "gigs", "wretch 32", "akala", "casisdead", "mura masa"];
const KR_ARTISTS = ["keith ape", "jay park", "zico", "bewhy", "changmo", "woo wonjae", "giriboy", "kid milli", "justhis", "epik high", "drunken tiger", "dynamic duo"];

function guessEraFromDate(dateStr) {
  if (!dateStr) return null;
  try {
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (year >= 1990 && year <= 1999) return "90s";
    if (year >= 2000 && year <= 2009) return "00s";
    if (year >= 2010 && year <= 2019) return "10s";
    if (year >= 2020 && year <= 2029) return "20s";
  } catch (e) {}
  return null;
}

function classifySong(song) {
  const title = (song.name || "").toLowerCase();
  
  let desc = "";
  if (song.description) {
    if (typeof song.description === "object") {
      desc = Object.values(song.description).join(" ").toLowerCase();
    } else {
      desc = String(song.description).toLowerCase();
    }
  }

  const searchText = `${title} ${desc}`;

  // 1. Region
  let region = song.region;
  if (!region || region === "null" || region === "" || region === "other" || region === "OTHER") {
    if (JP_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "jp";
    } else if (FR_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "fr";
    } else if (UK_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "uk";
    } else if (KR_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "kr";
    } else {
      region = "us";
    }
  }

  // 2. Era
  let era = song.era;
  if (!era || era === "null" || era === "" || era === "other" || era === "OTHER") {
    era = guessEraFromDate(song.publish_at) || guessEraFromDate(song.created_at);
    if (!era) {
      const years90 = searchText.match(/\b(199\d)\b/);
      const years00 = searchText.match(/\b(200\d)\b/);
      const years10 = searchText.match(/\b(201\d)\b/);
      const years20 = searchText.match(/\b(202\d)\b/);

      if (years90 || searchText.includes("90s") || searchText.includes("90's")) {
        era = "90s";
      } else if (years00 || searchText.includes("00s") || searchText.includes("00's") || searchText.includes("2000s")) {
        era = "00s";
      } else if (years10 || searchText.includes("10s") || searchText.includes("10's") || searchText.includes("2010s")) {
        era = "10s";
      } else if (years20 || searchText.includes("20s") || searchText.includes("20's") || searchText.includes("2020s")) {
        era = "20s";
      } else {
        era = "20s";
      }
    }
  }

  return { region, era };
}

async function kvFetch(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error: ${res.statusText}`);
  const data = await res.json();
  return data.result;
}

async function main() {
  console.log('--- SLAPS Metadata Auto-Classification Batch Run ---');

  // 1. Clean Local songs.json
  const localSongsPath = path.join(__dirname, '..', 'data', 'songs.json');
  if (fs.existsSync(localSongsPath)) {
    const localSongs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
    let localUpdatedCount = 0;

    localSongs.forEach((song) => {
      const origRegion = song.region;
      const origEra = song.era;
      const { region, era } = classifySong(song);

      if (song.region !== region || song.era !== era) {
        song.region = region;
        song.era = era;
        localUpdatedCount++;
        console.log(`[Local] Classified: "${song.name}" -> Region: ${region}, Era: ${era} (was: ${origRegion}, ${origEra})`);
      }
    });

    if (localUpdatedCount > 0) {
      fs.writeFileSync(localSongsPath, JSON.stringify(localSongs, null, 2), 'utf8');
      console.log(`Successfully updated ${localUpdatedCount} songs in local songs.json.`);
    } else {
      console.log('No local songs required updates.');
    }
  }

  // 2. Clean Vercel KV Database
  console.log('Fetching songs from Vercel KV...');
  const rawList = await kvFetch(['LRANGE', 'slaps:songs', '0', '-1']);
  if (!rawList || !Array.isArray(rawList)) {
    console.log('No songs found in Vercel KV.');
    return;
  }

  console.log(`Loaded ${rawList.length} songs from Vercel KV.`);
  let kvUpdatedCount = 0;
  const updatedSongs = [];

  rawList.forEach((item) => {
    const song = JSON.parse(item);
    const origRegion = song.region;
    const origEra = song.era;
    const { region, era } = classifySong(song);

    if (song.region !== region || song.era !== era) {
      song.region = region;
      song.era = era;
      kvUpdatedCount++;
      console.log(`[KV] Classified: "${song.name}" -> Region: ${region}, Era: ${era} (was: ${origRegion}, ${origEra})`);
    }
    updatedSongs.push(song);
  });

  if (kvUpdatedCount > 0) {
    console.log(`Updating ${kvUpdatedCount} songs in Vercel KV...`);
    // Delete existing list
    await kvFetch(['DEL', 'slaps:songs']);
    // Push updated list in original order (using RPUSH)
    const jsonStrings = updatedSongs.map((s) => JSON.stringify(s));
    await kvFetch(['RPUSH', 'slaps:songs', ...jsonStrings]);
    console.log(`Successfully completed KV database classification. Updated ${kvUpdatedCount} songs.`);
  } else {
    console.log('No KV songs required updates.');
  }

  console.log('Done!');
}

main().catch(console.error);
