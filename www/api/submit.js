import { classifySong } from './utils/classifier.js';
import { eraFromPublishDate, findTitleDuplicate } from './utils/submission-quality.js';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
const { readRedisList } = require('./utils/kv-list.js');

async function kvFetch(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV error: ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

async function fetchYouTubeMetadata(youtubeId) {
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const oembedResponse = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!oembedResponse.ok) return null;
  const oembed = await oembedResponse.json();
  if (!oembed || typeof oembed.title !== 'string' || !oembed.title.trim()) return null;

  const apiKey = process.env.YOUTUBE_INNERTUBE_API_KEY;
  if (!apiKey) return oembed;
  try {
    const clientVersion = process.env.YOUTUBE_INNERTUBE_CLIENT_VERSION || '2.20260826.01.00';
    const playerResponse = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://www.youtube.com',
          'User-Agent': 'Mozilla/5.0',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': clientVersion,
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion, hl: 'ja', gl: 'JP' } },
          videoId: youtubeId,
        }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!playerResponse.ok) return oembed;
    const player = await playerResponse.json();
    const details = player.videoDetails || {};
    const microformat = player.microformat?.playerMicroformatRenderer || {};
    return {
      ...oembed,
      title: details.title || oembed.title,
      author_name: details.author || oembed.author_name,
      shortDescription: details.shortDescription || '',
      keywords: Array.isArray(details.keywords) ? details.keywords : [],
      category: microformat.category || '',
      publishDate: microformat.publishDate || microformat.uploadDate || '',
    };
  } catch {
    return oembed;
  }
}

function parseJsonList(rawItems) {
  return (rawItems || []).flatMap((raw) => {
    try { return [JSON.parse(raw)]; } catch { return []; }
  });
}

function rateLimitKey(req, prefix) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || String(req.headers['x-real-ip'] || '').trim();
  if (!address) return null;
  const digest = createHash('sha256').update(address).digest('hex').slice(0, 24);
  return `${prefix}slaps:submit_rate:${digest}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let { youtube_id, region, era, user_name, description, conscious_turnt } = req.body || {};

  // 厳格なバリデーション
  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }
  if (conscious_turnt != null &&
      (typeof conscious_turnt !== 'number' || !Number.isFinite(conscious_turnt) || conscious_turnt < 0 || conscious_turnt > 5)) {
    return res.status(400).json({ error: 'Invalid conscious_turnt (0-5)' });
  }

  // description (文字列またはオブジェクト) のパース
  let jaDesc = '';
  let enDesc = '';
  if (description) {
    if (typeof description === 'object') {
      jaDesc = (description.ja && typeof description.ja === 'string') ? description.ja.trim().slice(0, 250) : '';
      enDesc = (description.en && typeof description.en === 'string') ? description.en.trim().slice(0, 250) : '';
    } else if (typeof description === 'string') {
      jaDesc = description.trim().slice(0, 250);
    }
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(503).json({ error: 'Submission storage unavailable' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const localSongs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'songs.json'), 'utf8'));
    const [isPublished, isPending] = await Promise.all([
      kvFetch(['SISMEMBER', `${prefix}slaps:existing_ids`, youtube_id]),
      kvFetch(['SISMEMBER', `${prefix}slaps:submission_ids`, youtube_id]),
    ]);
    if (isPublished === 1 || localSongs.some(item => item.youtube_id === youtube_id)) {
      return res.status(400).json({ error: 'This song already exists on SLAPS.' });
    }

    const limitKey = rateLimitKey(req, prefix);
    if (limitKey) {
      const attempts = await kvFetch(['INCR', limitKey]);
      if (attempts === 1) await kvFetch(['EXPIRE', limitKey, '60']);
      if (attempts > 3) {
        return res.status(429).json({ error: 'Too many submissions. Please wait a minute.' });
      }
    }

    const metadata = await fetchYouTubeMetadata(youtube_id);
    if (!metadata) {
      return res.status(400).json({ error: 'YouTube video is unavailable.' });
    }

    const verifiedName = metadata.title.trim().slice(0, 150);
    const [publishedRaw, pendingRaw] = await Promise.all([
      readRedisList(kvFetch, `${prefix}slaps:songs`),
      readRedisList(kvFetch, `${prefix}slaps:submissions`),
    ]);
    const pendingItems = parseJsonList(pendingRaw);
    const existingPending = pendingItems.find((item) => item.youtube_id === youtube_id) || null;
    const existingPendingRaw = existingPending
      ? pendingRaw.find((raw) => {
          try { return JSON.parse(raw).youtube_id === youtube_id; } catch { return false; }
        })
      : null;
    if (isPending === 1 && !existingPending) {
      return res.status(409).json({ error: 'This song is already awaiting migration.' });
    }
    const duplicate = findTitleDuplicate(verifiedName, [
      ...localSongs,
      ...parseJsonList(publishedRaw),
      ...pendingItems.filter((item) => item.youtube_id !== youtube_id),
    ]);
    if (duplicate) {
      return res.status(409).json({
        error: 'A track with the same title already exists on SLAPS.',
        duplicate_youtube_id: duplicate.youtube_id,
      });
    }

    if (existingPending) {
      region ||= existingPending.region;
      era ||= existingPending.era;
    }
    const publishEra = eraFromPublishDate(metadata.publishDate);
    const guesses = classifySong({
      name: verifiedName,
      region,
      era: era || publishEra,
      description,
      publish_at: metadata.publishDate,
    });
    if (!region || region === '') region = guesses.region;
    era = ((!era || era === '' || era === 'other') ? guesses.era : era);
    if (!['us', 'jp', 'uk', 'fr', 'kr', 'other'].includes(region)) {
      return res.status(400).json({ error: 'Invalid region' });
    }
    if (!['90s', '00s', '10s', '20s'].includes(era)) {
      return res.status(400).json({ error: 'Invalid era' });
    }

    const song = {
      youtube_id,
      name: verifiedName,
      region,
      era,
      user_name: existingPending?.user_name ||
        ((user_name && typeof user_name === 'string' && user_name.trim().slice(0, 50)) || 'Anonymous'),
      description: existingPending?.description || { ja: jaDesc, en: enDesc },
      thumbnail: existingPending?.thumbnail || `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg`,
      conscious_turnt: existingPending?.conscious_turnt ?? (conscious_turnt == null ? 2.5 : conscious_turnt),
      source: 'community',
      moderation_status: 'live',
      publish_at: existingPending?.publish_at || metadata.publishDate || undefined,
      created_at: existingPending?.created_at || existingPending?.submitted_at || new Date().toISOString(),
    };

    const reserved = await kvFetch(['SADD', `${prefix}slaps:existing_ids`, youtube_id]);
    if (reserved !== 1) {
      return res.status(409).json({ error: 'This song already exists on SLAPS.' });
    }
    try {
      await kvFetch(['LPUSH', `${prefix}slaps:songs`, JSON.stringify(song)]);
    } catch (error) {
      await kvFetch(['SREM', `${prefix}slaps:existing_ids`, youtube_id]).catch(() => {});
      throw error;
    }
    if (existingPending) {
      const cleanupResults = await Promise.allSettled([
        existingPendingRaw
          ? kvFetch(['LREM', `${prefix}slaps:submissions`, '1', existingPendingRaw])
          : Promise.resolve(0),
        kvFetch(['SREM', `${prefix}slaps:submission_ids`, youtube_id]),
      ]);
      if (cleanupResults.some((result) => result.status === 'rejected')) {
        console.warn('Published a pending song, but pending-queue cleanup was incomplete:', youtube_id);
      }
    }

    const host = req.headers.host || 'slaps.tokyo';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    fetch(`${protocol}://${host}/api/og-image?v=${youtube_id}`).catch(() => {});
    return res.status(201).json({ status: 'published', song });
  } catch (error) {
    console.error('Failed to submit song:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
