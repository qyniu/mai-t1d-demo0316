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
import {
  SCRNA_NODES,
  SCRNA_HAD_MEMBER_EDGES,
  SCRNA_COHORT_NODE,
  SCRNA_COHORT_MEMBER_EDGES,
} from "./scRnaNodes";
import {
  SCATAC_NODES,
  SCATAC_HAD_MEMBER_EDGES,
  SCATAC_COHORT_NODE,
  SCATAC_COHORT_MEMBER_EDGES,
} from "./scAtacNodes";
import {
  SNMULTIOMICS_NODES,
  SNMULTIOMICS_HAD_MEMBER_EDGES,
  SNMULTIOMICS_COHORT_NODE,
  SNMULTIOMICS_COHORT_MEMBER_EDGES,
} from "./snMultiomicsNodes";
import {
  CITE_SEQ_PROTEIN_NODES,
  CITE_SEQ_PROTEIN_HAD_MEMBER_EDGES,
  CITE_SEQ_PROTEIN_COHORT_NODE,
  CITE_SEQ_PROTEIN_COHORT_MEMBER_EDGES,
} from "./citeSeqProteinNodes";

const normalizeText = (v) => String(v ?? "").trim().toLowerCase();
const normalizePairContext = (detail = {}) => {
  const rawCell = String(detail.Cell_Type ?? "").trim();
  const cell = normalizeText(rawCell);
  const isCellEmpty = !cell || ["unknown", "unknown cell", "na", "n/a", "null"].includes(cell);
  if (!isCellEmpty) return cell;
  return normalizeText(detail.Tissue);
};
const pairKeyForNode = (node) => {
  const donor = normalizeText(node?.detail?.Donor);
  const context = normalizePairContext(node?.detail);
  return donor && context ? `${donor}||${context}` : "";
};

const bulkRnaPairKeys = new Set(BULK_RNA_NODES.map(pairKeyForNode).filter(Boolean));
const bulkAtacPairKeys = new Set(BULK_ATAC_NODES.map(pairKeyForNode).filter(Boolean));
const pairedBulkKeys = new Set([...bulkRnaPairKeys].filter((k) => bulkAtacPairKeys.has(k)));

const FILTERED_BULK_RNA_NODES = BULK_RNA_NODES.filter((n) => pairedBulkKeys.has(pairKeyForNode(n)));
const FILTERED_BULK_ATAC_NODES = BULK_ATAC_NODES.filter((n) => pairedBulkKeys.has(pairKeyForNode(n)));

const filteredBulkRnaIds = new Set(FILTERED_BULK_RNA_NODES.map((n) => n.id));
const filteredBulkAtacIds = new Set(FILTERED_BULK_ATAC_NODES.map((n) => n.id));

const FILTERED_BULK_RNA_HAD_MEMBER_EDGES = BULK_RNA_HAD_MEMBER_EDGES.filter((e) =>
  filteredBulkRnaIds.has(e.target)
);
const FILTERED_BULK_ATAC_HAD_MEMBER_EDGES = BULK_ATAC_HAD_MEMBER_EDGES.filter((e) =>
  filteredBulkAtacIds.has(e.target)
);
const FILTERED_BULK_RNA_COHORT_MEMBER_EDGES = BULK_RNA_COHORT_MEMBER_EDGES.filter((e) =>
  filteredBulkRnaIds.has(e.target)
);
const FILTERED_BULK_ATAC_COHORT_MEMBER_EDGES = BULK_ATAC_COHORT_MEMBER_EDGES.filter((e) =>
  filteredBulkAtacIds.has(e.target)
);

const donorTissueKeyForNode = (node) => {
  const donor = normalizeText(node?.detail?.Donor);
  const tissue = normalizeText(node?.detail?.Tissue);
  return donor && tissue ? `${donor}||${tissue}` : "";
};

const scrnaDonorTissueKeys = new Set(SCRNA_NODES.map(donorTissueKeyForNode).filter(Boolean));
const scatacDonorTissueKeys = new Set(SCATAC_NODES.map(donorTissueKeyForNode).filter(Boolean));
const matchedScDonorTissueKeys = new Set(
  [...scrnaDonorTissueKeys].filter((k) => scatacDonorTissueKeys.has(k))
);

const FILTERED_SCRNA_NODES = SCRNA_NODES.filter((n) =>
  matchedScDonorTissueKeys.has(donorTissueKeyForNode(n))
);
const FILTERED_SCATAC_NODES = SCATAC_NODES.filter((n) =>
  matchedScDonorTissueKeys.has(donorTissueKeyForNode(n))
);

const filteredScrnaIds = new Set(FILTERED_SCRNA_NODES.map((n) => n.id));
const filteredScatacIds = new Set(FILTERED_SCATAC_NODES.map((n) => n.id));

const FILTERED_SCRNA_HAD_MEMBER_EDGES = SCRNA_HAD_MEMBER_EDGES.filter((e) =>
  filteredScrnaIds.has(e.target)
);
const FILTERED_SCATAC_HAD_MEMBER_EDGES = SCATAC_HAD_MEMBER_EDGES.filter((e) =>
  filteredScatacIds.has(e.target)
);
const FILTERED_SCRNA_COHORT_MEMBER_EDGES = SCRNA_COHORT_MEMBER_EDGES.filter((e) =>
  filteredScrnaIds.has(e.target)
);
const FILTERED_SCATAC_COHORT_MEMBER_EDGES = SCATAC_COHORT_MEMBER_EDGES.filter((e) =>
  filteredScatacIds.has(e.target)
);

export const NODES = [

  { id:"qc_bulk_rna", label:"Bulk RNA QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"✅ Drive: drive.google.com/…/1GX2GrBNQ0v…", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { id:"qc_bulk_atac", label:"Bulk ATAC QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},
  { id:"qc_scrna", label:"scRNA QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"Not submitted in Data Track", "Path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Contact":"PanKbase/Kai Liu", "Email":"N/A", "Data Status":"Partial — Pipeline & Metadata & Documents Missing" }},
  { id:"qc_scatac", label:"scATAC QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"github.com/PanKbase/HPAP-scATAC-seq", "Path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Contact":"PanKbase/Kai Liu", "Email":"N/A", "Data Status":"Partial — QC Data & Metadata & Documents Missing" }},
  { id:"qc_snmultiomics", label:"snMultiomics QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"/nfs/turbo/umms-drjieliu/proj/MAI_T1Ddata/snMultiome(ATAC+RNA)/Annotation/snmultiome pipeline.docx", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/snMultiome/", "Contact":"Haoxuan Zeng", "Email":"N/A", "Data Status":"Partial — Pipeline & Metadata Missing" }},
  { id:"qc_cite_seq", label:"CITE-seq QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"Not submitted in Data Track", "Path":"—", "Metadata":"/nfs/turbo/umms-drjieliu/proj/MAI_T1Ddata/CITEseq/adt_marker_list.csv", "Contact":"—", "Email":"—", "Data Status":"Not Submitted" }},

  { id:"proc_bulk_rna_v1", label:"Bulk RNA-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Metadata":"QC metadata + Raw metadata (Google Sheets links)", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { id:"proc_bulk_atac_v1", label:"Bulk ATAC-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},
  { id:"proc_scrna_v1", label:"scRNA-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Metadata":"Not submitted in Data Track", "Contact":"PanKbase/Kai Liu", "Email":"N/A" }},
  { id:"proc_scatac_v1", label:"scATAC-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Metadata":"QC data path missing in Data Track", "Contact":"PanKbase/Kai Liu", "Email":"N/A" }},
  { id:"proc_snmultiomics_v1", label:"snMultiomics Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/snMultiome/", "Metadata":"/nfs/turbo/umms-drjieliu/proj/MAI_T1Ddata/snMultiome(ATAC+RNA)/Annotation/celltype_summary.csv", "Contact":"Haoxuan Zeng", "Email":"N/A" }},
  { id:"proc_cite_seq_v1", label:"CITE-seq Protein Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"—", "Metadata":"/nfs/turbo/umms-drjieliu/proj/MAI_T1Ddata/CITEseq/adt_marker_list.csv", "Contact":"—", "Email":"—", "Data Status":"Not Submitted in Data Track" }},
  { id:"dc_bulk_rna_v1", label:"Dataset Card\n(Bulk RNA v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/bulk_rna_v1.0.jsonld", "Author":"Dongliang Leng", "Institution":"Cornell University", "Consent":"Open (HPAP DUA)", "Known biases":"Exocrine-enriched samples in subset of donors", "Status":"Draft", "Updated":"2026-04-03" }},
  { id:"dc_bulk_atac_v1", label:"Dataset Card\n(Bulk ATAC v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/bulk_atac_v1.0.jsonld", "Author":"Xinyu Bao", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Cell-type coverage uneven across donors", "Status":"Draft", "Updated":"2026-04-03" }},
  { id:"dc_scrna_v1", label:"Dataset Card\n(scRNA-seq v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/scrna_seq_v1.0.jsonld", "Author":"PanKbase/Kai Liu", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Islet-focused tissue profile", "Status":"Draft", "Updated":"2026-04-05" }},
  { id:"dc_scatac_v1", label:"Dataset Card\n(scATAC-seq v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/scatac_seq_v1.0.jsonld", "Author":"PanKbase/Kai Liu", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Limited donor overlap with scRNA cohort", "Status":"Draft", "Updated":"2026-04-05" }},
  { id:"dc_snmultiomics_v1", label:"Dataset Card\n(snMultiomics v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/snmultiomics_v1.0.jsonld", "Author":"Haoxuan Zeng", "Institution":"University of Michigan", "Consent":"Open (HPAP DUA)", "Known biases":"Multi-tissue composition varies by donor", "Status":"Draft", "Updated":"2026-04-05" }},


  { id:"model_scfm",    label:"Single-cell FM v1\n(EpiAgent)", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"scGPT 70M params", "Cell-type F1 (macro)":"0.93", "Beta-cell F1":"0.95", "Alpha-cell F1":"0.92", "Eval set":"scRNA v2.1 (20% holdout)", "Lighthouse":"/lighthouse/mai-t1d/models/scfm_v1.0/", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_genomic", label:"Genomic FM v1\n(EPCOT-v2)",     type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"EPCOT multi-modal transformer", "AUROC (epigenome)":"0.91", "Pearson r (expression)":"0.87", "Eval set":"Multi-modal held-out", "Lighthouse":"/lighthouse/mai-t1d/models/genomic_v1.0/", "Status":"Active", "Compliance hold":"false" }},

  { id:"mc_scfm",    label:"Model Card\n(scFM v1)",          type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/scfm_v1.0.jsonld", "Author":"Kai Liu", "Intended use":"Cell-type annotation, T1D research", "Status":"Published" }},
  { id:"mc_genomic", label:"Model Card\n(Genomic FM v1)",    type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/genomic_v1.0.jsonld", "Author":"Kai Liu", "Linked dataset cards":"Bulk RNA v1.0, Bulk ATAC v1.0, scRNA-seq v1.0, scATAC-seq v1.0, snMultiomics v1.0", "Intended use":"Genomic prediction, regulatory elements", "Status":"Published" }},

  { id:"emb_genomic_all_modalities_v1", label:"Genomic FM Embedding\n(all modalities v1)", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Scope":"all_modalities", "Source model":"Genomic FM v1 (EPCOT-v2)", "Included modalities":"Bulk RNA-seq, Bulk ATAC-seq, scRNA-seq, scATAC-seq, snMultiomics", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/embeddings/genomic_all_modalities_v1/", "Note":"This embedding aggregates all datasets entering Genomic FM; other embedding nodes may represent subset modalities." }},
  { id:"model_scfm_ft_v1", label:"Finetuned Single-cell FM v1\n(on Genomic Embedding)", type:"FineTunedModel",
    detail:{ "Base model":"Single-cell FM v1 (EpiAgent)", "Fine-tuned on":"emb_genomic_all_modalities_v1", "Training mode":"Embedding-guided fine-tuning", "Version":"v1.0-ft", "Status":"Active" }},
  { id:"task_5", label:"Downstream Task 5\n(Finetuned scFM)", type:"DownstreamTask",
    detail:{ "Task":"Cross-model downstream task", "Model":"Finetuned Single-cell FM v1", "Input":"Genomic FM unified embedding (all modalities)", "Status":"Active" }},
  BULK_RNA_COHORT_NODE,
  BULK_ATAC_COHORT_NODE,
  SCRNA_COHORT_NODE,
  SCATAC_COHORT_NODE,
  SNMULTIOMICS_COHORT_NODE,
  CITE_SEQ_PROTEIN_COHORT_NODE,
  ...HPAP_DONOR_NODES,
  ...FILTERED_BULK_RNA_NODES,
  ...FILTERED_BULK_ATAC_NODES,
  ...FILTERED_SCRNA_NODES,
  ...FILTERED_SCATAC_NODES,
  ...SNMULTIOMICS_NODES,
  ...CITE_SEQ_PROTEIN_NODES,
];

export const EDGES = [
  { source:"cohort_bulk_rna_seq", target:"qc_bulk_rna", label:"USED" },
  { source:"cohort_bulk_atac_seq", target:"qc_bulk_atac", label:"USED" },
  { source:"cohort_scrna_seq", target:"qc_scrna", label:"USED" },
  { source:"cohort_scatac_seq", target:"qc_scatac", label:"USED" },
  { source:"cohort_snmultiomics", target:"qc_snmultiomics", label:"USED" },
  { source:"cohort_cite_seq_protein", target:"qc_cite_seq", label:"USED" },
  { source:"qc_bulk_rna", target:"proc_bulk_rna_v1", label:"GENERATED_BY" },
  { source:"qc_bulk_atac", target:"proc_bulk_atac_v1", label:"GENERATED_BY" },
  { source:"qc_scrna", target:"proc_scrna_v1", label:"GENERATED_BY" },
  { source:"qc_scatac", target:"proc_scatac_v1", label:"GENERATED_BY" },
  { source:"qc_snmultiomics", target:"proc_snmultiomics_v1", label:"GENERATED_BY" },
  { source:"qc_cite_seq", target:"proc_cite_seq_v1", label:"GENERATED_BY" },
  { source:"proc_bulk_rna_v1", target:"dc_bulk_rna_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bulk_atac_v1", target:"dc_bulk_atac_v1", label:"DOCUMENTED_BY" },
  { source:"proc_scrna_v1", target:"dc_scrna_v1", label:"DOCUMENTED_BY" },
  { source:"proc_scatac_v1", target:"dc_scatac_v1", label:"DOCUMENTED_BY" },
  { source:"proc_snmultiomics_v1", target:"dc_snmultiomics_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bulk_rna_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"Bulk RNA-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/dongleng/01.Bulk_RNA.seq.for_T1D_immno_model/", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { source:"proc_bulk_atac_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"Bulk ATAC-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/xinyubao/ATACseq-NextFlow", "Contact":"Xinyu Bao", "Email":"xinyubao@umich.edu" }},
  { source:"proc_scrna_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"scRNA-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Contact":"PanKbase/Kai Liu", "Email":"N/A" }},
  { source:"proc_scatac_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"scATAC-seq", "Data path":"/nfs/turbo/umms-drjieliu/usr/luosanj/FM_diabetes/data/scATAC_RNA_pankbase", "Contact":"PanKbase/Kai Liu", "Email":"N/A" }},
  { source:"proc_snmultiomics_v1", target:"model_scfm", label:"TRAINED_ON",
    train:{ "Model version":"Single-cell FM v1 (EpiAgent)", "Architecture":"Single-cell foundation model", "Modality":"snMultiomics", "Data path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/snMultiome/", "Contact":"Haoxuan Zeng", "Email":"N/A" }},
  { source:"proc_snmultiomics_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"snMultiomics", "Data path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/snMultiome/", "Contact":"Haoxuan Zeng", "Email":"N/A" }},
  { source:"proc_bulk_rna_v1", target:"emb_genomic_all_modalities_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"all_modalities", "Included":"yes", "Embedding producer":"Genomic FM v1" }},
  { source:"proc_bulk_atac_v1", target:"emb_genomic_all_modalities_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"all_modalities", "Included":"yes", "Embedding producer":"Genomic FM v1" }},
  { source:"proc_scrna_v1", target:"emb_genomic_all_modalities_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"all_modalities", "Included":"yes", "Embedding producer":"Genomic FM v1" }},
  { source:"proc_scatac_v1", target:"emb_genomic_all_modalities_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"all_modalities", "Included":"yes", "Embedding producer":"Genomic FM v1" }},
  { source:"proc_snmultiomics_v1", target:"emb_genomic_all_modalities_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"all_modalities", "Included":"yes", "Embedding producer":"Genomic FM v1" }},
  { source:"emb_genomic_all_modalities_v1", target:"model_genomic", label:"EMBEDDED_BY",
    embed:{ "Role":"producer_model", "Scope":"all_modalities" }},
  { source:"model_scfm", target:"emb_genomic_all_modalities_v1", label:"FINETUNED_ON",
    finetune:{ "Mode":"Embedding-guided", "Source embedding":"emb_genomic_all_modalities_v1" }},
  { source:"emb_genomic_all_modalities_v1", target:"model_scfm_ft_v1", label:"GENERATED_BY",
    train:{ "Model version":"Single-cell FM v1.0-ft", "Training mode":"Fine-tuned on Genomic FM embedding", "Embedding scope":"all_modalities" }},
  { source:"model_scfm_ft_v1", target:"model_scfm", label:"DERIVED_FROM",
    finetune:{ "Base model":"Single-cell FM v1 (EpiAgent)", "Method":"Fine-tuning on Genomic FM embedding" }},
  { source:"model_scfm",    target:"mc_scfm",       label:"DOCUMENTED_BY" },
  { source:"model_genomic", target:"mc_genomic",    label:"DOCUMENTED_BY" },
  { source:"mc_genomic", target:"dc_bulk_rna_v1",  label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_bulk_atac_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_scrna_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_scatac_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_snmultiomics_v1", label:"LINKED_TO" },
  { source:"mc_scfm", target:"dc_snmultiomics_v1", label:"LINKED_TO" },
  { source:"model_scfm_ft_v1", target:"task_5",      label:"ENABLES" },
  ...FILTERED_BULK_RNA_HAD_MEMBER_EDGES,
  ...FILTERED_BULK_ATAC_HAD_MEMBER_EDGES,
  ...FILTERED_SCRNA_HAD_MEMBER_EDGES,
  ...FILTERED_SCATAC_HAD_MEMBER_EDGES,
  ...SNMULTIOMICS_HAD_MEMBER_EDGES,
  ...CITE_SEQ_PROTEIN_HAD_MEMBER_EDGES,
  ...FILTERED_BULK_RNA_COHORT_MEMBER_EDGES,
  ...FILTERED_BULK_ATAC_COHORT_MEMBER_EDGES,
  ...FILTERED_SCRNA_COHORT_MEMBER_EDGES,
  ...FILTERED_SCATAC_COHORT_MEMBER_EDGES,
  ...SNMULTIOMICS_COHORT_MEMBER_EDGES,
  ...CITE_SEQ_PROTEIN_COHORT_MEMBER_EDGES,
];










