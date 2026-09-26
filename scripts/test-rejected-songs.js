const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isRejectedSong } = require('../api/utils/rejected-song-policy.js');

const rejectedId = 'b6-JNeXxN3s';
const songs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'songs.json'), 'utf8'));
const songsApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'songs.js'), 'utf8');
const submitApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'submit.js'), 'utf8');
const youtubeSearchApi = fs.readFileSync(path.join(__dirname, '..', 'api', 'youtube-search.js'), 'utf8');

assert.equal(isRejectedSong(rejectedId), true);
assert.equal(isRejectedSong('not-rejected'), false);
assert.equal(songs.some((song) => song.youtube_id === rejectedId), false);
assert.match(songsApi, /if \(isRejectedSong\(song\.youtube_id\)\) return false/,
  'production merge must suppress rejected IDs even if Redis contains an old row');
assert.match(submitApi, /if \(isRejectedSong\(youtube_id\)\)/,
  'community submission must not republish an explicitly rejected ID');
assert.match(youtubeSearchApi, /!isRejectedSong\(candidate\)/,
  'DIG YouTube lookup must skip rejected search results');
assert.match(youtubeSearchApi, /!isRejectedSong\(cached\)/,
  'DIG YouTube lookup must ignore a rejected cached result');

console.log('Rejected-song policy passed: catalogue absent, Redis/DIG suppressed, resubmission blocked.');
