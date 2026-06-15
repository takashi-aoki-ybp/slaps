const fs = require('fs');
const path = require('path');

const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
if (!fs.existsSync(unifiedPath)) {
  console.error("all_songs_unified.json not found");
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));

// 削除対象の7曲を除外
const EXCLUDE_IDS = new Set([
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i
  'JPQqPJqY_Lo', // Number_i
  'IoDViKwXqjw', // Number_i
  'Zv6JKobJyFY'  // BTS
]);

const brief = songs.filter(s => !EXCLUDE_IDS.has(s.youtube_id)).map(s => ({
  id: s.youtube_id,
  name: s.name,
  region: s.region,
  era: s.era,
  user: s.user_name
}));

const briefPath = path.join(__dirname, 'songs_brief.json');
fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf8');
console.log(`Successfully wrote brief to: ${briefPath}`);
