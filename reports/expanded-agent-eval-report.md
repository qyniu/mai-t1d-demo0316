# Expanded Agent Eval Report

Base URL: http://127.0.0.1:5173
Generated at: 2026-04-21T01:16:20.785Z

## Summary
- Total questions: 28
- Intent match rate: 60.7%
- Answered-user-question rate (primary): 96.4%
- Graph-consistency rate (primary): 85.7%
- Final verdicts: PASS 24, PARTIAL 3, FAIL 1
- Avg processing time: 5621.2 ms
- Avg precision (applicable cases): 0.889
- Avg recall (applicable cases): 0.889
- Note: precision/recall are auxiliary set-match metrics only; primary evaluation is answer adequacy + graph consistency.
- Metrics-applicable questions: 27/28
- Graph nodes/edges: 4034/10778
- Node-type coverage (actual-result touched): 6/8 (75.0%)
- Edge-label coverage (actual-result touched): 4/11 (36.4%)
- Node types touched: DownstreamTask, FineTunedModel, Model, ModelCard, ProcessedData, RawData
- Edge labels touched: DOCUMENTED_BY, EMBEDDED_BY, EVALUATED_ON, TRAINED_ON

## Per-question Results
| ID | Group | Oracle Intent | Final Intent | Answered Q? | Graph Consistent? | Verdict | Latency (ms) | Oracle Rows | Actual Rows | Precision | Recall |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|
| CM1 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 10880 | 89 | 89 | 1.000 | 1.000 |
| CM2 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 8954 | 91 | 91 | 1.000 | 1.000 |
| CM3 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 14100 | 52 | 52 | 1.000 | 1.000 |
| CM4 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 9932 | 134 | 134 | 1.000 | 1.000 |
| CM5 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 10960 | 47 | 47 | 1.000 | 1.000 |
| CM6 | S9.2-overlap | donor_overlap_between_models | training_donor_overlap_between_models | Y | Y | PASS | 13027 | 49 | 49 | 1.000 | 1.000 |
| CM7 | S9.2-leakage | donor_overlap_between_models | donor_overlap_between_models | Y | Y | PASS | 7945 | 17 | 17 | 1.000 | 1.000 |
| CM8 | S9.2-leakage | donor_overlap_between_models | donor_overlap_between_models | Y | Y | PASS | 3256 | 0 | 0 | 1.000 | 1.000 |
| CM9 | S9.2-leakage | donor_overlap_between_models | donor_overlap_between_models | Y | Y | PASS | 6859 | 0 | 0 | 1.000 | 1.000 |
| CM10 | S9.2-leakage | donor_overlap_between_models | donor_overlap_between_models | Y | Y | PASS | 3574 | 0 | 0 | 1.000 | 1.000 |
| G1 | Q1 | datasets_for_model | datasets_for_model | Y | Y | PASS | 2816 | 5 | 5 | 1.000 | 1.000 |
| G2 | Q1 | models_for_dataset | models_for_dataset | Y | Y | PASS | 2610 | 1 | 1 | 1.000 | 1.000 |
| G3 | Q1 | pipeline_for_dataset | pipeline_for_dataset | Y | Y | PASS | 2638 | 1 | 1 | 1.000 | 1.000 |
| G4 | Q1 | qc_pipeline_owner | (none) | Y | N | PARTIAL | 3656 | 1 | 0 | 0.000 | 0.000 |
| G5 | Q1 | provenance_chain | provenance_chain | Y | Y | PASS | 2783 | 11 | 11 | 1.000 | 1.000 |
| G6 | Q2 | impact_downstream | impact_downstream | Y | Y | PASS | 2523 | 24 | 24 | 1.000 | 1.000 |
| G7 | Q2 | impact_downstream | impact_downstream | Y | Y | PASS | 2594 | 24 | 24 | 1.000 | 1.000 |
| G8 | Bias | donor_attribute_ratio | donor_attribute_ratio | Y | Y | PASS | 3063 | 94 | 94 | 1.000 | 1.000 |
| G9 | Entity | node_detail | node_detail | Y | Y | PASS | 12203 | 1 | 1 | 1.000 | 1.000 |
| G10 | Cards | card_links | get_neighbors | Y | N | PARTIAL | 3442 | 5 | 0 | 0.000 | 0.000 |
| G11 | AQ1 | compliance_status | compliance_status | Y | Y | PASS | 81 | 5 | 5 | 1.000 | 1.000 |
| G12 | AQ4 | governance_events_by_period | (none) | N | N | FAIL | 5004 | 0 | 0 | 1.000 | 1.000 |
| G13 | Search | search_nodes | search_nodes | Y | Y | PASS | 2442 | 20 | 20 | 1.000 | 1.000 |
| G14 | DonorExtract | training_donors_by_models | extract_donors | Y | Y | PASS | 3149 | 2 | 154 | N/A | N/A |
| G15 | Leakage | embedding_leakage_between_models | embedding_leakage_between_models | Y | Y | PASS | 3335 | 0 | 0 | 1.000 | 1.000 |
| G16 | WhatIf | impact_downstream | impact_downstream | Y | Y | PASS | 3125 | 67 | 67 | 1.000 | 1.000 |
| G17 | Q1 | get_neighbors | get_neighbors | Y | Y | PASS | 2776 | 12 | 12 | 1.000 | 1.000 |
| G18 | Cross3 | shared_donors_three_fms | set_operation | Y | N | PARTIAL | 9667 | 49 | 0 | 0.000 | 0.000 |

## Answer Previews

### CM1
- Question: How many donors overlap between Genomic FM and Protein FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 10880 ms
- Preview: 89 donors overlap between Genomic FM (model_genomic) and Protein FM (model_protein) training sets. Detailed breakdown: - Genomic FM training set: 94 donors total - Protein FM training set: 137 donors total - Overlapping donors: 89 donors - Overlap ratio for Ge

### CM2
- Question: How many donors overlap between Genomic FM and Spatial FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 8954 ms
- Preview: There are **91 donors** that overlap between Genomic FM and Spatial FM training sets. Detailed breakdown: - **Genomic FM training donors**: 94 total - **Spatial FM training donors**: 151 total - **Shared donors**: 91 - **Overlap ratio for Genomic FM**: 96.8% (

### CM3
- Question: How many donors overlap between Genomic FM and Single-cell FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 14100 ms
- Preview: There are **52 donors** that overlap between Genomic FM and Single-cell FM training sets. **Key findings:** - **Genomic FM training set:** 94 donors total - **Single-cell FM training set:** 52 donors total - **Overlap:** 52 donors (100% of Single-cell FM's tra

### CM4
- Question: How many donors overlap between Protein FM and Spatial FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 9932 ms
- Preview: 134 donors overlap between Protein FM and Spatial FM training sets. Detailed breakdown: - Protein FM v1 training set: 137 donors total - Spatial FM v1 (Kronos) training set: 151 donors total - Overlap: 134 donors (97.8% of Protein FM donors, 88.7% of Spatial F

### CM5
- Question: How many donors overlap between Protein FM and Single-cell FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 10960 ms
- Preview: There are **47 donors** that overlap between Protein FM v1 and Single-cell FM v1 training sets. **Training Set Details:** - Protein FM v1: 137 total training donors - Single-cell FM v1: 52 total training donors - Overlap: 47 donors **Overlap Ratios:** - 34.3% 

### CM6
- Question: How many donors overlap between Single-cell FM and Spatial FM training sets?
- Oracle intent: donor_overlap_between_models
- Final intent: training_donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 13027 ms
- Preview: 49 donors overlap between Single-cell FM and Spatial FM training sets. Detailed breakdown: - Single-cell FM has 52 training donors total - Spatial FM has 151 training donors total - 49 donors are shared between both models' training sets - This represents 94.2

### CM7
- Question: How many donors appear in Genomic FM training and Protein FM validation?
- Oracle intent: donor_overlap_between_models
- Final intent: donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 7945 ms
- Preview: There are 17 donors that appear in both Genomic FM training and Protein FM validation sets. Details: - Genomic FM training set has 94 total donors - Protein FM validation set has 55 total donors - 17 donors overlap between the two sets - This represents 18.1% 

### CM8
- Question: How many donors appear in Genomic FM training and Spatial FM validation?
- Oracle intent: donor_overlap_between_models
- Final intent: donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 3256 ms
- Preview: Between Genomic FM v1 (EPCOT-v2) and Spatial FM v1 (Kronos), there are 0 overlapping donors in training / evaluation splits. Genomic FM v1 (EPCOT-v2) has 94 donors and Spatial FM v1 (Kronos) has 43; overlap ratio is 0.0% (relative to model A) and 0.0% (relativ

### CM9
- Question: How many donors appear in Protein FM training and Single-cell FM validation?
- Oracle intent: donor_overlap_between_models
- Final intent: donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 6859 ms
- Preview: Between Protein FM v1 and Single-cell FM v1 (EpiAgent), there are 0 overlapping donors in training / evaluation splits. Protein FM v1 has 137 donors and Single-cell FM v1 (EpiAgent) has 20; overlap ratio is 0.0% (relative to model A) and 0.0% (relative to mode

### CM10
- Question: How many donors appear in Single-cell FM training and Spatial FM validation?
- Oracle intent: donor_overlap_between_models
- Final intent: donor_overlap_between_models
- Answered question: Y (overlap_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 3574 ms
- Preview: Between Single-cell FM v1 (EpiAgent) and Spatial FM v1 (Kronos), there are 0 overlapping donors in training / evaluation splits. Single-cell FM v1 (EpiAgent) has 52 donors and Spatial FM v1 (Kronos) has 43; overlap ratio is 0.0% (relative to model A) and 0.0% 

### G1
- Question: Which datasets are used to train Genomic FM?
- Oracle intent: datasets_for_model
- Final intent: datasets_for_model
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2816 ms
- Preview: Found 5 dataset(s) used by this model: 1. Bulk RNA-seq Dataset v1.0 (training) 2. Bulk ATAC-seq Dataset v1.0 (training) 3. scRNA-seq Dataset v1.0 (training) 4. scATAC-seq Dataset v1.0 (training) 5. snMultiomics Dataset v1.0 (training)

### G2
- Question: Which models use the Bulk ATAC-seq dataset?
- Oracle intent: models_for_dataset
- Final intent: models_for_dataset
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2610 ms
- Preview: Found 1 model(s) that used this dataset: 1. Genomic FM v1 (EPCOT-v2)

### G3
- Question: What is the QC pipeline version that generates the Bulk ATAC-seq dataset?
- Oracle intent: pipeline_for_dataset
- Final intent: pipeline_for_dataset
- Answered question: Y (pipeline_version_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2638 ms
- Preview: Dataset: Bulk ATAC-seq Dataset v1.0 Pipeline: Bulk ATAC QC Pipeline v1.0 Version: v1.0 Owner/Contact: Xinyu Bao Email: xinyubao@umich.edu

### G4
- Question: Who owns the Bulk ATAC QC pipeline v1.0?
- Oracle intent: qc_pipeline_owner
- Final intent: (none)
- Answered question: Y (generic_nonempty)
- Graph consistent: N (none_intent_with_nonempty_oracle)
- Verdict: PARTIAL
- Latency: 3656 ms
- Preview: The Bulk ATAC QC pipeline v1.0 is owned by Xinyu Bao. The contact email is xinyubao@umich.edu. The pipeline is located at path /nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow and is version v1.0.

### G5
- Question: Reconstruct provenance for Genomic FM with full upstream chain.
- Oracle intent: provenance_chain
- Final intent: provenance_chain
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2783 ms
- Preview: Provenance chain contains 11 node(s): 1. Genomic FM v1 (EPCOT-v2) [Model] 2. Bulk RNA-seq Dataset v1.0 (training) [ProcessedData] 3. Bulk RNA-seq Dataset v1.0 (evaluation) [ProcessedData] 4. Bulk ATAC-seq Dataset v1.0 (training) [ProcessedData] 5. Bulk ATAC-se

### G6
- Question: Which models are downstream of HPAP-002?
- Oracle intent: impact_downstream
- Final intent: impact_downstream
- Answered question: Y (impact_models_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2523 ms
- Preview: Downstream models impacted by changes to HPAP-002: 5. 1. Protein FM v1 2. Spatial Omics FM v1 3. Spatial FM v1 (Kronos) 4. Finetuned Protein FM v1 (on scFM CITE-seq Embedding) 5. Finetuned Protein FM v2 (on scFM BCR/TCR Embedding)

### G7
- Question: Which datasets are downstream of HPAP-002?
- Oracle intent: impact_downstream
- Final intent: impact_downstream
- Answered question: Y (impact_datasets_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2594 ms
- Preview: Downstream datasets impacted by changes to HPAP-002: 9. 1. CyTOF Dataset v1.0 (training) [CyTOF] 2. Oxygen Consumption Dataset v1.0 (training) [Oxygen Consumption] 3. Histology Dataset v1.0 (training) [Histology] 4. Histology Dataset v1.0 [Histology] 5. Histol

### G8
- Question: Disease stage distribution of model Genomic FM training data.
- Oracle intent: donor_attribute_ratio
- Final intent: donor_attribute_ratio
- Answered question: Y (distribution_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 3063 ms
- Preview: In the current donor set (94), the proportion of Unknown is 0.00% (0/94). Attribute mode: disease, split: training. Composition: T2D=18, ND=57, T1D=19

### G9
- Question: Show me the metadata for HPAP-001
- Oracle intent: node_detail
- Final intent: node_detail
- Answered question: Y (node_metadata_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 12203 ms
- Preview: Based on the evidence, here is the metadata for HPAP-001: ## Donor Information - **Donor ID**: HPAP-001 - **Age**: 47 years - **Sex**: Male - **BMI**: 32.2 - **Clinical Diagnosis**: T2DM Gastric Bypass - **Disease Status**: T2DM (18 years Gastric Bypass) - **D

### G10
- Question: Which dataset cards are linked to Genomic FM model card?
- Oracle intent: card_links
- Final intent: get_neighbors
- Answered question: Y (generic_nonempty)
- Graph consistent: N (row_key_match)
- Verdict: PARTIAL
- Latency: 3442 ms
- Preview: No matching records were found in the current graph for get neighbors.

### G11
- Question: What is the compliance status of all FM models right now?
- Oracle intent: compliance_status
- Final intent: compliance_status
- Answered question: Y (compliance_focus)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 81 ms
- Preview: Models checked: 5. Compliance hold: 0.

### G12
- Question: Show governance change log events in 2024 Q1.
- Oracle intent: governance_events_by_period
- Final intent: (none)
- Answered question: N (no_oracle_evidence)
- Graph consistent: N (none_intent_with_empty_oracle)
- Verdict: FAIL
- Latency: 5004 ms
- Preview: I don't have access to governance change log events or temporal audit trails in the current graph system. The available governance intents focus on data lineage, model relationships, donor overlap analysis, and impact assessment rather than historical change t

### G13
- Question: Find nodes related to HPAP-010.
- Oracle intent: search_nodes
- Final intent: search_nodes
- Answered question: Y (explicit_search)
- Graph consistent: Y (search_grounding)
- Verdict: PASS
- Latency: 2442 ms
- Preview: Found 20 matching node(s): 1. HPAP-010 [RawData] 2. HPAP-010 BCR-seq Replicate-1 [RawData] 3. HPAP-010 BCR-seq Replicate-2 [RawData] 4. HPAP-010 BCR-seq Replicate-3 [RawData] 5. HPAP-010 BCR-seq Replicate-4 [RawData] 6. HPAP-010 Bulk ATAC-seq alpha [RawData] 7

### G14
- Question: List training donors for Genomic FM and Spatial FM.
- Oracle intent: training_donors_by_models
- Final intent: extract_donors
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (evidence_match_fallback)
- Verdict: PASS
- Latency: 3149 ms
- Preview: Extracted 154 donors (split=training, combine=union, sources=2). 1. HPAP-001 2. HPAP-002 3. HPAP-003 4. HPAP-004 5. HPAP-005 6. HPAP-006 7. HPAP-007 8. HPAP-008 9. HPAP-009 10. HPAP-010 11. HPAP-011 12. HPAP-012 13. HPAP-013 14. HPAP-014 15. HPAP-015 16. HPAP-

### G15
- Question: Is there embedding leakage between Single-cell FM and Genomic FM?
- Oracle intent: embedding_leakage_between_models
- Final intent: embedding_leakage_between_models
- Answered question: Y (no_oracle_evidence)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 3335 ms
- Preview: No matching records were found in the current graph for embedding leakage between models.

### G16
- Question: If HPAP-010 becomes T1D, what is the impact scope across datasets, models, and tasks?
- Oracle intent: impact_downstream
- Final intent: impact_downstream
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 3125 ms
- Preview: Downstream impact overview for changes to HPAP-010: Impacted samples: 27, datasets: 29, models: 8, downstream tasks: 3. Impacted data modalities: Bulk ATAC-seq, Bulk RNA-seq, CyTOF, Flow Cytometry, Genomic FM Embedding (all modalities v1), Histology, Oxygen Co

### G17
- Question: Show immediate neighbors of Genomic FM.
- Oracle intent: get_neighbors
- Final intent: get_neighbors
- Answered question: Y (generic_nonempty)
- Graph consistent: Y (row_key_match)
- Verdict: PASS
- Latency: 2776 ms
- Preview: Found 12 neighbor edge(s): 1. Genomic FM v1 (EPCOT-v2) -DOCUMENTED_BY-> Model Card (Genomic FM v1) 2. Genomic FM Embedding (all modalities v1) -EMBEDDED_BY-> Genomic FM v1 (EPCOT-v2) 3. Bulk RNA-seq Dataset v1.0 (training) -TRAINED_ON-> Genomic FM v1 (EPCOT-v2

### G18
- Question: Which donors are shared across Genomic FM, Single-cell FM, and Spatial FM training sets?
- Oracle intent: shared_donors_three_fms
- Final intent: set_operation
- Answered question: Y (generic_nonempty)
- Graph consistent: N (row_key_match)
- Verdict: PARTIAL
- Latency: 9667 ms
- Preview: No matching records were found in the current graph for set operation.