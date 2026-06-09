async function test() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("No OPENROUTER_API_KEY in process.env");
    return;
  }
  
  console.log("Testing OpenRouter API with key: " + key.substring(0, 10) + "...");
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'user', content: 'Say hello in Japanese.' }]
    })
  });
  
  if (!res.ok) {
    console.error(`HTTP Error: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.error(text);
    return;
  }
  
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

test().catch(console.error);
