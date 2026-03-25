# MAI-T1D Pipeline Hook (`prov_hook.py`)

Automated provenance capture for HPC training scripts — **Mode 2** of the MAI-T1D governance framework.

---

## What It Does

`prov_hook.py` provides a single function, `submit_prov()`, that training scripts call at job completion to automatically register a PROV record in the MAI-T1D governance knowledge graph. No forms, no manual input.

Each call creates the following subgraph in Neo4j:

```
(Model)-[:wasGeneratedBy]->(Activity)-[:used]->(Dataset)
                                    |
                             [:wasAttributedTo]
                                    |
                                 (Agent)
```

This directly addresses the governance question: **given a trained model, what data was used to produce it?**

---

## Usage

Place `prov_hook.py` in your shared utils directory. Add two lines at the end of any training script:

```python
from prov_hook import submit_prov
submit_prov(model_id=MODEL_ID, dataset_id=DATASET_ID, pipeline_version=PIPELINE_VERSION)
```

That is the only change required to a training script. The function reads the submitting user and timestamp automatically from the environment.

---

## Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `model_id` | str | Yes | Identifier of the model being trained (e.g., `"scFM_v1"`) |
| `dataset_id` | str | Yes | Identifier of the dataset used (e.g., `"scRNA_v1.2"`) |
| `pipeline_version` | str | Yes | Version of the QC/processing pipeline (e.g., `"QC_pipeline_v3"`) |
| `activity_type` | str | No | Type of activity. Default: `"training"` |

---

## Environment Variables

Set once per environment — training scripts do not need to handle these individually.

| Variable | Description | Where to Set |
|---|---|---|
| `PROV_ENDPOINT` | URL of the governance REST API `/submit` endpoint | Great Lakes `.bashrc` or SLURM job template |
| `USER` / `USERNAME` | Submitting researcher (read automatically) | OS-provided |
| `SLURM_JOB_ID` | HPC job ID, attached to the PROV record if present | Injected automatically by SLURM |

---

## Behavior

- If `PROV_ENDPOINT` is not set, the function prints a warning and returns without error — the training job is unaffected.
- If the API call fails for any reason (network error, server error, timeout), the function prints a warning and returns without raising an exception — the training job is unaffected.
- On success, prints: `[prov_hook] PROV record submitted OK: <model_id> <- <dataset_id>`

---

## Source

```python
import os
import datetime
import requests

def submit_prov(model_id, dataset_id, pipeline_version, activity_type="training"):
    payload = {
        "model_id": model_id,
        "dataset_id": dataset_id,
        "pipeline_version": pipeline_version,
        "activity_type": activity_type,
        "agent": os.environ.get("USER") or os.environ.get("USERNAME", "unknown"),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "slurm_job_id": os.environ.get("SLURM_JOB_ID", None)
    }
    endpoint = os.environ.get("PROV_ENDPOINT")
    if not endpoint:
        print("[prov_hook] WARNING: PROV_ENDPOINT not set, skipping submission")
        return
    try:
        resp = requests.post(endpoint, json=payload, timeout=10)
        resp.raise_for_status()
        print(f"[prov_hook] PROV record submitted OK: {model_id} <- {dataset_id}")
    except Exception as e:
        print(f"[prov_hook] WARNING: submission failed (training unaffected): {e}")
```

---

## Verification

Two test files are included:

- `test_prov_hook.py` — unit tests (no external dependencies, 14 tests)
- `test_layer2_api.py` + `mock_api_server.py` — API connectivity tests against a local mock server (11 tests)

Run locally:

```bash
python test_prov_hook.py
python test_layer2_api.py
```

Both test suites pass as of 2026-03-25. End-to-end Neo4j node verification requires a live governance API connection.

---

## Relation to the MAI-T1D Governance Framework

This file implements **Mode 2: Pipeline Hook** as described in the MAI-T1D governance paper (Section 3.3, Table 2). It complements the existing manual CLI tool (`mai_t1d0320.py`) which handles Mode 1 provenance capture for dataset releases, DUA events, and historical backfill.

| Mode | Tool | Automation | Use Case |
|---|---|---|---|
| 1 Manual CLI | `mai_t1d0320.py` | None | Dataset cards, DUA/DTA events |
| 2 Pipeline Hook | `prov_hook.py` | High | HPC training scripts |
