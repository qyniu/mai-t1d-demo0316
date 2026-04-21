import { chromium } from "playwright-core";
import fs from "node:fs";

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = process.argv[2] || "http://127.0.0.1:5173";

const CASES = [
  // S9.2 cross-model dependency and leakage risk (core)
  { id: "CM1", group: "S9.2-overlap", question: "How many donors overlap between Genomic FM and Protein FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_genomic", modelBId: "model_protein", splitA: "training", splitB: "training" } } },
  { id: "CM2", group: "S9.2-overlap", question: "How many donors overlap between Genomic FM and Spatial FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_genomic", modelBId: "model_spatial", splitA: "training", splitB: "training" } } },
  { id: "CM3", group: "S9.2-overlap", question: "How many donors overlap between Genomic FM and Single-cell FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_genomic", modelBId: "model_scfm", splitA: "training", splitB: "training" } } },
  { id: "CM4", group: "S9.2-overlap", question: "How many donors overlap between Protein FM and Spatial FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_protein", modelBId: "model_spatial", splitA: "training", splitB: "training" } } },
  { id: "CM5", group: "S9.2-overlap", question: "How many donors overlap between Protein FM and Single-cell FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_protein", modelBId: "model_scfm", splitA: "training", splitB: "training" } } },
  { id: "CM6", group: "S9.2-overlap", question: "How many donors overlap between Single-cell FM and Spatial FM training sets?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_scfm", modelBId: "model_spatial", splitA: "training", splitB: "training" } } },
  { id: "CM7", group: "S9.2-leakage", question: "How many donors appear in Genomic FM training and Protein FM validation?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_genomic", modelBId: "model_protein", splitA: "training", splitB: "evaluation" } } },
  { id: "CM8", group: "S9.2-leakage", question: "How many donors appear in Genomic FM training and Spatial FM validation?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_genomic", modelBId: "model_spatial", splitA: "training", splitB: "evaluation" } } },
  { id: "CM9", group: "S9.2-leakage", question: "How many donors appear in Protein FM training and Single-cell FM validation?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_protein", modelBId: "model_scfm", splitA: "training", splitB: "evaluation" } } },
  { id: "CM10", group: "S9.2-leakage", question: "How many donors appear in Single-cell FM training and Spatial FM validation?", oracle: { intent: "donor_overlap_between_models", params: { modelAId: "model_scfm", modelBId: "model_spatial", splitA: "training", splitB: "evaluation" } } },

  // broader governance coverage
  { id: "G1", group: "Q1", question: "Which datasets are used to train Genomic FM?", oracle: { intent: "datasets_for_model", params: { modelId: "model_genomic" } } },
  { id: "G2", group: "Q1", question: "Which models use the Bulk ATAC-seq dataset?", oracle: { intent: "models_for_dataset", params: { datasetId: "proc_bulk_atac_v1" } } },
  { id: "G3", group: "Q1", question: "What is the QC pipeline version that generates the Bulk ATAC-seq dataset?", oracle: { intent: "pipeline_for_dataset", params: { datasetId: "proc_bulk_atac_v1" } } },
  { id: "G4", group: "Q1", question: "Who owns the Bulk ATAC QC pipeline v1.0?", oracle: { intent: "qc_pipeline_owner", params: { query: "Bulk ATAC QC pipeline v1.0 owner" } } },
  { id: "G5", group: "Q1", question: "Reconstruct provenance for Genomic FM with full upstream chain.", oracle: { intent: "provenance_chain", params: { modelId: "model_genomic" } } },
  { id: "G6", group: "Q2", question: "Which models are downstream of HPAP-002?", oracle: { intent: "impact_downstream", params: { query: "HPAP-002" } } },
  { id: "G7", group: "Q2", question: "Which datasets are downstream of HPAP-002?", oracle: { intent: "impact_downstream", params: { query: "HPAP-002" } } },
  { id: "G8", group: "Bias", question: "Disease stage distribution of model Genomic FM training data.", oracle: { intent: "donor_attribute_ratio", params: { modelId: "model_genomic", split: "training", mode: "disease", askType: "distribution" } } },
  { id: "G9", group: "Entity", question: "Show me the metadata for HPAP-001", oracle: { intent: "node_detail", params: { nodeId: "donor_hpap_001" } } },
  { id: "G10", group: "Cards", question: "Which dataset cards are linked to Genomic FM model card?", oracle: { intent: "card_links", params: { query: "Genomic FM model card" } } },
  { id: "G11", group: "AQ1", question: "What is the compliance status of all FM models right now?", oracle: { intent: "compliance_status", params: {} } },
  { id: "G12", group: "AQ4", question: "Show governance change log events in 2024 Q1.", oracle: { intent: "governance_events_by_period", params: { query: "2024 Q1" } } },
  { id: "G13", group: "Search", question: "Find nodes related to HPAP-010.", oracle: { intent: "search_nodes", params: { query: "HPAP-010", limit: 20 } } },
  { id: "G14", group: "DonorExtract", question: "List training donors for Genomic FM and Spatial FM.", oracle: { intent: "training_donors_by_models", params: { modelIds: ["model_genomic", "model_spatial"], split: "training" } } },
  { id: "G15", group: "Leakage", question: "Is there embedding leakage between Single-cell FM and Genomic FM?", oracle: { intent: "embedding_leakage_between_models", params: { modelAId: "model_scfm", modelBId: "model_genomic", sourceSplit: "training", targetTrainSplit: "training", targetUseSplit: "evaluation", requireEmbeddingUsage: true } } },
  { id: "G16", group: "WhatIf", question: "If HPAP-010 becomes T1D, what is the impact scope across datasets, models, and tasks?", oracle: { intent: "impact_downstream", params: { query: "HPAP-010" } } },
  { id: "G17", group: "Q1", question: "Show immediate neighbors of Genomic FM.", oracle: { intent: "get_neighbors", params: { nodeId: "model_genomic", depth: 1, direction: "both", limit: 200 } } },
  { id: "G18", group: "Cross3", question: "Which donors are shared across Genomic FM, Single-cell FM, and Spatial FM training sets?", oracle: { intent: "shared_donors_three_fms", params: { genomicModelId: "model_genomic", scfmModelId: "model_scfm", spatialModelId: "model_spatial" } } },
];

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

const parseParams = (text) => {
  const raw = String(text || "").replace(/^params:\s*/i, "").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
};

const parseIntentFromChip = (line) => {
  const m = String(line || "").match(/([a-z_]+)\s+(\d+)\s+rows/i);
  return m ? m[1] : null;
};

const extractRowKeys = (rows, intent) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { keys: [], applicable: true };
  const keys = [];
  for (const r of list) {
    if (r?.id !== undefined && r?.id !== null) {
      keys.push(`id:${String(r.id)}`);
      continue;
    }
    if (r?.fromId !== undefined && r?.toId !== undefined && r?.edgeLabel !== undefined) {
      keys.push(`edge:${r.fromId}|${r.edgeLabel}|${r.toId}`);
      continue;
    }
    return { keys: [], applicable: false };
  }
  return { keys: [...new Set(keys)], applicable: true };
};

const pr = (oracleRows, actualRows, intent) => {
  const o = extractRowKeys(oracleRows, intent);
  const a = extractRowKeys(actualRows, intent);
  if (!o.applicable || !a.applicable) return { applicable: false };
  const O = new Set(o.keys);
  const A = new Set(a.keys);
  const tp = [...A].filter((x) => O.has(x)).length;
  const precision = A.size ? tp / A.size : (O.size ? 0 : 1);
  const recall = O.size ? tp / O.size : (A.size ? 0 : 1);
  return { applicable: true, precision, recall, tp, actualN: A.size, oracleN: O.size };
};

const isExplicitSearchRequest = (q) => /(^|\b)(find|search|show matching|list nodes|find nodes)\b/i.test(String(q || ""));

const hasMeaningfulEvidence = (intent, result) => {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  const summary = result?.summary || {};
  if (rows.length > 0) return true;
  if (intent === "donor_overlap_between_models" || intent === "training_donor_overlap_between_models") {
    return typeof summary.overlapCount === "number";
  }
  if (intent === "embedding_leakage_between_models") {
    return typeof summary.overlapCount === "number" || typeof summary.leakageCount === "number";
  }
  if (intent === "reclassification_distribution_impact") {
    return !!summary.before && !!summary.after;
  }
  return false;
};

const scoreAnswerAdequacy = ({ question, oracleIntent, answer, oracleRows, oracleResult }) => {
  const q = String(question || "").toLowerCase();
  const a = String(answer || "").toLowerCase();
  const oracleEvidence = hasMeaningfulEvidence(oracleIntent, oracleResult);

  if (oracleIntent === "search_nodes" || isExplicitSearchRequest(question)) {
    return { ok: /found|matching node|candidate|node\(s\)/i.test(answer || ""), reason: "explicit_search" };
  }

  if (!oracleEvidence) {
    const ok = /no (matching )?(records|evidence|results)|cannot find|not available|missing/i.test(answer || "");
    return { ok, reason: "no_oracle_evidence" };
  }

  if (q.includes("which models are downstream")) {
    const ok = /downstream models/i.test(answer || "") && /\b\d+\b/.test(answer || "");
    return { ok, reason: "impact_models_focus" };
  }
  if (q.includes("which datasets are downstream")) {
    const ok = /downstream datasets/i.test(answer || "") && /\b\d+\b/.test(answer || "");
    return { ok, reason: "impact_datasets_focus" };
  }
  if (q.includes("qc pipeline version")) {
    const ok = /pipeline/i.test(answer || "") && /version/i.test(answer || "");
    return { ok, reason: "pipeline_version_focus" };
  }
  if (q.includes("metadata") || q.includes("details") || q.includes("properties")) {
    const hit = ["age", "sex", "diagnosis", "disease", "ethnicity", "ancestry", "bmi"].filter((k) => a.includes(k)).length;
    return { ok: hit >= 2, reason: "node_metadata_focus" };
  }
  if (q.includes("compliance status")) {
    const ok = /compliance/i.test(answer || "");
    return { ok, reason: "compliance_focus" };
  }
  if (q.includes("disease stage distribution") || q.includes("proportion")) {
    const ok = /distribution|composition|proportion|t1d|nd|t2d/i.test(answer || "");
    return { ok, reason: "distribution_focus" };
  }
  if (q.includes("overlap") || q.includes("appear in")) {
    const ok = /overlap|shared donors|donors/i.test(answer || "") && /\b\d+\b/.test(answer || "");
    return { ok, reason: "overlap_focus" };
  }
  if (q.includes("provenance chain")) {
    const ok = /provenance chain|chain contains|->/i.test(answer || "");
    return { ok, reason: "provenance_focus" };
  }
  if (q.includes("change log")) {
    const ok = /change log|event|no .*change log|cannot find/i.test(answer || "");
    return { ok, reason: "changelog_focus" };
  }

  return { ok: (answer || "").trim().length > 0, reason: "generic_nonempty" };
};

const scoreGraphConsistency = ({ oracleIntent, finalIntent, oracleRows, actualRows, metric, answer, oracleResult }) => {
  if (oracleIntent === "search_nodes" && finalIntent === "search_nodes") {
    return { ok: true, reason: "search_grounding" };
  }
  if (!finalIntent || finalIntent === "(none)") {
    if ((oracleRows?.length || 0) === 0) {
      const ok = /no (matching )?(records|evidence|results)|cannot find|not available|missing/i.test(answer || "");
      return { ok, reason: "none_intent_with_empty_oracle" };
    }
    return { ok: false, reason: "none_intent_with_nonempty_oracle" };
  }
  if (metric?.applicable) {
    const ok = (metric.precision >= 0.95 && metric.recall >= 0.95) || ((oracleRows.length === 0) && (actualRows.length === 0));
    return { ok, reason: "row_key_match" };
  }
  if ((oracleRows?.length || 0) === (actualRows?.length || 0)) {
    return { ok: true, reason: "row_count_match_fallback" };
  }
  if (hasMeaningfulEvidence(oracleIntent, oracleResult) === hasMeaningfulEvidence(finalIntent, { rows: actualRows })) {
    return { ok: true, reason: "evidence_match_fallback" };
  }
  return { ok: false, reason: "inconsistent_fallback" };
};

const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });

const results = [];
let graphMeta = null;

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /Governance Agent/i }).click({ timeout: 20000 });

  graphMeta = await page.evaluate(() => {
    const dbg = window.__KG_DEBUG__;
    if (!dbg) return null;
    const nodes = typeof dbg.getNodes === "function" ? dbg.getNodes() : [];
    const edges = typeof dbg.getEdges === "function" ? dbg.getEdges() : [];
    const nodeTypes = [...new Set((nodes || []).map((n) => String(n.type || "Unknown")))].sort();
    const edgeLabels = [...new Set((edges || []).map((e) => String(e.label || "")))].filter(Boolean).sort();
    return { nodeCount: nodes.length, edgeCount: edges.length, nodeTypes, edgeLabels };
  });

  for (const c of CASES) {
    const clearBtn = page.getByRole("button", { name: /Clear/i });
    if (await clearBtn.isVisible().catch(() => false)) await clearBtn.click();

    const input = page.getByPlaceholder(/Ask a governance question/i);
    const t0 = Date.now();
    await input.fill(c.question);
    await input.press("Enter");

    await page.waitForSelector("text=LangGraph - route", { timeout: 60000 });
    await page.waitForSelector("text=/LangGraph run completed in/", { timeout: 120000 });
    const latencyMs = Date.now() - t0;

    const intentTexts = await page.locator("text=/Intent:/").allInnerTexts();
    const paramsTexts = await page.locator("text=/params:/").allInnerTexts();
    const chipTexts = await page.locator("text=/[a-z_]+\s+\d+\s+rows/").allInnerTexts();

    const intentSeq = intentTexts.map((t) => clean(String(t || "").replace(/^.*Intent:\s*/i, ""))).filter(Boolean);
    const paramsSeq = paramsTexts.map(parseParams);
    const chipIntents = chipTexts.map(parseIntentFromChip).filter(Boolean);

    const finalIntent = intentSeq[intentSeq.length - 1] || chipIntents[chipIntents.length - 1] || "(none)";
    const finalParams = paramsSeq[paramsSeq.length - 1] || {};

    const computed = await page.evaluate(({ finalIntent, finalParams, oracle }) => {
      const dbg = window.__KG_DEBUG__;
      if (!dbg || typeof dbg.queryGraph !== "function") return { oracle: null, actual: null };
      const oracleResult = dbg.queryGraph(oracle.intent, oracle.params || {});
      const actualResult = finalIntent && finalIntent !== "(none)"
        ? dbg.queryGraph(finalIntent, finalParams || {})
        : null;
      return { oracle: oracleResult, actual: actualResult };
    }, { finalIntent, finalParams, oracle: c.oracle });

    const oracleRows = Array.isArray(computed?.oracle?.rows) ? computed.oracle.rows : [];
    const actualRows = Array.isArray(computed?.actual?.rows) ? computed.actual.rows : [];
    const metric = pr(oracleRows, actualRows, c.oracle.intent);

    const answer = await page.evaluate(() => {
      const bubbles = [...document.querySelectorAll("div")].filter((el) => {
        const st = el.style || {};
        return st.alignSelf === "flex-start" && st.whiteSpace === "pre-wrap";
      });
      const last = bubbles[bubbles.length - 1];
      return last ? String(last.innerText || "").trim() : "";
    });

    const intentMatch = finalIntent === c.oracle.intent;
    const adequacy = scoreAnswerAdequacy({
      question: c.question,
      oracleIntent: c.oracle.intent,
      answer,
      oracleRows,
      oracleResult: computed?.oracle,
    });
    const consistency = scoreGraphConsistency({
      oracleIntent: c.oracle.intent,
      finalIntent,
      oracleRows,
      actualRows,
      metric,
      answer,
      oracleResult: computed?.oracle,
    });
    const finalVerdict = adequacy.ok && consistency.ok ? "PASS" : (adequacy.ok || consistency.ok ? "PARTIAL" : "FAIL");
    const touchedNodeTypes = new Set();
    const touchedEdgeLabels = new Set();
    for (const r of actualRows) {
      if (r?.type) touchedNodeTypes.add(String(r.type));
      if (r?.fromType) touchedNodeTypes.add(String(r.fromType));
      if (r?.toType) touchedNodeTypes.add(String(r.toType));
      if (r?.edgeLabel) touchedEdgeLabels.add(String(r.edgeLabel));
    }

    results.push({
      id: c.id,
      group: c.group,
      question: c.question,
      oracleIntent: c.oracle.intent,
      finalIntent,
      intentMatch,
      latencyMs,
      oracleRowCount: oracleRows.length,
      actualRowCount: actualRows.length,
      precision: metric.applicable ? metric.precision : null,
      recall: metric.applicable ? metric.recall : null,
      metricApplicable: metric.applicable,
      answeredUserQuestion: adequacy.ok,
      answerReason: adequacy.reason,
      graphConsistent: consistency.ok,
      consistencyReason: consistency.reason,
      finalVerdict,
      touchedNodeTypes: [...touchedNodeTypes],
      touchedEdgeLabels: [...touchedEdgeLabels],
      answerPreview: clean(answer).slice(0, 260),
    });
  }
} finally {
  await browser.close();
}

const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / Math.max(1, results.length);
const intentAcc = results.filter((r) => r.intentMatch).length / Math.max(1, results.length);
const answerAcc = results.filter((r) => r.answeredUserQuestion).length / Math.max(1, results.length);
const graphAcc = results.filter((r) => r.graphConsistent).length / Math.max(1, results.length);
const passCount = results.filter((r) => r.finalVerdict === "PASS").length;
const partialCount = results.filter((r) => r.finalVerdict === "PARTIAL").length;
const failCount = results.filter((r) => r.finalVerdict === "FAIL").length;
const metricRows = results.filter((r) => r.metricApplicable);
const avgPrecision = metricRows.length ? metricRows.reduce((s, r) => s + (r.precision ?? 0), 0) / metricRows.length : null;
const avgRecall = metricRows.length ? metricRows.reduce((s, r) => s + (r.recall ?? 0), 0) / metricRows.length : null;

const touchedNodeTypesAll = [...new Set(results.flatMap((r) => r.touchedNodeTypes))].sort();
const touchedEdgeLabelsAll = [...new Set(results.flatMap((r) => r.touchedEdgeLabels))].sort();
const nodeTypeCoverage = graphMeta?.nodeTypes?.length ? touchedNodeTypesAll.length / graphMeta.nodeTypes.length : null;
const edgeLabelCoverage = graphMeta?.edgeLabels?.length ? touchedEdgeLabelsAll.length / graphMeta.edgeLabels.length : null;

const lines = [];
lines.push("# Expanded Agent Eval Report");
lines.push("");
lines.push(`Base URL: ${baseUrl}`);
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push("## Summary");
lines.push(`- Total questions: ${results.length}`);
lines.push(`- Intent match rate: ${(intentAcc * 100).toFixed(1)}%`);
lines.push(`- Answered-user-question rate (primary): ${(answerAcc * 100).toFixed(1)}%`);
lines.push(`- Graph-consistency rate (primary): ${(graphAcc * 100).toFixed(1)}%`);
lines.push(`- Final verdicts: PASS ${passCount}, PARTIAL ${partialCount}, FAIL ${failCount}`);
lines.push(`- Avg processing time: ${avgLatency.toFixed(1)} ms`);
lines.push(`- Avg precision (applicable cases): ${avgPrecision === null ? "N/A" : avgPrecision.toFixed(3)}`);
lines.push(`- Avg recall (applicable cases): ${avgRecall === null ? "N/A" : avgRecall.toFixed(3)}`);
lines.push("- Note: precision/recall are auxiliary set-match metrics only; primary evaluation is answer adequacy + graph consistency.");
lines.push(`- Metrics-applicable questions: ${metricRows.length}/${results.length}`);
if (graphMeta) {
  lines.push(`- Graph nodes/edges: ${graphMeta.nodeCount}/${graphMeta.edgeCount}`);
  lines.push(`- Node-type coverage (actual-result touched): ${touchedNodeTypesAll.length}/${graphMeta.nodeTypes.length} (${((nodeTypeCoverage || 0) * 100).toFixed(1)}%)`);
  lines.push(`- Edge-label coverage (actual-result touched): ${touchedEdgeLabelsAll.length}/${graphMeta.edgeLabels.length} (${((edgeLabelCoverage || 0) * 100).toFixed(1)}%)`);
  lines.push(`- Node types touched: ${touchedNodeTypesAll.join(", ") || "none"}`);
  lines.push(`- Edge labels touched: ${touchedEdgeLabelsAll.join(", ") || "none"}`);
}

lines.push("");
lines.push("## Per-question Results");
lines.push("| ID | Group | Oracle Intent | Final Intent | Answered Q? | Graph Consistent? | Verdict | Latency (ms) | Oracle Rows | Actual Rows | Precision | Recall |");
lines.push("|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|");
for (const r of results) {
  lines.push(`| ${r.id} | ${r.group} | ${r.oracleIntent} | ${r.finalIntent} | ${r.answeredUserQuestion ? "Y" : "N"} | ${r.graphConsistent ? "Y" : "N"} | ${r.finalVerdict} | ${r.latencyMs} | ${r.oracleRowCount} | ${r.actualRowCount} | ${r.metricApplicable ? r.precision.toFixed(3) : "N/A"} | ${r.metricApplicable ? r.recall.toFixed(3) : "N/A"} |`);
}

lines.push("");
lines.push("## Answer Previews");
for (const r of results) {
  lines.push("");
  lines.push(`### ${r.id}`);
  lines.push(`- Question: ${r.question}`);
  lines.push(`- Oracle intent: ${r.oracleIntent}`);
  lines.push(`- Final intent: ${r.finalIntent}`);
  lines.push(`- Answered question: ${r.answeredUserQuestion ? "Y" : "N"} (${r.answerReason})`);
  lines.push(`- Graph consistent: ${r.graphConsistent ? "Y" : "N"} (${r.consistencyReason})`);
  lines.push(`- Verdict: ${r.finalVerdict}`);
  lines.push(`- Latency: ${r.latencyMs} ms`);
  lines.push(`- Preview: ${r.answerPreview || "(empty)"}`);
}

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/expanded-agent-eval-report.md", lines.join("\n"), "utf8");
console.log("Wrote reports/expanded-agent-eval-report.md");
