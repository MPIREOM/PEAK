// pages/api/generate.js
// Server-side Anthropic API call — API key never exposed to browser.
// Retries automatically on transient overload / rate-limit errors (429, 529, 500/503).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured in environment variables" });
  }

  const RETRYABLE = new Set([429, 500, 503, 529]);
  const MAX_ATTEMPTS = 4;
  let lastError = "Unknown error";
  let lastStatus = 502;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content?.find((b) => b.type === "text")?.text || "";
        return res.status(200).json({ text });
      }

      // Non-OK: extract a clean message from Anthropic's error envelope.
      const raw = await response.text();
      let message = raw;
      try { message = JSON.parse(raw)?.error?.message || raw; } catch {}
      lastError = message;
      lastStatus = response.status;

      if (RETRYABLE.has(response.status) && attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s
        continue;
      }
      break;
    } catch (err) {
      lastError = err.message;
      lastStatus = 500;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
    }
  }

  const friendly =
    lastStatus === 529 || /overload/i.test(lastError)
      ? "Anthropic is temporarily overloaded. Please click Generate again in a moment."
      : lastStatus === 429
      ? "Rate limited by Anthropic. Please wait a few seconds and click Generate again."
      : lastError;
  return res.status(lastStatus).json({ error: friendly });
}
