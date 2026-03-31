# MAI-T1D Demo — Implementation Guide for Pending UI Changes

Based on the priority checklist from `image.png` (March review), this guide explains
exactly how to implement each of the 6 required changes in the dev branch
(`qyniu/mai-t1d-demo0316`, branch `dev`).

All edits are in **`src/App.jsx`** unless otherwise noted.

---

## Change 1 — Impact Analysis: "Consent Withdrawn (Type C)" Label & Trigger Text

**Problem:** The `deprecation` scenario in the Impact Analysis tab uses a label and trigger
text that don't match the paper. The paper defines this scenario as a policy-driven
archival event, not a consent withdrawal.

**File:** `src/App.jsx`, line ~70 (inside the `IMPACT` object)

### Step 1 — Update the scenario label

Find this line (approx. line 70):
```js
deprecation:{ label:" Consent Withdrawn (Type C)", trigger:"proc_wgs", ...
```

Change `label` to:
```js
deprecation:{ label:" Policy-Driven Archival (Type C)", trigger:"proc_wgs", ...
```

### Step 2 — Update the trigger text

Find this block (approx. line 652–656), inside the `ImpactView` render:
```js
:sc==="deprecation" ? "HPAP-088 WGS data retracted ?consent withdrawn 2025-Q2. Raw data deprecated, downstream models on compliance hold."
```

Replace with:
```js
:sc==="deprecation" ? "V2.1.1 policy change: CellRanger processed files archived across ~60 donors. Raw data unaffected — only downstream artifacts trained on processed files flagged."
```

> **Why:** The paper defines Type C as a policy-driven archival event (not a per-donor
> consent withdrawal). The trigger text must reflect the V2.1.1 CellRanger archival
> scenario so reviewers can match it directly to the paper's example.

---

## Change 2 — Governance Agent: Replace Suggested Questions with CQ1–CQ8

**Problem:** The `SUGGESTIONS` array (7 items) does not map to the 8 Competency Questions
(CQ1–CQ8) defined in the paper. Reviewers cannot verify the claim "all 8 CQs answerable"
because the demo shows different questions.

**File:** `src/App.jsx`, lines ~1097–1105 (the `SUGGESTIONS` constant)

### Current code
```js
const SUGGESTIONS = [
  "What datasets trained Single-cell FM?",
  "Which models used scRNA data?",
  "Is any model on compliance hold?",
  "Show the provenance chain for Genomic FM",
  "What downstream tasks does Single-cell FM enable?",
  "Who ran the WGS pipeline?",
  "Which Dataset Cards does the Genomic FM Model Card link to?",
];
```

### Replacement

Replace the entire array with the 8 standard CQs from the paper (copy the exact wording
from Table 1 / Section 4 of the paper — the strings below are placeholder labels;
substitute the exact paper text):

```js
const SUGGESTIONS = [
  // CQ1
  "Which raw datasets were used to train [model]?",
  // CQ2
  "What QC pipeline produced [processed dataset]?",
  // CQ3
  "Which models have a TRAINED_ON edge to [dataset]?",
  // CQ4
  "Is any model currently on compliance hold?",
  // CQ5
  "Show the full provenance chain for [model].",
  // CQ6
  "Which downstream tasks does [model] enable?",
  // CQ7
  "Which Dataset Card and Model Card are linked via LINKED_TO?",
  // CQ8
  "What is the impact if [node] is deprecated or revised?",
];
```

> **Important:** Replace the placeholder strings above with the verbatim CQ1–CQ8
> wording from the paper. The count must be exactly 8.

> **Why:** The paper claims the KG can answer all 8 CQs. Having them as clickable
> suggestion chips lets a reviewer immediately verify that claim during a live demo.

---

## Change 3 — Governance Agent: Remove "Mode 4" Label

**Problem:** The header above the chat panel reads `AI Agent Interface — Mode 4`, but
the paper defines this interface as Mode 1 / Governed UI. The "Mode 4" label
contradicts the paper's mode taxonomy.

**File:** `src/App.jsx`, line ~1287 (inside `AgentView`)

### Current code
```js
<div style={{ fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#94a3b8",
  letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>
  AI Agent Interface ?Mode 4
</div>
```

### Option A — Remove the "Mode 4" label entirely (recommended)
Delete the entire `<div>` element above, leaving only the `MAI-T1D Governance Agent`
heading below it.

### Option B — Change to "Mode 1 / Governed UI"
```js
<div style={{ fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#94a3b8",
  letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>
  Mode 1 / Governed UI
</div>
```

> **Why:** The paper's mode taxonomy reserves Mode 4 for a different interface type.
> Showing "Mode 4" to a reviewer creates a direct contradiction with the paper text.

---

## Change 4 — Page Title Tag: Reflect 9 Modalities

**Problem:** The subtitle in the top bar reads `HPAP scRNA-seq  W3C PROV  Knowledge Graph`,
which implies only scRNA-seq data. The system covers 9 modalities.

**File:** `src/App.jsx`, line ~1538 (inside the top bar `<div>`)

### Current code
```js
<span style={{ marginLeft:10, fontSize:p?12:10, color:"#64748b", fontFamily:"monospace" }}>
  HPAP scRNA-seq  W3C PROV  Knowledge Graph
</span>
```

### Replacement
```js
<span style={{ marginLeft:10, fontSize:p?12:10, color:"#64748b", fontFamily:"monospace" }}>
  HPAP · Multi-modal · W3C PROV · Knowledge Graph
</span>
```

**Optional — also update `index.html` `<title>` tag** (line 6):
```html
<!-- current -->
<title>KG Demo v9</title>

<!-- updated -->
<title>MAI-T1D · Multi-modal Provenance KG</title>
```

> **Why:** The paper describes 9 modalities (scRNA-seq, scATAC-seq, WGS, Spatial CODEX,
> Spatial IMC, snMultiome, TEA-seq, Flow Cytometry, Clinical Metadata). The subtitle
> must reflect that scope.

---

## Change 5 — Provenance Log Entry: Update Subtitle Text

**Problem:** The Provenance Log Entry panel subtitle reads `Mode 1 — Manual Provenance Log`.
The paper's terminology is `MODE 1 | GOVERNED UI · AI-ASSISTED PROVENANCE LOG`.

**File:** `src/App.jsx`, line ~274 (inside `LogView`)

### Current code
```js
<div style={{ fontSize:p?13:11, fontFamily:"monospace", color:"#94a3b8",
  letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>
  Mode 1 ?Manual Provenance Log
</div>
```

### Replacement
```js
<div style={{ fontSize:p?13:11, fontFamily:"monospace", color:"#94a3b8",
  letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>
  MODE 1 | GOVERNED UI · AI-ASSISTED PROVENANCE LOG
</div>
```

> **Why:** "Manual" implies no AI assistance, which contradicts the paper's description
> of Mode 1 as a governed UI with AI-assisted provenance logging. The updated text
> aligns with the paper's terminology and mode definitions.

---

## Change 6 — Node Count Consistency

**Problem:** The top bar and the Governance Agent footer both display live node/edge
counts dynamically from `NODES.length` and `EDGES.length`. These numbers must match
what will be reported in the paper's graph statistics table (the `[TC ↓ L]` cell).

**File:** `src/App.jsx`, lines ~1376 and ~1541 (two locations)

### Location A — Governance Agent footer (line ~1376)

```js
: `${NODES.length} nodes  ${EDGES.length} edges  ${EDGES.filter(e=>e.label==="TRAINED_ON").length} TRAINED_ON  ${EDGES.filter(e=>e.label==="LINKED_TO").length} LINKED_TO`}
```

This is already **dynamic** — it reads from `NODES` and `EDGES` arrays in `graphData.js`.
No code change is needed here as long as `graphData.js` is kept up to date.

### Location B — Top bar badges (line ~1541)

```js
{[["#3b82f6",`${NODES.length} nodes`],["#10b981",`${EDGES.length} edges`],["#f43f5e","Model Card ?Dataset Card"]].map(...)}
```

This is also dynamic. Again, no code change needed here.

### Action required: update `src/graphData.js` to match the paper

The current graph has **~21 nodes** and **23 edges** (as counted in the dev branch on
2026-03-31). Before the paper is finalized, do the following:

1. Determine the final node and edge counts that will appear in the paper's
   graph statistics table.
2. Add or remove nodes/edges in `src/graphData.js` until `NODES.length` and
   `EDGES.length` match those final numbers exactly.
3. Also verify that `EDGES.filter(e => e.label === "TRAINED_ON").length` and
   `EDGES.filter(e => e.label === "LINKED_TO").length` match the TRAINED_ON and
   LINKED_TO sub-counts in the paper.

> **Why:** If the demo shows different counts than the paper, reviewers will notice
> the discrepancy. Because the display is already driven by the live data, fixing
> `graphData.js` fixes both display locations simultaneously.

---

## Summary Checklist

| # | File | Location (approx. line) | Change |
|---|------|------------------------|--------|
| 1a | `src/App.jsx` | Line 70 — `IMPACT.deprecation.label` | `"Consent Withdrawn (Type C)"` → `"Policy-Driven Archival (Type C)"` |
| 1b | `src/App.jsx` | Line 655 — trigger text string | Update to V2.1.1 CellRanger archival wording |
| 2 | `src/App.jsx` | Lines 1097–1105 — `SUGGESTIONS` array | Replace 7 items with exact CQ1–CQ8 from paper |
| 3 | `src/App.jsx` | Line 1287 — `AgentView` header | Remove or replace `"AI Agent Interface — Mode 4"` |
| 4a | `src/App.jsx` | Line 1538 — top bar subtitle | `"HPAP scRNA-seq W3C PROV Knowledge Graph"` → `"HPAP · Multi-modal · W3C PROV · Knowledge Graph"` |
| 4b | `index.html` | Line 6 — `<title>` | Optional: update to reflect multi-modal scope |
| 5 | `src/App.jsx` | Line 274 — `LogView` subtitle | `"Mode 1 — Manual Provenance Log"` → `"MODE 1 \| GOVERNED UI · AI-ASSISTED PROVENANCE LOG"` |
| 6 | `src/graphData.js` | `NODES` / `EDGES` arrays | Sync node and edge counts with final paper statistics |
