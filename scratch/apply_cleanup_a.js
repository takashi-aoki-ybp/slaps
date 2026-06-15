const fs = require('fs');
const path = require('path');

const songsPath = path.join(__dirname, '../data/songs.json');
if (!fs.existsSync(songsPath)) {
  console.error("songs.json not found");
  process.exit(1);
}

const deleteIds = new Set([
  "YjC0vvPGiKk", // BewhY - GOTTASADAE
  "2jTshYqJpG8", // Gazo ft. Freeze Corleone - Drill FR 4
  "N1yMLZ_d1tI", // Joey Bada$$ - Paper Trail$
  "f0Tq1qS5z7k", // Shing02 - Luv(sic) Part 2
  "h1cKt-1JzE0", // Little Simz - Introvert
  "u36Zp_L2h4k", // Sexyy Red - Pound Town
  "jTglS3RUSgA", // Time Machine - Personal Ads
  "A1B2C3D4E5J", // Untitled (Dummy)
  "A1B2C3D4E5I", // Untitled (Dummy)
  "A1B2C3D4E5H", // Untitled (Dummy)
  "A1B2C3D4E5G", // Untitled (Dummy)
  "3S1tP7S-uLg", // Untitled (Dummy)
  "8V94XvDq_m8", // ZORN - Walk This Way (Dummy)
  "3tmd-ClpJKA"  // Test Song (Dummy)
]);

const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
const originalLength = songs.length;

const cleanedSongs = songs.filter(s => !deleteIds.has(s.youtube_id));

console.log(`Original count: ${originalLength}`);
console.log(`Cleaned count: ${cleanedSongs.length}`);
console.log(`Removed: ${originalLength - cleanedSongs.length} songs.`);

fs.writeFileSync(songsPath, JSON.stringify(cleanedSongs, null, 2) + '\n');
console.log("songs.json updated successfully.");
