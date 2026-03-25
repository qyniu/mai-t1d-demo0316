import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function anthropicProxyPlugin(apiKey) {
  return {
    name: "anthropic-proxy",
    configureServer(server) {
      server.middlewares.use("/api/anthropic/messages", async (req, res, next) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Missing ANTHROPIC_API_KEY. Set it in your shell before running npm run dev.",
            })
          );
          return;
        }

        try {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          await new Promise((resolve, reject) => {
            req.on("end", resolve);
            req.on("error", reject);
          });

          const upstream = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body,
          });

          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader(
            "Content-Type",
            upstream.headers.get("content-type") || "application/json"
          );
          res.end(text);
        } catch (err) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : "Upstream request failed",
            })
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  return {
    plugins: [react(), anthropicProxyPlugin(apiKey)],
  };
});
