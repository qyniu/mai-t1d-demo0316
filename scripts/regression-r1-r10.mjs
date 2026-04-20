import { chromium } from "playwright-core";

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.argv[2] || process.env.AGENT_BASE_URL || "http://127.0.0.1:5173";

const parseParams = (text) => {
  const raw = String(text || "").replace(/^params:\s*/i, "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const isExplicitSearchRequest = (q = "") => {
  const s = String(q || "").toLowerCase().trim();
  if (!s) return false;
  return (
    /\b(find nodes?|search for|search nodes?|show matching nodes?|list nodes?)\b/.test(s) ||
    /\b(find|search|list|show)\b.*\bnodes?\b/.test(s)
  );
};

const hasNumber = (v) => typeof v === "number" && Number.isFinite(v);
const asObj = (v) => (v && typeof v === "object" ? v : {});

const CASES = [
  {
    id: "R1",
    question: "what is the QC pipeline version that generates dataset bulk ATAC seq",
    expectedIntents: ["pipeline_for_dataset"],
    evidenceCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length > 0;
    },
    shapeCheck: ({ result, answer }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      const first = rows[0] || {};
      const detail = asObj(first.detail);
      const hasVersion = !!(detail.version || detail.Version);
      const mentionsVersionUnavailable = /version is not available/i.test(String(answer || ""));
      return !!first.datasetLabel && (hasVersion || mentionsVersionUnavailable);
    },
  },
  {
    id: "R2",
    question: "Disease stage distribution of model genomic FM training data",
    expectedIntents: ["donor_attribute_ratio"],
    evidenceCheck: ({ result }) => {
      const s = asObj(result?.summary);
      const comp = asObj(s.composition);
      return hasNumber(s.totalDonors) && s.totalDonors > 0 && Object.keys(comp).length > 0;
    },
    shapeCheck: ({ result }) => {
      const s = asObj(result?.summary);
      const comp = asObj(s.composition);
      return Object.keys(comp).length >= 2;
    },
  },
  {
    id: "R3",
    question: "show me the metadata for HPAP-001",
    expectedIntents: ["node_detail"],
    evidenceCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length > 0;
    },
    shapeCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      const first = rows[0] || {};
      const id = String(first.id || "").toLowerCase();
      const label = String(first.label || "").toUpperCase();
      const detail = asObj(first.detail);
      const donorLike = id.startsWith("donor_hpap_") || label === "HPAP-001";
      return donorLike && Object.keys(detail).length > 0;
    },
  },
  {
    id: "R4",
    question: "Which datasets are used to train Genomic FM?",
    expectedIntents: ["datasets_for_model"],
    evidenceCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length > 0;
    },
    shapeCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.some((r) => !!r.id && !!r.label);
    },
  },
  {
    id: "R5",
    question: "If HPAP-010 becomes T1D, which models are affected?",
    expectedIntents: ["reclassification_distribution_impact", "impact_downstream"],
    evidenceCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "reclassification_distribution_impact") return !!s.before && !!s.after;
      if (finalIntent === "impact_downstream") {
        return s.found === true || hasNumber(s.modelCount) || hasNumber(s.impactedModelCount);
      }
      return false;
    },
    shapeCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "reclassification_distribution_impact") {
        return Array.isArray(s.impactedModels) || Array.isArray(s.impactedTasks);
      }
      if (finalIntent === "impact_downstream") {
        return hasNumber(s.modelCount ?? s.impactedModelCount);
      }
      return false;
    },
  },
  {
    id: "R6",
    question: "Which donors are shared between Genomic FM and Spatial FM training sets?",
    expectedIntents: ["training_donor_overlap_between_models", "donor_overlap_between_models"],
    evidenceCheck: ({ result }) => {
      const s = asObj(result?.summary);
      return hasNumber(s.overlapCount);
    },
    shapeCheck: ({ result }) => {
      const s = asObj(result?.summary);
      return hasNumber(s.modelADonorCount) && hasNumber(s.modelBDonorCount);
    },
  },
  {
    id: "R7",
    question: "Are there donors in Genomic FM training and Spatial FM validation?",
    expectedIntents: ["donor_overlap_between_models", "training_donor_overlap_between_models", "embedding_leakage_between_models"],
    evidenceCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "embedding_leakage_between_models") return hasNumber(s.leakageDonorCount);
      return hasNumber(s.overlapCount);
    },
    shapeCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "embedding_leakage_between_models") return hasNumber(s.directionCount) || Array.isArray(s.directions);
      return !!s.splitA && !!s.splitB;
    },
  },
  {
    id: "R8",
    question: "Show the full provenance chain for Genomic FM",
    expectedIntents: ["provenance_chain"],
    evidenceCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      const s = asObj(result?.summary);
      return rows.length >= 2 || !!s.path || !!s.chain || !!s.lineage;
    },
    shapeCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length >= 2;
    },
  },
  {
    id: "R9",
    question: "Which planned configs reference deprecated CellRanger processed files?",
    expectedIntents: ["impact_downstream", "provenance_chain"],
    evidenceCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "impact_downstream") {
        return s.found === true || hasNumber(s.taskCount) || hasNumber(s.modelCount) || hasNumber(s.impactedTaskCount);
      }
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length > 0;
    },
    shapeCheck: ({ finalIntent, result }) => {
      const s = asObj(result?.summary);
      if (finalIntent === "impact_downstream") {
        return hasNumber(s.modelCount ?? s.impactedModelCount) || hasNumber(s.taskCount ?? s.impactedTaskCount);
      }
      return true;
    },
  },
  {
    id: "R10",
    question: "Which dataset cards are linked to Genomic FM model card?",
    expectedIntents: ["card_links", "get_neighbors"],
    evidenceCheck: ({ result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      return rows.length > 0;
    },
    shapeCheck: ({ finalIntent, result }) => {
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      if (finalIntent === "card_links") {
        return rows.some((r) => String(r?.id || "").toLowerCase().includes("dc_"));
      }
      return rows.some((r) => /documented_by|linked_to/i.test(String(r?.edgeLabel || "")));
    },
  },
];

const runCase = async (page, testCase) => {
  const clearBtn = page.getByRole("button", { name: /Clear/i });
  if (await clearBtn.isVisible().catch(() => false)) {
    await clearBtn.click();
  }

  const input = page.getByPlaceholder(/Ask a governance question/i);
  await input.fill(testCase.question);
  await input.press("Enter");

  await page.waitForSelector("text=LangGraph - route", { timeout: 60000 });
  await page.waitForSelector("text=/LangGraph run completed in/", { timeout: 120000 });

  const intentTexts = await page.locator("text=/Intent:/").allInnerTexts();
  const paramsTexts = await page.locator("text=/params:/").allInnerTexts();

  const intentSeq = intentTexts
    .map((t) => String(t || "").replace(/^.*Intent:\s*/i, "").trim())
    .filter(Boolean);
  const paramsSeq = paramsTexts.map(parseParams);

  const finalIntent = intentSeq[intentSeq.length - 1] || null;
  const finalParams = paramsSeq[paramsSeq.length - 1] || {};

  const result = await page.evaluate(
    ({ intent, params }) => {
      const dbg = window.__KG_DEBUG__;
      if (!dbg || typeof dbg.queryGraph !== "function" || !intent) return null;
      return dbg.queryGraph(intent, params || {});
    },
    { intent: finalIntent, params: finalParams }
  );

  const answer = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll("div")].filter((el) => {
      const style = el.style || {};
      return style.alignSelf === "flex-start" && style.whiteSpace === "pre-wrap";
    });
    const last = bubbles[bubbles.length - 1];
    return last ? String(last.innerText || "").trim() : "";
  });

  const searchOnlyAllowed = isExplicitSearchRequest(testCase.question);
  const nonSearchFinalPass = searchOnlyAllowed || finalIntent !== "search_nodes";
  const intentFamilyPass = testCase.expectedIntents.includes(String(finalIntent || ""));
  const evidencePass = !!testCase.evidenceCheck({ finalIntent, finalParams, result, answer });
  const shapePass = !!testCase.shapeCheck({ finalIntent, finalParams, result, answer });

  const pass = nonSearchFinalPass && intentFamilyPass && evidencePass && shapePass;

  return {
    id: testCase.id,
    question: testCase.question,
    finalIntent,
    intentSeq,
    finalParams,
    rowCount: Array.isArray(result?.rows) ? result.rows.length : null,
    nonSearchFinalPass,
    intentFamilyPass,
    evidencePass,
    shapePass,
    pass,
    answerPreview: String(answer || "").slice(0, 220),
  };
};

let browser;
try {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
} catch (error) {
  console.error("Failed to launch Chrome for regression run.");
  console.error("Set CHROME_PATH to a valid local Chrome/Chromium executable and retry.");
  console.error(`Launch target: ${executablePath}`);
  console.error(String(error?.message || error));
  process.exit(1);
}

const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
const results = [];
let failed = 0;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Governance Agent/i }).click({ timeout: 20000 });

  for (const testCase of CASES) {
    const outcome = await runCase(page, testCase);
    if (!outcome.pass) failed += 1;
    results.push(outcome);
  }
} finally {
  await browser.close();
}

console.log("=== MAI-T1D Governance Agent Regression (R1-R10) ===");
for (const r of results) {
  console.log(`\n[${r.id}] ${r.pass ? "PASS" : "FAIL"}`);
  console.log(`Q: ${r.question}`);
  console.log(`Final intent: ${r.finalIntent || "(none)"}`);
  console.log(`Intent path: ${r.intentSeq.length ? r.intentSeq.join(" -> ") : "(none)"}`);
  console.log(`Rows: ${r.rowCount ?? "(unknown)"}`);
  console.log(`Checks: nonSearchFinal=${r.nonSearchFinalPass} | intentFamily=${r.intentFamilyPass} | evidence=${r.evidencePass} | answerShape=${r.shapePass}`);
  if (!r.pass) {
    console.log(`Answer preview: ${r.answerPreview || "(empty)"}`);
    console.log(`Final params: ${JSON.stringify(r.finalParams)}`);
  }
}

console.log(`\nSummary: ${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exit(1);
