const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const prefix = process.env.DB_PREFIX || '';

if (!url || !token) {
  console.error("Error: KV_REST_API_URL and KV_REST_API_TOKEN must be set.");
  process.exit(1);
}

async function kvFetch(command) {
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

async function run() {
  const keyName = `${prefix}slaps:songs`;
  console.log(`Fetching songs from KV key: ${keyName}...`);
  
  const rawList = await kvFetch(['LRANGE', keyName, 0, -1]);
  if (!rawList || !Array.isArray(rawList)) {
    console.error("Failed to retrieve songs list, or list is empty.");
    return;
  }
  
  console.log(`Retrieved ${rawList.length} songs. Processing replacement...`);
  
  let updatedCount = 0;
  const updatedList = rawList.map(item => {
    try {
      const song = JSON.parse(item);
      if (song && song.user_name === "青木 喬") {
        song.user_name = "青木 喬 takashi aoki";
        updatedCount++;
      }
      return JSON.stringify(song);
    } catch (e) {
      return item;
    }
  });
  
  console.log(`Completed processing. Found ${updatedCount} matches to update.`);
  if (updatedCount === 0) {
    console.log("No songs matched '青木 喬'. No updates needed.");
    return;
  }
  
  console.log("Deleting old key...");
  await kvFetch(['DEL', keyName]);
  
  console.log("Writing updated songs back to KV using RPUSH...");
  const chunkSize = 50;
  for (let i = 0; i < updatedList.length; i += chunkSize) {
    const chunk = updatedList.slice(i, i + chunkSize);
    await kvFetch(['RPUSH', keyName, ...chunk]);
    console.log(`Uploaded chunk ${i / chunkSize + 1} (${i + chunk.length}/${updatedList.length})`);
  }
  
  console.log("Database update completed successfully!");
}

run().catch(err => {
  console.error("Execution failed:", err);
  process.exit(1);
});
