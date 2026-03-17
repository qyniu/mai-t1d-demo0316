import pandas as pd
import requests
import os
import json
import hashlib
import glob
from datetime import datetime

# --- Configuration ---
API_KEY = "AIzaSyBNl12kLsDJBQUR5ssKYwwYJ7QeTDvraUY".strip()
CONFIG_PATH = os.path.expanduser("~/.bio_config")

NODE_SCHEMA = {
    "RAW": ["Modality", "Batch", "Storage_Link"],
    "QC": ["Doublet_Removal_Method", "Labeling_Tool", "Batch_Correction"],
    "METADATA": ["Donor_ID", "Disease_Duration", "Antibody_Profile"],
    "AI-READY": ["Tokenization_Method", "Dim_Reduction"],
    "MODEL": ["Architecture", "F1_Score", "Contact"]
}

def get_file_hash(path):
    """Logic: It uses the SHA-256 algorithm to create a 12-character 
    unique ID based on the file content.

    Value: This makes the data immutable. If a researcher changes a 
    single value in a CSV, the ID changes. It eliminates confusion over 
    "which version of the data" was used.
    """
    sha256 = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return sha256.hexdigest()[:12]

def check_duplicate_node(fid):
    """This provides Redundancy Control. Before saving, it checks if this 
    exact data has been uploaded before (even under a different filename).
    """
    files = glob.glob("commit_*.json")
    for f in files:
        with open(f, 'r') as j:
            data = json.load(j)
            if data.get("node_id") == fid: return data
    return None

def bio_alert(target_id, reason="Data quality issue detected"):
    """
    This is the most "intelligent" part of your code—the Bio-Alert function.

    Logic: It uses Recursion. If you mark a "Raw Data" node as AFFECTED 
    (e.g., due to contamination), the code doesn't just stop there. It 
    automatically "walks down the tree" to find every QC file, every 
    AI-ready matrix, and every Model that was built using that data.

    Value: It provides Automatic Risk Isolation. In traditional labs, if a 
    sample is found to be bad months later, it’s almost impossible to find 
    every model it affected. Here, it happens in seconds.
    """
    print(f"\n🚨 ALERT: Tracing downstream lineage for {target_id}...")
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
                        print(f"   ⚠️ Affected Downstream: {data.get('node_id')} [{data.get('type')}]")
                        count += 1 + propagate(data.get("node_id"))
        return count
    total = propagate(target_id)
    print(f"✅ Governance sync complete. {total} downstream nodes marked.")

def show_bio_log():
    """
    This generates the FAIR Audit Trail.

    Structure: It organizes nodes into a Parent-Child hierarchy (📦 ROOT 
    -> 🧬 CHILD).

    Status Tracking: It visually flags health status (✅ vs ❌). This 
    allows a supervisor to see the entire history of a T1D project at a 
    glance, knowing exactly who did what, when, and if the results are 
    still valid.
    """
    files = glob.glob("commit_*.json")
    if not files: print("\n📭 No commits found."); return
    nodes = {d['node_id']: d for d in [json.load(open(f)) for f in files]}
    print("\n" + "="*60 + "\n📜 MAI-T1D PROVENANCE LOG (FAIR Audit Trail)\n" + "="*60)
    for nid, d in nodes.items():
        if d['parent_id'] == "ROOT":
            status = "✅ HEALTHY" if d.get('governance_status') == "HEALTHY" else f"❌ AFFECTED ({d.get('alert_reason')})"
            print(f"📦 [ROOT]  ID: {nid} | Type: {d['type']} | Status: {status}")
            for cid, cd in nodes.items():
                if cd['parent_id'] == nid:
                    c_status = "✅" if cd.get('governance_status') == "HEALTHY" else "❌"
                    print(f"    └── 🧬 [CHILD] ID: {cid} | Type: {cd['type']} | {c_status}")
    print("="*60)

def ask_gemini(prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={API_KEY}"
    try:
        r = requests.post(url, json={"contents": [{"parts": [{"text": prompt + " Return 1-sentence bio-technical summary."}]}]}, timeout=10)
        return r.json()['candidates'][0]['content']['parts'][0]['text'].strip()
    except: return "AI Analysis Offline"

def run_bio_cli():
    if not os.path.exists(CONFIG_PATH):
        print("🔧 First-time Setup...")
        cfg = {"user": input("User Name: "), "orcid": input("ORCID: "), "lab": input("Lab ID: ")}
        with open(CONFIG_PATH, 'w') as f: json.dump(cfg, f)
    
    with open(CONFIG_PATH, 'r') as f: config = json.load(f)
    print("\n🚀 MAI-T1D GOVERNANCE ENGINE\n1. Commit Node | 2. Alert System | 3. View Log")
    choice = input("Selection (1/2/3): ")

    if choice == '2':
        bio_alert(input("Target Node ID: "), input("Reason for Alert: "))
    elif choice == '3':
        show_bio_log()
    elif choice == '1':
        path = input("Data Path: ")
        if not os.path.exists(path): print("❌ File not found."); return
        
        fid = get_file_hash(path)
        existing = check_duplicate_node(fid)
        if existing:
            print(f"\n[!] DUPLICATE DETECTED: Node {fid} already exists (Author: {existing['metadata']['author']}).")
            if input("Proceed with duplicate entry? (y/n): ").lower() != 'y': return

        parent = input("Parent ID (default ROOT): ") or "ROOT"
        node_type = input(f"Type ({', '.join(NODE_SCHEMA.keys())}): ").upper()
        
        print("🔍 Extracting Bio-Stats...")
        df = pd.read_csv(path)
        missing_pct = (df.isnull().sum().sum() / df.size) * 100
        # Auto-detect Donor columns
        donor_cols = [c for c in df.columns if any(k in c.lower() for k in ['donor', 'subject', 'pt_id', 'name'])]
        donors = df[donor_cols[0]].nunique() if donor_cols else "Unknown"

        props = {f.lower(): input(f"   > {f}: ") for f in NODE_SCHEMA.get(node_type, [])}
        summary = ask_gemini(f"T1D study. {node_type} data. {donors} donors. Columns: {list(df.columns[:10])}")

        node = {
            "@context": "https://schema.mai-t1d.org/",
            "node_id": fid, "parent_id": parent, "type": node_type,
            "governance_status": "HEALTHY",
            "metadata": {
                "author": config['user'], "lab": config['lab'], "timestamp": datetime.now().isoformat(),
                "properties": props,
                "data_stats": {"shape": f"{df.shape[0]}x{df.shape[1]}", "missing_ratio": f"{missing_pct:.2f}%", "unique_donors": donors}
            },
            "ai_analysis": summary
        }

        with open(f"commit_{node_type}_{fid}.json", "w") as f:
            json.dump(node, f, indent=4)
        print(f"✅ Node {fid} linked to {parent}. Metadata secured.")

if __name__ == "__main__":
    run_bio_cli()