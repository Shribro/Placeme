// api/chat.js — server-side proxy. The OpenAI key lives here as an env var
// (OPENAI_API_KEY) and never reaches the browser. Vercel serves this at /api/chat.
//
// Access control: the caller must be a signed-in IIMU user. We verify the
// Supabase access token (sent as "Authorization: Bearer <token>") against
// Supabase, and only then call OpenAI — so nobody can spend your credits by
// hitting /api/chat directly.
//
// Required Vercel env vars: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON.

const ADMIN_EMAILS = ["shricharan.ar@gmail.com", "shricharan.arumugam.2025@iimu.ac.in"];
const ALLOWED_DOMAIN = "iimu.ac.in";

// Max headroom: 300s is the Hobby ceiling (requires Fluid Compute enabled).
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-demo-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // ---- access control ----
  // Guest (no-login) path: a shared demo key lets the app work without Google sign-in.
  const demoKey = req.headers["x-demo-key"] || "";
  const isGuest = process.env.DEMO_KEY && demoKey === process.env.DEMO_KEY;

  if (!isGuest) {
    // Normal path: verify the caller is a signed-in IIMU user.
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Sign in required" });
    let email = "";
    try {
      const who = await fetch(process.env.SUPABASE_URL + "/auth/v1/user", {
        headers: { apikey: process.env.SUPABASE_ANON, Authorization: "Bearer " + token },
      });
      if (!who.ok) return res.status(401).json({ error: "Sign in required" });
      const info = await who.json();
      email = (info.email || "").toLowerCase();
    } catch (e) {
      return res.status(401).json({ error: "Auth check failed" });
    }
    const allowed = email.endsWith("@" + ALLOWED_DOMAIN) || ADMIN_EMAILS.includes(email);
    if (!allowed) return res.status(403).json({ error: "Not allowed" });
  }

  // ---- proxy to OpenAI ----
  const { messages, model, temperature, response_format } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const allowedModels = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
  const body = {
    model: allowedModels.includes(model) ? model : "gpt-4o-mini",
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
