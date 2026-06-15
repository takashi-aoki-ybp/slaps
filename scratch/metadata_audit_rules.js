const fs = require('fs');
const path = require('path');

// 削除対象の7曲のID (監査対象外とする)
const EXCLUDE_IDS = new Set([
  'QLEc84xQRQM', // 女王蜂
  'AaMmSNBt_O8', // KID PHENOMENON
  'iR5vQeUQ32Q', // ShowMinorSavage
  '0izBEKMf-3Q', // Number_i
  'JPQqPJqY_Lo', // Number_i
  'IoDViKwXqjw', // Number_i
  'Zv6JKobJyFY'  // BTS
]);

const unifiedPath = path.join(__dirname, 'all_songs_unified.json');
if (!fs.existsSync(unifiedPath)) {
  console.error("Error: all_songs_unified.json not found.");
  process.exit(1);
}

const songs = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));

// 判定関数 (バグ修正版)
function auditSong(song) {
  const name = song.name;
  const lowerName = name.toLowerCase();
  
  let region = song.region;
  let era = song.era === '20s' ? '20s+' : song.era;
  let non_hiphop = false;
  let reason = [];

  // アーティスト名と曲名の切り出し
  let artistPart = "";
  let titlePart = "";
  const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
  let splitSuccess = false;
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      const parts = name.split(sep);
      artistPart = parts[0].trim();
      titlePart = parts.slice(1).join(sep).trim();
      splitSuccess = true;
      break;
    }
  }
  
  if (!splitSuccess) {
    artistPart = name.trim();
    titlePart = "";
  }

  const lowerArtist = artistPart.toLowerCase();

  // アーティストたちをさらに分解 (feat, ft, &, comma)
  const features = [' feat. ', ' feat ', ' ft. ', ' ft ', ' & ', ' &amp; ', ' and ', ','];
  let artists = [lowerArtist];
  
  for (const feat of features) {
    const nextArtists = [];
    for (const a of artists) {
      if (a.includes(feat)) {
        nextArtists.push(...a.split(feat).map(x => x.trim()));
      } else {
        nextArtists.push(a);
      }
    }
    artists = nextArtists;
  }
  
  // 空文字除外
  artists = artists.filter(a => a.length > 0);

  // 国・地域の判定
  const jpArtists = new Set([
    'zorn', 'libro', '小林勝行', '舐達麻', 'punpee', 'kreva', 'kohh', 'bad hop', 'watson', 
    'yellow bucks', '¥ellow bucks', 'jinmenusagi', 'ピーナッツくん', 'stuts', 'kandytown', 'io', 'keiju', 
    'どんぐりず', 'dongurizu', '田我流', '般若', 'ozworld', 'bim', 'sparta', 'norikiyo', 'tokona-x', 
    'chico carlito', 'anarchy', 'shing02', 'buddha brand', 'tohji', 'guca owl', 'dinary delta force', 
    'omsb', 'salu', 'sicboy', 'dada', 'vividboooy', 'lana', 'lex', 'yo-sea', 'torauma', 'wilywnka', 
    't-pablow', 'jaggla', 'cz tiger', 'mcbites', 'shurkn pap', 'awich', 'ozrosaurus', 'g-k.i.d', 
    'candee', 'dj ryow', 'suglawd familiar', 'c.o.s.a.', 'kvi baba', 'novel core', 'shunto', 'ryoki', 
    'peterparker69', '野田洋次郎', '加山雄三', 'お嫁においで', '柊人', '鎮座dopeness', '句潤', '志人', 
    'なのるなもない', 'meiso', '鬼', '武', 'dj krush', 'dj tatstuki', 'dj chari', 'monyhorse',
    'gottz', 'mud', 'ryohu', 'squad', 'jin dogg', 'eyden', 'benjazzy', 'vingo', 'bark', 
    'yellow pato', 'g-k.i.d', 'tiji jojo', 'lisa lil vinci', 'jellyy', 'petz', 'jnkmn', 'u-lee',
    'chaki zulu', 'hono'
  ]);
  
  const frArtists = new Set(['gazo', 'pnl', 'ninho', 'nekfeu', 'freeze corleone', 'sch', 'booba', 'damso']);
  
  const ukArtists = new Set([
    'dave', 'skepta', 'stormzy', 'little simz', 'central cee', 'headie one', 'mura masa', 
    'young fathers', 'the bug', 'flowdan', 'hard life', 'easy life', 'coldcut', 'amon tobin', 
    'dj food', 'dizzee rascal', 'giggs', 'the 1975'
  ]);
  
  const krArtists = new Set(['keith ape', 'jay park', 'zico', 'bewhy', 'g-dragon', 'bts', 'h//pe princess', 'tashannie', 'drunken tiger', 'epik high']);
  
  const latamArtists = new Set(['ca7riel', 'paco amoroso']);
  const africaArtists = new Set(['falz', 'kwesi arthur', 'sarkodie']);

  let targetRegion = region;
  
  // アーティストリストのいずれかがマッチするか判定
  const hasJp = artists.some(a => jpArtists.has(a) || a.includes('般若') || a.includes('加山雄三') || a.includes('お嫁においで') || a.includes('田我流') || a.includes('舐達麻') || a.includes('小林勝行') || a.includes('柊人'));
  const hasFr = artists.some(a => frArtists.has(a));
  const hasUk = artists.some(a => ukArtists.has(a));
  const hasKr = artists.some(a => krArtists.has(a));
  const hasLatam = artists.some(a => latamArtists.has(a));
  const hasAfrica = artists.some(a => africaArtists.has(a));

  if (hasJp) {
    targetRegion = 'jp';
  } else if (hasFr) {
    targetRegion = 'fr';
  } else if (hasUk) {
    targetRegion = 'uk';
  } else if (hasKr) {
    targetRegion = 'kr';
  } else if (hasLatam) {
    targetRegion = 'other';
    reason.push("Artist is from Argentina (LatAm)");
  } else if (hasAfrica) {
    targetRegion = 'other';
    reason.push("Artist is from Nigeria/Ghana (Africa)");
  } else {
    // US artists
    const usArtists = new Set(['lil wayne', 'kendrick lamar', 'travis scott', 'drake', 'kanye west', '50 cent', '2pac', 'notorious b.i.g.', 'eminem', 'mobb deep', 'wu-tang', 'jay-z', 'busta rhymes', 'dr. dre', 'snoop dogg', 'yves tumor', 'chief keef', 'outkast', 'childish gambino', 'migos', 'lil uzi vert', 'pusha t', 'vince staples', 'schoolboy q', 'mac miller', 'baby keem', 'cardi b', 'lupe fiasco', 'rick ross', 'megan thee stallion', 'sexyy red', 'eve', 'bia', 'method man', 'redman', 'souls of mischief', 'luniz', 'digable planets', 'del the funky homosapien', 'ice cube', 'lauryn hill', 'fugees', 'big pun', 'bone thugs-n-harmony', 'warren g', 'coolio', 'naughty by nature', 'dmx', 'the roots', 'ghostface killah', 'pete rock', 'big l', 'ol\' dirty bastard', 'krs-one', 'de la soul', 'goodie mob', 'scarface', 'arrested development', 'lil\' kim', 'the lox', 'gang starr', 'common', 'gza', 'raekwon', 'cam\'ron', 'foxy brown', 'dj quik', 'too $hort', 'e-40', 'black star', 'xzibit', 'mc lyte', 'black sheep', 'das efx', 'onyx', 'house of pain', 'jeru the damaja', 'black moon', 'three 6 mafia', 'dj shadow', 'run the jewels', 'company flow', 'el-p', 'cannibal ox', 'aesop rock', 'blackalicious', 'deltron 3030', 'mr. lif', 'doechii', 'cordae', 'samara cyn', 'smino', 'logic', 'chance the rapper', 'chevy woods', 'dear silas', 'connor price', 'coi leray', 'shoreline mafia', 'jid', 'kodak black', 'ovrkast.', 'offset', 'gunna', 'young nudy', 'project pat', 'big yavo', '310babii', 'elisha la\'verne', 'jungle brothers', 'marco polo', 'masta ace', 'sha\'dasious', 'crooklyn dodgers', 'en vogue', 'janet jackson', 'the underachievers', 'billy woods', 'kenny segal', 'boldy james', 'evidence', 'the alchemist', 'curren$', 'speech', 'jurassic 5', 'beastie boys', 'dilated peoples', 'black eyed peas']);
    
    if (artists.some(a => usArtists.has(a))) {
      targetRegion = 'us';
    }
  }

  // 2. Era Audit
  let targetEra = era;
  if (lowerName.includes('love it if we made it')) {
    targetEra = '10s'; // 2018
    reason.push("Released in 2018");
  } else if (lowerName.includes('noid') && lowerName.includes('yves tumor')) {
    targetEra = '10s'; // 2018
    reason.push("Released in 2018");
  } else if (lowerName.includes('a milli')) {
    targetEra = '00s'; // 2008
  } else if (lowerName.includes('still d.r.e.')) {
    targetEra = '90s'; // 1999
  } else if (lowerName.includes('human発電所') || lowerName.includes('人間発電所')) {
    targetEra = '90s'; // 1996
  } else if (lowerName.includes('yokaze')) {
    targetEra = '20s+'; // 2020
  } else if (lowerName.includes('チーム友達')) {
    targetEra = '20s+'; // 2024
  } else if (lowerName.includes('luv(sic) part 2')) {
    targetEra = '00s'; // 2002
  } else if (lowerName.includes('bussin')) {
    targetEra = '10s'; // 2019
  }

  // 3. Non-Hiphop Audit
  const nonHiphopArtists = new Set([
    'the 1975', 'yves tumor', 'kuromi', 'hana', 'be:first', 'rei harakami', 
    'ua', 'clambon', 'クラムボン', 'ali'
  ]);
  
  const isNonHiphopArtist = artists.some(a => nonHiphopArtists.has(a) || a.includes('クラムボン') || a === 'ali');
  
  if (isNonHiphopArtist) {
    non_hiphop = true;
    reason.push("Non-Hiphop Artist/Genre (Rock/Pop/Electronic/Alternative Band)");
  }

  if (lowerName.includes('oddtaxi') && lowerName.includes('スカート')) {
    non_hiphop = true;
    reason.push("Anime Pop/Indie Pop collaboration");
  }

  // Region correction reason
  let regionChanged = region !== targetRegion;
  // 特殊ケース：元が jp で target が us に誤判定されやすいものを除外（手動確認）
  // どんぐりず, 舐達麻など日本語が入らないアーティスト名
  const forceJpArtists = new Set(['dongurizu', 'kandytown', 'refugeecamp', 'tokona-x', 'anarchy']);
  if (region === 'jp' && forceJpArtists.has(lowerArtist)) {
    targetRegion = 'jp';
    regionChanged = false;
  }

  if (regionChanged) {
    reason.push(`Region corrected from '${region}' to '${targetRegion}'`);
  }
  // Era correction reason
  if (era !== targetEra) {
    reason.push(`Era corrected from '${era}' to '${targetEra}'`);
  }

  return {
    region: targetRegion,
    era: targetEra,
    non_hiphop,
    confidence: 1.0,
    reason: reason.join(", ") || "Verified by rules"
  };
}

async function run() {
  const activeSongs = songs.filter(s => !EXCLUDE_IDS.has(s.youtube_id));
  console.log(`Total songs in unified database: ${songs.length}`);
  console.log(`Active songs to audit: ${activeSongs.length}`);

  const summerSongs = songs.filter(s => s.user_name === 'summer');
  console.log(`Found ${summerSongs.length} songs posted by 'summer'.`);

  const auditResults = [];
  let modifiedRegionCount = 0;
  let modifiedEraCount = 0;
  let nonHiphopCount = 0;

  for (const song of activeSongs) {
    const audited = auditSong(song);
    
    // era '20s' と '20s+' は同等とみなす
    const originalEraMapped = song.era === '20s' ? '20s+' : song.era;
    const regionChanged = song.region !== audited.region;
    const eraChanged = originalEraMapped !== audited.era;
    const isNonHiphop = audited.non_hiphop;

    if (regionChanged) modifiedRegionCount++;
    if (eraChanged) modifiedEraCount++;
    if (isNonHiphop) nonHiphopCount++;

    auditResults.push({
      youtube_id: song.youtube_id,
      name: song.name,
      original: {
        region: song.region,
        era: song.era
      },
      audited: {
        region: audited.region,
        era: audited.era,
        non_hiphop: audited.non_hiphop,
        confidence: audited.confidence,
        reason: audited.reason
      },
      action_needed: {
        region: regionChanged,
        era: eraChanged,
        non_hiphop: isNonHiphop
      }
    });
  }

  const report = {
    summary: {
      total_songs: songs.length,
      total_active_processed: activeSongs.length,
      modified_region_count: modifiedRegionCount,
      modified_era_count: modifiedEraCount,
      non_hiphop_count: nonHiphopCount,
      summer_songs_count: summerSongs.length,
      elapsed_seconds: 0
    },
    summer_songs: summerSongs.map(s => ({
      youtube_id: s.youtube_id,
      name: s.name,
      region: s.region,
      era: s.era
    })),
    audit_results: auditResults
  };

  const reportPath = path.join(__dirname, 'audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nAudit completed! Report written to: ${reportPath}`);
  console.log(`Summary:`);
  console.log(`- Modified Regions: ${modifiedRegionCount}`);
  console.log(`- Modified Eras: ${modifiedEraCount}`);
  console.log(`- Non-Hiphop Songs: ${nonHiphopCount}`);
}

run().catch(console.error);
