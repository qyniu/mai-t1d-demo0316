import pandas as pd
import os
import json
import hashlib
import glob
import subprocess
import urllib.request
from datetime import datetime

# --- Configuration ---
CONFIG_PATH = os.path.expanduser("~/.bio_config")
VERCEL_DEPLOY_HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_gJKrKHUXKOrNHulXIpGNU9m3jcrP/LzM2podhRu"

def git_auto_commit(file_path: str, message: str):
    """Stage a file, commit, and push to origin in the repo containing it."""
    repo_dir = os.path.dirname(os.path.abspath(file_path))
    try:
        subprocess.run(
            ["git", "add", os.path.abspath(file_path)],
            cwd=repo_dir, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=repo_dir, check=True, capture_output=True
        )
        print(f"   📌 Auto-committed: {os.path.basename(file_path)}")
        subprocess.run(
            ["git", "push", "origin", "HEAD:dev"],
            cwd=repo_dir, check=True, capture_output=True
        )
        print(f"   🚀 Auto-pushed to dev: {os.path.basename(file_path)}")
        urllib.request.urlopen(urllib.request.Request(VERCEL_DEPLOY_HOOK, method="GET"))
        print(f"   🌐 Vercel redeploy triggered")
    except subprocess.CalledProcessError as e:
        print(f"   ⚠️  Git auto-commit/push failed: {e.stderr.decode().strip()}")
    except Exception as e:
        print(f"   ⚠️  Vercel deploy hook failed: {e}")

# --- Expanded Schema (Aligned with provided Images) ---
PHASE_SCHEMA = {
    "1": {
        "name": "Prepare",
        "categories": {
            "Raw BioBank Data": [
                "Modality", "Donors", "Source", "Lighthouse", "Access", "Connections"
            ],
            "QC & Filtering": [
                "Responsible_Person", "Pipeline_Path", "Doublet_Removal",
                "Annotation_Refinement", "Min_Genes_Cell", "Max_Mitochondrial_Pct",
                "Integration_Method", "Script_Hash"
            ],
            "Metadata Alignment": [
                "Institution", "Metadata_Path", "Donor_ID_Linkage",
                "Disease_Duration", "Antibody_Profile", "Harmonisation_Ontology", "Output_Format"
            ],
            "AI-Ready Data Construction": [
                "Tokenization_Schema", "HVGs_Selected", "Dimensional_Reduction",
                "File_Format", "Version", "Cells_Post_QC", "Checksum"
            ]
        }
    },
    "2": {
        "name": "Train",
        "categories": {
            "Model Training / Evaluation": [
                "Model_Name", "Developed_By", "Architecture", "Pretraining_Data",
                "Training_Data_Path", "Training_Data_Upload_Time",
                "Imaging_Platforms", "Framework", "Epochs", "Batch_Size",
                "Optimizer", "Hardware", "F1_Score_CHL", "F1_Score_DLBCL", "License"
            ]
        }
    },
    "3": {
        "name": "Post-train",
        "categories": {
            "Registry & Version Tracking": [
                "Model_Version", "Dataset_Version", "QC_Pipeline_Version",
                "Model_Repository", "Governance_Repository", "Storage_Backend",
                "Graph_Backend", "Monthly_Tracking_Link"
            ]
        }
    },
    "4": {
        "name": "Governance",
        "categories": {
            "Dataset Card": [
                "Standard", "Format", "GitHub", "Author", "Institution",
                "Consent", "Known_Biases", "Linked_Dataset_ID",
                "Linked_Dataset_Version", "Status"
            ],
            "Model Card": [
                "Standard", "Format", "GitHub", "Author", "Institution",
                "Linked_Model_ID", "Linked_Dataset_Cards", "Intended_Use", "Status"
            ]
        }
    },
    "5": {
        "name": "Downstream",
        "categories": {
            "Downstream Task": [
                "Task_ID", "Task_Name", "Task_Type", "Enabled_By_Model",
                "Description", "Institution", "Status", "EU_AI_Act_Risk_Tier"
            ]
        }
    }
}

# --- KG Node Type Mapping ---
CATEGORY_TO_NODE_TYPE = {
    "Raw BioBank Data":             "RawData",
    "QC & Filtering":               "Pipeline",
    "Metadata Alignment":           "ProcessedData",
    "AI-Ready Data Construction":   "ProcessedData",
    "Model Training / Evaluation":  "Model",
    "Registry & Version Tracking":  "PostTrainRegistry",
    "Dataset Card":                 "DatasetCard",
    "Model Card":                   "ModelCard",
    "Downstream Task":              "DownstreamTask",
}

# --- KG Edge Label Mapping ---
CATEGORY_TO_EDGE = {
    "Raw BioBank Data":             None,
    "QC & Filtering":               "USED",
    "Metadata Alignment":           "WAS_GENERATED_BY",
    "AI-Ready Data Construction":   "WAS_GENERATED_BY",
    "Model Training / Evaluation":  "TRAINED_ON",
    "Registry & Version Tracking":  None,
    "Dataset Card":                 "DOCUMENTED_BY",
    "Model Card":                   "DOCUMENTED_BY",
    "Downstream Task":              "ENABLES",
}

# --- Known KG Nodes (from kg_demo_v9.jsx) ---
KNOWN_NODES = {
    "raw_scrna":     {"label": "HPAP-002 scRNA-seq",          "type": "RawData",        "detail": {"Modality": "scRNA-seq",  "Donors": "HPAP-002",    "Source": "HPAP / PancDB",  "Lighthouse": "/lighthouse/mai-t1d/raw/scrna/hpap002/", "Access": "DUA-HPAP-2024-001", "Connections": "USED scRNA QC Pipeline v3.1"}},
    "raw_atac":      {"label": "HPAP cohort scATAC-seq",      "type": "RawData",        "detail": {"Modality": "scATAC-seq", "Donors": "8 donors",    "Source": "HPAP/PancDB",    "Lighthouse": "/lighthouse/mai-t1d/raw/atac/",           "Access": "DUA-HPAP-2024-001", "Connections": "USED scATAC QC Pipeline v2.0"}},
    "raw_wgs":       {"label": "HPAP cohort WGS",             "type": "RawData",        "detail": {"Modality": "WGS",       "Donors": "194 donors",  "Source": "HPAP/PancDB",    "Lighthouse": "/lighthouse/mai-t1d/raw/wgs/",            "Access": "DUA-HPAP-2024-001", "Connections": "USED WGS Variant Calling v1.2"}},
    "qc_scrna":      {"label": "scRNA QC Pipeline v3.1",      "type": "Pipeline",       "detail": {"Version": "v3.1", "Pipeline_Path": "github.com/mai-t1d/pipelines/qc-scrna", "Doublet_Removal": "DoubletFinder", "Min_Genes_Cell": "200", "Max_Mitochondrial_Pct": "20%", "Integration_Method": "Harmony", "Responsible_Person": "Kai Liu", "Institution": "University of Michigan"}},
    "qc_atac":       {"label": "scATAC QC Pipeline v2.0",     "type": "Pipeline",       "detail": {"Version": "v2.0", "Pipeline_Path": "github.com/mai-t1d/pipelines/qc-atac", "Responsible_Person": "Kai Liu", "Institution": "University of Michigan"}},
    "qc_wgs":        {"label": "WGS Variant Calling v1.2",    "type": "Pipeline",       "detail": {"Version": "v1.2", "Pipeline_Path": "github.com/mai-t1d/pipelines/wgs-varcall", "Responsible_Person": "Diane Saunders", "Institution": "Vanderbilt University"}},
    "proc_scrna":    {"label": "scRNA Dataset v2.1",          "type": "ProcessedData",  "detail": {"Version": "v2.1", "Cells_Post_QC": "72,400", "HVGs_Selected": "3,000", "File_Format": "AnnData .h5ad", "Lighthouse": "/lighthouse/mai-t1d/processed/scrna_v2.1.h5ad"}},
    "proc_atac":     {"label": "scATAC Dataset v1.3",         "type": "ProcessedData",  "detail": {"Version": "v1.3", "Cells_Post_QC": "48,200", "File_Format": "ArchR + .h5ad", "Lighthouse": "/lighthouse/mai-t1d/processed/atac_v1.3/"}},
    "proc_wgs":      {"label": "WGS Variant Matrix v1.0",     "type": "ProcessedData",  "detail": {"Version": "v1.0", "Donors": "194", "File_Format": "VCF + PLINK", "Lighthouse": "/lighthouse/mai-t1d/processed/wgs_v1.0/"}},
    "dc_scrna":      {"label": "Dataset Card (scRNA v2.1)",   "type": "DatasetCard",    "detail": {"Standard": "Datasheets for Datasets (CACM 2021)", "Format": "JSON-LD", "GitHub": "github.com/mai-t1d/governance/dataset-cards/scrna_v2.1.jsonld", "Author": "Kai Liu", "Institution": "University of Michigan", "Consent": "Open (HPAP DUA)", "Known_Biases": "Skews toward recent-onset T1D", "Status": "Published"}},
    "dc_atac":       {"label": "Dataset Card (scATAC v1.3)",  "type": "DatasetCard",    "detail": {"Standard": "Datasheets for Datasets (CACM 2021)", "Format": "JSON-LD", "GitHub": "github.com/mai-t1d/governance/dataset-cards/atac_v1.3.jsonld", "Author": "Kai Liu", "Institution": "University of Michigan", "Consent": "Open (HPAP DUA)", "Known_Biases": "Limited donor pool; no pediatric donors", "Status": "Published"}},
    "dc_wgs":        {"label": "Dataset Card (WGS v1.0)",     "type": "DatasetCard",    "detail": {"Standard": "Datasheets for Datasets (CACM 2021)", "Format": "JSON-LD", "GitHub": "github.com/mai-t1d/governance/dataset-cards/wgs_v1.0.jsonld", "Author": "Diane Saunders", "Institution": "Vanderbilt University", "Consent": "Open (HPAP DUA)", "Known_Biases": "European ancestry overrepresented", "Status": "Published"}},
    "model_scfm":    {"label": "scFM-T1D v1",                 "type": "Model",          "detail": {"Model_Name": "scFM-T1D", "Architecture": "scGPT 70M params", "F1_Score_CHL": "0.93", "Epochs": "100", "Batch_Size": "512", "Hardware": "8x A100 80GB — Lighthouse HPC", "Lighthouse": "/lighthouse/mai-t1d/models/scfm_v1.0/"}},
    "model_genomic": {"label": "Genomic FM v1 (EPCOT-v2)",    "type": "Model",          "detail": {"Model_Name": "Genomic FM (EPCOT-v2)", "Architecture": "EPCOT multi-modal transformer", "Epochs": "80", "Batch_Size": "256", "Hardware": "16x A100 80GB — Lighthouse HPC", "Lighthouse": "/lighthouse/mai-t1d/models/genomic_v1.0/"}},
    "mc_scfm":       {"label": "Model Card (scFM v1)",        "type": "ModelCard",      "detail": {"Standard": "Model Cards (FAccT 2019)", "Format": "JSON-LD", "GitHub": "github.com/mai-t1d/governance/model-cards/scfm_v1.0.jsonld", "Author": "Kai Liu", "Linked_Model_ID": "model_scfm", "Linked_Dataset_Cards": "dc_scrna", "Intended_Use": "Cell-type annotation, T1D research", "Status": "Published"}},
    "mc_genomic":    {"label": "Model Card (Genomic FM v1)",  "type": "ModelCard",      "detail": {"Standard": "Model Cards (FAccT 2019)", "Format": "JSON-LD", "GitHub": "github.com/mai-t1d/governance/model-cards/genomic_v1.0.jsonld", "Author": "Kai Liu", "Linked_Model_ID": "model_genomic", "Linked_Dataset_Cards": "dc_scrna, dc_atac, dc_wgs", "Intended_Use": "Genomic prediction, regulatory elements", "Status": "Published"}},
    "task_celltype": {"label": "Cell-type Classification",    "type": "DownstreamTask", "detail": {"Task_ID": "task_celltype", "Task_Name": "Cell-type Classification", "Task_Type": "Classification", "Enabled_By_Model": "model_scfm", "Description": "Identify β, α, δ, ductal cell types in pancreatic islet scRNA-seq", "Status": "Active"}},
    "task_deconv":   {"label": "Islet Deconvolution",         "type": "DownstreamTask", "detail": {"Task_ID": "task_deconv", "Task_Name": "Islet Deconvolution", "Task_Type": "Deconvolution", "Enabled_By_Model": "model_scfm", "Description": "Decompose bulk RNA-seq into cell-type fractions", "Status": "Active"}},
    "task_eqtl":     {"label": "eQTL Prediction",             "type": "DownstreamTask", "detail": {"Task_ID": "task_eqtl", "Task_Name": "eQTL Prediction", "Task_Type": "Regression / association", "Enabled_By_Model": "model_genomic", "Description": "Predict eQTLs across islet cell types", "Status": "Active"}},
    "task_epigenome":{"label": "Epigenome Prediction",        "type": "DownstreamTask", "detail": {"Task_ID": "task_epigenome", "Task_Name": "Epigenome Prediction", "Task_Type": "Sequence-to-function", "Enabled_By_Model": "model_genomic", "Description": "Predict chromatin accessibility and histone marks from DNA sequence", "Status": "Active"}},
}

# --- Impact Scenarios (ported from kg_demo_v9.jsx IMPACT) ---
IMPACT_SCENARIOS = {
    "1": {
        "label": "📊 Dataset Revised (Type B)",
        "trigger_type": "ProcessedData",
        "propagate_to": ["DatasetCard", "Model", "ModelCard"],
        "new_status": "OUTDATED",
        "notes": {
            "DatasetCard": "⚠️  Dataset Card must be versioned — QC parameters changed",
            "Model":       "❌  Outdated — retrain required (TRAINED_ON → revised data)",
            "ModelCard":   "❌  Model Card outdated — linked dataset changed",
        }
    },
    "2": {
        "label": "🚨 Consent Withdrawn (Type C)",
        "trigger_type": "ProcessedData",
        "propagate_to": ["DatasetCard", "Model", "ModelCard"],
        "new_status": "COMPLIANCE_HOLD",
        "notes": {
            "DatasetCard": "⚠️  Dataset Card must record deprecation event",
            "Model":       "❌  COMPLIANCE HOLD — TRAINED_ON edge traces to retracted data",
            "ModelCard":   "❌  Model Card outdated — LINKED_TO points to deprecated Dataset Card",
        }
    },
    "3": {
        "label": "🔧 QC Pipeline Updated",
        "trigger_type": "Pipeline",
        "propagate_to": ["ProcessedData", "Model"],
        "new_status": "OUTDATED",
        "notes": {
            "ProcessedData": "❌  Re-processing recommended with new pipeline",
            "Model":         "❌  TRAINED_ON data produced by outdated pipeline",
        }
    },
}

# --- Lineage Subgraph Modes (from kg_demo_v9.jsx GRAPH_MODES) ---
GRAPH_MODES = {
    "1": {"label": "scFM lineage",        "ids": ["raw_scrna","qc_scrna","proc_scrna","dc_scrna","model_scfm","mc_scfm","task_celltype","task_deconv"]},
    "2": {"label": "Genomic FM lineage",  "ids": ["raw_scrna","raw_atac","raw_wgs","qc_scrna","qc_atac","qc_wgs","proc_scrna","proc_atac","proc_wgs","dc_scrna","dc_atac","dc_wgs","model_genomic","mc_genomic","task_eqtl","task_epigenome"]},
    "3": {"label": "HPAP-002 downstream", "ids": ["raw_scrna","qc_scrna","proc_scrna","dc_scrna","model_scfm","model_genomic","mc_scfm","mc_genomic","task_celltype","task_deconv","task_eqtl","task_epigenome"]},
    "4": {"label": "Full graph",          "ids": None},
}

def lookup_commit_by_path(target_path):
    """
    Scans all local commit_*.json files.
    Returns (file_path, timestamp, properties) of the matching node, or (None, None, {}) if not found.
    If multiple matches exist, returns the one with the latest timestamp.
    """
    if target_path.upper() == "ROOT":
        return None, None, {}
    abs_target = os.path.abspath(target_path)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    matches = []
    for json_file in glob.glob(os.path.join(script_dir, "commit_*.json")):
        try:
            with open(json_file, "r") as f:
                node = json.load(f)
            stored_path = node.get("metadata", {}).get("file_path", "")
            if stored_path and os.path.abspath(stored_path) == abs_target:
                timestamp = node["metadata"].get("timestamp", "")
                properties = node["metadata"].get("properties", {})
                author = node["metadata"].get("author", "")
                matches.append((stored_path, timestamp, properties, author))
        except Exception:
            continue
    if not matches:
        return None, None, {}
    matches.sort(key=lambda x: x[1])
    best = matches[-1]
    return best[0], best[1], {**best[2], "_author": best[3]}

def get_file_hash(path):
    if path.upper() == "ROOT": return "ROOT"
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()[:12]

# ─── Step 6 + 7: Lineage & Impact helpers ─────────────────────────────────────

def load_all_commits():
    """Load every commit_*.json from the script directory."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    commits = []
    for json_file in glob.glob(os.path.join(script_dir, "commit_*.json")):
        try:
            with open(json_file, "r") as f:
                node = json.load(f)
            node["_file"] = json_file
            commits.append(node)
        except Exception:
            continue
    return commits


def build_children_map(commits):
    """Returns {parent_id: [child_node, ...]} for DFS traversal."""
    from collections import defaultdict
    children = defaultdict(list)
    for node in commits:
        parents = node.get("parent_ids", [node.get("parent_id", "ROOT")])
        for pid in parents:
            children[pid].append(node)
    return children


def flag_node(node_id, status, reason):
    """Update governance_status of a committed node and append a flag record. (Step 7)"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    for json_file in glob.glob(os.path.join(script_dir, "commit_*.json")):
        try:
            with open(json_file, "r") as f:
                node = json.load(f)
            if node.get("node_id") == node_id:
                node["governance_status"] = status
                node.setdefault("governance_flags", []).append({
                    "status": status,
                    "reason": reason,
                    "flagged_at": datetime.now().isoformat(),
                })
                with open(json_file, "w") as f:
                    json.dump(node, f, indent=4)
                flag_msg = (
                    f"[auto] flag node {node_id[:8]} | "
                    f"status={status} | "
                    f"ts={datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}"
                )
                git_auto_commit(json_file, flag_msg)
                return True
        except Exception:
            continue
    return False


def _node_label(node):
    """Return a display label for a commit node."""
    kid = node.get("known_node_id")
    if kid and kid in KNOWN_NODES:
        return f"[{kid}]  {KNOWN_NODES[kid]['label']}"
    cat = node.get("category", "?")
    nid = node.get("node_id", "?")
    return f"[{nid[:8]}]  {cat}"


def _print_tree(node_id, children_map, visited, prefix=""):
    """Recursive DFS tree printer."""
    children = children_map.get(node_id, [])
    for i, child in enumerate(children):
        cid = child.get("node_id", "?")
        if cid in visited:
            continue
        visited.add(cid)
        edge = child.get("edge_label") or "──"
        status = child.get("governance_status", "HEALTHY")
        status_icon = {"HEALTHY": "✅", "OUTDATED": "⚠️ ", "COMPLIANCE_HOLD": "🚨"}.get(status, "  ")
        is_last = (i == len(children) - 1)
        branch = "└─" if is_last else "├─"
        print(f"{prefix}{branch}[{edge}]─► {status_icon} {_node_label(child)}")
        ext = "   " if is_last else "│  "
        _print_tree(cid, children_map, visited, prefix + ext)


def view_full_lineage(commits):
    print("\n" + "─" * 60)
    print("📊 FULL LINEAGE TREE")
    print("─" * 60)
    if not commits:
        print("  No commits found.")
        return
    children_map = build_children_map(commits)
    visited = set()
    print("ROOT")
    _print_tree("ROOT", children_map, visited)
    orphans = {c["node_id"] for c in commits} - visited
    if orphans:
        print(f"\n  ⚠️  {len(orphans)} orphan node(s) not reachable from ROOT:")
        for c in commits:
            if c["node_id"] in orphans:
                print(f"     • {_node_label(c)}")


def view_model_lineage(commits):
    print("\n  Select lineage view:")
    for k, v in GRAPH_MODES.items():
        print(f"    {k}. {v['label']}")
    sel = input("  Choice: ").strip()
    mode = GRAPH_MODES.get(sel)
    if not mode:
        print("  Invalid choice."); return
    allowed_ids = mode["ids"]
    filtered = commits if allowed_ids is None else [
        c for c in commits if c.get("known_node_id") in allowed_ids
    ]
    print(f"\n{'─' * 60}")
    print(f"📊 LINEAGE: {mode['label']}")
    print(f"{'─' * 60}")
    if not filtered:
        print("  No matching committed nodes found.")
        return
    children_map = build_children_map(filtered)
    visited = set()
    print("ROOT")
    _print_tree("ROOT", children_map, visited)
    orphans = {c["node_id"] for c in filtered} - visited
    if orphans:
        print(f"\n  (standalone nodes not connected to ROOT in this subgraph:)")
        for c in filtered:
            if c["node_id"] in orphans:
                print(f"     • {_node_label(c)}")


def run_impact_analysis(commits):
    print("\n  Select impact scenario:")
    for k, v in IMPACT_SCENARIOS.items():
        print(f"    {k}. {v['label']}  (trigger type: {v['trigger_type']})")
    sel = input("  Choice: ").strip()
    scenario = IMPACT_SCENARIOS.get(sel)
    if not scenario:
        print("  Invalid choice."); return

    trigger_type = scenario["trigger_type"]
    candidates = [c for c in commits if c.get("node_type") == trigger_type]
    if not candidates:
        print(f"\n  No committed nodes with node_type='{trigger_type}' found.")
        return

    print(f"\n  Select trigger node ({trigger_type}):")
    for i, c in enumerate(candidates, 1):
        status_icon = {"HEALTHY": "✅", "OUTDATED": "⚠️ ", "COMPLIANCE_HOLD": "🚨"}.get(
            c.get("governance_status", "HEALTHY"), "  ")
        print(f"    {i}. {_node_label(c)}  {status_icon}")
    ti = input("  Choice: ").strip()
    if not ti.isdigit() or not (1 <= int(ti) <= len(candidates)):
        print("  Invalid choice."); return
    trigger_node = candidates[int(ti) - 1]
    trigger_id = trigger_node["node_id"]

    # BFS downstream from trigger node
    children_map = build_children_map(commits)
    propagate_types = set(scenario["propagate_to"])
    notes = scenario["notes"]
    new_status = scenario["new_status"]

    affected = []
    queue = [trigger_id]
    visited = {trigger_id}
    while queue:
        current = queue.pop(0)
        for child in children_map.get(current, []):
            cid = child["node_id"]
            if cid not in visited:
                visited.add(cid)
                queue.append(cid)
                if child.get("node_type") in propagate_types:
                    affected.append(child)

    print(f"\n{'─' * 60}")
    print(f"💥 IMPACT ANALYSIS: {scenario['label']}")
    print(f"   Trigger: {_node_label(trigger_node)}")
    print(f"{'─' * 60}")
    if not affected:
        print("  No downstream nodes affected.")
        return

    print(f"\n  {len(affected)} affected node(s):")
    for node in affected:
        ntype = node.get("node_type", "?")
        note = notes.get(ntype, "Affected by upstream change")
        print(f"  • {_node_label(node)}  ({ntype})")
        print(f"    {note}")

    do_flag = input(f"\n  Flag all as '{new_status}'? [y/N]: ").strip().lower()
    if do_flag == "y":
        flagged_count = 0
        for node in affected:
            ntype = node.get("node_type", "?")
            note = notes.get(ntype, "Affected by upstream change")
            ok = flag_node(node["node_id"], new_status, note)
            if ok:
                flagged_count += 1
                print(f"  🚩 Flagged: {_node_label(node)}")
            else:
                print(f"  ⚠️  Not found on disk: {_node_label(node)}")
        print(f"\n  ✅ Done. {flagged_count}/{len(affected)} node(s) flagged as '{new_status}'.")


def view_lineage_log():
    commits = load_all_commits()
    print(f"\n  Loaded {len(commits)} commit(s) from disk.")
    print("  a. Full lineage tree")
    print("  b. Lineage by model / subgraph")
    print("  c. Impact analysis")
    sub = input("  Sub-option: ").strip().lower()
    if sub == "a":
        view_full_lineage(commits)
    elif sub == "b":
        view_model_lineage(commits)
    elif sub == "c":
        run_impact_analysis(commits)
    else:
        print("  Invalid sub-option.")


def run_bio_cli():
    if not os.path.exists(CONFIG_PATH):
        print("🔧 Initializing Bio-Config...")
        cfg = {"user": input("Enter Name: "), "lab": input("Enter Lab ID: "), "orcid": input("Enter ORCID (e.g. 0000-0000-0000-0000, or leave blank): ")}
        with open(CONFIG_PATH, 'w') as f: json.dump(cfg, f)

    with open(CONFIG_PATH, 'r') as f: config = json.load(f)

    print(f"\n🚀 MAI-T1D GOVERNANCE SYSTEM | User: {config['user']} | Lab: {config.get('lab', 'N/A')} | ORCID: {config.get('orcid', 'N/A')}")
    print("1. Commit Node | 2. View Lineage Log | 3. Edit Profile")
    choice = input("Select Option: ")

    if choice == '1':
        child_path = input("\n[1/4] Child Data Path: ")
        if not os.path.exists(child_path):
            print("Error: File not found."); return

        parent_paths_raw = input("      Parent Data Path(s) (comma-separated, or 'ROOT'): ")
        parent_paths = [p.strip() for p in parent_paths_raw.split(",")]
        child_id = get_file_hash(child_path)
        parent_ids = []
        for pp in parent_paths:
            if pp.upper() == "ROOT":
                parent_ids.append("ROOT")
            else:
                parent_ids.append(get_file_hash(pp))
        parent_id = parent_ids[0]  # backwards compat

        print("\n[2/4] Select Work Phase:")
        for k, v in PHASE_SCHEMA.items(): print(f"  {k}. {v['name']}")
        p_choice = input("Choice: ")
        phase_data = PHASE_SCHEMA.get(p_choice)
        if not phase_data: return

        print(f"\n[3/4] Select Category:")
        cat_list = list(phase_data['categories'].keys())
        for i, cat in enumerate(cat_list, 1): print(f"  {i}. {cat}")
        c_idx = int(input("Choice: ")) - 1
        selected_cat = cat_list[c_idx]


        node_type  = CATEGORY_TO_NODE_TYPE.get(selected_cat, "Unknown")
        edge_label = CATEGORY_TO_EDGE.get(selected_cat)


        known_node_id = None
        matching_known = [(k, v) for k, v in KNOWN_NODES.items() if v["type"] == node_type]
        if matching_known:
            print(f"\n  🔗 Known '{node_type}' nodes in the KG:")
            for i, (kid, kv) in enumerate(matching_known, 1):
                print(f"    {i}. [{kid}]  {kv['label']}")
            print(f"    0. None / New node")
            sel = input("  Link to known node (number, or Enter to skip): ").strip()
            if sel.isdigit() and 1 <= int(sel) <= len(matching_known):
                known_node_id, knode = matching_known[int(sel) - 1]
                print(f"  ✅ Linked to: [{known_node_id}] {knode['label']}")


        props = {}
        edge_train_metadata = []
        # Pre-fill from known node detail (lowest priority — overridden by commit data and user input)
        if known_node_id:
            props.update(KNOWN_NODES[known_node_id]["detail"])
        if selected_cat == "Model Training / Evaluation":

            child_path_committed, _, child_props = lookup_commit_by_path(child_path)
            if child_path_committed:
                print("\n🔍 Found prior commit for this model file — pre-filling all fields...")
                for k, v in child_props.items():
                    if not k.startswith("_"):
                        props[k] = v
                        print(f"   ✅ {k}: {v}")


            print("\n🔍 Auto-fetching training data info from parent commit(s)...")
            non_root_parents = [pp for pp in parent_paths if pp.upper() != "ROOT"]
            if not non_root_parents:
                print("   ⚠️  Parent is ROOT, skipping auto-fetch.")
            else:
                for pp in non_root_parents:
                    found_path, found_time, parent_props = lookup_commit_by_path(pp)
                    if found_path:
                        print(f"   ✅ Training Data Path      : {found_path}")
                        print(f"   ✅ Training Data Upload Time: {found_time}")
                        edge_train_metadata.append({
                            "parent_path": found_path,
                            "modality": parent_props.get("Data_Modality", ""),
                            "committed_at": found_time,
                        })
                        if "Training_Data_Path" not in props:
                            props["Training_Data_Path"] = found_path
                        if "Training_Data_Upload_Time" not in props:
                            props["Training_Data_Upload_Time"] = found_time
                        if "Pretraining_Data" not in props:
                            props["Pretraining_Data"] = found_path
                            print(f"   ✅ Pretraining Data        : {found_path}")
                    else:
                        print(f"   ⚠️  No commit found for: {pp}. Please fill in manually.")


            if "Developed_By" not in props:
                props["Developed_By"] = config['user']
                print(f"   ✅ Developed By             : {config['user']} (current user)")


        print(f"\n📝 METADATA ENTRY FOR: {selected_cat}")
        print("(Press Enter to keep pre-filled value, or type to overwrite/add)")
        for field in phase_data['categories'][selected_cat]:
            current_val = props.get(field, "")
            user_input = input(f"   > {field.replace('_', ' ')} [{current_val}]: ").strip()
            if user_input:
                props[field] = user_input
            elif not current_val:
                if field in props: del props[field]


        try:
            df = pd.read_csv(child_path)
            stats = {"shape": f"{df.shape[0]}x{df.shape[1]}", "cols": list(df.columns[:8])}
        except:
            stats = "Non-CSV Artifact"


        node = {
            "node_id": child_id,
            "parent_ids": parent_ids,
            "parent_id": parent_id,
            "edge_label": edge_label,
            "node_type": node_type,
            "known_node_id": known_node_id,
            "phase": phase_data['name'],
            "category": selected_cat,
            "governance_status": "HEALTHY",
            "metadata": {
                "author": config['user'],
                "timestamp": datetime.now().isoformat(),
                "file_path": os.path.abspath(child_path),
                "properties": props,
                "data_profiling": stats,
                "edge_train_metadata": edge_train_metadata,
            }
        }

        script_dir = os.path.dirname(os.path.abspath(__file__))
        safe_cat = "".join(c if c.isalnum() or c == "_" else "_" for c in selected_cat)
        save_name = os.path.join(script_dir, f"commit_{safe_cat}_{child_id}.json")
        with open(save_name, "w") as f:
            json.dump(node, f, indent=4)
        print(f"\n✅ Success: Node {child_id} saved to {save_name}.")
        commit_msg = (
            f"[auto] commit node {child_id[:8]} | "
            f"cat={selected_cat} | "
            f"author={config['user']} | "
            f"ts={datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}"
        )
        git_auto_commit(save_name, commit_msg)

    elif choice == '2':
        view_lineage_log()
    elif choice == '3':
        print(f"\n✏️  EDIT PROFILE  (press Enter to keep current value)")
        fields = [
            ("user",  "Name"),
            ("lab",   "Lab ID"),
            ("orcid", "ORCID"),
        ]
        for key, label in fields:
            current = config.get(key, "")
            val = input(f"   > {label} [{current}]: ").strip()
            if val:
                config[key] = val
        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=4)
        print(f"   ✅ Profile updated — Name: {config['user']} | Lab: {config.get('lab','')} | ORCID: {config.get('orcid','')}")
    else:
        print("Invalid option.")

if __name__ == "__main__":
    run_bio_cli()
