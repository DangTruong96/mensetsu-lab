// MensetsuLab backend proxy: keeps the Gemini API key on the server.
// The public website (GitHub Pages) calls this endpoint; the key never
// reaches the browser. Runs on the Vercel free tier.
//
// POST JSON body: { "prompt": "...", "system": "..." (optional) }
// Response: { "text": "..." } or { "error": "..." }

const MODEL = "gemini-flash-latest";
const ALLOWED_ORIGINS = [
  "https://dangtruong96.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];
const MAX_PROMPT_CHARS = 12000;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default async function handler(req, res) {
  const headers = corsHeaders(req.headers.origin || "");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "server key not configured" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const prompt = body && typeof body.prompt === "string" ? body.prompt : "";
  const system = body && typeof body.system === "string" ? body.system : "";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: "invalid prompt" });
  }

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4000 },
  };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || "upstream error";
      return res.status(upstream.status).json({ error: msg });
    }
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!text) return res.status(502).json({ error: "empty response" });
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: "upstream unreachable" });
  }
}
