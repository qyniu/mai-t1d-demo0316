const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-20250514",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
]);

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing ANTHROPIC_API_KEY on server" });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const model = body?.model;
    const maxTokens = Number(body?.max_tokens ?? 0);

    if (!model || !ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: "Unsupported model" });
      return;
    }

    if (!Number.isFinite(maxTokens) || maxTokens <= 0 || maxTokens > 4096) {
      res.status(400).json({ error: "Invalid max_tokens (1-4096 required)" });
      return;
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json"
    );
    res.send(text);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "Upstream request failed",
    });
  }
}
