import { HPAP_DONOR_NODES } from "./hpapDonorNodes";
import {
  BULK_ATAC_NODES,
  BULK_ATAC_HAD_MEMBER_EDGES,
  BULK_ATAC_COHORT_NODE,
  BULK_ATAC_COHORT_MEMBER_EDGES,
} from "./bulkAtacNodes";
import {
  BULK_RNA_NODES,
  BULK_RNA_HAD_MEMBER_EDGES,
  BULK_RNA_COHORT_NODE,
  BULK_RNA_COHORT_MEMBER_EDGES,
} from "./bulkRnaNodes";

export const NODES = [

  { id:"qc_bulk_rna", label:"Bulk RNA QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"✅ Drive: drive.google.com/…/1GX2GrBNQ0v…", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { id:"qc_bulk_atac", label:"Bulk ATAC QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},

  { id:"proc_bulk_rna_v1", label:"Bulk RNA-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Metadata":"QC metadata + Raw metadata (Google Sheets links)", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { id:"proc_bulk_atac_v1", label:"Bulk ATAC-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},
  { id:"dc_bulk_rna_v1", label:"Dataset Card\n(Bulk RNA v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/bulk_rna_v1.0.jsonld", "Author":"Dongliang Leng", "Institution":"Cornell University", "Consent":"Open (HPAP DUA)", "Known biases":"Exocrine-enriched samples in subset of donors", "Status":"Draft", "Updated":"2026-04-03" }},
  { id:"dc_bulk_atac_v1", label:"Dataset Card\n(Bulk ATAC v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/bulk_atac_v1.0.jsonld", "Author":"Xinyu Bao", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Cell-type coverage uneven across donors", "Status":"Draft", "Updated":"2026-04-03" }},


  { id:"model_scfm",    label:"Single-cell FM v1\n(scFM-T1D)", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"scGPT 70M params", "Cell-type F1 (macro)":"0.93", "Beta-cell F1":"0.95", "Alpha-cell F1":"0.92", "Eval set":"scRNA v2.1 (20% holdout)", "Lighthouse":"/lighthouse/mai-t1d/models/scfm_v1.0/", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_genomic", label:"Genomic FM v1\n(EPCOT-v2)",     type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"EPCOT multi-modal transformer", "AUROC (epigenome)":"0.91", "Pearson r (expression)":"0.87", "Eval set":"Multi-modal held-out", "Lighthouse":"/lighthouse/mai-t1d/models/genomic_v1.0/", "Status":"Active", "Compliance hold":"false" }},

  { id:"mc_scfm",    label:"Model Card\n(scFM v1)",          type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/scfm_v1.0.jsonld", "Author":"Kai Liu", "Intended use":"Cell-type annotation, T1D research", "Status":"Published" }},
  { id:"mc_genomic", label:"Model Card\n(Genomic FM v1)",    type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/genomic_v1.0.jsonld", "Author":"Kai Liu", "Linked dataset cards":"Bulk RNA v1.0, Bulk ATAC v1.0", "Intended use":"Genomic prediction, regulatory elements", "Status":"Published" }},

  { id:"task_celltype",  label:"Cell-type\nClassification",  type:"DownstreamTask",
    detail:{ "Task":"Classification", "Model":"scFM-T1D v1", "Description":"Identify , , , ductal cell types in pancreatic islet scRNA-seq", "Status":"Active" }},
  { id:"task_deconv",    label:"Islet\nDeconvolution",       type:"DownstreamTask",
    detail:{ "Task":"Deconvolution", "Model":"scFM-T1D v1", "Description":"Decompose bulk RNA-seq into cell-type fractions", "Status":"Active" }},
  { id:"task_eqtl",      label:"eQTL\nPrediction",          type:"DownstreamTask",
    detail:{ "Task":"Regression / association", "Model":"Genomic FM v1", "Description":"Predict eQTLs across islet cell types", "Status":"Active" }},
  { id:"task_epigenome", label:"Epigenome\nPrediction",      type:"DownstreamTask",
    detail:{ "Task":"Sequence-to-function", "Model":"Genomic FM v1", "Description":"Predict chromatin accessibility and histone marks from DNA sequence", "Status":"Active" }},
  BULK_RNA_COHORT_NODE,
  BULK_ATAC_COHORT_NODE,
  ...HPAP_DONOR_NODES,
  ...BULK_RNA_NODES,
  ...BULK_ATAC_NODES,
];

export const EDGES = [
  { source:"cohort_bulk_rna_seq", target:"qc_bulk_rna", label:"USED" },
  { source:"cohort_bulk_atac_seq", target:"qc_bulk_atac", label:"USED" },
  { source:"qc_bulk_rna", target:"proc_bulk_rna_v1", label:"WAS_GENERATED_BY" },
  { source:"qc_bulk_atac", target:"proc_bulk_atac_v1", label:"WAS_GENERATED_BY" },
  { source:"proc_bulk_rna_v1", target:"dc_bulk_rna_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bulk_atac_v1", target:"dc_bulk_atac_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bulk_rna_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"Bulk RNA-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { source:"proc_bulk_atac_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"Bulk ATAC-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},
  { source:"model_scfm",    target:"mc_scfm",       label:"DOCUMENTED_BY" },
  { source:"model_genomic", target:"mc_genomic",    label:"DOCUMENTED_BY" },
  { source:"mc_genomic", target:"dc_bulk_rna_v1",  label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_bulk_atac_v1", label:"LINKED_TO" },
  { source:"model_scfm",    target:"task_celltype",  label:"ENABLES" },
  { source:"model_scfm",    target:"task_deconv",    label:"ENABLES" },
  { source:"model_genomic", target:"task_eqtl",      label:"ENABLES" },
  { source:"model_genomic", target:"task_epigenome", label:"ENABLES" },
  ...BULK_RNA_HAD_MEMBER_EDGES,
  ...BULK_ATAC_HAD_MEMBER_EDGES,
  ...BULK_RNA_COHORT_MEMBER_EDGES,
  ...BULK_ATAC_COHORT_MEMBER_EDGES,
];










