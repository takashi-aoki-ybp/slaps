const { retired, generic } = require('../../data/retired-descriptions.json');
const retiredTexts = new Set(Object.values(retired).flatMap(pair => [pair.ja, pair.en]));

function isBoilerplate(value, lang) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (retiredTexts.has(text)) return true;
  if (generic.some(pair => pair[lang] === text)) return true;
  if (lang === 'ja') {
    return /^YouTubeで公開中の「|^SLAPSアーカイブから「/.test(text)
      || /公開の「[\s\S]+」。(?:日本|US|UK|フランス|韓国|グローバル) \/ (?:\d{4}年代|年代横断)。$/.test(text)
      || /^[「“][\s\S]+[」”]の(?:ミュージックビデオ|映像版)。/.test(text);
  }
  return /^From the SLAPS archive:|^“[\s\S]+” on YouTube\. Hip-hop from|^“[\s\S]+” from [\s\S]+\. (?:Japan|US|the UK|France|Korea|the global scene) \/ (?:the \d{4}s|across eras)\.$|^The (?:music video|video version) (?:for|of) /i.test(text);
}

// Only erase the precise retired text for the precise catalogued ID.
// Later genuine edits in either language remain authoritative.
function retireGeneratedDescription(song) {
  const old = retired[song.youtube_id];
  if (!old || !song.description || typeof song.description !== 'object') return song;
  const description = { ...song.description };
  for (const lang of ['ja', 'en']) {
    if (description[lang] === old[lang]) description[lang] = '';
  }
  return { ...song, description };
}

module.exports = { isBoilerplate, retireGeneratedDescription };
