import pandas as pd
import requests
import os
import json
import hashlib
import glob
from datetime import datetime

# --- Configuration ---
# Replace with your actual API Key for production
API_KEY = "AIzaSyBNl12kLsDJBQUR5ssKYwwYJ7QeTDvraUY".strip()
CONFIG_PATH = os.path.expanduser("~/.bio_config")

# --- Structured Schema (3 Phases, 6 Categories) ---
# This schema maps the Work Phases to the specific categories and sub-fields 
# requested by the supervisor.
PHASE_SCHEMA = {
    "1": {
        "name": "Prepare",
        "categories": {
            "Raw HPAP Data": ["Data_Modality", "Batch_Lab_Source", "Cell_Type"],
            "QC & Filtering": ["Doublet_Removal", "Annotation_Refinement", "Cell_Integration"],
            "Metadata Alignment": ["Donor_ID_Linkage", "Disease_Duration", "Antibody_Profile"],
            "AI-Ready Data Construction": ["Tokenization", "Peak_Gene_Pairing", "Dimensional_Reduction"]
        }
    },
    "2": {
        "name": "Train",
        "categories": {
            "Model Training / Evaluation": ["Which_Model", "Input_or_Validation", "Training_Timestamp", "Contact"]
        }
    },
    "3": {
        "name": "Post-train",
        "categories": {
            "Registry & Version Tracking": ["Dataset_Version_ID", "Model_Version_ID", "QC_Pipeline_Version", "Git_Storage_Path"]
        }
    }
}

def get_file_hash(path):
    """Generates a 12-character SHA-256 hash to ensure data immutability."""
    if path.upper() == "ROOT": return "ROOT"
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()[:12]

def check_duplicate_node(fid):
    """Checks if a data node with the same content hash already exists locally."""
    files = glob.glob("commit_*.json")
    for f in files:
        with open(f, 'r') as j:
            data = json.load(j)
            if data.get("node_id") == fid: return data
    return None

def bio_alert(target_id, reason="Quality issue detected"):
    """
    Triggers a recursive alert. If a parent node is marked AFFECTED, 
    all downstream child nodes are automatically flagged.
    """
    print(f"\n[!] ALERT: Propagating risk for node {target_id}...")
    files = glob.glob("commit_*.json")
    
    def propagate(current_id):
        count = 0
        for f in files:
            with open(f, 'r+') as j:
                data = json.load(j)
                if data.get("parent_id") == current_id:
                    if data.get("governance_status") != "AFFECTED":
                        data.update({"governance_status": "AFFECTED", "alert_reason": reason})
                        j.seek(0); json.dump(data, j, indent=4); j.truncate()
                        print(f"    -> Flagged Downstream: {data.get('node_id')} ({data.get('category')})")
                        count += 1 + propagate(data.get("node_id"))
        return count

    total = propagate(target_id)
    print(f"Governance Sync Complete. {total} downstream nodes impacted.")

def show_bio_log():
    """Displays a tree-like view of the data provenance (Lineage)."""
    files = glob.glob("commit_*.json")
    if not files: 
        print("\nProvenance log is empty."); return
        
    nodes = {d['node_id']: d for d in [json.load(open(f)) for f in files]}
    print("\n" + "="*70)
    print("MAI-T1D PROVENANCE LOG (FAIR Audit Trail)")
    print("="*70)
    
    for nid, d in nodes.items():
        # Display root nodes and their children
        if d['parent_id'] == "ROOT":
            status = "HEALTHY" if d.get('governance_status') == "HEALTHY" else "AFFECTED"
            print(f"📦 [ROOT] ID: {nid} | Phase: {d['phase']} | Status: {status}")
            for cid, cd in nodes.items():
                if cd['parent_id'] == nid:
                    c_status = "OK" if cd.get('governance_status') == "HEALTHY" else "!!"
                    print(f"    └── 🧬 [CHILD] ID: {cid} | Cat: {cd['category']} | {c_status}")
    print("="*70)

def ask_gemini(prompt):
    """Calls Gemini API to generate a technical summary of the data node."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={API_KEY}"
    try:
        payload = {"contents": [{"parts": [{"text": prompt + " Return a 1-sentence bio-technical summary."}]}]}
        r = requests.post(url, json=payload, timeout=10)
        return r.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    except Exception:
        return "AI Summary Unavailable (Check API connection)"

def run_bio_cli():
    """Main CLI entry point for the Auto-Profiling System."""
    # Initialize Configuration
    if not os.path.exists(CONFIG_PATH):
        print("🔧 Initializing Bio-Config...")
        cfg = {"user": input("Enter Name: "), "lab": input("Enter Lab ID: ")}
        with open(CONFIG_PATH, 'w') as f: json.dump(cfg, f)
    
    with open(CONFIG_PATH, 'r') as f: config = json.load(f)
    
    print(f"\n🚀 MAI-T1D GOVERNANCE SYSTEM | User: {config['user']}")
    print("1. Commit Node | 2. Trigger Alert | 3. View Lineage Log")
    choice = input("Select Option (1/2/3): ")

    if choice == '1':
        # --- Step 1: Path Binding ---
        child_path = input("\n[1/3] Child Data Path: ")
        if not os.path.exists(child_path): 
            print("Error: File not found."); return
            
        parent_path = input("      Parent Data Path (or 'ROOT'): ")
        if parent_path.upper() != "ROOT" and not os.path.exists(parent_path):
            print("Error: Parent file not found."); return

        child_id = get_file_hash(child_path)
        parent_id = get_file_hash(parent_path)
        
        # Prevent redundant commits
        if check_duplicate_node(child_id):
            print(f"Note: Node {child_id} already exists in registry.")
            if input("Proceed anyway? (y/n): ").lower() != 'y': return

        # --- Step 2: Phase Selection ---
        print("\n[2/3] Select Work Phase:")
        for k, v in PHASE_SCHEMA.items():
            print(f"  {k}. {v['name']}")
        p_choice = input("Choice: ")
        if p_choice not in PHASE_SCHEMA: return
        
        phase_data = PHASE_SCHEMA[p_choice]
        
        # --- Step 3: Category & Sub-field Input ---
        print(f"\n[3/3] Select Input Category in {phase_data['name']}:")
        cat_list = list(phase_data['categories'].keys())
        for i, cat in enumerate(cat_list, 1):
            print(f"  {i}. {cat}")
        c_choice = int(input("Choice: ")) - 1
        selected_cat = cat_list[c_choice]

        print(f"\n📝 Entering Metadata for {selected_cat}:")
        props = {}
        for field in phase_data['categories'][selected_cat]:
            props[field.lower()] = input(f"   > {field}: ")

        # Automated Profiling (CSV Stats)
        print("🔍 Extracting Profiling Stats...")
        try:
            df = pd.read_csv(child_path)
            stats = {
                "shape": f"{df.shape[0]}x{df.shape[1]}",
                "missing_ratio": f"{(df.isnull().sum().sum()/df.size)*100:.2f}%",
                "columns": list(df.columns[:10])
            }
            summary = ask_gemini(f"T1D {selected_cat} data. Columns: {stats['columns']}")
        except Exception:
            stats = "Non-CSV file"
            summary = "Direct Binary/Image Artifact"

        # Construct Provenance Object (JSON-LD Style)
        node = {
            "node_id": child_id,
            "parent_id": parent_id,
            "phase": phase_data['name'],
            "category": selected_cat,
            "governance_status": "HEALTHY",
            "metadata": {
                "author": config['user'],
                "lab": config['lab'],
                "timestamp": datetime.now().isoformat(),
                "properties": props,
                "data_profiling": stats
            },
            "ai_summary": summary
        }

        # Save to local registry
        clean_cat = selected_cat.replace(' ', '_').replace('/', '_')
        save_name = f"commit_{clean_cat}_{child_id}.json"
        with open(save_name, "w") as f:
            json.dump(node, f, indent=4)
        print(f"\n✅ Success: Node {child_id} registered under {phase_data['name']}.")

    elif choice == '2':
        tid = input("Enter Target Node ID: ")
        reason = input("Enter Alert Reason: ")
        bio_alert(tid, reason)

    elif choice == '3':
        show_bio_log()

if __name__ == "__main__":
    run_bio_cli()