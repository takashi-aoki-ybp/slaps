const { rejected } = require('../../data/rejected-songs.json');

function isRejectedSong(youtubeId) {
  return Boolean(youtubeId && rejected[youtubeId]);
}

module.exports = { isRejectedSong };
