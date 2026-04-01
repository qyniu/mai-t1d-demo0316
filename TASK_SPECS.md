# Task Specs: Minimal PoC Deployment on External Dataset
**Owner:** Qingyuan Niu
**Project:** MAI-T1D — Provenance Knowledge Graph Generalizability Testing
**Date:** 2026-04-01
**Mentor Directive:** Pick the simplest external dataset, find its metadata, and prove the KG schema can ingest it and return governance queries — without modifying the PROV core.

---

## 1. Background: What This System Is

The MAI-T1D framework is a **Provenance Knowledge Graph (KG)** that tracks the full AI data lineage chain:

```
Raw Data → QC Pipeline → Processed Dataset → Model Configuration → Downstream Task
```

It answers two governance questions:
- **Q1:** What data produced a given model?
- **Q2:** Which models are affected when upstream data changes?

The current demo is a **React + D3 web UI** with **no live database** — all 21 nodes and 23 edges are hardcoded in JavaScript (`src/graphData.js`). There is no Neo4j, no Cypher — graph traversal is done with custom JavaScript (BFS/DFS over arrays). The governance agent uses Claude via a Vercel API proxy.

### What the Demo Has Right Now (MAI-T1D / HPAP)

| Component | What's There |
|---|---|
| Node types | RawData, Pipeline, ProcessedData, DatasetCard, Model, ModelCard, DownstreamTask |
| Nodes | 21 hardcoded HPAP nodes (HPAP-002 donors, scRNA/genomic pipelines, scFM/genomic models) |
| Edges | 23 hardcoded edges (USED, WAS_GENERATED_BY, TRAINED_ON, DOCUMENTED_BY, LINKED_TO, ENABLES) |
| UI Views | Provenance Graph, Impact Analysis, Provenance Log Entry, Governance Agent |
| Data files | demo_raw_scrna.csv, demo_proc_scrna.csv, demo_model_eval.csv (HPAP-specific) |
| Backend | Python CLI (Auto-profiling_demo.py), Vercel serverless proxy for Claude |

### What the Manuscript Claims (But Hasn't Proven)

> *"In-silico schema mapping demonstrates zero PROV core modification required for deployment across HCA Census, ENCODE, GTEx, and MIMIC-IV."*

**The limitation the paper explicitly acknowledges:**
> *"Cross-domain deployment on at least one additional project is required before generalizability claims can be made empirically."*

**Your job is to be that empirical proof.**

---

## 2. Your Specific Task

> Duplicate the current demo node structure for one external dataset. Change node names, labels, and metadata to match the external dataset. Prove that:
> 1. The KG schema can ingest the external dataset's metadata
> 2. Governance queries still return meaningful results
> 3. Zero PROV core modification was needed

This is a **minimal PoC** — not a full deployment. You do not need to:
- Set up a real Neo4j database
- Write Cypher queries
- Connect to live APIs
- Change the governance logic or UI architecture

You **do** need to:
- Choose one external dataset
- Find or construct representative metadata
- Replace NODES/EDGES in `src/graphData.js` and update GRAPH_MODES/IMPACT/INSTITUTIONS/MODALITIES in `src/App.jsx` with external-dataset equivalents
- Verify all 4 UI views still work
- Document what changed vs. what stayed the same (this is the proof)

---

## 3. Choosing the External Dataset

**Mentor's recommendation:** Pick the simplest one first.

### Candidate Comparison

| Dataset | Modality | Why Easy | Why Hard | Recommendation |
|---|---|---|---|---|
| **HCA Census** (CZ CELLxGENE) | scRNA-seq (pan-tissue) | Same modality as scFM, open access, well-documented metadata schema, public API | Large scale (500M+ cells) | **Best first choice** |
| ENCODE | Functional genomics | Open access, structured metadata | Different modality from current demo | Second choice |
| GTEx | Bulk RNA + eQTL | Open access | Less similar to T1D context | Third choice |
| MIMIC-IV | EHR / clinical | Very different (clinical, not omics) | Schema least similar to current nodes | Last resort |
| **TEDDY NCC1** | Longitudinal immunological | Already partially in KG, T1D-adjacent | Restricted access (DUA required) | Skip for now |

**Recommendation: Use HCA Census.** It is single-cell RNA-seq — the same modality as the scFM model in the current demo — meaning the node structure maps almost directly. Metadata is freely available via the CZ CELLxGENE Census API and web portal.

---

## 4. What You Know Going In

### About the Current System (dev branch — two-file data split)

On the `dev` branch, KG data is split across two files:

**`src/graphData.js`** — the data layer (your primary edit target):
- `NODES` array — 21 HPAP nodes; structure: `{ id, label, type, detail: { key: value, ... } }`
- `EDGES` array — 23 edges; structure: `{ source, target, label }` (plus optional `train` object for TRAINED_ON edges)
- `TYPE`, `EDGE_STYLE`, `EDGE_LEGEND` — visual styling (node colors, edge dash patterns)

**`src/App.jsx`** — the UI logic layer (secondary edit target — data constants only):
- `GRAPH_MODES` — defines the 4 subgraph filter views (full, scfm, genomic, hpap002); node ID lists must match your new node IDs
- `IMPACT` — 3 governance scenarios (revision, deprecation, pipeline); trigger and affected node IDs must match your new nodes
- `NODE_OPTIONS` — Provenance Log Entry form fields; instance lists reference HPAP node IDs
- `INSTITUTIONS` — dropdown list for the log form
- `MODALITIES` — dropdown list for the log form

The `queryGraph()` function in App.jsx handles agent queries by filtering NODES/EDGES arrays — it works on any data as long as node types and edge labels stay the same. Impact BFS traversal also uses edge labels — no logic changes needed.

Python CLI (`Auto-profiling_demo.py`) has `KNOWN_NODES` and `PHASE_SCHEMA` — only needed if you want the CLI mode to work; not required for the web PoC.

### About HCA Census
- Public portal: https://cellxgene.cziscience.com/census
- Metadata includes: organism, tissue, cell type, assay, disease, sex, donor ID, n_cells
- Organized by tissue (Heart, Brain, Lung, Kidney, etc.) and cell type
- Has its own versioned releases (Census v1.0, v2.0, etc.) — these map to Type A/B/C/D governance events
- Existing models trained on HCA: scTab, scGPT, Geneformer, UCE — these become your Model nodes

### About the Schema Mapping
The two-layer schema design means:
- **PROV core stays identical:** Entity/Activity/Agent, wasGeneratedBy, wasDerivedFrom, wasAttributedTo
- **Extension properties change:** Donor → Cell/Sample, Disease Stage → Tissue Type, PancDB → CELLxGENE

Concrete field-level mapping:

| MAI-T1D / HPAP Field | HCA Census Equivalent |
|---|---|
| `Donor` (e.g., HPAP-002) | `donor_id` (e.g., HCA-DONOR-001) |
| `Disease_Status` (T1D / T2DM / ND) | `disease` (normal / type 2 diabetes / etc.) |
| `Modality` (scRNA-seq) | `assay` (10x 3' v3, Smart-seq2, etc.) |
| `Institution` (UPenn) | `tissue_general` or `dataset_title` |
| `QC_Pipeline_Version` (CellRanger v7.1) | `cellranger` / `cell_census_build_date` |
| `N_Cells` | `n_cells` |
| `Cell_Type` | `cell_type` (annotated) |
| `Downstream Task: β-cell classification` | `Downstream Task: Pan-tissue cell-type classification` |

---

## 5. Step-by-Step Execution Plan

### Phase 1 — Understand the Current Demo

**Goal:** Understand every hardcoded piece before touching anything. The demo is already running and all 4 views are verified working.

1. Read `src/graphData.js` in full — map out all 21 nodes by type:
   - 3 RawData (`raw_scrna`, `raw_atac`, `raw_wgs`)
   - 3 Pipeline (`qc_scrna`, `qc_atac`, `qc_wgs`)
   - 3 ProcessedData (`proc_scrna`, `proc_atac`, `proc_wgs`)
   - 3 DatasetCard (`dc_scrna`, `dc_atac`, `dc_wgs`)
   - 2 Model (`model_scfm`, `model_genomic`)
   - 2 ModelCard (`mc_scfm`, `mc_genomic`)
   - 4 DownstreamTask (`task_celltype`, `task_deconv`, `task_eqtl`, `task_epigenome`)
   - 1 auto-committed test node (`1ea9c376`) — ignore this one
2. Read `src/App.jsx` lines 60–117 — note GRAPH_MODES (which node IDs each subgraph view filters to), IMPACT (which nodes each scenario triggers and affects), NODE_OPTIONS instance lists.
3. In the running browser demo, click each node and confirm you understand what its `detail` fields mean — these are what you'll replace with HCA equivalents.

**Checkpoint:** You can describe the full HPAP lineage (raw → pipeline → processed → model → task) for both scFM and genomic FM without looking at the file.

---

### Phase 2 — Get HCA Census Metadata (2–3 hours)

**Goal:** Have real metadata for 3–5 HCA nodes that will replace HPAP nodes.

#### Option A — Use the CZ CELLxGENE Census Python API (preferred)
```bash
pip install cellxgene-census
```
```python
import cellxgene_census
with cellxgene_census.open_soma() as census:
    # Get metadata for a few tissues
    obs = census["census_data"]["homo_sapiens"].obs.read(
        column_names=["donor_id", "tissue", "cell_type", "assay", "disease", "sex", "n_obs"]
    ).concat().to_pandas()
    print(obs.head(20))
```
Grab 2–3 tissues (e.g., Heart, Lung, Brain). For each tissue, note:
- `tissue` name
- `assay` types used
- Number of cells (`n_obs`)
- Disease labels present
- Example donor IDs

#### Option B — Use the web portal manually
Go to https://cellxgene.cziscience.com/census and note metadata from 3 tissue-specific datasets. This is sufficient for the PoC.

#### Option C — If no API access, construct plausible metadata
The mentor said: *"没有metadata就自己做"* (no metadata → make it yourself). Construct a minimal representative table:

```
Tissue: Heart | Assay: 10x 3' v3 | Cells: 500,000 | Donors: 120 | Disease: Normal
Tissue: Lung  | Assay: 10x 3' v3 | Cells: 800,000 | Donors: 200 | Disease: Normal/IPF
Tissue: Brain | Assay: 10x 3' v3 | Cells: 1.2M    | Donors: 150 | Disease: Normal
```

**Deliverable from Phase 2:** Metadata values for all ~18 HCA nodes you'll need, covering the same node types as HPAP:
- 3 RawData (one per tissue: Heart, Lung, Brain)
- 1 shared Pipeline (CELLxGENE QC)
- 3 ProcessedData (one tissue atlas per tissue)
- 3 DatasetCards
- 1–2 Models (e.g., scGPT trained on HCA)
- 1–2 ModelCards
- 2–3 DownstreamTasks

Write these out as a flat list with key metadata values before moving to Phase 3.

---

### Phase 3 — Build the HCA Node/Edge Definitions (3–4 hours)

**Goal:** A new NODES array and EDGES array representing HCA's data lineage.

#### 3a. Design the node structure

Map the HCA data lineage for one tissue (e.g., Heart):

```
[RawData] HCA Census: Heart raw
    ↓ USED
[Pipeline] CELLxGENE QC Pipeline v2.0
    ↓ WAS_GENERATED_BY
[ProcessedData] HCA Heart Atlas v1.0
    ↓ DOCUMENTED_BY
[DatasetCard] HCA Heart Dataset Card
    ↓ TRAINED_ON (from ProcessedData → Model)
[Model] scGPT-tissue v1
    ↓ DOCUMENTED_BY
[ModelCard] scGPT Model Card
    ↓ LINKED_TO (ModelCard → DatasetCard)
    ↓ ENABLES
[DownstreamTask] Pan-tissue cell-type classification
```

Repeat for 1–2 more tissues (e.g., Lung, Brain) to get multi-tissue coverage — this shows the framework handles multiple input streams to one model, which is the key generalizability proof.

#### 3b. Write the NODES array entries

Template for each node:
```javascript
{
  id: "raw_hca_heart",
  label: "HCA Census\nHeart",
  type: "RawData",
  detail: {
    "Dataset": "HCA Census",
    "Tissue": "Heart",
    "Assay": "10x 3' v3",
    "N_Cells": "500,000",
    "N_Donors": "120",
    "Disease": "Normal",
    "Release": "Census v2.0 (2024-05-13)",
    "Source": "CZ CELLxGENE"
  }
}
```

#### 3c. Write the EDGES array entries

```javascript
{ source: "raw_hca_heart",    target: "qc_census",        label: "USED" },
{ source: "qc_census",        target: "proc_hca_heart",   label: "WAS_GENERATED_BY" },
{ source: "proc_hca_heart",   target: "dc_hca_heart",     label: "DOCUMENTED_BY" },
{ source: "proc_hca_heart",   target: "model_scgpt",      label: "TRAINED_ON",
  train: {
    "Model": "scGPT-tissue v1",
    "Architecture": "Transformer (scGPT)",
    "Training_Tissues": "15",
    "N_Cells": "33M",
    "Source_Dataset": "HCA Census v2.0"
  }
},
{ source: "model_scgpt",      target: "mc_scgpt",         label: "DOCUMENTED_BY" },
{ source: "mc_scgpt",         target: "dc_hca_heart",     label: "LINKED_TO" },
{ source: "model_scgpt",      target: "task_celltype_pan", label: "ENABLES" }
```

#### 3d. Update GRAPH_MODES to match new node IDs

```javascript
const GRAPH_MODES = {
  full:   { label: "Full graph",              ids: NODES.map(n=>n.id) },
  heart:  { label: "HCA Heart lineage",       ids: ["raw_hca_heart","qc_census","proc_hca_heart","dc_hca_heart","model_scgpt","mc_scgpt","task_celltype_pan"] },
  lung:   { label: "HCA Lung lineage",        ids: ["raw_hca_lung","qc_census","proc_hca_lung","dc_hca_lung","model_scgpt","mc_scgpt","task_celltype_pan"] },
  impact: { label: "Impact: Census v3 update",ids: ["raw_hca_heart","raw_hca_lung","raw_hca_brain","proc_hca_heart","proc_hca_lung","proc_hca_brain","model_scgpt","task_celltype_pan"] }
};
```

#### 3e. Update IMPACT scenarios for HCA governance events

Replace the 3 HPAP scenarios with HCA-equivalent ones:
1. **"Census Version Updated (Type B)"** — new Census release adds tissues; downstream models flagged for re-evaluation
2. **"Cell-type Annotation Revised (Type D)"** — cell-type labels corrected; model trained on old labels needs audit
3. **"QC Pipeline Updated (Type B)"** — CELLxGENE QC pipeline updated; processed datasets re-derived; models flagged

---

### Phase 4 — Integrate and Test (2 hours)

**Goal:** The HCA demo runs end-to-end in all 4 UI views.

1. In **`src/graphData.js`**: replace NODES and EDGES with your HCA equivalents (TYPE/EDGE_STYLE can stay unchanged — same 7 node types, same 6 edge labels)
2. In **`src/App.jsx`** lines 60–117: update GRAPH_MODES (new node ID lists), IMPACT (new trigger/affected node IDs), NODE_OPTIONS instance lists, INSTITUTIONS, MODALITIES
3. Run `npm run dev` and verify:
   - [ ] Provenance Graph renders all HCA nodes with correct labels/colors
   - [ ] Clicking a node shows correct HCA metadata in detail panel
   - [ ] All 3 GRAPH_MODES subgraphs show correct node subsets
   - [ ] Impact Analysis: selecting a scenario correctly highlights downstream nodes
   - [ ] Governance Agent: natural language query ("What data trained scGPT?") returns correct answer
   - [ ] Provenance Log Entry: form fields appear correctly for each node type

---

### Phase 5 — Document the Generalizability Proof (2 hours)

**Goal:** A written record of what changed vs. stayed the same — this is the deliverable for the manuscript.

Create `GENERALIZABILITY_REPORT.md` in this folder. It should contain:

#### Section 1: Schema Mapping Table
Field-by-field mapping of HPAP → HCA (populate Table 3 from the manuscript):

| PROV Layer | MAI-T1D / HPAP | HCA Census | Changed? |
|---|---|---|---|
| Entity (RawData) node | HPAP donor ID | HCA tissue name | Extension only |
| Activity (Pipeline) node | CellRanger v7.1 | CELLxGENE QC v2.0 | Extension only |
| Entity (ProcessedData) | Dataset version | Census build date | Extension only |
| Agent | UPenn, UMich | CZI, Broad | Extension only |
| wasGeneratedBy | ✓ | ✓ | **No change** |
| wasDerivedFrom | ✓ | ✓ | **No change** |
| wasAttributedTo | ✓ | ✓ | **No change** |
| PROV core schema | — | — | **Zero modification** |

#### Section 2: Governance Query Results
Run at least 3 of the governance queries against the HCA demo using the Governance Agent tab. For each:
- Question asked (natural language)
- Intent routed to by the agent (e.g., `models_for_dataset`)
- Result returned (node names / row count)
- Pass / Fail

#### Section 3: Impact Analysis Results
For each of the 3 HCA scenarios:
- Trigger node selected
- Nodes flagged by BFS traversal
- Governance action recommended
- Latency (subjective — "instant" is fine for JS in-memory)

#### Section 4: What Required Zero Change
List explicitly:
- Node type vocabulary (all 7 types reused)
- Edge type vocabulary (all 6 labels reused)
- UI architecture (React + D3)
- Governance logic (BFS traversal)
- Agent query patterns (datasets_for_model, compliance_status, etc.)
- API proxy

#### Section 5: What Required Change (Extension Properties Only)
- Node label text
- Node `detail` field names and values
- GRAPH_MODES subgraph node ID lists
- IMPACT scenario node IDs and descriptions
- INSTITUTIONS and MODALITIES lists
- Demo CSV files (if updated)

---

## 6. What Still Needs to Be Confirmed (Questions for Your Team)

| # | Question | Why It Matters |
|---|---|---|
| 1 | Should the HCA PoC be a **separate branch** off `dev`, or committed directly to `dev`? | Keeps your work isolated and reviewable |
| 2 | Does the team have a **preferred HCA tissue** for the demo (Heart, Lung, Brain)? | Ensures alignment with manuscript Table 3 |
| 3 | Are checklist items #12/#13 (cross-model donor overlap) **your job** or someone else's? | Scope clarity |
| 4 | Does Kai have a **template for Table 3** (schema mapping table) already started? | Avoids duplicating work |
| 5 | ~~Do you have an Anthropic API key?~~ | ✅ Resolved — `.env` created and agent verified working |

---

## 7. File Map

> **Note:** Working from the `dev` branch. KG data is split across two files — both need edits for HCA.

```
minimal proof-of-concept deployment/
├── src/
│   ├── graphData.js             ← EDIT 1: Replace NODES + EDGES arrays
│   │                              (TYPE, EDGE_STYLE, EDGE_LEGEND stay unchanged)
│   └── App.jsx                  ← EDIT 2: Lines 60–117 only
│                                  Update: GRAPH_MODES, IMPACT, NODE_OPTIONS
│                                  instance lists, INSTITUTIONS, MODALITIES
├── .env                         ← ✅ DONE — API key set, agent verified working
├── Auto-profiling_demo.py       ← Optional: update KNOWN_NODES/PHASE_SCHEMA
│                                  only if you want CLI mode to work with HCA
├── governance_hook.py           ← NO CHANGES NEEDED
├── api/anthropic/messages.js    ← NO CHANGES NEEDED
├── vite.config.js               ← NO CHANGES NEEDED
├── TASK_SPECS.md                ← This file
└── GENERALIZABILITY_REPORT.md  ← Your deliverable (create in Phase 5)
```

---

## 8. Definition of Done

The PoC is complete when:

- [ ] HCA Census metadata is ingested into the KG schema (NODES populated with real/representative HCA metadata)
- [ ] All 4 demo views render correctly with HCA data
- [ ] At least 3 governance queries return correct results on HCA data
- [ ] At least 1 impact scenario runs correctly (BFS traversal highlights correct downstream nodes)
- [ ] `GENERALIZABILITY_REPORT.md` documents what changed vs. what stayed the same
- [ ] Zero PROV core modifications were made (confirmed in report)
- [ ] Demo is runnable locally with `npm run dev`
- [ ] (Optional) Deployed to Vercel so mentor can view it live
