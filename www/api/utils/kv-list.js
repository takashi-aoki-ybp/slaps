const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ITEMS = 10000;

async function readRedisList(kvFetch, key, options = {}) {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const maxItems = options.maxItems || DEFAULT_MAX_ITEMS;
  const items = [];

  for (let start = 0; start < maxItems; start += batchSize) {
    const end = Math.min(maxItems - 1, start + batchSize - 1);
    const batch = await kvFetch(['LRANGE', key, String(start), String(end)]);
    if (!Array.isArray(batch) || batch.length === 0) return items;
    items.push(...batch);
    if (batch.length < batchSize) return items;
  }

  throw new Error(`Redis list exceeded safe read limit: ${key}`);
}

module.exports = { readRedisList };
