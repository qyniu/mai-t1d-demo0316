# MAI-T1D Governance CLI

A lightweight command-line provenance engine for the MAI-T1D (Michigan AI for Type 1 Diabetes) project. It records every step of the research pipeline — from raw HPAP biobank data to trained foundation models and downstream clinical tasks — as a structured, auditable knowledge graph committed to local JSON files.

---

## Overview

Modern AI-for-biology research involves long chains of data transformations across multiple teams and institutions. When a dataset changes, is retracted, or a pipeline is updated, it is often unclear which downstream models and analyses are affected. This tool solves that by:

- Treating every data artifact and model as a **typed node** in a knowledge graph
- Recording every transformation as a **labeled edge** (USED, TRAINED_ON, DOCUMENTED_BY, etc.)
- Linking each commit to its **known KG identity** (e.g., `proc_scrna`, `model_scfm`)
- Enabling **impact propagation analysis** — instantly showing which nodes are outdated or under compliance hold when upstream data changes

The schema and node registry are aligned with `kg_demo_v9.jsx`, the interactive D3 knowledge graph visualization for this project.

---

## Quick Start

### Prerequisites

```bash
pip install pandas
```

### Run

```bash
python mai_t1d0325.py
```

On first run, you will be prompted to set your name and lab ID. This is saved to `~/.bio_config` and reused in all future sessions.

---

## Menu Options

```
1. Commit Node       — Record a data artifact or model with full provenance metadata
2. View Lineage Log  — Visualize the lineage tree and run impact analysis
3. Edit Profile      — Update your name or lab ID stored in ~/.bio_config
```

---

## Option 1: Commit Node

Records a file as a node in the knowledge graph. The workflow has four steps:

### Step 1 — File paths

```
[1/4] Child Data Path: /path/to/your/file.h5ad
      Parent Data Path(s) (comma-separated, or 'ROOT'): /path/to/parent.h5ad
```

- **Child**: the artifact you are committing (any file type)
- **Parent**: the upstream artifact this was derived from; use `ROOT` for source data with no local parent
- **Multiple parents** are supported (comma-separated) — required for multi-modal model training (e.g., Genomic FM trained on scRNA + scATAC + WGS simultaneously)

Each file is fingerprinted with SHA-256 (12-char prefix) as its unique node ID.

### Step 2 — Work phase

```
  1. Prepare
  2. Train
  3. Post-train
  4. Governance
  5. Downstream
```

### Step 3 — Category

Each phase contains one or more categories with specific metadata fields:

| Phase | Category | Edge label | Node type |
|-------|----------|-----------|-----------|
| Prepare | Raw HPAP Data | _(source)_ | RawData |
| Prepare | QC & Filtering | USED | Pipeline |
| Prepare | Metadata Alignment | WAS_GENERATED_BY | ProcessedData |
| Prepare | AI-Ready Data Construction | WAS_GENERATED_BY | ProcessedData |
| Train | Model Training / Evaluation | TRAINED_ON | Model |
| Post-train | Registry & Version Tracking | _(registry)_ | PostTrainRegistry |
| Governance | Dataset Card | DOCUMENTED_BY | DatasetCard |
| Governance | Model Card | DOCUMENTED_BY | ModelCard |
| Downstream | Downstream Task | ENABLES | DownstreamTask |

### Step 4 — Link to known KG node (optional)

After selecting a category, the CLI shows a list of pre-registered nodes from the MAI-T1D knowledge graph that match the node type. Selecting one:

- Stamps the commit with a `known_node_id` (e.g., `proc_scrna`, `model_scfm`)
- Pre-fills relevant metadata fields from the KG registry (version, lighthouse path, architecture, etc.)
- Connects the local file to its semantic identity in the broader graph

```
  Known 'Model' nodes in the KG:
    1. [model_scfm]  scFM-T1D v1
    2. [model_genomic]  Genomic FM v1 (EPCOT-v2)
    0. None / New node
  Link to known node (number, or Enter to skip): 1
```

### Auto-fill for Model Training

When committing a **Model Training / Evaluation** node, the CLI automatically:

1. Loads all fields from any prior commit for the same model file (re-commit scenario)
2. Loops over all parent paths and fetches their commit metadata (`Training_Data_Path`, `Training_Data_Upload_Time`, `Pretraining_Data`, modality) — stored as `edge_train_metadata` on the TRAINED_ON edge
3. Defaults `Developed_By` to the current user

### Output JSON

Each commit is saved as `commit_<Category>_<hash>.json` in the script directory:

```json
{
  "node_id": "4dd68ec04612",
  "parent_ids": ["cead8f2bf3ce"],
  "parent_id": "cead8f2bf3ce",
  "edge_label": "TRAINED_ON",
  "node_type": "Model",
  "known_node_id": "model_scfm",
  "phase": "Train",
  "category": "Model Training / Evaluation",
  "governance_status": "HEALTHY",
  "metadata": {
    "author": "Qingyuan Niu",
    "timestamp": "2026-03-25T14:22:00.000000",
    "file_path": "/absolute/path/to/model.pt",
    "properties": { ... },
    "data_profiling": { ... },
    "edge_train_metadata": [
      { "parent_path": "...", "modality": "scRNA-seq", "committed_at": "..." }
    ]
  }
}
```

---

## Option 2: View Lineage Log

### 2a — Full lineage tree

Loads all local commits and prints a DFS tree from ROOT, showing edge labels and governance status icons:

```
ROOT
└─[USED]─► ✅ [qc_scrna]  scRNA QC Pipeline v3.1
   └─[WAS_GENERATED_BY]─► ✅ [proc_scrna]  scRNA Dataset v2.1
      ├─[DOCUMENTED_BY]─► ✅ [dc_scrna]  Dataset Card (scRNA v2.1)
      └─[TRAINED_ON]─► ⚠️  [model_scfm]  scFM-T1D v1
         └─[ENABLES]─► ✅ [task_celltype]  Cell-type Classification
```

Status icons: `✅ HEALTHY` | `⚠️ OUTDATED` | `🚨 COMPLIANCE_HOLD`

### 2b — Lineage by model / subgraph

Filters commits to one of four predefined views (aligned with the JSX knowledge graph):

| # | View | Scope |
|---|------|-------|
| 1 | scFM lineage | raw_scrna → qc → proc → dc → model_scfm → mc → tasks |
| 2 | Genomic FM lineage | all 3 raw modalities → model_genomic → mc → eQTL/epigenome tasks |
| 3 | HPAP-002 downstream | HPAP-002 donor trace through both models |
| 4 | Full graph | all committed nodes |

### 2c — Impact analysis

Simulates what happens when a node changes. Three pre-defined scenarios:

| # | Scenario | Trigger type | Propagates to | New status |
|---|----------|-------------|---------------|------------|
| 1 | Dataset Revised (Type B) | ProcessedData | DatasetCard, Model, ModelCard | OUTDATED |
| 2 | Consent Withdrawn (Type C) | ProcessedData | DatasetCard, Model, ModelCard | COMPLIANCE_HOLD |
| 3 | QC Pipeline Updated | Pipeline | ProcessedData, Model | OUTDATED |

Workflow:
1. Select a scenario
2. Select the trigger node from committed nodes of that type
3. The engine BFS-traverses all downstream nodes and lists affected ones with per-type notes
4. Optionally flag all affected nodes — updates `governance_status` in their JSON files and appends a timestamped `governance_flags` entry

---

## Option 3: Edit Profile

Update your display name or lab ID without leaving the program:

```
✏️  EDIT PROFILE  (press Enter to keep current value)
   > Name [Qingyuan Niu]: Jane Smith
   > Lab ID [UMICH-MAI]:
   ✅ Profile updated — Name: Jane Smith | Lab: UMICH-MAI
```

Profile is stored at `~/.bio_config` (e.g., `C:\Users\<you>\.bio_config` on Windows).

---

## Known Node Registry

The following 20 nodes are pre-registered from the MAI-T1D knowledge graph and can be linked at commit time:

| ID | Label | Type |
|----|-------|------|
| `raw_scrna` | HPAP-002 scRNA-seq | RawData |
| `raw_atac` | HPAP cohort scATAC-seq | RawData |
| `raw_wgs` | HPAP cohort WGS | RawData |
| `qc_scrna` | scRNA QC Pipeline v3.1 | Pipeline |
| `qc_atac` | scATAC QC Pipeline v2.0 | Pipeline |
| `qc_wgs` | WGS Variant Calling v1.2 | Pipeline |
| `proc_scrna` | scRNA Dataset v2.1 | ProcessedData |
| `proc_atac` | scATAC Dataset v1.3 | ProcessedData |
| `proc_wgs` | WGS Variant Matrix v1.0 | ProcessedData |
| `dc_scrna` | Dataset Card (scRNA v2.1) | DatasetCard |
| `dc_atac` | Dataset Card (scATAC v1.3) | DatasetCard |
| `dc_wgs` | Dataset Card (WGS v1.0) | DatasetCard |
| `model_scfm` | scFM-T1D v1 | Model |
| `model_genomic` | Genomic FM v1 (EPCOT-v2) | Model |
| `mc_scfm` | Model Card (scFM v1) | ModelCard |
| `mc_genomic` | Model Card (Genomic FM v1) | ModelCard |
| `task_celltype` | Cell-type Classification | DownstreamTask |
| `task_deconv` | Islet Deconvolution | DownstreamTask |
| `task_eqtl` | eQTL Prediction | DownstreamTask |
| `task_epigenome` | Epigenome Prediction | DownstreamTask |

---

## Edge Types

| Label | Meaning | Color in KG |
|-------|---------|-------------|
| USED | Raw data feeds into a QC pipeline | Blue |
| WAS_GENERATED_BY | Pipeline produces a processed dataset | Green |
| TRAINED_ON | Processed data used to train a model (with rich edge metadata) | Purple |
| DOCUMENTED_BY | Dataset or model is described by a Card | Orange (dashed) |
| LINKED_TO | Model Card references a Dataset Card | Red (dashed) |
| ENABLES | Model enables a downstream clinical task | Gray |

---

## File Structure

```
demo/
├── mai_t1d0325.py              # Main CLI
├── README.md                   # This file
├── EXPANSION_PLAN.md           # Implementation plan (KG → CLI expansion)
├── ~/.bio_config               # User profile (name, lab ID) — outside repo
└── commit_*.json               # Generated provenance records (one per committed node)
```

---

## Institutions

University of Michigan · Vanderbilt University · Cornell University · University of South Florida · UCLA
