const crypto = require('crypto');
const Jimp = require('jimp');
const path = require('path');

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
  return (await response.json()).result;
}

async function loadTile(id, width, height) {
  try {
    const image = await Jimp.read(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    return image.cover(width, height, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
  } catch (_) {
    return new Jimp(width, height, 0x181818ff);
  }
}

export default async function handler(req, res) {
  const ids = validIds(req.query.crate);
  if (!ids.length) return res.status(400).send('Missing or invalid crate IDs');

  const cacheHash = crypto.createHash('sha1').update(ids.join('.')).digest('hex');
  const cacheKey = `${process.env.DB_PREFIX || ''}slaps:crate-og:${cacheHash}`;

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

    const font64 = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const font32 = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const font16 = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    canvas.print(font64, 64, 230, 'CRATE', 410);
    canvas.print(font32, 68, 340, `${ids.length} TRACK${ids.length === 1 ? '' : 'S'}`, 400);
    canvas.print(font16, 68, 420, 'A SELECTION SHARED ON SLAPS', 410);
    canvas.print(font16, 68, 520, 'OPEN THE CRATE  /  SLAPS.TOKYO', 420);

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
