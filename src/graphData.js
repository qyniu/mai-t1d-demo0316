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
import {
  FLOW_CYTOMETRY_NODES,
  FLOW_CYTOMETRY_HAD_MEMBER_EDGES,
  FLOW_CYTOMETRY_COHORT_NODE,
  FLOW_CYTOMETRY_COHORT_MEMBER_EDGES,
} from "./flowCytometryNodes";
import {
  CYTOF_NODES,
  CYTOF_HAD_MEMBER_EDGES,
  CYTOF_COHORT_NODE,
  CYTOF_COHORT_MEMBER_EDGES,
} from "./cytofNodes";
import {
  OXYGEN_CONSUMPTION_NODES,
  OXYGEN_CONSUMPTION_HAD_MEMBER_EDGES,
  OXYGEN_CONSUMPTION_COHORT_NODE,
  OXYGEN_CONSUMPTION_COHORT_MEMBER_EDGES,
} from "./oxygenConsumptionNodes";
import {
  BCR_SEQ_NODES,
  BCR_SEQ_HAD_MEMBER_EDGES,
  BCR_SEQ_COHORT_NODE,
  BCR_SEQ_COHORT_MEMBER_EDGES,
} from "./bcrSeqNodes";
import {
  TCR_SEQ_NODES,
  TCR_SEQ_HAD_MEMBER_EDGES,
  TCR_SEQ_COHORT_NODE,
  TCR_SEQ_COHORT_MEMBER_EDGES,
} from "./tcrSeqNodes";

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
  { id:"qc_flow_cytometry", label:"Flow Cytometry QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"Drive folder (pipeline docs)", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.Flow_cytometery.T1D/05.FlowCytometry.0113/hpapdata", "Metadata":"QC metadata (Google Sheets)", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu", "Data Status":"Partial — Documents Missing" }},
  { id:"qc_cytof", label:"CyTOF QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"Not submitted in Data Track", "Path":"—", "Metadata":"—", "Contact":"—", "Email":"—", "Data Status":"Not Submitted" }},
  { id:"qc_oxygen_consumption", label:"Oxygen Consumption QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"Google Doc protocol includes pipeline", "Path":"drive.google.com/.../1RK45VTtT0A...", "Metadata":"QC + Raw metadata (Google Sheets)", "Contact":"Jeya", "Email":"jeyavandana@gmail.com", "Data Status":"Available" }},
  { id:"qc_bcr_seq", label:"BCR-seq QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"FastQC + MiXCR pipeline", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Metadata":"Missing in Data Track", "Contact":"Adil Mohammed", "Email":"aim4007@med.cornell.edu; am2832@cornell.edu", "Data Status":"Partial — Metadata & Documents Missing" }},
  { id:"qc_tcr_seq", label:"TCR-seq QC\nPipeline v1.0", type:"Pipeline",
    detail:{ "Version":"v1.0", "Pipeline":"FastQC + MiXCR pipeline", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Metadata":"Missing in Data Track", "Contact":"Adil Mohammed", "Email":"aim4007@med.cornell.edu; am2832@cornell.edu", "Data Status":"Partial — Metadata & Documents Missing" }},

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
  { id:"proc_flow_cytometry_v1", label:"Flow Cytometry Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.Flow_cytometery.T1D/05.FlowCytometry.0113/hpapdata", "Storage":"https://docs.google.com/spreadsheets/d/124D9N5GJQdkOBiyLlvYq6uZ4vJHmhKqL7bUColcgPf0/edit?usp=sharing", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu", "Data Status":"Partial — Documents Missing" }},
  { id:"proc_cytof_v1", label:"CyTOF Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"—", "Metadata":"—", "Contact":"—", "Email":"—", "Data Status":"Not Submitted in Data Track" }},
  { id:"proc_oxygen_consumption_v1", label:"Oxygen Consumption Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"drive.google.com/.../1RK45VTtT0A...", "Metadata":"QC + Raw metadata (Google Sheets)", "Storage":"drive.google.com/.../1um8LIqqMVqN...", "Contact":"Jeya", "Email":"jeyavandana@gmail.com", "Data Status":"Available" }},
  { id:"proc_bcr_seq_v1", label:"BCR-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Pipeline":"FastQC + MiXCR", "Contact":"Adil Mohammed", "Email":"aim4007@med.cornell.edu; am2832@cornell.edu", "Data Status":"Partial — Metadata & Documents Missing" }},
  { id:"proc_tcr_seq_v1", label:"TCR-seq Dataset\nv1.0", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Pipeline":"FastQC + MiXCR", "Contact":"Adil Mohammed", "Email":"aim4007@med.cornell.edu; am2832@cornell.edu", "Data Status":"Partial — Metadata & Documents Missing" }},
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
  { id:"dc_cite_seq_v1", label:"Dataset Card\n(CITE-seq Protein v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/cite_seq_protein_v1.0.jsonld", "Author":"TBD", "Institution":"TBD", "Consent":"Open (HPAP DUA)", "Metadata":"/nfs/turbo/umms-drjieliu/proj/MAI_T1Ddata/CITEseq/adt_marker_list.csv", "Data status":"Not Submitted (Data Track)", "Status":"Draft", "Updated":"2026-04-06" }},
  { id:"dc_flow_cytometry_v1", label:"Dataset Card\n(Flow Cytometry v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/flow_cytometry_v1.0.jsonld", "Author":"Dongliang Leng", "Institution":"Cornell University", "Consent":"Open (HPAP DUA)", "Storage":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.Flow_cytometery.T1D/05.FlowCytometry.0113/hpapdata", "Known biases":"Documents missing in Data Track; pancreas B/T sub-dataset tracked separately", "Status":"Draft", "Updated":"2026-04-06" }},
  { id:"dc_cytof_v1", label:"Dataset Card\n(CyTOF v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/cytof_v1.0.jsonld", "Author":"TBD", "Institution":"TBD", "Consent":"Open (HPAP DUA)", "Data status":"Not Submitted (Data Track)", "Known biases":"Pipeline/metadata unavailable in current submission", "Status":"Draft", "Updated":"2026-04-06" }},
  { id:"dc_oxygen_consumption_v1", label:"Dataset Card\n(Oxygen Consumption v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/oxygen_consumption_v1.0.jsonld", "Author":"Jeya", "Institution":"University of Pennsylvania", "Consent":"Open (HPAP DUA)", "Primary docs":"docs.google.com/.../1oZfpNfuDidLho5k...", "Storage":"drive.google.com/.../1um8LIqqMVqN...", "Data status":"Available (Data Track)", "Status":"Draft", "Updated":"2026-04-06" }},
  { id:"dc_bcr_seq_v1", label:"Dataset Card\n(BCR-seq v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/bcr_seq_v1.0.jsonld", "Author":"Adil Mohammed", "Institution":"Cornell University", "Consent":"Open (HPAP DUA)", "Pipeline":"FastQC + MiXCR", "Storage":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Data status":"Partial — Metadata & Documents Missing", "Status":"Draft", "Updated":"2026-04-06" }},
  { id:"dc_tcr_seq_v1", label:"Dataset Card\n(TCR-seq v1.0)", type:"DatasetCard",
    detail:{ "Standard":"Datasheets for Datasets (CACM 2021)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/dataset-cards/tcr_seq_v1.0.jsonld", "Author":"Adil Mohammed", "Institution":"Cornell University", "Consent":"Open (HPAP DUA)", "Pipeline":"FastQC + MiXCR", "Storage":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.TCR_BCR.Adil", "Data status":"Partial — Metadata & Documents Missing", "Status":"Draft", "Updated":"2026-04-06" }},


  { id:"model_scfm",    label:"Single-cell FM v1\n(EpiAgent)", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"scGPT 70M params", "Cell-type F1 (macro)":"0.93", "Beta-cell F1":"0.95", "Alpha-cell F1":"0.92", "Eval set":"scRNA v2.1 (20% holdout)", "Lighthouse":"/lighthouse/mai-t1d/models/scfm_v1.0/", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_genomic", label:"Genomic FM v1\n(EPCOT-v2)",     type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"EPCOT multi-modal transformer", "AUROC (epigenome)":"0.91", "Pearson r (expression)":"0.87", "Eval set":"Multi-modal held-out", "Lighthouse":"/lighthouse/mai-t1d/models/genomic_v1.0/", "Status":"Active", "Compliance hold":"false" }},
  { id:"model_protein", label:"Protein FM v1", type:"Model",
    detail:{ "Version":"v1.0", "Architecture":"Protein multi-modal transformer", "AUPRC":"0.88", "Eval set":"Holdout proteomics cohort", "Lighthouse":"/lighthouse/mai-t1d/models/protein_v1.0/", "Status":"Active", "Compliance hold":"false" }},

  { id:"mc_scfm",    label:"Model Card\n(scFM v1)",          type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/scfm_v1.0.jsonld", "Author":"Kai Liu", "Intended use":"Cell-type annotation, T1D research", "Status":"Published" }},
  { id:"mc_genomic", label:"Model Card\n(Genomic FM v1)",    type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/genomic_v1.0.jsonld", "Author":"Kai Liu", "Linked dataset cards":"Bulk RNA v1.0, Bulk ATAC v1.0, scRNA-seq v1.0, scATAC-seq v1.0, snMultiomics v1.0", "Intended use":"Genomic prediction, regulatory elements", "Status":"Published" }},
  { id:"mc_protein", label:"Model Card\n(Protein FM v1)",    type:"ModelCard",
    detail:{ "Standard":"Model Cards (FAccT 2019)", "Format":"JSON-LD", "GitHub":"github.com/mai-t1d/governance/model-cards/protein_fm_v1.0.jsonld", "Author":"MAI-T1D team", "Linked dataset cards":"CITE-seq Protein v1.0, Flow Cytometry v1.0, CyTOF v1.0, Oxygen Consumption v1.0", "Intended use":"Protein-level representation learning and downstream immunophenotyping tasks", "Status":"Draft" }},

  { id:"emb_genomic_all_modalities_v1", label:"Genomic FM Embedding\n(all modalities v1)", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Scope":"all_modalities", "Source model":"Genomic FM v1 (EPCOT-v2)", "Included modalities":"Bulk RNA-seq, Bulk ATAC-seq, scRNA-seq, scATAC-seq, snMultiomics", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/embeddings/genomic_all_modalities_v1/", "Note":"This embedding aggregates all datasets entering Genomic FM; other embedding nodes may represent subset modalities." }},
  { id:"emb_scfm_bulk_rna_atac_v1", label:"Single-cell FM Embedding\n(Bulk RNA + Bulk ATAC v1)", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Scope":"bulk_rna_bulk_atac", "Source model":"Single-cell FM v1 (EpiAgent)", "Included modalities":"Bulk RNA-seq, Bulk ATAC-seq", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/embeddings/scfm_bulk_rna_atac_v1/", "Note":"Embedding generated by Single-cell FM from Bulk RNA + Bulk ATAC inputs." }},
  { id:"emb_scfm_cite_seq_v1", label:"Single-cell FM Embedding\n(CITE-seq v1)", type:"ProcessedData",
    detail:{ "Version":"v1.0", "Scope":"cite_seq_only", "Source model":"Single-cell FM v1 (EpiAgent)", "Included modalities":"CITE-seq Protein", "Path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/embeddings/scfm_cite_seq_v1/", "Note":"Embedding generated from CITE-seq input by Single-cell FM." }},
  { id:"model_scfm_ft_v1", label:"Finetuned Single-cell FM v1\n(on Genomic Embedding)", type:"FineTunedModel",
    detail:{ "Base model":"Single-cell FM v1 (EpiAgent)", "Fine-tuned on":"emb_genomic_all_modalities_v1", "Training mode":"Embedding-guided fine-tuning", "Version":"v1.0-ft", "Status":"Active" }},
  { id:"model_protein_ft_v1", label:"Finetuned Protein FM v1\n(on scFM CITE-seq Embedding)", type:"FineTunedModel",
    detail:{ "Base model":"Protein FM v1", "Fine-tuned on":"emb_scfm_cite_seq_v1", "Training mode":"Embedding-guided fine-tuning", "Version":"v1.0-ft", "Status":"Active" }},
  { id:"task_2", label:"Downstream Task 2\n(Finetuned Protein FM)", type:"DownstreamTask",
    detail:{ "Task":"Protein-level downstream task", "Model":"Finetuned Protein FM v1", "Input":"Single-cell FM CITE-seq embedding", "Status":"Active" }},
  { id:"task_1", label:"Downstream Task 1\n(Bulk scFM Embedding)", type:"DownstreamTask",
    detail:{ "Task":"Embedding-enabled downstream task", "Model":"Single-cell FM embedding (Bulk RNA + Bulk ATAC)", "Input":"emb_scfm_bulk_rna_atac_v1", "Status":"Active" }},
  { id:"task_5", label:"Downstream Task 5\n(Finetuned scFM)", type:"DownstreamTask",
    detail:{ "Task":"Cross-model downstream task", "Model":"Finetuned Single-cell FM v1", "Input":"Genomic FM unified embedding (all modalities)", "Status":"Active" }},
  BULK_RNA_COHORT_NODE,
  BULK_ATAC_COHORT_NODE,
  SCRNA_COHORT_NODE,
  SCATAC_COHORT_NODE,
  SNMULTIOMICS_COHORT_NODE,
  CITE_SEQ_PROTEIN_COHORT_NODE,
  FLOW_CYTOMETRY_COHORT_NODE,
  CYTOF_COHORT_NODE,
  OXYGEN_CONSUMPTION_COHORT_NODE,
  BCR_SEQ_COHORT_NODE,
  TCR_SEQ_COHORT_NODE,
  ...HPAP_DONOR_NODES,
  ...FILTERED_BULK_RNA_NODES,
  ...FILTERED_BULK_ATAC_NODES,
  ...FILTERED_SCRNA_NODES,
  ...FILTERED_SCATAC_NODES,
  ...SNMULTIOMICS_NODES,
  ...CITE_SEQ_PROTEIN_NODES,
  ...FLOW_CYTOMETRY_NODES,
  ...CYTOF_NODES,
  ...OXYGEN_CONSUMPTION_NODES,
  ...BCR_SEQ_NODES,
  ...TCR_SEQ_NODES,
];

export const EDGES = [
  { source:"cohort_bulk_rna_seq", target:"qc_bulk_rna", label:"USED" },
  { source:"cohort_bulk_atac_seq", target:"qc_bulk_atac", label:"USED" },
  { source:"cohort_scrna_seq", target:"qc_scrna", label:"USED" },
  { source:"cohort_scatac_seq", target:"qc_scatac", label:"USED" },
  { source:"cohort_snmultiomics", target:"qc_snmultiomics", label:"USED" },
  { source:"cohort_cite_seq_protein", target:"qc_cite_seq", label:"USED" },
  { source:"cohort_flow_cytometry", target:"qc_flow_cytometry", label:"USED" },
  { source:"cohort_cytof", target:"qc_cytof", label:"USED" },
  { source:"cohort_oxygen_consumption", target:"qc_oxygen_consumption", label:"USED" },
  { source:"cohort_bcr_seq", target:"qc_bcr_seq", label:"USED" },
  { source:"cohort_tcr_seq", target:"qc_tcr_seq", label:"USED" },
  { source:"qc_bulk_rna", target:"proc_bulk_rna_v1", label:"GENERATED_BY" },
  { source:"qc_bulk_atac", target:"proc_bulk_atac_v1", label:"GENERATED_BY" },
  { source:"qc_scrna", target:"proc_scrna_v1", label:"GENERATED_BY" },
  { source:"qc_scatac", target:"proc_scatac_v1", label:"GENERATED_BY" },
  { source:"qc_snmultiomics", target:"proc_snmultiomics_v1", label:"GENERATED_BY" },
  { source:"qc_cite_seq", target:"proc_cite_seq_v1", label:"GENERATED_BY" },
  { source:"qc_flow_cytometry", target:"proc_flow_cytometry_v1", label:"GENERATED_BY" },
  { source:"qc_cytof", target:"proc_cytof_v1", label:"GENERATED_BY" },
  { source:"qc_oxygen_consumption", target:"proc_oxygen_consumption_v1", label:"GENERATED_BY" },
  { source:"qc_bcr_seq", target:"proc_bcr_seq_v1", label:"GENERATED_BY" },
  { source:"qc_tcr_seq", target:"proc_tcr_seq_v1", label:"GENERATED_BY" },
  { source:"proc_bulk_rna_v1", target:"dc_bulk_rna_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bulk_atac_v1", target:"dc_bulk_atac_v1", label:"DOCUMENTED_BY" },
  { source:"proc_scrna_v1", target:"dc_scrna_v1", label:"DOCUMENTED_BY" },
  { source:"proc_scatac_v1", target:"dc_scatac_v1", label:"DOCUMENTED_BY" },
  { source:"proc_snmultiomics_v1", target:"dc_snmultiomics_v1", label:"DOCUMENTED_BY" },
  { source:"proc_cite_seq_v1", target:"dc_cite_seq_v1", label:"DOCUMENTED_BY" },
  { source:"proc_flow_cytometry_v1", target:"dc_flow_cytometry_v1", label:"DOCUMENTED_BY" },
  { source:"proc_cytof_v1", target:"dc_cytof_v1", label:"DOCUMENTED_BY" },
  { source:"proc_oxygen_consumption_v1", target:"dc_oxygen_consumption_v1", label:"DOCUMENTED_BY" },
  { source:"proc_bcr_seq_v1", target:"dc_bcr_seq_v1", label:"DOCUMENTED_BY" },
  { source:"proc_tcr_seq_v1", target:"dc_tcr_seq_v1", label:"DOCUMENTED_BY" },
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
  { source:"proc_cite_seq_v1", target:"model_scfm", label:"TRAINED_ON",
    train:{ "Model version":"Single-cell FM v1 (EpiAgent)", "Architecture":"Single-cell foundation model", "Modality":"CITE-seq Protein", "Data path":"N/A", "Contact":"N/A", "Email":"N/A" }},
  { source:"proc_snmultiomics_v1", target:"model_genomic", label:"TRAINED_ON",
    train:{ "Model version":"Genomic FM v1.0", "Architecture":"EPCOT multi-modal transformer", "Modality":"snMultiomics", "Data path":"/nfs/turbo/umms-drjieliu/proj/MAI_T1D_Data/snMultiome/", "Contact":"Haoxuan Zeng", "Email":"N/A" }},
  { source:"proc_cite_seq_v1", target:"model_protein", label:"TRAINED_ON",
    train:{ "Model version":"Protein FM v1.0", "Architecture":"Protein multi-modal transformer", "Modality":"CITE-seq Protein", "Data path":"N/A", "Contact":"N/A", "Email":"N/A" }},
  { source:"proc_flow_cytometry_v1", target:"model_protein", label:"TRAINED_ON",
    train:{ "Model version":"Protein FM v1.0", "Architecture":"Protein multi-modal transformer", "Modality":"Flow Cytometry", "Data path":"/nfs/turbo/umms-drjieliu/usr/dongleng/02.Flow_cytometery.T1D/05.FlowCytometry.0113/hpapdata", "Contact":"Dongliang Leng", "Email":"dol4005@med.cornell.edu" }},
  { source:"proc_cytof_v1", target:"model_protein", label:"TRAINED_ON",
    train:{ "Model version":"Protein FM v1.0", "Architecture":"Protein multi-modal transformer", "Modality":"CyTOF", "Data path":"N/A", "Contact":"N/A", "Email":"N/A" }},
  { source:"proc_oxygen_consumption_v1", target:"model_protein", label:"TRAINED_ON",
    train:{ "Model version":"Protein FM v1.0", "Architecture":"Protein multi-modal transformer", "Modality":"Oxygen Consumption", "Data path":"drive.google.com/.../1RK45VTtT0A...", "Contact":"Jeya", "Email":"jeyavandana@gmail.com" }},
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
  { source:"proc_bulk_rna_v1", target:"emb_scfm_bulk_rna_atac_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"bulk_rna_bulk_atac", "Included":"yes", "Embedding producer":"Single-cell FM v1" }},
  { source:"proc_bulk_atac_v1", target:"emb_scfm_bulk_rna_atac_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"bulk_rna_bulk_atac", "Included":"yes", "Embedding producer":"Single-cell FM v1" }},
  { source:"proc_cite_seq_v1", target:"emb_scfm_cite_seq_v1", label:"DERIVED_FROM",
    embed:{ "Scope":"cite_seq_only", "Included":"yes", "Embedding producer":"Single-cell FM v1" }},
  { source:"emb_genomic_all_modalities_v1", target:"model_genomic", label:"EMBEDDED_BY",
    embed:{ "Role":"producer_model", "Scope":"all_modalities" }},
  { source:"emb_scfm_bulk_rna_atac_v1", target:"model_scfm", label:"EMBEDDED_BY",
    embed:{ "Role":"producer_model", "Scope":"bulk_rna_bulk_atac" }},
  { source:"emb_scfm_cite_seq_v1", target:"model_scfm", label:"EMBEDDED_BY",
    embed:{ "Role":"producer_model", "Scope":"cite_seq_only" }},
  { source:"model_scfm_ft_v1", target:"emb_genomic_all_modalities_v1", label:"FINETUNED_ON",
    finetune:{ "Mode":"Embedding-guided", "Source embedding":"emb_genomic_all_modalities_v1" }},
  { source:"model_scfm_ft_v1", target:"model_scfm", label:"FINETUNED_ON",
    finetune:{ "Base model":"Single-cell FM v1 (EpiAgent)", "Method":"Fine-tuning on Genomic FM embedding" }},
  { source:"model_protein_ft_v1", target:"emb_scfm_cite_seq_v1", label:"FINETUNED_ON",
    finetune:{ "Mode":"Embedding-guided", "Source embedding":"emb_scfm_cite_seq_v1" }},
  { source:"model_protein_ft_v1", target:"model_protein", label:"FINETUNED_ON",
    finetune:{ "Base model":"Protein FM v1", "Method":"Fine-tuning on Single-cell FM CITE-seq embedding" }},
  { source:"model_scfm",    target:"mc_scfm",       label:"DOCUMENTED_BY" },
  { source:"model_genomic", target:"mc_genomic",    label:"DOCUMENTED_BY" },
  { source:"model_protein", target:"mc_protein",    label:"DOCUMENTED_BY" },
  { source:"mc_genomic", target:"dc_bulk_rna_v1",  label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_bulk_atac_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_scrna_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_scatac_v1", label:"LINKED_TO" },
  { source:"mc_genomic", target:"dc_snmultiomics_v1", label:"LINKED_TO" },
  { source:"mc_scfm", target:"dc_snmultiomics_v1", label:"LINKED_TO" },
  { source:"mc_protein", target:"dc_cite_seq_v1", label:"LINKED_TO" },
  { source:"mc_protein", target:"dc_flow_cytometry_v1", label:"LINKED_TO" },
  { source:"mc_protein", target:"dc_cytof_v1", label:"LINKED_TO" },
  { source:"mc_protein", target:"dc_oxygen_consumption_v1", label:"LINKED_TO" },
  { source:"emb_scfm_bulk_rna_atac_v1", target:"task_1",      label:"ENABLES" },
  { source:"model_protein_ft_v1", target:"task_2",      label:"ENABLES" },
  { source:"model_scfm_ft_v1", target:"task_5",      label:"ENABLES" },
  ...FILTERED_BULK_RNA_HAD_MEMBER_EDGES,
  ...FILTERED_BULK_ATAC_HAD_MEMBER_EDGES,
  ...FILTERED_SCRNA_HAD_MEMBER_EDGES,
  ...FILTERED_SCATAC_HAD_MEMBER_EDGES,
  ...SNMULTIOMICS_HAD_MEMBER_EDGES,
  ...CITE_SEQ_PROTEIN_HAD_MEMBER_EDGES,
  ...FLOW_CYTOMETRY_HAD_MEMBER_EDGES,
  ...CYTOF_HAD_MEMBER_EDGES,
  ...OXYGEN_CONSUMPTION_HAD_MEMBER_EDGES,
  ...BCR_SEQ_HAD_MEMBER_EDGES,
  ...TCR_SEQ_HAD_MEMBER_EDGES,
  ...FILTERED_BULK_RNA_COHORT_MEMBER_EDGES,
  ...FILTERED_BULK_ATAC_COHORT_MEMBER_EDGES,
  ...FILTERED_SCRNA_COHORT_MEMBER_EDGES,
  ...FILTERED_SCATAC_COHORT_MEMBER_EDGES,
  ...SNMULTIOMICS_COHORT_MEMBER_EDGES,
  ...CITE_SEQ_PROTEIN_COHORT_MEMBER_EDGES,
  ...FLOW_CYTOMETRY_COHORT_MEMBER_EDGES,
  ...CYTOF_COHORT_MEMBER_EDGES,
  ...OXYGEN_CONSUMPTION_COHORT_MEMBER_EDGES,
  ...BCR_SEQ_COHORT_MEMBER_EDGES,
  ...TCR_SEQ_COHORT_MEMBER_EDGES,
];










