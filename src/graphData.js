// NODE TYPES - unchanged from HPAP demo (zero PROV core modification)
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
  USED:             { color:"#3b82f6", dash:"none", width:1.8 },
  WAS_GENERATED_BY: { color:"#22c55e", dash:"none", width:1.8 },
  TRAINED_ON:       { color:"#8b5cf6", dash:"none", width:2.2 },
  DOCUMENTED_BY:    { color:"#f59e0b", dash:"5,3",  width:1.6 },
  LINKED_TO:        { color:"#f43f5e", dash:"8,3",  width:2.2 },
  ENABLES:          { color:"#94a3b8", dash:"4,2",  width:1.4 },
  HAS_DONOR:        { color:"#0ea5e9", dash:"2,2",  width:1.2 },
};

export const EDGE_LEGEND = [
  { key:"USED",             label:"USED" },
  { key:"WAS_GENERATED_BY", label:"WAS_GENERATED_BY" },
  { key:"TRAINED_ON",       label:"TRAINED_ON (with training metadata)" },
  { key:"DOCUMENTED_BY",    label:"DOCUMENTED_BY" },
  { key:"LINKED_TO",        label:"LINKED_TO - core contribution" },
  { key:"ENABLES",          label:"ENABLES" },
  { key:"HAS_DONOR",        label:"HAS_DONOR" },
];

// NODES - ENCODE Portal external dataset PoC (from encode_real_metadata.json)
// Same PROV core schema; only extension properties change.
export const NODES = [
  // RAW DATA (ENCODE experiments; treat each experiment's released file set as the "raw" artifact)
  { id:"raw_encode_chip_jund", label:"TF ChIP-seq\nENCSR785RQR", type:"RawData",
    detail:{ Accession:"ENCSR785RQR", Assay:"TF ChIP-seq", Target:"JUND", Biosample:"K562 (CRISPR targeting CEBPB)", Organism:"Homo sapiens", Lab:"Michael Snyder, Stanford", Released:"2025-09-27", Files:"2", "Portal URL":"https://www.encodeproject.org/experiments/ENCSR785RQR/", License:"CC0" }},
  { id:"raw_encode_chip_nr2f2", label:"TF ChIP-seq\nENCSR054ZMK", type:"RawData",
    detail:{ Accession:"ENCSR054ZMK", Assay:"TF ChIP-seq", Target:"NR2F2", Biosample:"HepG2 (shRNA targeting FOXA3)", Organism:"Homo sapiens", Lab:"Michael Snyder, Stanford", "Portal URL":"https://www.encodeproject.org/experiments/ENCSR054ZMK/", License:"CC0" }},
  { id:"raw_encode_atac_treg", label:"ATAC-seq\nENCSR844TIU", type:"RawData",
    detail:{ Accession:"ENCSR844TIU", Assay:"ATAC-seq", Biosample:"Regulatory T cell (C57BL/6NJ)", Organism:"Mus musculus", Lab:"Tim Reddy, Duke University", Released:"2025-09-30", Replicates:"2 biological x 2 technical", Files:"10", Sequencer:"Illumina NextSeq 500", Assembly:"mm10", "Portal URL":"https://www.encodeproject.org/experiments/ENCSR844TIU/", License:"CC0" }},
  { id:"raw_encode_rna_th9", label:"total RNA-seq\nENCSR863GGC", type:"RawData",
    detail:{ Accession:"ENCSR863GGC", Assay:"total RNA-seq", Biosample:"T-helper 9 cell (female adult, 25y)", Organism:"Homo sapiens", Lab:"John Stamatoyannopoulos, UW", Released:"2026-01-26", Files:"3", Assembly:"GRCh38", "Portal URL":"https://www.encodeproject.org/experiments/ENCSR863GGC/", License:"CC0" }},

  // PIPELINES (ENCODE released pipelines)
  { id:"pipe_chipseq", label:"ChIP-seq Pipeline\nENCPL436CSM", type:"Pipeline",
    detail:{ Accession:"ENCPL436CSM", Name:"CRG ChIP-seq", Status:"Released", "Portal URL":"https://www.encodeproject.org/pipelines/ENCPL436CSM/" }},
  { id:"pipe_atacseq", label:"ATAC-seq Pipeline\nENCPL867PDN", type:"Pipeline",
    detail:{ Accession:"ENCPL867PDN", Name:"GGR ATAC-seq pipeline VERSION TR.1", Status:"Released", "Portal URL":"https://www.encodeproject.org/pipelines/ENCPL867PDN/" }},
  { id:"pipe_rnaseq", label:"RNA-seq Pipeline\nENCPL280OHK", type:"Pipeline",
    detail:{ Accession:"ENCPL280OHK", Name:"Altius Total RNA-seq Pipeline", Version:"1", Assembly:"GRCh38", "Portal URL":"https://www.encodeproject.org/pipelines/ENCPL280OHK/" }},

  // PROCESSED DATA (conceptual released analysis outputs for provenance demo)
  { id:"proc_encode_chip_jund", label:"Processed\nJUND ChIP-seq", type:"ProcessedData",
    detail:{ "From experiment":"ENCSR785RQR", "Output types":"BAM + peaks + signal", Assembly:"GRCh38" }},
  { id:"proc_encode_chip_nr2f2", label:"Processed\nNR2F2 ChIP-seq", type:"ProcessedData",
    detail:{ "From experiment":"ENCSR054ZMK", "Output types":"BAM + peaks + signal", Assembly:"GRCh38" }},
  { id:"proc_encode_atac_treg", label:"Processed\nTreg ATAC-seq", type:"ProcessedData",
    detail:{ "From experiment":"ENCSR844TIU", "Output types":"BAM + peaks + signal", Assembly:"mm10" }},
  { id:"proc_encode_rna_th9", label:"Processed\nTh9 total RNA-seq", type:"ProcessedData",
    detail:{ "From experiment":"ENCSR863GGC", "Output types":"Quantification + signal", Assembly:"GRCh38" }},

  // DATASET CARDS (ENCODE portal experiment pages as documentation artifacts)
  { id:"dc_encode_chip_jund", label:"Experiment Page\nENCSR785RQR", type:"DatasetCard",
    detail:{ "Portal URL":"https://www.encodeproject.org/experiments/ENCSR785RQR/", Documentation:"Experiment metadata + released files list", License:"CC0" }},
  { id:"dc_encode_chip_nr2f2", label:"Experiment Page\nENCSR054ZMK", type:"DatasetCard",
    detail:{ "Portal URL":"https://www.encodeproject.org/experiments/ENCSR054ZMK/", Documentation:"Experiment metadata + released files list", License:"CC0" }},
  { id:"dc_encode_atac_treg", label:"Experiment Page\nENCSR844TIU", type:"DatasetCard",
    detail:{ "Portal URL":"https://www.encodeproject.org/experiments/ENCSR844TIU/", Documentation:"Experiment metadata + released files list", License:"CC0" }},
  { id:"dc_encode_rna_th9", label:"Experiment Page\nENCSR863GGC", type:"DatasetCard",
    detail:{ "Portal URL":"https://www.encodeproject.org/experiments/ENCSR863GGC/", Documentation:"Experiment metadata + released files list", License:"CC0" }},

  // MODEL (reference foundation model)
  { id:"model_enformer", label:"Enformer\n(Sequence-to-Function)", type:"Model",
    detail:{ Publication:"Avsec et al., Nature Methods 2021", DOI:"10.1038/s41592-021-01252-x", Parameters:"~250M", Input:"196 kb DNA sequence", Output:"5313 human + 1643 mouse tracks", "Training data":"ENCODE + Roadmap Epigenomics", License:"Apache-2.0" }},

  // MODEL CARD
  { id:"mc_enformer", label:"Model Card\nEnformer", type:"ModelCard",
    detail:{ GitHub:"https://github.com/deepmind/deepmind-research/tree/master/enformer", License:"Apache-2.0", Card:"Reference metadata (paper + repo)" }},

  // DOWNSTREAM TASKS (canonical Enformer tasks)
  { id:"task_tf_binding", label:"TF Binding\nPrediction", type:"DownstreamTask",
    detail:{ Task:"Prediction", Description:"Predict TF binding-related tracks from sequence (ChIP-seq-like signals)" }},
  { id:"task_accessibility", label:"Chromatin\nAccessibility", type:"DownstreamTask",
    detail:{ Task:"Prediction", Description:"Predict chromatin accessibility-related tracks (ATAC/DNase-like signals)" }},
  { id:"task_gene_expression", label:"Gene Expression\nPrediction", type:"DownstreamTask",
    detail:{ Task:"Prediction", Description:"Predict expression-proximal tracks from sequence (CAGE/RNA-like signals)" }},
];

export const EDGES = [
  // Raw experiments -> pipelines
  { source:"raw_encode_chip_jund",  target:"pipe_chipseq", label:"USED" },
  { source:"raw_encode_chip_nr2f2", target:"pipe_chipseq", label:"USED" },
  { source:"raw_encode_atac_treg",  target:"pipe_atacseq", label:"USED" },
  { source:"raw_encode_rna_th9",    target:"pipe_rnaseq",  label:"USED" },

  // Pipelines -> processed datasets
  { source:"pipe_chipseq", target:"proc_encode_chip_jund",  label:"WAS_GENERATED_BY" },
  { source:"pipe_chipseq", target:"proc_encode_chip_nr2f2", label:"WAS_GENERATED_BY" },
  { source:"pipe_atacseq", target:"proc_encode_atac_treg",  label:"WAS_GENERATED_BY" },
  { source:"pipe_rnaseq",  target:"proc_encode_rna_th9",    label:"WAS_GENERATED_BY" },

  // Processed datasets -> documentation cards
  { source:"proc_encode_chip_jund",  target:"dc_encode_chip_jund",  label:"DOCUMENTED_BY" },
  { source:"proc_encode_chip_nr2f2", target:"dc_encode_chip_nr2f2", label:"DOCUMENTED_BY" },
  { source:"proc_encode_atac_treg",  target:"dc_encode_atac_treg",  label:"DOCUMENTED_BY" },
  { source:"proc_encode_rna_th9",    target:"dc_encode_rna_th9",    label:"DOCUMENTED_BY" },

  // Processed datasets -> Enformer (TRAINED_ON)
  // Note: provenance/demo linkage representing "ENCODE-like" track supervision.
  { source:"proc_encode_chip_jund",  target:"model_enformer", label:"TRAINED_ON",
    train:{ Model:"Enformer", Publication:"Avsec et al. 2021", Supervision:"ChIP-seq-like tracks", Source:"ENCODE (metadata demo)" }},
  { source:"proc_encode_chip_nr2f2", target:"model_enformer", label:"TRAINED_ON",
    train:{ Model:"Enformer", Publication:"Avsec et al. 2021", Supervision:"ChIP-seq-like tracks", Source:"ENCODE (metadata demo)" }},
  { source:"proc_encode_atac_treg",  target:"model_enformer", label:"TRAINED_ON",
    train:{ Model:"Enformer", Publication:"Avsec et al. 2021", Supervision:"ATAC/DNase-like tracks", Source:"ENCODE (metadata demo)" }},
  { source:"proc_encode_rna_th9",    target:"model_enformer", label:"TRAINED_ON",
    train:{ Model:"Enformer", Publication:"Avsec et al. 2021", Supervision:"RNA/CAGE-like tracks", Source:"ENCODE (metadata demo)" }},

  // Model -> model card
  { source:"model_enformer", target:"mc_enformer", label:"DOCUMENTED_BY" },

  // Model card -> dataset cards
  { source:"mc_enformer", target:"dc_encode_chip_jund",  label:"LINKED_TO" },
  { source:"mc_enformer", target:"dc_encode_chip_nr2f2", label:"LINKED_TO" },
  { source:"mc_enformer", target:"dc_encode_atac_treg",  label:"LINKED_TO" },
  { source:"mc_enformer", target:"dc_encode_rna_th9",    label:"LINKED_TO" },

  // Model -> downstream tasks
  { source:"model_enformer", target:"task_tf_binding",      label:"ENABLES" },
  { source:"model_enformer", target:"task_accessibility",   label:"ENABLES" },
  { source:"model_enformer", target:"task_gene_expression", label:"ENABLES" },
];

