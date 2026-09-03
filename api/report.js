import { createHash } from 'crypto';
const { isCataloguedYoutubeId, takeRateLimit } = require('./utils/request-guards.js');

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

function reporterKey(req, prefix, youtubeId) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || String(req.headers['x-real-ip'] || '').trim();
  if (!address) return null;
  const digest = createHash('sha256').update(address).digest('hex').slice(0, 24);
  return `${prefix}slaps:reporters:${youtubeId}:${digest}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { youtube_id, name, reason, note } = req.body || {};

  if (!youtube_id || !/^[A-Za-z0-9_-]{11}$/.test(youtube_id)) {
    return res.status(400).json({ error: 'Invalid YouTube ID' });
  }

  const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  if (!kvEnabled) {
    return res.status(503).json({ error: 'Report storage unavailable' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    if (!(await isCataloguedYoutubeId(youtube_id, kvFetch, prefix))) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const rate = await takeRateLimit({
      req,
      kvFetch,
      prefix,
      scope: 'report',
      limit: 30,
      windowSeconds: 3600,
    });
    if (!rate.allowed) return res.status(429).json({ error: 'Too Many Requests' });

    const voterKey = reporterKey(req, prefix, youtube_id);
    if (voterKey) {
      const firstReport = await kvFetch(['SET', voterKey, '1', 'NX', 'EX', '2592000']);
      if (firstReport !== 'OK') {
        return res.status(200).json({ status: 'already_reported', report_counted: false });
      }
    }

    const reportCount = await kvFetch(['HINCRBY', `${prefix}slaps:report_counts`, youtube_id, '1']);
    const report = {
      youtube_id,
      name: (name && name.slice(0, 150)) || '',
      reason: (reason && reason.slice(0, 100)) || '',
      note: (note && note.slice(0, 500)) || '',
      report_count: reportCount,
      created_at: new Date().toISOString()
    };

    await kvFetch(['LPUSH', `${prefix}slaps:reports`, JSON.stringify(report)]);
    await kvFetch(['LTRIM', `${prefix}slaps:reports`, '0', '1999']);

    let autoHidden = false;
    if (reportCount >= 3) {
      const songsKey = `${prefix}slaps:songs`;
      const rawSongs = await kvFetch(['LRANGE', songsKey, '0', '-1']);
      const communityMatches = (rawSongs || []).flatMap(raw => {
        try {
          const song = JSON.parse(raw);
          return song.youtube_id === youtube_id && song.source === 'community' ? [{ raw, song }] : [];
        } catch {
          return [];
        }
      });
      if (communityMatches.length) {
        await Promise.all([
          ...communityMatches.map(item => kvFetch(['LREM', songsKey, '0', item.raw])),
          kvFetch(['SREM', `${prefix}slaps:existing_ids`, youtube_id]),
          kvFetch(['LPUSH', `${prefix}slaps:submission_reviews`, JSON.stringify({
            action: 'auto_unpublish',
            youtube_id,
            reason: `${reportCount} unique reports`,
            reviewed_at: new Date().toISOString(),
          })]),
        ]);
        await kvFetch(['LTRIM', `${prefix}slaps:submission_reviews`, '0', '999']);
        autoHidden = true;
      }
    }

    res.status(200).json({ status: 'success', report_counted: true, report_count: reportCount, auto_hidden: autoHidden });
  } catch (error) {
    console.error('Failed to save report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
