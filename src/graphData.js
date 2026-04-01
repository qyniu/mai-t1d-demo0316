//  NODE TYPES — unchanged from HPAP demo (zero PROV core modification)
export const TYPE = {
  RawData:       { bg:"#eff6ff", border:"#3b82f6", text:"#1e40af", badge:"#dbeafe", icon:"🧬", label:"Raw Biobank Data" },
  Pipeline:      { bg:"#f0fdf4", border:"#22c55e", text:"#15803d", badge:"#dcfce7", icon:"⚙️", label:"QC Pipeline" },
  ProcessedData: { bg:"#ecfdf5", border:"#10b981", text:"#065f46", badge:"#d1fae5", icon:"📊", label:"Processed Dataset" },
  DatasetCard:   { bg:"#fefce8", border:"#f59e0b", text:"#92400e", badge:"#fef3c7", icon:"📄", label:"Dataset Card" },
  Model:         { bg:"#fff1f2", border:"#f43f5e", text:"#9f1239", badge:"#ffe4e6", icon:"🧠", label:"Foundation Model" },
  ModelCard:     { bg:"#fff7ed", border:"#f97316", text:"#9a3412", badge:"#ffedd5", icon:"📋", label:"Model Card" },
  DownstreamTask:{ bg:"#f1f5f9", border:"#94a3b8", text:"#475569", badge:"#e2e8f0", icon:"🎯", label:"Downstream Task" },
};

export const EDGE_STYLE = {
  "USED":             { color:"#3b82f6", dash:"none", width:1.8 },
  "WAS_GENERATED_BY": { color:"#22c55e", dash:"none", width:1.8 },
  "TRAINED_ON":       { color:"#8b5cf6", dash:"none", width:2.2 },
  "DOCUMENTED_BY":    { color:"#f59e0b", dash:"5,3",  width:1.6 },
  "LINKED_TO":        { color:"#f43f5e", dash:"8,3",  width:2.2 },
  "ENABLES":          { color:"#94a3b8", dash:"4,2",  width:1.4 },
  "HAS_DONOR":        { color:"#0ea5e9", dash:"2,2",  width:1.2 },
};

export const EDGE_LEGEND = [
  { key:"USED",             label:"USED" },
  { key:"WAS_GENERATED_BY", label:"WAS_GENERATED_BY" },
  { key:"TRAINED_ON",       label:"TRAINED_ON (with training metadata)" },
  { key:"DOCUMENTED_BY",    label:"DOCUMENTED_BY" },
  { key:"LINKED_TO",        label:"LINKED_TO — core contribution" },
  { key:"ENABLES",          label:"ENABLES" },
  { key:"HAS_DONOR",        label:"HAS_DONOR" },
];

//  NODES — HCA Census external dataset PoC
//  Mirrors HPAP structure exactly: same 7 node types, same edge vocabulary
//  Only extension properties (names, metadata values) have changed
export const NODES = [

  // --- RAW DATA (3 nodes, one per tissue) ---
  { id:"raw_hca_heart", label:"HCA Census\nHeart", type:"RawData",
    detail:{ "Tissue":"Heart", "Modality":"scRNA-seq", "Assay":"10x 3' v3", "N_Cells":"~500,000", "N_Donors":"~140", "Disease":"Normal", "Organism":"Homo sapiens", "Source":"CZ CELLxGENE Census v2024-07-01", "Portal":"cellxgene.cziscience.com", "Access":"Open (CC BY 4.0)", "Responsible":"CZI / HCA Consortium" }},
  { id:"raw_hca_lung",  label:"HCA Census\nLung",  type:"RawData",
    detail:{ "Tissue":"Lung", "Modality":"scRNA-seq", "Assay":"10x 3' v3", "N_Cells":"~2,400,000", "N_Donors":"~400", "Disease":"Normal / IPF", "Organism":"Homo sapiens", "Source":"CZ CELLxGENE Census v2024-07-01", "Portal":"cellxgene.cziscience.com", "Access":"Open (CC BY 4.0)", "Responsible":"CZI / HLCA Consortium" }},
  { id:"raw_hca_brain", label:"HCA Census\nBrain", type:"RawData",
    detail:{ "Tissue":"Brain", "Modality":"scRNA-seq", "Assay":"10x 3' v3", "N_Cells":"~3,400,000", "N_Donors":"~300", "Disease":"Normal", "Organism":"Homo sapiens", "Source":"CZ CELLxGENE Census v2024-07-01", "Portal":"cellxgene.cziscience.com", "Access":"Open (CC BY 4.0)", "Responsible":"CZI / Allen Brain Institute" }},

  // --- QC PIPELINE (1 shared pipeline across all tissues) ---
  { id:"qc_census", label:"CELLxGENE\nSchema QC v5.1", type:"Pipeline",
    detail:{ "Version":"v5.1.0", "Tool":"CELLxGENE Schema + TileDB-SOMA", "Cell filter":"is_primary_data == True", "Min genes/cell":"200", "Doublet removal":"Per-dataset contributor QC", "Batch correction":"None at ingestion (per-study)", "Schema":"github.com/chanzuckerberg/single-cell-curation", "Executor":"Chan Zuckerberg Initiative", "Institution":"CZI Biohub" }},

  // --- PROCESSED DATA (3 nodes, one tissue atlas per tissue) ---
  { id:"proc_hca_heart", label:"HCA Heart\nAtlas v1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Cells after QC":"~480,000", "Cell types annotated":"30+", "Format":"AnnData .h5ad + TileDB-SOMA", "Embedding":"scVI latent space", "Source":"CZ CELLxGENE Census v2024-07-01", "DOI":"10.1038/s41586-023-06818-7", "Deprecated":"false" }},
  { id:"proc_hca_lung",  label:"HLCA Core\nv2.0",       type:"ProcessedData",
    detail:{ "Version":"v2.0", "Cells after QC":"~2,300,000", "Cell types annotated":"58", "Format":"AnnData .h5ad + TileDB-SOMA", "Embedding":"scANVI integrated", "Source":"CZ CELLxGENE Census v2024-07-01", "DOI":"10.1038/s41591-023-02327-2", "Deprecated":"false" }},
  { id:"proc_hca_brain", label:"HCA Brain\nAtlas v1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Cells after QC":"~3,300,000", "Cell types annotated":"100+", "Format":"AnnData .h5ad + TileDB-SOMA", "Embedding":"scVI latent space", "Source":"CZ CELLxGENE Census v2024-07-01", "DOI":"10.1126/science.add7046", "Deprecated":"false" }},

  // --- DATASET CARDS (3 nodes) ---
  { id:"dc_hca_heart", label:"Dataset Card\n(HCA Heart v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/chanzuckerberg/cellxgene-census/dataset-cards/hca_heart_v1.jsonld", "Author":"HCA Consortium / CZI", "Institution":"Chan Zuckerberg Initiative", "Consent":"Open (CC BY 4.0)", "Known biases":"Predominantly healthy donors; limited age range", "Status":"Published", "Updated":"2024-07-01" }},
  { id:"dc_hca_lung",  label:"Dataset Card\n(HLCA v2.0)",      type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/chanzuckerberg/cellxgene-census/dataset-cards/hlca_v2.jsonld", "Author":"HLCA Consortium / CZI", "Institution":"Helmholtz Munich / CZI", "Consent":"Open (CC BY 4.0)", "Known biases":"IPF overrepresented in disease cohort", "Status":"Published", "Updated":"2024-07-01" }},
  { id:"dc_hca_brain", label:"Dataset Card\n(HCA Brain v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/chanzuckerberg/cellxgene-census/dataset-cards/hca_brain_v1.jsonld", "Author":"Allen Brain Institute / CZI", "Institution":"Allen Institute / CZI", "Consent":"Open (CC BY 4.0)", "Known biases":"Adult donors only; limited subcortical coverage", "Status":"Published", "Updated":"2024-07-01" }},

  // --- MODELS (2 nodes) ---
  { id:"model_scgpt", label:"scGPT v1\n(Pan-tissue FM)", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"Transformer, ~51M params", "Training cells":"~33M (CZ CELLxGENE)", "Cell-type F1 (macro)":"0.95", "Perturbation AUROC":"0.88", "Eval set":"CELLxGENE held-out (20%)", "Publication":"Nature Methods 2024 — Wang et al.", "GitHub":"github.com/bowang-lab/scGPT", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_geneformer", label:"Geneformer v2\n(Pan-tissue FM)", type:"Model",
    detail:{ "Version":"v2.0", "Architecture":"BERT-style transformer, ~10M params", "Training cells":"~29.9M single-cell transcriptomes", "Cell-type F1 (macro)":"0.92", "Gene network AUROC":"0.91", "Eval set":"Independent held-out cohort", "Publication":"Nature 2023 — Theodoris et al.", "GitHub":"huggingface.co/ctheodoris/Geneformer", "Status":"Active", "Compliance hold":"false" }},

  // --- MODEL CARDS (2 nodes) ---
  { id:"mc_scgpt", label:"Model Card\n(scGPT v1)", type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/bowang-lab/scGPT/model-card.jsonld", "Author":"Wang et al. / University of Toronto", "Linked dataset cards":"HCA Heart v1.0, HLCA v2.0, HCA Brain v1.0", "Intended use":"Pan-tissue cell-type annotation, perturbation prediction", "Status":"Published" }},
  { id:"mc_geneformer", label:"Model Card\n(Geneformer v2)", type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"huggingface.co/ctheodoris/Geneformer/model-card.jsonld", "Author":"Theodoris et al. / Gladstone Institutes", "Linked dataset cards":"HCA Heart v1.0, HLCA v2.0, HCA Brain v1.0", "Intended use":"Gene network inference, disease gene prioritization", "Status":"Published" }},

  // --- DOWNSTREAM TASKS (4 nodes) ---
  { id:"task_celltype_pan",   label:"Pan-tissue\nCell-type Classification", type:"DownstreamTask",
    detail:{ "Task":"Classification", "Model":"scGPT v1", "Description":"Classify cell types across 30+ tissues using pan-tissue foundation model embeddings", "Status":"Active" }},
  { id:"task_perturbation",   label:"Perturbation\nResponse Prediction",    type:"DownstreamTask",
    detail:{ "Task":"Regression", "Model":"scGPT v1", "Description":"Predict transcriptomic response to genetic or chemical perturbations", "Status":"Active" }},
  { id:"task_gene_network",   label:"Gene Network\nInference",              type:"DownstreamTask",
    detail:{ "Task":"Graph inference", "Model":"Geneformer v2", "Description":"Infer gene regulatory networks from single-cell expression profiles", "Status":"Active" }},
  { id:"task_disease_gene",   label:"Disease Gene\nPrioritization",         type:"DownstreamTask",
    detail:{ "Task":"Ranking", "Model":"Geneformer v2", "Description":"Rank candidate disease genes using chromatin and expression context", "Status":"Active" }},
];

export const EDGES = [
  // Raw data → QC pipeline
  { source:"raw_hca_heart", target:"qc_census", label:"USED" },
  { source:"raw_hca_lung",  target:"qc_census", label:"USED" },
  { source:"raw_hca_brain", target:"qc_census", label:"USED" },

  // QC pipeline → processed atlases
  { source:"qc_census", target:"proc_hca_heart", label:"WAS_GENERATED_BY" },
  { source:"qc_census", target:"proc_hca_lung",  label:"WAS_GENERATED_BY" },
  { source:"qc_census", target:"proc_hca_brain", label:"WAS_GENERATED_BY" },

  // Processed atlases → dataset cards
  { source:"proc_hca_heart", target:"dc_hca_heart", label:"DOCUMENTED_BY" },
  { source:"proc_hca_lung",  target:"dc_hca_lung",  label:"DOCUMENTED_BY" },
  { source:"proc_hca_brain", target:"dc_hca_brain", label:"DOCUMENTED_BY" },

  // Processed atlases → models (TRAINED_ON)
  { source:"proc_hca_heart", target:"model_scgpt", label:"TRAINED_ON",
    train:{ "Model version":"scGPT v1.0", "Architecture":"Transformer ~51M params", "Tissue":"Heart (one of 3)", "N_Cells":"~33M total", "GPU":"8 A100 80GB", "Cluster":"Vector Institute HPC", "Training date":"2023-08-01", "Executor":"Wang et al.", "Institution":"University of Toronto", "Publication":"Nature Methods 2024" }},
  { source:"proc_hca_lung",  target:"model_scgpt", label:"TRAINED_ON",
    train:{ "Model version":"scGPT v1.0", "Architecture":"Transformer ~51M params", "Tissue":"Lung (one of 3)", "N_Cells":"~33M total", "GPU":"8 A100 80GB", "Cluster":"Vector Institute HPC", "Training date":"2023-08-01", "Executor":"Wang et al.", "Institution":"University of Toronto", "Publication":"Nature Methods 2024" }},
  { source:"proc_hca_brain", target:"model_scgpt", label:"TRAINED_ON",
    train:{ "Model version":"scGPT v1.0", "Architecture":"Transformer ~51M params", "Tissue":"Brain (one of 3)", "N_Cells":"~33M total", "GPU":"8 A100 80GB", "Cluster":"Vector Institute HPC", "Training date":"2023-08-01", "Executor":"Wang et al.", "Institution":"University of Toronto", "Publication":"Nature Methods 2024" }},
  { source:"proc_hca_heart", target:"model_geneformer", label:"TRAINED_ON",
    train:{ "Model version":"Geneformer v2.0", "Architecture":"BERT-style ~10M params", "Tissue":"Heart (one of 3)", "N_Cells":"~29.9M total", "Training date":"2023-05-01", "Executor":"Theodoris et al.", "Institution":"Gladstone Institutes", "Publication":"Nature 2023" }},
  { source:"proc_hca_lung",  target:"model_geneformer", label:"TRAINED_ON",
    train:{ "Model version":"Geneformer v2.0", "Architecture":"BERT-style ~10M params", "Tissue":"Lung (one of 3)", "N_Cells":"~29.9M total", "Training date":"2023-05-01", "Executor":"Theodoris et al.", "Institution":"Gladstone Institutes", "Publication":"Nature 2023" }},
  { source:"proc_hca_brain", target:"model_geneformer", label:"TRAINED_ON",
    train:{ "Model version":"Geneformer v2.0", "Architecture":"BERT-style ~10M params", "Tissue":"Brain (one of 3)", "N_Cells":"~29.9M total", "Training date":"2023-05-01", "Executor":"Theodoris et al.", "Institution":"Gladstone Institutes", "Publication":"Nature 2023" }},

  // Models → model cards
  { source:"model_scgpt",      target:"mc_scgpt",      label:"DOCUMENTED_BY" },
  { source:"model_geneformer", target:"mc_geneformer",  label:"DOCUMENTED_BY" },

  // Model cards → dataset cards (LINKED_TO)
  { source:"mc_scgpt",      target:"dc_hca_heart", label:"LINKED_TO" },
  { source:"mc_scgpt",      target:"dc_hca_lung",  label:"LINKED_TO" },
  { source:"mc_scgpt",      target:"dc_hca_brain", label:"LINKED_TO" },
  { source:"mc_geneformer", target:"dc_hca_heart", label:"LINKED_TO" },
  { source:"mc_geneformer", target:"dc_hca_lung",  label:"LINKED_TO" },
  { source:"mc_geneformer", target:"dc_hca_brain", label:"LINKED_TO" },

  // Models → downstream tasks (ENABLES)
  { source:"model_scgpt",      target:"task_celltype_pan", label:"ENABLES" },
  { source:"model_scgpt",      target:"task_perturbation", label:"ENABLES" },
  { source:"model_geneformer", target:"task_gene_network", label:"ENABLES" },
  { source:"model_geneformer", target:"task_disease_gene", label:"ENABLES" },
];
