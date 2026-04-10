import { chromium } from "playwright-core";

const executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:5173";

const CASES = [
  {
    question: "哪些donor同时出现在三个FM的training set中？",
    expectedIntent: "cross_model_donor_leakage",
  },
  {
    question: "scFM的downstream task产出的embedding被用于Genomic FM时，是否存在training data交叉？",
    expectedIntent: "cross_modality_embedding_leakage",
  },
  {
    question: "当HPAP V4.0.0 disease stage reclassification发生后，原来的80/20分配还合理吗？",
    expectedIntent: "train_eval_distribution_drift",
  },
  {
    question: "上游HPAP把某donor从'AAb+' reclassify成'T1D onset'后，影响哪些下游？",
    expectedIntent: "upstream_metadata_impact",
  },
  {
    question: "Genomic FM的validation如果用了single-cell embedding做验证，共用了哪些公共数据集？",
    expectedIntent: "shared_validation_datasets_across_fms",
  },
  {
    question: "同时用于三个FM训练的donor中，T1D患者比例是多少？",
    expectedIntent: "disease_composition_bias_three_fms",
  },
];

const parseTrace = (intentText, paramsText, rowsText) => {
  const intent = String(intentText || "").replace(/^Intent:\s*/i, "").trim() || null;
  let params = {};
  try {
    params = JSON.parse(String(paramsText || "").replace(/^params:\s*/i, "").trim() || "{}");
  } catch {
    params = {};
  }
  const m = String(rowsText || "").match(/(\d+)\s+rows returned/i);
  const rows = m ? Number(m[1]) : null;
  return { intent, params, rows };
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

let failed = 0;
const results = [];

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Governance Agent/i }).click({ timeout: 15000 });

  for (const testCase of CASES) {
    const clearBtn = page.getByRole("button", { name: /Clear/i });
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    }

    const input = page.getByPlaceholder(/Ask a governance question/i);
    await input.fill(testCase.question);
    await input.press("Enter");

    await page.waitForSelector("text=Step 1 - LLM analysis", { timeout: 60000 });
    await Promise.race([
      page.waitForSelector("text=Done", { timeout: 120000 }),
      page.waitForSelector("text=Error", { timeout: 120000 }),
    ]);

    const intentText = await page.locator("text=/Intent:/").last().innerText().catch(() => "");
    const paramsText = await page.locator("text=/params:/").last().innerText().catch(() => "");
    const rowsText = await page.locator("text=/rows returned/").last().innerText().catch(() => "");
    const parsed = parseTrace(intentText, paramsText, rowsText);

    let expectedRows = null;
    if (parsed.intent) {
      const result = await page.evaluate(({ intent, params }) => {
        const dbg = window.__KG_DEBUG__;
        if (!dbg || typeof dbg.queryGraph !== "function") return null;
        return dbg.queryGraph(intent, params || {});
      }, parsed);
      expectedRows = result?.rows?.length ?? null;
    }

    const intentPass = parsed.intent === testCase.expectedIntent;
    const rowPass = expectedRows !== null && parsed.rows !== null ? expectedRows === parsed.rows : false;
    const pass = intentPass && rowPass;
    if (!pass) failed += 1;

    results.push({
      question: testCase.question,
      expectedIntent: testCase.expectedIntent,
      actualIntent: parsed.intent,
      traceRows: parsed.rows,
      queryGraphRows: expectedRows,
      pass,
    });
  }
} finally {
  await browser.close();
}

console.log("=== Q1-Q6 Regression Report ===");
results.forEach((r, idx) => {
  console.log(`\n[${idx + 1}] ${r.pass ? "PASS" : "FAIL"}`);
  console.log(`Q: ${r.question}`);
  console.log(`expected intent: ${r.expectedIntent}`);
  console.log(`actual intent:   ${r.actualIntent ?? "(none)"}`);
  console.log(`trace rows: ${r.traceRows ?? "(none)"}, queryGraph rows: ${r.queryGraphRows ?? "(none)"}`);
});

console.log(`\nSummary: ${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exit(1);
