import pandas as pd
import os
import json
import hashlib
import glob
from datetime import datetime

# --- Configuration ---
CONFIG_PATH = os.path.expanduser("~/.bio_config")

# --- Expanded Schema (Aligned with provided Images) ---
PHASE_SCHEMA = {
    "1": {
        "name": "Prepare",
        "categories": {
            "Raw HPAP Data": [
                "Institution", "Lab", "Portal_Owner", "Data_Modality",
                "Donors", "Cell_Type", "Tissue", "Platform", "Access"
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
    }
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

def run_bio_cli():
    # --- 1. 初始化配置 ---
    if not os.path.exists(CONFIG_PATH):
        print("🔧 Initializing Bio-Config...")
        cfg = {"user": input("Enter Name: "), "lab": input("Enter Lab ID: ")}
        with open(CONFIG_PATH, 'w') as f: json.dump(cfg, f)

    with open(CONFIG_PATH, 'r') as f: config = json.load(f)

    print(f"\n🚀 MAI-T1D GOVERNANCE SYSTEM | User: {config['user']}")
    print("1. Commit Node | 2. View Lineage Log")
    choice = input("Select Option: ")

    if choice == '1':
        # --- 2. 路径与哈希绑定 ---
        child_path = input("\n[1/4] Child Data Path: ")
        if not os.path.exists(child_path):
            print("Error: File not found."); return

        parent_path = input("      Parent Data Path (or 'ROOT'): ")
        child_id = get_file_hash(child_path)
        parent_id = "ROOT" if parent_path.upper() == "ROOT" else get_file_hash(parent_path)

        # --- 3. 阶段与类别选择 ---
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

        # --- 4. Foundation Model 自动读取父节点信息 ---
        props = {}
        if selected_cat == "Model Training / Evaluation":
            # 4a. 从 child path 已有的 commit 中加载所有字段（re-commit 场景）
            child_path_committed, _, child_props = lookup_commit_by_path(child_path)
            if child_path_committed:
                print("\n🔍 Found prior commit for this model file — pre-filling all fields...")
                for k, v in child_props.items():
                    if not k.startswith("_"):
                        props[k] = v
                        print(f"   ✅ {k}: {v}")

            # 4b. 从 parent commit 中读取训练数据信息
            print("\n🔍 Auto-fetching training data info from parent commit...")
            if parent_path.upper() == "ROOT":
                print("   ⚠️  Parent is ROOT, skipping auto-fetch.")
            else:
                found_path, found_time, parent_props = lookup_commit_by_path(parent_path)
                if found_path:
                    print(f"   ✅ Training Data Path      : {found_path}")
                    print(f"   ✅ Training Data Upload Time: {found_time}")
                    props["Training_Data_Path"] = found_path
                    props["Training_Data_Upload_Time"] = found_time
                    # Pretraining_Data 用父节点路径填充（若未从 child commit 中获取）
                    if "Pretraining_Data" not in props:
                        props["Pretraining_Data"] = found_path
                        print(f"   ✅ Pretraining Data        : {found_path}")
                else:
                    print("   ⚠️  No matching commit found for parent path. Please fill in manually.")

            # 4c. Developed_By 默认用当前用户（若未从 child commit 中获取）
            if "Developed_By" not in props:
                props["Developed_By"] = config['user']
                print(f"   ✅ Developed By             : {config['user']} (current user)")

        # --- 5. 手动元数据录入 ---
        print(f"\n📝 METADATA ENTRY FOR: {selected_cat}")
        print("(Press Enter to keep pre-filled value, or type to overwrite/add)")
        for field in phase_data['categories'][selected_cat]:
            current_val = props.get(field, "")
            user_input = input(f"   > {field.replace('_', ' ')} [{current_val}]: ").strip()
            if user_input:
                props[field] = user_input
            elif not current_val:
                if field in props: del props[field]

        # --- 6. 数据概况 ---
        try:
            df = pd.read_csv(child_path)
            stats = {"shape": f"{df.shape[0]}x{df.shape[1]}", "cols": list(df.columns[:8])}
        except:
            stats = "Non-CSV Artifact"

        # --- 7. 构造并保存 JSON ---
        node = {
            "node_id": child_id,
            "parent_id": parent_id,
            "phase": phase_data['name'],
            "category": selected_cat,
            "governance_status": "HEALTHY",
            "metadata": {
                "author": config['user'],
                "timestamp": datetime.now().isoformat(),
                "file_path": os.path.abspath(child_path),
                "properties": props,
                "data_profiling": stats
            }
        }

        script_dir = os.path.dirname(os.path.abspath(__file__))
        save_name = os.path.join(script_dir, f"commit_{selected_cat.replace(' ', '_')}_{child_id}.json")
        with open(save_name, "w") as f:
            json.dump(node, f, indent=4)
        print(f"\n✅ Success: Node {child_id} saved to {save_name}.")

if __name__ == "__main__":
    run_bio_cli()
