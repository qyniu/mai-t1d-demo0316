import { HPAP_DONOR_NODES } from "./hpapDonorNodes";
import { BULK_ATAC_NODES, BULK_ATAC_HAD_MEMBER_EDGES } from "./bulkAtacNodes";

export const NODES = [
  { id:"raw_scrna",  label:"HPAP-002\nscRNA-seq",         type:"RawData",
    detail:{ "Donor":"HPAP-002", "Modality":"scRNA-seq", "Source":"HPAP / PancDB", "Platform":"10x Genomics Chromium v3", "Lighthouse":"/lighthouse/mai-t1d/raw/scrna/hpap002/", "Portal":"hpap.pmacs.upenn.edu", "Access":"DUA-HPAP-2024-001", "Responsible":"HPAP Consortium / UPenn", "Checksum":"sha256:a1b2c3..." }},
  { id:"raw_atac",   label:"HPAP cohort\nscATAC-seq",     type:"RawData",
    detail:{ "Modality":"scATAC-seq", "Donors":"8 donors", "Source":"HPAP/PancDB", "Lighthouse":"/lighthouse/mai-t1d/raw/atac/", "Access":"DUA-HPAP-2024-001" }},
  { id:"raw_wgs",    label:"HPAP cohort\nWGS",            type:"RawData",
    detail:{ "Modality":"WGS", "Donors":"194 donors", "Source":"HPAP/PancDB", "Lighthouse":"/lighthouse/mai-t1d/raw/wgs/", "Access":"DUA-HPAP-2024-001" }},

  { id:"qc_scrna",   label:"scRNA QC\nPipeline v3.1",     type:"Pipeline",
    detail:{ "Version":"v3.1", "Tool":"Scanpy 1.9 + DoubletFinder", "Min genes/cell":"200", "Max mito %":"< 20%", "Batch correction":"Harmony", "Script Hash":"sha256:1c2d3e...", "GitHub":"github.com/mai-t1d/pipelines/qc-scrna", "Run Date":"2025-10-14", "SLURM Job":"12345678", "Executor":"Kai Liu", "Institution":"University of Michigan" }},
  { id:"qc_atac",    label:"scATAC QC\nPipeline v2.0",    type:"Pipeline",
    detail:{ "Version":"v2.0", "Tool":"ArchR 1.0.2", "GitHub":"github.com/mai-t1d/pipelines/qc-atac", "Executor":"Kai Liu", "Institution":"University of Michigan" }},
  { id:"qc_wgs",     label:"WGS Variant\nCalling v1.2",   type:"Pipeline",
    detail:{ "Version":"v1.2", "Tool":"GATK 4.3 + bcftools", "GitHub":"github.com/mai-t1d/pipelines/wgs-varcall", "Executor":"Diane Saunders", "Institution":"Vanderbilt University" }},

  { id:"proc_scrna", label:"scRNA Dataset\nv2.1",         type:"ProcessedData",
    detail:{ "Version":"v2.1", "Cells before QC":"84,200", "Cells after QC":"72,400", "Cells removed":"~14%", "Donors":"10 (incl. HPAP-002)", "HVGs retained":"3,000", "Doublet rate":"8%", "Median genes/cell":"1,840", "Format":"AnnData .h5ad", "Lighthouse":"/lighthouse/mai-t1d/processed/scrna_v2.1.h5ad", "Deprecated":"false" }},
  { id:"proc_atac",  label:"scATAC Dataset\nv1.3",        type:"ProcessedData",
    detail:{ "Version":"v1.3", "Cells after QC":"48,200", "Peaks called":"142,000", "Format":"ArchR + .h5ad", "Lighthouse":"/lighthouse/mai-t1d/processed/atac_v1.3/", "Deprecated":"false" }},
  { id:"proc_wgs",   label:"WGS Variant\nMatrix v1.0",    type:"ProcessedData",
    detail:{ "Version":"v1.0", "Donors":"194", "Variants (PASS)":"4.2M SNPs", "Format":"VCF + PLINK", "Lighthouse":"/lighthouse/mai-t1d/processed/wgs_v1.0/", "Deprecated":"false" }},

  { id:"dc_scrna",   label:"Dataset Card\n(scRNA v2.1)",   type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/scrna_v2.1.jsonld", "Author":"Kai Liu", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Skews toward recent-onset T1D", "Status":"Published", "Updated":"2025-10-15" }},
  { id:"dc_atac",    label:"Dataset Card\n(scATAC v1.3)",  type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/atac_v1.3.jsonld", "Author":"Kai Liu", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Limited donor pool; no pediatric donors", "Status":"Published", "Updated":"2025-10-22" }},
  { id:"dc_wgs",     label:"Dataset Card\n(WGS v1.0)",     type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/wgs_v1.0.jsonld", "Author":"Diane Saunders", "Institution":"Vanderbilt University", "Consent":"Open (HPAP DUA)", "Known biases":"European ancestry overrepresented", "Status":"Published", "Updated":"2025-09-10" }},

  { id:"model_scfm",    label:"Single-cell FM v1\n(scFM-T1D)", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"scGPT 70M params", "Cell-type F1 (macro)":"0.93", "Beta-cell F1":"0.95", "Alpha-cell F1":"0.92", "Eval set":"scRNA v2.1 (20% holdout)", "Lighthouse":"/lighthouse/mai-t1d/models/scfm_v1.0/", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_genomic", label:"Genomic FM v1\n(EPCOT-v2)",     type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"EPCOT multi-modal transformer", "AUROC (epigenome)":"0.91", "Pearson r (expression)":"0.87", "Eval set":"Multi-modal held-out", "Lighthouse":"/lighthouse/mai-t1d/models/genomic_v1.0/", "Status":"Active", "Compliance hold":"false" }},

  { id:"mc_scfm",    label:"Model Card\n(scFM v1)",          type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/scfm_v1.0.jsonld", "Author":"Kai Liu", "Linked dataset card":"scRNA v2.1", "Intended use":"Cell-type annotation, T1D research", "Status":"Published" }},
  { id:"mc_genomic", label:"Model Card\n(Genomic FM v1)",    type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/genomic_v1.0.jsonld", "Author":"Kai Liu", "Linked dataset cards":"scRNA v2.1, scATAC v1.3, WGS v1.0", "Intended use":"Genomic prediction, regulatory elements", "Status":"Published" }},

  { id:"task_celltype",  label:"Cell-type\nClassification",  type:"DownstreamTask",
    detail:{ "Task":"Classification", "Model":"scFM-T1D v1", "Description":"Identify , , , ductal cell types in pancreatic islet scRNA-seq", "Status":"Active" }},
  { id:"task_deconv",    label:"Islet\nDeconvolution",       type:"DownstreamTask",
    detail:{ "Task":"Deconvolution", "Model":"scFM-T1D v1", "Description":"Decompose bulk RNA-seq into cell-type fractions", "Status":"Active" }},
  { id:"task_eqtl",      label:"eQTL\nPrediction",          type:"DownstreamTask",
    detail:{ "Task":"Regression / association", "Model":"Genomic FM v1", "Description":"Predict eQTLs across islet cell types", "Status":"Active" }},
  { id:"task_epigenome", label:"Epigenome\nPrediction",      type:"DownstreamTask",
    detail:{ "Task":"Sequence-to-function", "Model":"Genomic FM v1", "Description":"Predict chromatin accessibility and histone marks from DNA sequence", "Status":"Active" }},
  ...HPAP_DONOR_NODES,
  ...BULK_ATAC_NODES,
];

export const EDGES = [
  { source:"raw_scrna",  target:"qc_scrna",      label:"USED" },
  { source:"raw_atac",   target:"qc_atac",        label:"USED" },
  { source:"raw_wgs",    target:"qc_wgs",         label:"USED" },
  { source:"qc_scrna",   target:"proc_scrna",     label:"WAS_GENERATED_BY" },
  { source:"qc_atac",    target:"proc_atac",      label:"WAS_GENERATED_BY" },
  { source:"qc_wgs",     target:"proc_wgs",       label:"WAS_GENERATED_BY" },
  { source:"proc_scrna", target:"dc_scrna",       label:"DOCUMENTED_BY" },
  { source:"proc_atac",  target:"dc_atac",         label:"DOCUMENTED_BY" },
  { source:"proc_wgs",   target:"dc_wgs",          label:"DOCUMENTED_BY" },
  { source:"proc_scrna", target:"model_scfm",    label:"TRAINED_ON",
    train:{ "Model version":"scFM-T1D v1.0", "Architecture":"scGPT 70M params", "Epochs":"100", "Batch size":"512", "GPU":"8 A100 80GB", "Cluster":"Lighthouse HPC", "SLURM Job":"99887766", "Script Hash":"sha256:e6f7a8...", "GitHub":"github.com/mai-t1d/pipelines/scfm-pretrain", "Training date":"2025-11-03", "Executor":"Kai Liu", "Institution":"University of Michigan" }},
  { source:"proc_scrna", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Epochs":"80", "Batch size":"256", "Modality":"scRNA-seq (one of 3)", "GPU":"16 A100 80GB", "Cluster":"Lighthouse HPC", "SLURM Job":"99887800", "Script Hash":"sha256:f7g8h9...", "GitHub":"github.com/mai-t1d/pipelines/genomic-fm", "Training date":"2025-12-01", "Executor":"Kai Liu", "Institution":"University of Michigan" }},
  { source:"proc_atac",  target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"scATAC-seq (one of 3)", "SLURM Job":"99887800", "Training date":"2025-12-01", "Executor":"Kai Liu" }},
  { source:"proc_wgs",   target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"WGS (one of 3)", "SLURM Job":"99887800", "Training date":"2025-12-01", "Executor":"Kai Liu" }},
  { source:"model_scfm",    target:"mc_scfm",       label:"DOCUMENTED_BY" },
  { source:"model_genomic", target:"mc_genomic",    label:"DOCUMENTED_BY" },
  { source:"mc_scfm",    target:"dc_scrna",  label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_scrna",  label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_atac",   label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_wgs",    label:"LINKED_TO" },
  { source:"model_scfm",    target:"task_celltype",  label:"ENABLES" },
  { source:"model_scfm",    target:"task_deconv",    label:"ENABLES" },
  { source:"model_genomic", target:"task_eqtl",      label:"ENABLES" },
  { source:"model_genomic", target:"task_epigenome", label:"ENABLES" },
  ...BULK_ATAC_HAD_MEMBER_EDGES,
];








