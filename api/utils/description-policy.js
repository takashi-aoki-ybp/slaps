const { retired, generic } = require('../../data/retired-descriptions.json');
const { retired: retiredCreditOnly } = require('../../data/retired-credit-descriptions.json');
const retiredTexts = new Set([
  ...Object.values(retired).flatMap(pair => [pair.ja, pair.en]),
  ...Object.values(retiredCreditOnly).flatMap(pair => [pair.ja, pair.en]),
]);

// Production credits are useful source evidence, but a list of names and roles is
// not useful editorial copy. This intentionally recognizes the compact bilingual
// credit summaries previously produced by the daily curation job. It does not
// inspect community copy generically; runtime retirement remains exact ID + text.
function isCreditOnlyDescription(description) {
  const ja = typeof description?.ja === 'string' ? description.ja.trim() : '';
  const en = typeof description?.en === 'string' ? description.en.trim() : '';
  if (!ja || !en) return false;

  if (/^(?:Vocals by|Music by|Beat by|Created with footage|Filmed in|Directed by|Video directed by|Written and directed by|Directed and|Directed,|Shot and edited by|Ian Lipton served as|Concept and direction by)/i.test(en)) {
    return true;
  }
  if (/^Produced by\b/i.test(en) && (en.match(/[.!?](?:\s|$)/g) || []).length <= 1) {
    return true;
  }
  if (/^Featuring\b/i.test(en) && /\b(?:produced|directed)\b/i.test(en)) {
    return true;
  }
  if (/^This remix brings in\b/i.test(en) && /\b(?:production by|directed by)\b/i.test(en)) {
    return true;
  }
  const namedCredit = /^(?:[A-Z][A-Za-z0-9'’.-]*(?:\s+(?:&\s+)?[A-Z][A-Za-z0-9'’.-]*){0,5})\s+(?:directed|produced|served as (?:director|cinematographer|editor))\b/;
  return namedCredit.test(en) && /\b(?:directed|edited|dancer|visuals|cinematograph)\b/i.test(en);
}

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
  const old = retired[song.youtube_id] || retiredCreditOnly[song.youtube_id];
  if (!old || !song.description || typeof song.description !== 'object') return song;
  const description = { ...song.description };
  for (const lang of ['ja', 'en']) {
    if (description[lang] === old[lang]) description[lang] = '';
  }
  return { ...song, description };
}

module.exports = { isBoilerplate, isCreditOnlyDescription, retireGeneratedDescription };
