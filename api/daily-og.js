import crypto from 'crypto';
import { Jimp, JimpMime, HorizontalAlign, VerticalAlign } from 'jimp';
import path from 'path';
import fs from 'fs';
import kvList from './utils/kv-list.js';

const { readRedisList } = kvList;

async function kvFetch(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`KV error: ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

async function loadSongs() {
  const prefix = process.env.DB_PREFIX || '';
  let dbSongs = [];
  try {
    const raw = await readRedisList(kvFetch, `${prefix}slaps:songs`);
    if (Array.isArray(raw)) dbSongs = raw.map((item) => { try { return JSON.parse(item); } catch { return null; } }).filter(Boolean);
  } catch (error) {
    console.error('DAILY OG database read failed:', error);
  }
  let localSongs = [];
  try {
    localSongs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'songs.json'), 'utf8'));
  } catch (error) {
    console.error('DAILY OG catalogue read failed:', error);
  }
  const localMap = new Map(localSongs.map((song) => [song.youtube_id, song]));
  const dbMap = new Map(dbSongs.map((song) => [song.youtube_id, song]));
  return [...new Set([...dbMap.keys(), ...localMap.keys()])].map((id) => dbMap.get(id) || localMap.get(id));
}

async function loadTile(id, width, height) {
  try {
    const response = await fetch(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
    if (!response.ok) throw new Error(`Thumbnail error: ${response.status}`);
    const image = await Jimp.read(Buffer.from(await response.arrayBuffer()));
    return image.cover({
      w: width,
      h: height,
      align: HorizontalAlign.CENTER | VerticalAlign.MIDDLE,
    });
  } catch {
    return new Jimp({ width, height, color: 0x181818ff });
  }
}

const GLYPHS = {
  A:['01110','10001','10001','11111','10001','10001','10001'], C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'], E:['11111','10000','10000','11110','10000','10000','11111'],
  I:['11111','00100','00100','00100','00100','00100','11111'], K:['10001','10010','10100','11000','10100','10010','10001'],
  L:['10000','10000','10000','10000','10000','10000','11111'], O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'], R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  '0':['01110','10001','10011','10101','11001','10001','01110'], '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
  '.':['00000','00000','00000','00000','00000','00110','00110'], '/':['00001','00010','00100','01000','10000','00000','00000'],
};

function drawText(image, text, x, y, scale, color = 0xffffffff) {
  let cursor = x;
  for (const character of String(text).toUpperCase()) {
    if (character === ' ') { cursor += scale * 4; continue; }
    const glyph = GLYPHS[character];
    if (!glyph) { cursor += scale * 3; continue; }
    glyph.forEach((row, rowIndex) => [...row].forEach((pixel, columnIndex) => {
      if (pixel === '1') image.scan(cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, function draw(pixelX, pixelY) { this.setPixelColor(color, pixelX, pixelY); });
    }));
    cursor += scale * 6;
  }
}

const imageHeaders = (cacheState) => ({
  'Content-Type': 'image/jpeg',
  'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  'X-Slaps-Cache': cacheState,
});

const textResponse = (body, status) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});

export async function handleDailyOg(request) {
  const requestUrl = new URL(request.url);
  const date = requestUrl.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return textResponse('Invalid date', 400);
  const prefix = process.env.DB_PREFIX || '';
  const cacheHash = crypto.createHash('sha1').update(date).digest('hex');
  const cacheKey = `${prefix}slaps:daily-og:v1:${cacheHash}`;

  try {
    const cached = await kvFetch(['GET', cacheKey]);
    if (cached) {
      return new Response(Buffer.from(cached, 'base64'), { headers: imageHeaders('KV_HIT') });
    }
  } catch (error) {
    console.error('DAILY OG cache read failed:', error);
  }

  try {
    const songs = await loadSongs();
    const tracks = songs.filter((song) =>
      String(song.user_name || '').toUpperCase() === 'SLAPS' &&
      String(song.created_at || song.publish_at || '').startsWith(date)
    ).filter((song, index, all) => all.findIndex((item) => item.youtube_id === song.youtube_id) === index).slice(0, 10);
    if (!tracks.length) return textResponse('Daily drop not found', 404);

    const canvas = new Jimp({ width: 1200, height: 630, color: 0x050505ff });
    const tileWidth = 300;
    const tileHeight = 315;
    const tiles = await Promise.all(tracks.slice(0, 4).map((song) => loadTile(song.youtube_id, tileWidth, tileHeight)));
    tiles.forEach((tile, index) => canvas.composite(tile, 600 + (index % 2) * tileWidth, Math.floor(index / 2) * tileHeight));
    canvas.composite(new Jimp({ width: 650, height: 630, color: 0x00000066 }), 550, 0);
    const logo = await Jimp.read(fs.readFileSync(path.join(process.cwd(), 'assets', 'logo.png')));
    logo.contain({
      w: 390,
      h: 138,
      align: HorizontalAlign.LEFT | VerticalAlign.MIDDLE,
    });
    canvas.composite(logo, 62, 54);
    drawText(canvas, "TODAY'S 10", 68, 230, 10);
    drawText(canvas, date.replaceAll('-', '.'), 70, 345, 5, 0xe0ff3cff);
    drawText(canvas, `${tracks.length} TRACKS / DAILY DROP`, 70, 445, 3, 0xd8d8d8ff);
    const buffer = await canvas.getBuffer(JimpMime.jpeg, { quality: 88 });
    try { await kvFetch(['SET', cacheKey, buffer.toString('base64'), 'EX', 604800]); } catch (error) { console.error('DAILY OG cache write failed:', error); }
    return new Response(buffer, { headers: imageHeaders('KV_MISS') });
  } catch (error) {
    console.error('DAILY OG generation failed:', error);
    return textResponse('Failed to generate DAILY DROP image', 500);
  }
}

export default { fetch: handleDailyOg };
