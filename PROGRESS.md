# Project Progress: HCA Census PoC
**Last updated:** 2026-04-01

---

## Status Overview

| Phase | Description | Status |
|---|---|---|
| 0 | Local setup | ✅ Done |
| 1 | Understand current HPAP demo | ✅ Done |
| 2 | Gather HCA Census metadata | ✅ Done |
| 3 | Build HCA node/edge definitions | ✅ Done |
| 4 | Integrate into demo + verify all 4 views | ✅ Done |
| 5 | Write GENERALIZABILITY_REPORT.md | ✅ Done |

---

## Phase 0 — Local Setup ✅

- `npm install` — done
- `.env` with Anthropic API key — done
- On `dev` branch — confirmed
- Dev server runs at `localhost:5173` — confirmed
- All 4 UI views working — confirmed
- Governance Agent fix applied (intent descriptions in AGENT_TOOLS) — done

---

## Phase 1 — Understand Current HPAP Demo ✅

### Full lineage mapped

**scFM-T1D** (single modality):
```
raw_scrna → qc_scrna → proc_scrna → dc_scrna
                              ↓
                         model_scfm → mc_scfm → dc_scrna (LINKED_TO)
                              ↓
                    task_celltype, task_deconv
```

**Genomic FM** (3 modalities):
```
raw_scrna → qc_scrna → proc_scrna ──┐
raw_atac  → qc_atac  → proc_atac  ──┼→ model_genomic → mc_genomic → dc_scrna/atac/wgs
raw_wgs   → qc_wgs   → proc_wgs   ──┘        ↓
                                     task_eqtl, task_epigenome
```

### Key detail fields per node type (must replicate for HCA)

| Node type | Key detail fields |
|---|---|
| RawData | Modality, Donors, Source, Platform, Access, Checksum |
| Pipeline | Version, Tool, GitHub, Executor, Institution, SLURM Job |
| ProcessedData | Version, Cells before/after QC, Format, Deprecated |
| DatasetCard | Standard, Format, GitHub, Consent, Known biases, Status |
| Model | Version, Architecture, Primary metric, Eval set, Status, Compliance hold |
| ModelCard | Standard, Format, GitHub, Linked dataset card(s), Intended use |
| DownstreamTask | Task type, Model, Description, Status |

### Notes
- `1ea9c376` is an orphan auto-committed test node — do not replicate in HCA
- `proc_scrna` feeds both models — HCA processed data will do the same
- `mc_genomic` links to 3 dataset cards — HCA equivalent will link to all tissue DatasetCards

---

## Phase 2 + 3 — HCA Metadata + Node/Edge Definitions ✅

**Total nodes:** 18 | **Total edges:** 28
**Metadata source:** Constructed from public HCA Census documentation (mentor approved: "没有metadata就自己做")

### Nodes built

| Type | ID | Label |
|---|---|---|
| RawData | raw_hca_heart | HCA Census: Heart (~500K cells, ~140 donors) |
| RawData | raw_hca_lung | HCA Census: Lung (~2.4M cells, ~400 donors) |
| RawData | raw_hca_brain | HCA Census: Brain (~3.4M cells, ~300 donors) |
| Pipeline | qc_census | CELLxGENE Schema QC v5.1.0 (shared across all tissues) |
| ProcessedData | proc_hca_heart | HCA Heart Atlas v1.0 |
| ProcessedData | proc_hca_lung | HLCA Core v2.0 |
| ProcessedData | proc_hca_brain | HCA Brain Atlas v1.0 |
| DatasetCard | dc_hca_heart | Dataset Card (HCA Heart v1.0) |
| DatasetCard | dc_hca_lung | Dataset Card (HLCA v2.0) |
| DatasetCard | dc_hca_brain | Dataset Card (HCA Brain v1.0) |
| Model | model_scgpt | scGPT v1 — ~51M params, trained on 33M cells |
| Model | model_geneformer | Geneformer v2 — ~10M params, trained on 29.9M cells |
| ModelCard | mc_scgpt | Model Card (scGPT v1) |
| ModelCard | mc_geneformer | Model Card (Geneformer v2) |
| DownstreamTask | task_celltype_pan | Pan-tissue Cell-type Classification |
| DownstreamTask | task_perturbation | Perturbation Response Prediction |
| DownstreamTask | task_gene_network | Gene Network Inference |
| DownstreamTask | task_disease_gene | Disease Gene Prioritization |

### Key structural difference vs HPAP
- HPAP: one pipeline per modality (3 pipelines) → HCA: one shared CELLxGENE QC schema for all tissues (1 pipeline)
- All 3 tissues feed both models (6 TRAINED_ON edges vs HPAP's 4)
- Both ModelCards LINKED_TO all 3 DatasetCards (6 LINKED_TO edges vs HPAP's 4)

### Files modified
- `src/graphData.js` — full NODES + EDGES replacement
- `src/App.jsx` lines 60–117 — GRAPH_MODES, IMPACT, NODE_OPTIONS, INSTITUTIONS, MODALITIES

---

## Phase 4 — Integrate + Verify All 4 Views ✅

### Issues found and fixed
1. **Graph mode buttons showing HPAP labels** — `GRAPH_MODES` constant was correctly updated but a second hardcoded `GMODES` array at line 1453 in App.jsx was also controlling the UI buttons. Fixed by updating `GMODES` to match new HCA keys/labels.
2. **`CUSTOM_NODE_OPTIONS`** (Impact Analysis custom trigger dropdown) still listed HPAP node IDs — replaced with HCA nodes.
3. **`ORDER` array** still listed HPAP node IDs — updated to HCA node IDs.
4. **`SUGGESTIONS`** (Governance Agent clickable prompts) still referenced HPAP names — replaced with HCA-specific questions.
5. **Agent tool `params` description** still cited HPAP node IDs as examples — updated to HCA IDs.
6. **Root cause:** Vite HMR did not pick up all App.jsx changes — required full server restart (`Ctrl+C` → `npm run dev`) to apply.

### All 4 views verified ✅

| View | Result |
|---|---|
| Provenance Graph | 18 HCA nodes render correctly; node detail panels show HCA metadata; all 4 subgraph modes work (Full / scGPT lineage / Geneformer lineage / HCA Heart downstream) |
| Impact Analysis | All 3 scenarios correct: Census Version Updated (6 affected, 4 outdated), Annotation Retracted (6 affected, 4 outdated), QC Schema Updated (9 affected, 5 outdated) |
| Provenance Log Entry | HCA node instances, HCA institutions, HCA modalities all showing correctly |
| Governance Agent | All 3 test queries passed (see below) |

### Governance Agent queries verified ✅

| Query | Intent routed | Result | Pass? |
|---|---|---|---|
| What datasets trained scGPT? | `datasets_for_model` | HCA Heart Atlas, HLCA Core, HCA Brain Atlas | ✅ |
| Which models are affected if the lung atlas is revised? | `models_for_dataset` | scGPT v1, Geneformer v2 | ✅ |
| What is the compliance status of Geneformer? | `compliance_status` | Active, no hold | ✅ |

### Conceptual clarification logged
Changing `graphData.js` is equivalent to loading data into a database — it is **data change, not schema change**. The PROV core (node types, edge vocabulary, governance logic) was untouched. Schema generalizability holds. A production version would read from a JSON config file so external labs don't need to touch source code — noted as future work.

---

## Post-Phase 5 — Cleanup: Remaining Hardcoded HPAP References ✅

After writing the report, a full scan of `src/App.jsx` found additional HPAP/MAI-T1D text still hardcoded in the UI. All visible references fixed:

| Location | Old value | New value |
|---|---|---|
| Impact scenario trigger descriptions (lines 652–654) | "HPAP-016 scRNA data revised…", "CellRanger processed files…", "scRNA QC pipeline updated…" | HCA-appropriate descriptions for each scenario |
| Default custom node in Impact Analysis | `qc_scrna` (no longer exists) | `qc_census` |
| Agent system prompt | "MAI-T1D (Multimodal AI for Type 1 Diabetes)" | "HCA Census provenance knowledge graph" |
| Agent tool description | "MAI-T1D provenance graph" | "HCA Census provenance graph" |
| Agent suggestion CQ8 | "Which Vanderbilt datasets were used post-2024?" | "Which datasets were used after the Census v2024 release?" |
| Agent panel header | "MAI-T1D Governance Agent" | "HCA Census Governance Agent" |
| Agent empty state description | "query the MAI-T1D provenance graph" | "query the HCA Census provenance graph" |
| App title bar | "MAI-T1D Data Traceability & Model Governance" | "HCA Census Data Traceability & Model Governance" |
| App subtitle | "HPAP · Multi-modal · W3C PROV · Knowledge Graph" | "CZ CELLxGENE · Pan-tissue · W3C PROV · Knowledge Graph" |

**Left intentionally unchanged (not visible in demo or correct as-is):**
- Lines 26–35: HAS_DONOR expansion feature generates HPAP-style donor IDs — feature not applicable to HCA tissue-level data but does not activate unless explicitly clicked
- Form field placeholder text (greyed-out hint text, not actual content)
- Line 1069: "based on the MAI-T1D framework" in system prompt — accurate and intentional

---

## Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-04-01 | Use HCA Census as external dataset | Same modality (scRNA-seq) as scFM, open access, no DUA |
| 2026-04-01 | Work from `dev` branch | Most up-to-date per mentor |
| 2026-04-01 | Fixed Governance Agent intent routing | `models_for_dataset` was being misrouted to `downstream_tasks` |

---

## Blockers / Open Questions

- [ ] Should HCA work go on a separate branch off `dev`, or directly on `dev`?
- [ ] Does Kai have a preferred tissue for the demo (Heart / Lung / Brain)?
- [ ] Does Kai have Table 3 schema mapping template already started?
- [ ] Are checklist items #12/#13 (cross-model overlap) part of this task?
