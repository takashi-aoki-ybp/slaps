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
  return data.result;
}

// Call Gemini API (with OpenRouter fallback)
async function callLLM(prompt) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  } else if (openrouterKey) {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error(`OpenRouter API error: ${res.statusText}`);
    const data = await res.json();
    return data.choices[0].message.content;
  } else {
    throw new Error("Missing API Keys (neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set)");
  }
}

export default async function handler(req, res) {
  // Vercel Cron Job authorization check
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const prefix = process.env.DB_PREFIX || '';
    const songsKey = `${prefix}slaps:songs`;
    
    const rawList = await kvFetch(['LRANGE', songsKey, '0', '-1']);
    if (!rawList || !Array.isArray(rawList)) {
      return res.status(200).json({ message: 'No songs found in KV' });
    }

    const songs = rawList.map(item => JSON.parse(item));

    // Filter songs that need classification
    function needsClassification(song) {
      const region = (song.region || '').toLowerCase();
      const era = (song.era || '').toLowerCase();
      const mood = song.conscious_turnt;
      return region === 'other' || region === '' || era === 'other' || era === '' || mood === 2.5 || mood === 3;
    }

    const targets = songs.filter(needsClassification);

    if (targets.length === 0) {
      return res.status(200).json({ message: 'No updates required. All songs classified.' });
    }

    console.log(`Found ${targets.length} songs that require classification.`);

    // Classify using Gemini API
    const batchInput = targets.map(s => ({
      id: s.youtube_id,
      name: s.name,
      comment: typeof s.description === 'object' ? Object.values(s.description).join(' ') : (s.description || '')
    }));

    const prompt = `You are an expert hip-hop music analyst. Your task is to classify a list of hip-hop songs.
For each song, classify:
1. Region: Choose from "us" (United States), "jp" (Japan), "uk" (United Kingdom), "kr" (South Korea), "fr" (France).
2. Era: Choose from "90s", "00s", "10s", "20s".
3. Conscious vs Turnt mood: Assign a score from 0.0 to 5.0.
   - 0.0 to 2.0: Conscious (mellow, lyrical, introspective, jazzy, boom-bap, political).
   - 3.5 to 5.0: Turnt (trap, drill, club bangers, high-energy, hype).
   - Crucially, you MUST NOT output values in the range [2.1, 3.4]. Force it to be either Conscious (<2.5) or Turnt (>3.0). Do not output intermediate values like 2.5 or 3.0.

Input songs:
${JSON.stringify(batchInput, null, 2)}

Return a JSON object containing a "results" map where keys are the song IDs, matching this exact structure:
{
  "results": {
    "YjC0vvPGiKk": {
      "region": "kr" | "us" | "jp" | "uk" | "fr",
      "era": "90s" | "00s" | "10s" | "20s",
      "conscious_turnt": number
    }
  }
}
`;

    const rawResponse = await callLLM(prompt);
    const cleanJson = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    const classificationResults = parsed.results || {};

    let updatedCount = 0;
    const updatedSongs = songs.map(song => {
      const result = classificationResults[song.youtube_id];
      if (result) {
        const newRegion = result.region || song.region;
        const newEra = result.era || song.era;
        const newMood = result.conscious_turnt !== undefined ? result.conscious_turnt : song.conscious_turnt;

        if (song.region !== newRegion || song.era !== newEra || song.conscious_turnt !== newMood) {
          updatedCount++;
          return {
            ...song,
            region: newRegion,
            era: newEra,
            conscious_turnt: newMood
          };
        }
      }
      return song;
    });

    if (updatedCount > 0) {
      // Re-write to Vercel KV
      await kvFetch(['DEL', songsKey]);
      const chunkSize = 50;
      const jsonStrings = updatedSongs.map(s => JSON.stringify(s));
      for (let i = 0; i < jsonStrings.length; i += chunkSize) {
        const chunk = jsonStrings.slice(i, i + chunkSize);
        await kvFetch(['RPUSH', songsKey, ...chunk]);
      }
      
      return res.status(200).json({
        message: `Successfully completed auto-classification. Updated ${updatedCount} songs.`
      });
    } else {
      return res.status(200).json({ message: 'No updates applied (LLM returned same values)' });
    }
  } catch (error) {
    console.error('Cron job failed:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
