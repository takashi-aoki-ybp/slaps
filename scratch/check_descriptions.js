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

console.log(`Checking ${songs.length} descriptions for unnatural wording...`);

const suspiciousWords = [
  { word: 'バーズ', type: 'error', suggest: 'バース' },
  { word: '小説', type: 'error', suggest: '小節' },
  { word: 'お届け', type: 'ai_smell', suggest: 'レビュー形式に書き換え' },
  { word: '紹介します', type: 'unnatural', suggest: '体言止めや簡潔な表現に' },
  { word: 'フィーチャーする', type: 'unnatural', suggest: '「〜を迎えた」や「〜とコラボ」に' },
  { word: 'フューチャリング', type: 'error', suggest: 'フィーチャリング / 客演' },
  { word: 'ヒップホップソング', type: 'unnatural', suggest: '「ヒップホップアンセム」や「名曲」等に' }
];

const matches = [];

songs.forEach((song, index) => {
  const jaDesc = song.description && song.description.ja ? song.description.ja : '';
  const enDesc = song.description && song.description.en ? song.description.en : '';

  suspiciousWords.forEach(({ word, type, suggest }) => {
    if (jaDesc.includes(word)) {
      matches.push({
        index,
        name: song.name,
        youtube_id: song.youtube_id,
        jaDesc,
        foundWord: word,
        type,
        suggest
      });
    }
  });
});

console.log(`\nFound ${matches.length} suspicious descriptions:`);
matches.forEach((m, idx) => {
  console.log(`[${idx + 1}] Song: "${m.name}" (ID: ${m.youtube_id})`);
  console.log(`    Found: "${m.foundWord}" (Type: ${m.type}, Suggestion: ${m.suggest})`);
  console.log(`    Current ja: "${m.jaDesc}"`);
});
