const fs = require('fs');
const path = require('path');

const songsPath = path.join(__dirname, '..', 'data', 'songs.json');
const songs = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
const validRegions = new Set(['us', 'jp', 'uk', 'fr', 'kr', 'other']);
const validEras = new Set(['90s', '00s', '10s', '20s']);
const seenIds = new Map();
const errors = [];
const warnings = [];

function addError(index, message) {
  errors.push(`#${index + 1}: ${message}`);
}

for (const [index, song] of songs.entries()) {
  const id = song.youtube_id;

  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    addError(index, `invalid youtube_id: ${JSON.stringify(id)}`);
  } else if (seenIds.has(id)) {
    addError(index, `duplicate youtube_id ${id} (first at #${seenIds.get(id) + 1})`);
  } else {
    seenIds.set(id, index);
  }

  if (!song.name || typeof song.name !== 'string') addError(index, 'missing name');
  if (!validRegions.has(song.region)) addError(index, `invalid region: ${JSON.stringify(song.region)}`);
  if (!validEras.has(song.era)) addError(index, `invalid era: ${JSON.stringify(song.era)}`);

  const vibe = Number(song.conscious_turnt);
  if (!Number.isFinite(vibe) || vibe < 0 || vibe > 5) {
    addError(index, `conscious_turnt must be between 0 and 5: ${JSON.stringify(song.conscious_turnt)}`);
  }

  if (!song.thumbnail || typeof song.thumbnail !== 'string') {
    addError(index, 'missing thumbnail');
  } else if (id && song.thumbnail.includes('img.youtube.com/vi/') && !song.thumbnail.includes(`/vi/${id}/`)) {
    addError(index, `thumbnail does not match youtube_id ${id}`);
  }

  if (!song.created_at || Number.isNaN(Date.parse(song.created_at))) {
    addError(index, `invalid created_at: ${JSON.stringify(song.created_at)}`);
  }

  if (!song.description || typeof song.description !== 'object') {
    warnings.push(`#${index + 1} ${id || '(no id)'}: missing bilingual description object`);
  } else if (!song.description.ja || !song.description.en) {
    warnings.push(`#${index + 1} ${id || '(no id)'}: one or more descriptions are empty`);
  }
}

console.log(`Audited ${songs.length} songs.`);
console.log(`Warnings: ${warnings.length} (legacy empty descriptions are allowed)`);

if (errors.length) {
  console.error(`Errors: ${errors.length}`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Errors: 0');
