import fs from 'fs';
import path from 'path';
import { timingSafeEqual } from 'crypto';
const { readRedisList } = require('../utils/kv-list.js');

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
  if (!response.ok) throw new Error(`KV error: ${response.statusText}`);
  const data = await response.json();
  if (data.error) throw new Error(`KV command failed: ${data.error}`);
  return data.result;
}

// Compare every old value before writing. LSET preserves list position and
// never creates a delete/reinsert window, even if the network drops afterward.
const UPDATE_DESCRIPTIONS = `
local rows = redis.call('LRANGE', KEYS[1], 0, -1)
local replacements = cjson.decode(ARGV[1])
local indices = {}
for _, replacement in ipairs(replacements) do
  local found = false
  for index, raw in ipairs(rows) do
    if raw == replacement.oldRaw then
      indices[index] = replacement.newRaw
      found = true
    end
  end
  if not found then return 0 end
end
for index, raw in pairs(indices) do
  redis.call('LSET', KEYS[1], index - 1, raw)
end
return 1
`;

function isAuthorized(req) {
  const expected = process.env.SLAPS_ADMIN_TOKEN || '';
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function parseSubmissions(rawItems) {
  return (rawItems || []).flatMap(raw => {
    try {
      return [{ raw, submission: JSON.parse(raw) }];
    } catch {
      return [];
    }
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.SLAPS_ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Admin review is not configured' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(503).json({ error: 'Submission storage unavailable' });
  }

  const prefix = process.env.DB_PREFIX || '';
  const submissionsKey = `${prefix}slaps:submissions`;
  const submissionIdsKey = `${prefix}slaps:submission_ids`;

  try {
    const rawItems = await kvFetch(['LRANGE', submissionsKey, '0', '99']);
    const items = parseSubmissions(rawItems);

    if (req.method === 'GET') {
      return res.status(200).json({
        count: items.length,
        submissions: items.map(item => item.submission),
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, youtube_id, reason = '' } = req.body || {};
    if (!['approve', 'reject', 'unpublish', 'update_description'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve, reject, unpublish, or update_description' });
    }
    if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
      return res.status(400).json({ error: 'Invalid YouTube ID' });
    }

    if (action === 'update_description') {
      const songsKey = `${prefix}slaps:songs`;
      const rawSongs = await readRedisList(kvFetch, songsKey);
      const matchedSongs = (rawSongs || []).flatMap(raw => {
        try {
          const song = JSON.parse(raw);
          return song.youtube_id === youtube_id ? [{ raw, song }] : [];
        } catch {
          return [];
        }
      });
      if (!matchedSongs.length) {
        return res.status(404).json({ error: 'Published KV song not found' });
      }
      const description = req.body?.description || {};
      const ja = typeof description.ja === 'string' ? description.ja.trim().slice(0, 250) : '';
      const en = typeof description.en === 'string' ? description.en.trim().slice(0, 250) : '';
      if (!req.body.description || (typeof description.ja !== 'string' && typeof description.en !== 'string') ||
          ('ja' in description && typeof description.ja !== 'string') || ('en' in description && typeof description.en !== 'string')) {
        return res.status(400).json({ error: 'Provide description.ja or description.en as a string (empty is allowed)' });
      }
      const updatedSongs = matchedSongs.map(item => ({
        oldRaw: item.raw,
        song: { ...item.song, description: {
          ja: typeof description.ja === 'string' ? ja : item.song.description?.ja || '',
          en: typeof description.en === 'string' ? en : item.song.description?.en || '',
        }, updated_at: new Date().toISOString() },
      }));
      const updated = await kvFetch(['EVAL', UPDATE_DESCRIPTIONS, '1', songsKey,
        JSON.stringify(updatedSongs.map(item => ({ oldRaw: item.oldRaw, newRaw: JSON.stringify(item.song) })))]);
      if (updated !== 1) {
        return res.status(409).json({ error: 'Song changed during review; reload before retrying' });
      }
      await kvFetch(['LPUSH', `${prefix}slaps:submission_reviews`, JSON.stringify({
        action,
        youtube_id,
        reviewed_at: new Date().toISOString(),
      })]);
      return res.status(200).json({ status: 'description_updated', song: updatedSongs[0].song });
    }

    if (action === 'unpublish') {
      const songsKey = `${prefix}slaps:songs`;
      const rawSongs = await readRedisList(kvFetch, songsKey);
      const matchedSongs = (rawSongs || []).flatMap(raw => {
        try {
          const song = JSON.parse(raw);
          return song.youtube_id === youtube_id ? [{ raw, song }] : [];
        } catch {
          return [];
        }
      });
      if (!matchedSongs.length) {
        return res.status(404).json({ error: 'Published community song not found' });
      }
      if (matchedSongs.some(item => item.song.source !== 'community')) {
        return res.status(409).json({ error: 'Only community submissions can be unpublished here' });
      }
      await Promise.all([
        ...matchedSongs.map(item => kvFetch(['LREM', songsKey, '0', item.raw])),
        kvFetch(['SREM', `${prefix}slaps:existing_ids`, youtube_id]),
        kvFetch(['LPUSH', `${prefix}slaps:submission_reviews`, JSON.stringify({
          action,
          youtube_id,
          reason: String(reason).trim().slice(0, 300),
          reviewed_at: new Date().toISOString(),
        })]),
      ]);
      return res.status(200).json({ status: 'unpublished', youtube_id, removed: matchedSongs.length });
    }

    const matched = items.find(item => item.submission.youtube_id === youtube_id);
    if (!matched) {
      return res.status(404).json({ error: 'Pending submission not found' });
    }

    if (action === 'approve') {
      const localSongs = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'songs.json'), 'utf8'));
      const isPublished = await kvFetch(['SISMEMBER', `${prefix}slaps:existing_ids`, youtube_id]);
      if (isPublished === 1 || localSongs.some(song => song.youtube_id === youtube_id)) {
        return res.status(409).json({ error: 'This song is already published' });
      }

      const { submission_id, submitted_at, status, ...songData } = matched.submission;
      const song = {
        ...songData,
        moderation_status: 'live',
        created_at: new Date().toISOString(),
      };
      await Promise.all([
        kvFetch(['LPUSH', `${prefix}slaps:songs`, JSON.stringify(song)]),
        kvFetch(['SADD', `${prefix}slaps:existing_ids`, youtube_id]),
        kvFetch(['LREM', submissionsKey, '1', matched.raw]),
        kvFetch(['SREM', submissionIdsKey, youtube_id]),
        kvFetch(['LPUSH', `${prefix}slaps:submission_reviews`, JSON.stringify({
          action,
          youtube_id,
          submission_id,
          reviewed_at: new Date().toISOString(),
        })]),
      ]);

      const host = req.headers.host || 'slaps.tokyo';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      fetch(`${protocol}://${host}/api/og-image?v=${youtube_id}`).catch(() => {});
      return res.status(200).json({ status: 'approved', song });
    }

    await Promise.all([
      kvFetch(['LREM', submissionsKey, '1', matched.raw]),
      kvFetch(['SREM', submissionIdsKey, youtube_id]),
      kvFetch(['LPUSH', `${prefix}slaps:submission_reviews`, JSON.stringify({
        action,
        youtube_id,
        submission_id: matched.submission.submission_id,
        reason: String(reason).trim().slice(0, 300),
        reviewed_at: new Date().toISOString(),
      })]),
    ]);
    return res.status(200).json({ status: 'rejected', youtube_id });
  } catch (error) {
    console.error('Submission review failed:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
