const fs = require('fs');
const path = require('path');

const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
if (!fs.existsSync(unifiedPath)) {
  console.error("Unified songs file not found");
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));
const summaryLines = songs.map((s, index) => {
  const mood = s.conscious_turnt !== undefined ? s.conscious_turnt : 'N/A';
  return `${index + 1} | ${s.youtube_id} | ${s.region || 'null'} | ${s.era || 'null'} | ${mood} | ${s.user_name || 'Anonymous'} | ${s.name}`;
});

const outputPath = path.join(__dirname, 'songs_summary.txt');
fs.writeFileSync(outputPath, summaryLines.join('\n'), 'utf8');
console.log(`Summary written to: ${outputPath} (${songs.length} songs)`);
