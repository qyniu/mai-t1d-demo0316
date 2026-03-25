🌟 Vision
The MAI-T1D Provenance Engine is a lightweight CLI-based version control system designed to capture biological metadata at the moment of generation. It automates the documentation process for researchers and constructs a real-time Knowledge Graph from Raw Data → QC → Metadata → AI-Ready → Model, ensuring FAIR (Findable, Accessible, Interoperable, Reusable) standards for T1D research.

🛠️ Core Modules
1. Identity & Secure Audit
Command: Automatic initialization on first run.

Function: Binds every commit to a specific User Name, ORCID, and Lab ID.

Value: Creates an immutable audit trail, solving the "who touched this data" problem in collaborative clinical research.

2. Intelligent Profiling Extractor
Content Fingerprinting (SHA-256): Generates a unique 12-character ID based on file content. Any 1-byte change in the data results in a new ID, preventing version confusion.

Auto-Profiling: Automatically detects biological stats such as Unique Donor Counts, data dimensions, and missing value ratios.

AI-Generated Summaries: Integrated with Gemini Flash LLM to generate technical descriptions (e.g., "This dataset contains 5,000 cell samples with Harmony batch correction applied").

3. Provenance Commit & Mapping
Strictly aligned with T1D research practices, supporting specialized node types:

RAW: Captures Modality (scRNA/Imaging), Batch, and Storage Links.

QC: Tracks Doublet Removal, Labeling Tools, and Batch Correction methods.

METADATA: Links Donor IDs, Disease Duration, and Antibody Profiles.

AI-READY: Documents Tokenization and Dimensionality Reduction parameters.

MODEL: Records Architecture, Validation Metrics (F1-Score), and Contact info.

4. Recursive Governance & Alerting (The "Kill Switch")
Command: Selection 2. Alert System.

Logic: If a data node is flagged as AFFECTED (e.g., due to contamination or bias), the engine recursively propagates this status downstream.

Value: Instantly identifies and isolates all downstream QC files, matrices, and AI models that relied on the compromised data, ensuring research integrity.

🚀 Quick Start
Prerequisites
Bash
pip install pandas requests
Execution
Bash
python mai_t1d0316.py
Typical Workflow
Setup: Complete the one-time ORCID identity binding.

Commit: Select 1 and provide a CSV path. The engine fingerprints the file and calls the AI for profiling.

Audit: Select 3 to view the Provenance Log (a hierarchical tree of your research history).

Alert: Input a Node ID to trigger a system-wide risk isolation if data issues are found.

📊 Solutions for Modern Research
Automated Documentation: Replaces 80% of manual "data tracking" forms with automated CLI capture.

Data-Model Decoupling: Tracks lineage even when data and models are managed by different teams.

FAIR Compliance: Every data version has a fingerprint, timestamp, and responsible author, meeting the highest standards for clinical data audits.

📜 MAI-T1D Auto-Profiling System: Data Definition Guide
This document defines the schema for the MAI-T1D Data Provenance System. It ensures every data node is captured with its lineage (Parent-Child) and specific biological/technical metadata.

🟢 WORK PHASE: PREPARE
This phase covers the transition from raw biological samples to machine-learning-ready features.

1. Raw HPAP Data
Definition: The initial data generated directly from the HPAP lab.

Required Fields:

Data Modality: e.g., scRNA-seq, snATAC, Imaging.

Batch / Lab Source: Originating facility and batch ID.

Cell Type: Initial targeted cell population.

2. QC & Filtering
Definition: The "cleaning" stage where noise is removed.

Required Fields:

Doublet Removal: Method used to exclude double-cell droplets.

Annotation Refinement: Updates or corrections to cell type labels.

Cell Integration: Method used to merge different batches (e.g., Harmony, Seurat).

3. Metadata Alignment
Definition: Enriching biological data with clinical donor context.

Required Fields:

Donor ID Linkage: Unique identifier mapping data to a specific donor.

Disease Duration: Time since T1D onset for the donor.

Antibody Profile: Autoantibody status (e.g., GAD+, ZnT8-).

4. AI-Ready Data Construction
Definition: Final feature engineering before model training.

Required Fields:

Tokenization: Method for converting sequences/features into tokens.

Peak-gene Pairing: Mapping regulatory regions to gene expression.

Dimensional Reduction: Techniques like PCA, UMAP, or t-SNE parameters.

🔵 WORK PHASE: TRAIN
This phase documents the training process and the resulting model behavior.

5. Model Training / Evaluation
Definition: Capturing the "brain" of the AI and its performance.

Required Fields:

Which Model: Model architecture/name (e.g., scGPT v2).

Input or Validation: Defines if the file is training data or a validation set.

Training Timestamp: Exact date and time the training job was executed.

Contact: Principal investigator or lead researcher responsible.

🔴 WORK PHASE: POST-TRAIN
This phase ensures long-term reproducibility and deployment tracking.

6. Registry & Version Tracking
Definition: Finalizing the artifact for the knowledge graph registry.

Required Fields:

Dataset Version ID: Unique version for the data bundle.

Model Version ID: Unique version for the trained weights.

QC Pipeline Version: Version of the code used for preprocessing.

Git / Storage Path: Direct link to the source code (GitHub) and file storage (S3/Azure).

## Deploy (Vercel) with hidden API key

1. Push this folder (`mai-t1d-demo0316`) to GitHub.
2. In Vercel, import the repo and set **Root Directory** to `mai-t1d-demo0316`.
3. Set environment variable in Vercel project settings:
   - `ANTHROPIC_API_KEY=...`
4. Deploy.

Notes:
- Frontend calls `/api/anthropic/messages`.
- API key stays only on server (Vercel env var), never exposed to browser code.
- Local development still works with `.env` + `npm run dev`.
