# Paper Evaluation Report

Base URL: http://127.0.0.1:5173
Generated at: 2026-04-21T00:59:31.669Z

| ID | Section | Final Intent | Intent OK | Answer Shape OK | Verdict |
|---|---|---|---|---|---|
| CQ1 | S1 | datasets_for_model | Y | Y | PASS |
| CQ2 | S1/S2 | impact_downstream | Y | Y | PASS |
| CQ3 | S1 | pipeline_for_dataset | Y | Y | PASS |
| CQ4 | S1 | donor_attribute_ratio | Y | Y | PASS |
| CQ5 | S1 | training_donor_overlap_between_models | Y | Y | PASS |
| CQ6 | S1/S9 | donor_overlap_between_models | Y | Y | PASS |
| CQ7 | S1 | provenance_chain | Y | Y | PASS |
| CQ8 | S1/S9 | search_nodes | Y | Y | PASS |
| AQ1 | S8 | compliance_status | Y | Y | PASS |
| AQ2 | S8/S9 | impact_downstream | Y | Y | PASS |
| AQ3 | S8 | provenance_chain | Y | Y | PASS |
| AQ4 | S8 | (none) | N | Y | PARTIAL |

## Answer Previews

### CQ1 (PASS)
- Question: Which datasets are used to train Genomic FM?
- Final intent: datasets_for_model
- Preview: Found 5 dataset(s) used by this model: 1. Bulk RNA-seq Dataset v1.0 (training) 2. Bulk ATAC-seq Dataset v1.0 (training) 3. scRNA-seq Dataset v1.0 (training) 4. scATAC-seq Dataset v1.0 (training) 5. snMultiomics Dataset v1.0 (training)

### CQ2 (PASS)
- Question: If the Bulk RNA QC pipeline is revised, which downstream tasks need review?
- Final intent: impact_downstream
- Preview: Downstream tasks impacted by changes to Bulk RNA QC Pipeline v1.0: 1. 1. Downstream Task 5 (Finetuned scFM)

### CQ3 (PASS)
- Question: What is the QC pipeline version that generates the Bulk ATAC-seq dataset?
- Final intent: pipeline_for_dataset
- Preview: Dataset: Bulk ATAC-seq Dataset v1.0 Pipeline: Bulk ATAC QC Pipeline v1.0 Version: v1.0 Owner/Contact: Xinyu Bao Email: xinyubao@umich.edu

### CQ4 (PASS)
- Question: Disease stage distribution of model Genomic FM training data.
- Final intent: donor_attribute_ratio
- Preview: In the current donor set (94), the proportion of Unknown is 0.00% (0/94). Attribute mode: disease, split: training. Composition: T2D=18, ND=57, T1D=19

### CQ5 (PASS)
- Question: Which donors are shared between Genomic FM and Spatial FM training sets?
- Final intent: training_donor_overlap_between_models
- Preview: Between Genomic FM v1 (EPCOT-v2) and Spatial FM v1 (Kronos), there are 91 overlapping donors in training / training splits. Genomic FM v1 (EPCOT-v2) has 94 donors and Spatial FM v1 (Kronos) has 151; overlap ratio is 96.8% (relative to model A) and 60.3% (relat

### CQ6 (PASS)
- Question: Are there donors in Genomic FM training that also appear in Spatial FM validation?
- Final intent: donor_overlap_between_models
- Preview: Between Genomic FM v1 (EPCOT-v2) and Spatial FM v1 (Kronos), there are 0 overlapping donors in training / evaluation splits. Genomic FM v1 (EPCOT-v2) has 94 donors and Spatial FM v1 (Kronos) has 43; overlap ratio is 0.0% (relative to model A) and 0.0% (relativ

### CQ7 (PASS)
- Question: Show the full provenance chain for sample HPAP-001.
- Final intent: provenance_chain
- Preview: The provenance chain for sample HPAP-001 shows a limited lineage scope. The search identified the donor node 'donor_hpap_001' (HPAP-001) as the primary entity, along with several associated BCR-seq sample replicates. However, the provenance chain query returne

### CQ8 (PASS)
- Question: Which planned configs reference deprecated CellRanger processed files?
- Final intent: search_nodes
- Preview: Based on the available evidence, I cannot identify which planned configs reference deprecated CellRanger processed files. The search results returned various dataset cards (BCR-seq, Bulk ATAC, Bulk RNA, CITE-seq, CODEX, CyTOF, Flow Cytometry, Histology, IMC, O

### AQ1 (PASS)
- Question: What is the compliance status of all FM models right now?
- Final intent: compliance_status
- Preview: Models checked: 5. Compliance hold: 0.

### AQ2 (PASS)
- Question: If HPAP-010 becomes T1D, what is the impact scope across datasets, models, and tasks?
- Final intent: impact_downstream
- Preview: Downstream impact overview for changes to HPAP-010: Impacted samples: 27, datasets: 29, models: 8, downstream tasks: 3. Impacted data modalities: Bulk ATAC-seq, Bulk RNA-seq, CyTOF, Flow Cytometry, Genomic FM Embedding (all modalities v1), Histology, Oxygen Co

### AQ3 (PASS)
- Question: Reconstruct provenance for Genomic FM with full upstream chain.
- Final intent: provenance_chain
- Preview: Provenance chain contains 11 node(s): 1. Genomic FM v1 (EPCOT-v2) [Model] 2. Bulk RNA-seq Dataset v1.0 (training) [ProcessedData] 3. Bulk RNA-seq Dataset v1.0 (evaluation) [ProcessedData] 4. Bulk ATAC-seq Dataset v1.0 (training) [ProcessedData] 5. Bulk ATAC-se

### AQ4 (PARTIAL)
- Question: Show governance change log events in 2024 Q1.
- Final intent: (none)
- Preview: I don't see any governance change log events or audit trail functionality in the available tools. The system appears to track data lineage, model training relationships, and donor information, but doesn't include temporal change logs or event history. Could yo