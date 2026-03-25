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
