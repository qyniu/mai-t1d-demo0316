import { chromium } from "playwright-core";
import fs from "node:fs";

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:5173";

const CASES = [
  {
    id: "CQ1",
    section: "S1",
    question: "Which datasets are used to train Genomic FM?",
    expectedIntents: ["datasets_for_model"],
    answerMustIncludeAny: ["dataset", "Bulk", "scRNA", "ATAC"],
  },
  {
    id: "CQ2",
    section: "S1/S2",
    question: "If the Bulk RNA QC pipeline is revised, which downstream tasks need review?",
    expectedIntents: ["impact_downstream"],
    answerMustIncludeAny: ["Impacted", "downstream tasks", "models"],
  },
  {
    id: "CQ3",
    section: "S1",
    question: "What is the QC pipeline version that generates the Bulk ATAC-seq dataset?",
    expectedIntents: ["pipeline_for_dataset"],
    answerMustIncludeAny: ["Pipeline", "Version", "Bulk ATAC"],
  },
  {
    id: "CQ4",
    section: "S1",
    question: "Disease stage distribution of model Genomic FM training data.",
    expectedIntents: ["donor_attribute_ratio"],
    answerMustIncludeAny: ["distribution", "T1D", "ND", "donor"],
  },
  {
    id: "CQ5",
    section: "S1",
    question: "Which donors are shared between Genomic FM and Spatial FM training sets?",
    expectedIntents: ["training_donor_overlap_between_models", "donor_overlap_between_models"],
    answerMustIncludeAny: ["overlapping donors", "ratio", "donors"],
  },
  {
    id: "CQ6",
    section: "S1/S9",
    question: "Are there donors in Genomic FM training that also appear in Spatial FM validation?",
    expectedIntents: ["donor_overlap_between_models", "training_donor_overlap_between_models", "embedding_leakage_between_models"],
    answerMustIncludeAny: ["overlapping donors", "No overlapping donors", "leakage"],
  },
  {
    id: "CQ7",
    section: "S1",
    question: "Show the full provenance chain for sample HPAP-001.",
    expectedIntents: ["provenance_chain", "node_detail", "search_nodes"],
    answerMustIncludeAny: ["Provenance", "chain", "Node"],
  },
  {
    id: "CQ8",
    section: "S1/S9",
    question: "Which planned configs reference deprecated CellRanger processed files?",
    expectedIntents: ["impact_downstream", "search_nodes", "clarify"],
    answerMustIncludeAny: ["specify", "No matching entity", "resolved candidate", "deprecated"],
  },
  {
    id: "AQ1",
    section: "S8",
    question: "What is the compliance status of all FM models right now?",
    expectedIntents: ["compliance_status"],
    answerMustIncludeAny: ["Compliance", "Models checked", "hold"],
  },
  {
    id: "AQ2",
    section: "S8/S9",
    question: "If HPAP-010 becomes T1D, what is the impact scope across datasets, models, and tasks?",
    expectedIntents: ["reclassification_distribution_impact", "impact_downstream"],
    answerMustIncludeAny: ["impact", "models", "tasks", "ratio"],
  },
  {
    id: "AQ3",
    section: "S8",
    question: "Reconstruct provenance for Genomic FM with full upstream chain.",
    expectedIntents: ["provenance_chain"],
    answerMustIncludeAny: ["Provenance", "chain"],
  },
  {
    id: "AQ4",
    section: "S8",
    question: "Show governance change log events in 2024 Q1.",
    expectedIntents: ["governance_events_by_period"],
    answerMustIncludeAny: ["Governance events", "No matching update events", "period"],
  },
];

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

const parseIntentFromChip = (line) => {
  const m = String(line || "").match(/([a-z_]+)\s+(\d+)\s+rows/i);
  return m ? m[1] : null;
};

const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

const results = [];

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Governance Agent/i }).click({ timeout: 20000 });

  for (const c of CASES) {
    const clearBtn = page.getByRole("button", { name: /Clear/i });
    if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click();

    const input = page.getByPlaceholder(/Ask a governance question/i);
    await input.fill(c.question);
    await input.press("Enter");

    await page.waitForSelector("text=LangGraph - route", { timeout: 60000 });
    await page.waitForSelector("text=/LangGraph run completed in/", { timeout: 120000 });

    const intentTexts = await page.locator("text=/Intent:/").allInnerTexts();
    const intentSeq = intentTexts
      .map((t) => clean(String(t || "").replace(/^.*Intent:\s*/i, "")))
      .filter(Boolean);

    const chipTexts = await page.locator("text=/[a-z_]+\s+\d+\s+rows/").allInnerTexts();
    const chipIntents = chipTexts.map(parseIntentFromChip).filter(Boolean);

    const finalIntent = intentSeq[intentSeq.length - 1] || chipIntents[chipIntents.length - 1] || "(none)";

    const answer = await page.evaluate(() => {
      const bubbles = [...document.querySelectorAll("div")].filter((el) => {
        const st = el.style || {};
        return st.alignSelf === "flex-start" && st.whiteSpace === "pre-wrap";
      });
      const last = bubbles[bubbles.length - 1];
      return last ? String(last.innerText || "").trim() : "";
    });

    const normalizedAnswer = clean(answer);
    const intentOk = c.expectedIntents.includes(finalIntent);
    const answerShapeOk = c.answerMustIncludeAny.some((k) => normalizedAnswer.toLowerCase().includes(String(k).toLowerCase()));

    let verdict = "PASS";
    if (!intentOk && answerShapeOk) verdict = "PARTIAL";
    if (!answerShapeOk) verdict = "FAIL";

    results.push({
      id: c.id,
      section: c.section,
      question: c.question,
      finalIntent,
      intentOk,
      answerShapeOk,
      verdict,
      answerPreview: normalizedAnswer.slice(0, 260),
    });
  }
} finally {
  await browser.close();
}

const lines = [];
lines.push("# Paper Evaluation Report");
lines.push("");
lines.push(`Base URL: ${baseUrl}`);
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push("| ID | Section | Final Intent | Intent OK | Answer Shape OK | Verdict |");
lines.push("|---|---|---|---|---|---|");
for (const r of results) {
  lines.push(`| ${r.id} | ${r.section} | ${r.finalIntent} | ${r.intentOk ? "Y" : "N"} | ${r.answerShapeOk ? "Y" : "N"} | ${r.verdict} |`);
}
lines.push("");
lines.push("## Answer Previews");
for (const r of results) {
  lines.push("");
  lines.push(`### ${r.id} (${r.verdict})`);
  lines.push(`- Question: ${r.question}`);
  lines.push(`- Final intent: ${r.finalIntent}`);
  lines.push(`- Preview: ${r.answerPreview || "(empty)"}`);
}

fs.mkdirSync("reports", { recursive: true });
const outPath = "reports/paper-eval-report.md";
fs.writeFileSync(outPath, lines.join("\n"), "utf8");

const counts = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
console.log("=== Paper Eval Summary ===");
console.log(counts);
console.log(`Report written: ${outPath}`);

if ((counts.FAIL || 0) > 0) process.exitCode = 1;
