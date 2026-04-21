import { chromium } from "playwright-core";
import fs from "node:fs";

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:5173";

const CASES = [
  "Show immediate neighbors of donor_hpap_001.",
  "Show immediate neighbors of proc_bulk_rna_v1.",
  "Show immediate neighbors of proc_bulk_rna_v1__training.",
  "Show immediate neighbors of qc_bulk_rna.",
  "Show immediate neighbors of model_genomic.",
  "Show immediate neighbors of model_scfm_ft_v1.",
  "Show immediate neighbors of mc_genomic.",
  "Show immediate neighbors of dc_bulk_rna_v1.",
  "Show immediate neighbors of emb_genomic_all_modalities_v1.",
  "Show immediate neighbors of task_eqtl.",
];

const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } });

const touched = new Set();
const intents = [];

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Governance Agent/i }).click({ timeout: 20000 });

  for (const q of CASES) {
    const clearBtn = page.getByRole("button", { name: /Clear/i });
    if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click();

    const input = page.getByPlaceholder(/Ask a governance question/i);
    await input.fill(q);
    await input.press("Enter");
    await page.waitForSelector("text=/LangGraph run completed in/", { timeout: 120000 });

    const intentTexts = await page.locator("text=/Intent:/").allInnerTexts();
    const paramsTexts = await page.locator("text=/params:/").allInnerTexts();
    const lastIntent = intentTexts.length ? String(intentTexts[intentTexts.length - 1]).replace(/^.*Intent:\s*/i, "").trim() : "(none)";
    let lastParams = {};
    if (paramsTexts.length) {
      const raw = String(paramsTexts[paramsTexts.length - 1]).replace(/^params:\s*/i, "").trim();
      try { lastParams = JSON.parse(raw || "{}"); } catch { lastParams = {}; }
    }
    intents.push({ q, intent: lastIntent });

    const labels = await page.evaluate(({ lastIntent, lastParams }) => {
      const dbg = window.__KG_DEBUG__;
      if (!dbg || typeof dbg.queryGraph !== "function") return [];
      if (lastIntent !== "get_neighbors") return [];
      const r = dbg.queryGraph("get_neighbors", lastParams || {});
      return (r?.rows || []).map((x) => String(x.edgeLabel || "")).filter(Boolean);
    }, { lastIntent, lastParams });
    labels.forEach((x) => touched.add(x));
  }
} finally {
  await browser.close();
}

const out = {
  intents,
  edgeLabelsTouchedByProbes: [...touched].sort(),
};
fs.writeFileSync("reports/edge-probe-report.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
