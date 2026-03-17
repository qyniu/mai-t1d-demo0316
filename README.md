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