const JP_ARTISTS = [
  "zorn", "libro", "小林勝行", "舐達麻", "punpee", "kreva", "kohh", "bad hop", "salu", 
  "lex", "gadoro", "anarchy", "jjj", "kid fresino", "仙人掌", "韻シスト", "awich", 
  "ak-69", "creepy nuts", "r-指定", "illmore", "febb", "omsb", "psg", "norikiyo", 
  "gezan", "shing02", "nujabes", "evisbeat", "bas", "唾奇", "sweet william", "goku green",
  "stuts", "tofubeats", "bim", "kzm", "io", "young juju", "flashbacks", "issugi", "bes",
  "buddha brand", "king giddra", "muro", "seeda", "scars", "shakka zombie", "rhymester",
  "yzerr", "tiji jojo", "g-k.i.d", "zot on the wave", "dj chari", "dj tatsuki", "watson", 
  "eyden", "kandytown", "keiju", "gottz", "mud", "ryohu", "holly q", "kikumaru", 
  "¥ellow bucks", "yellow bucks", "lana", "jp the wavy", "crystal kay", "shurkn pap", 
  "kohjiya", "kvi baba", "elione", "guca owl", "c.o.s.a.", "monyhorse", "zeebra", "candee", 
  "yelladigos", "katsuyuki"
];

const FR_ARTISTS = ["gazo", "pnl", "ninho", "damso", "booba", "nekfeu", "jul", "orelsan", "lomepal", "kaaris", "rohvff", "iam", "suprême ntm", "ntm"];
const UK_ARTISTS = ["dave", "skepta", "stormzy", "central cee", "j hus", "slowthai", "little simz", "knucks", "loyle carner", "gigs", "wretch 32", "akala", "casisdead", "mura masa"];
const KR_ARTISTS = ["keith ape", "jay park", "zico", "bewhy", "changmo", "woo wonjae", "giriboy", "kid milli", "justhis", "epik high", "drunken tiger", "dynamic duo"];

function guessEraFromDate(dateStr) {
  if (!dateStr) return null;
  try {
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (year >= 1990 && year <= 1999) return "90s";
    if (year >= 2000 && year <= 2009) return "00s";
    if (year >= 2010 && year <= 2019) return "10s";
    if (year >= 2020 && year <= 2029) return "20s";
  } catch (e) {}
  return null;
}

export function classifySong(song) {
  const title = (song.name || "").toLowerCase();
  
  let desc = "";
  if (song.description) {
    if (typeof song.description === "object") {
      desc = Object.values(song.description).join(" ").toLowerCase();
    } else {
      desc = String(song.description).toLowerCase();
    }
  }

  const searchText = `${title} ${desc}`;

  // 1. Region の分類
  let region = song.region;
  if (!region || region === "null" || region === "" || region === "other" || region === "OTHER") {
    if (JP_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "jp";
    } else if (FR_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "fr";
    } else if (UK_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "uk";
    } else if (KR_ARTISTS.some(artist => searchText.includes(artist))) {
      region = "kr";
    } else {
      // 英語のタイトルや特定のUSアーティスト、あるいはそれ以外はデフォルトで us とする
      region = "us";
    }
  }

  // 2. Era の分類
  let era = song.era;
  if (!era || era === "null" || era === "" || era === "other" || era === "OTHER") {
    // 日付から推測
    era = guessEraFromDate(song.publish_at) || guessEraFromDate(song.created_at);
    if (!era) {
      // テキスト内の年号表記から推測
      const years90 = searchText.match(/\b(199\d)\b/);
      const years00 = searchText.match(/\b(200\d)\b/);
      const years10 = searchText.match(/\b(201\d)\b/);
      const years20 = searchText.match(/\b(202\d)\b/);

      if (years90 || searchText.includes("90s") || searchText.includes("90's")) {
        era = "90s";
      } else if (years00 || searchText.includes("00s") || searchText.includes("00's") || searchText.includes("2000s")) {
        era = "00s";
      } else if (years10 || searchText.includes("10s") || searchText.includes("10's") || searchText.includes("2010s")) {
        era = "10s";
      } else if (years20 || searchText.includes("20s") || searchText.includes("20's") || searchText.includes("2020s")) {
        era = "20s";
      } else {
        era = "20s"; // デフォルト
      }
    }
  }

  return { region, era };
}
