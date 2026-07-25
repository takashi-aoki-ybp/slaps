export default async function handler(req, res) {
  try {
    const kvEnabled = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    res.status(200).json({ debug: true, kvEnabled });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
