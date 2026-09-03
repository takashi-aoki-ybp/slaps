const crypto = require('crypto');
const Jimp = require('jimp');
const path = require('path');
const { filterCataloguedYoutubeIds, takeRateLimit } = require('./utils/request-guards.js');

function validIds(raw) {
  return String(raw || '')
    .split('.')
    .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 50);
}

async function kvFetch(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`KV error: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

async function loadTile(id, width, height) {
  try {
    const image = await Jimp.read(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    return image.cover(width, height, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
  } catch (_) {
    return new Jimp(width, height, 0x181818ff);
  }
}

const GLYPHS = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '.': ['00000','00000','00000','00000','00000','00110','00110'],
  '/': ['00001','00010','00100','01000','10000','00000','00000'],
};

function drawText(image, text, x, y, scale, color = 0xffffffff) {
  let cursor = x;
  for (const character of String(text).toUpperCase()) {
    if (character === ' ') {
      cursor += scale * 4;
      continue;
    }
    const glyph = GLYPHS[character];
    if (!glyph) {
      cursor += scale * 6;
      continue;
    }
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === '1') image.scan(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, function draw(pixelX, pixelY) { this.setPixelColor(color, pixelX, pixelY); });
      });
    });
    cursor += scale * 6;
  }
}

export default async function handler(req, res) {
  const requestedIds = validIds(req.query.crate);
  if (!requestedIds.length) return res.status(400).send('Missing or invalid crate IDs');
  const prefix = process.env.DB_PREFIX || '';
  const ids = await filterCataloguedYoutubeIds(requestedIds, kvFetch, prefix);
  if (ids.length !== requestedIds.length) return res.status(404).send('Track not found');
  const rate = await takeRateLimit({
    req,
    kvFetch,
    prefix,
    scope: 'saved_og',
    limit: 30,
    windowSeconds: 60,
  });
  if (!rate.allowed) return res.status(429).send('Too Many Requests');

  const cacheHash = crypto.createHash('sha1').update(ids.join('.')).digest('hex');
  const cacheKey = `${prefix}slaps:saved-og:v2:${cacheHash}`;

  try {
    const cached = await kvFetch(['GET', cacheKey]);
    if (cached) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.setHeader('X-Slaps-Cache', 'KV_HIT');
      return res.send(Buffer.from(cached, 'base64'));
    }
  } catch (error) {
    console.error('CRATE OG cache read failed:', error);
  }

  try {
    const canvas = new Jimp(1200, 630, 0x050505ff);
    const tileWidth = 335;
    const tileHeight = 315;
    const tileIds = ids.slice(0, 4);
    const tiles = await Promise.all(tileIds.map((id) => loadTile(id, tileWidth, tileHeight)));

    for (let index = 0; index < 4; index += 1) {
      const x = 530 + (index % 2) * tileWidth;
      const y = Math.floor(index / 2) * tileHeight;
      const tile = tiles[index] || new Jimp(tileWidth, tileHeight, 0x181818ff);
      canvas.composite(tile, x, y);
    }

    const shade = new Jimp(670, 630, 0x00000055);
    canvas.composite(shade, 530, 0);

    const logo = await Jimp.read(path.join(process.cwd(), 'assets', 'logo.png'));
    logo.contain(390, 138, Jimp.HORIZONTAL_ALIGN_LEFT | Jimp.VERTICAL_ALIGN_MIDDLE);
    canvas.composite(logo, 62, 58);

    drawText(canvas, 'SAVED', 68, 230, 11);
    drawText(canvas, `${ids.length} TRACK${ids.length === 1 ? '' : 'S'}`, 70, 340, 5);
    drawText(canvas, 'A SELECTION SHARED ON SLAPS', 70, 420, 2, 0xbdbdbdff);
    drawText(canvas, 'LISTEN ON SLAPS.TOKYO', 70, 520, 2, 0xd8d8d8ff);

    canvas.quality(88);
    const buffer = await canvas.getBufferAsync(Jimp.MIME_JPEG);
    try {
      await kvFetch(['SET', cacheKey, buffer.toString('base64'), 'EX', 604800]);
    } catch (error) {
      console.error('CRATE OG cache write failed:', error);
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.setHeader('X-Slaps-Cache', 'KV_MISS');
    return res.send(buffer);
  } catch (error) {
    console.error('CRATE OG generation failed:', error);
    return res.status(500).send('Failed to generate CRATE image');
  }
}
