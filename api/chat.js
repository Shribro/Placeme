// api/chat.js — server-side proxy. The OpenAI key lives here as an env var
// and never reaches the browser. Vercel runs this automatically at /api/chat.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { messages, model, temperature, response_format } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Only allow known models; cap output tokens so no single call can run away.
  const allowed = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
  const body = {
    model: allowed.includes(model) ? model : "gpt-4o-mini",
    messages,
    temperature: typeof temperature === "number" ? temperature : 0.7,
    max_tokens: 800,
  };
  if (response_format) body.response_format = response_format;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
