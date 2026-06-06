import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localSongsPath = path.join(__dirname, '..', 'data', 'songs.json');
if (!fs.existsSync(localSongsPath)) {
  console.error('songs.json not found');
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(localSongsPath, 'utf8'));
const targetHost = 'https://slaps.tokyo';

async function fetchWithTimeout(url, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res.status;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function main() {
  console.log(`--- SLAPS OGP Image Pre-warm Batch ---`);
  console.log(`Total songs to pre-warm: ${songs.length}`);

  // 10個ずつの並行実行チャンクで回す
  const CHUNK_SIZE = 10;
  for (let i = 0; i < songs.length; i += CHUNK_SIZE) {
    const chunk = songs.slice(i, i + CHUNK_SIZE);
    console.log(`Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(songs.length / CHUNK_SIZE)}...`);

    const promises = chunk.map(async (song) => {
      const url = `${targetHost}/api/og-image?v=${song.youtube_id}`;
      try {
        const status = await fetchWithTimeout(url);
        console.log(`  [Warm] "${song.name}" -> Status: ${status}`);
      } catch (err) {
        console.warn(`  [Warn] Failed to warm "${song.name}": ${err.message}`);
      }
    });

    await Promise.all(promises);
    // Vercelサーバーの急激なCPUバーストを防ぐために少しスリープ
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log('OGP Pre-warm complete!');
}

main().catch(console.error);
