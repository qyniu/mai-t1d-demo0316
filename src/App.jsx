import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { NODES, EDGES } from "./graphData";

//  NODE TYPES 
const TYPE = {
  RawData:       { bg:"#eff6ff", border:"#3b82f6", text:"#1e40af", badge:"#dbeafe", icon:"🧬", label:"Raw Biobank Data" },
  Pipeline:      { bg:"#f0fdf4", border:"#22c55e", text:"#15803d", badge:"#dcfce7", icon:"⚙️", label:"QC Pipeline" },
  ProcessedData: { bg:"#ecfdf5", border:"#10b981", text:"#065f46", badge:"#d1fae5", icon:"📊", label:"Processed Dataset" },
  DatasetCard:   { bg:"#fefce8", border:"#f59e0b", text:"#92400e", badge:"#fef3c7", icon:"📄", label:"Dataset Card" },
  Model:         { bg:"#fff1f2", border:"#f43f5e", text:"#9f1239", badge:"#ffe4e6", icon:"🧠", label:"Foundation Model" },
  FineTunedModel:{ bg:"#eef2ff", border:"#4f46e5", text:"#3730a3", badge:"#e0e7ff", icon:"🛠️", label:"Finetuned Model" },
  ModelCard:     { bg:"#fff7ed", border:"#f97316", text:"#9a3412", badge:"#ffedd5", icon:"📋", label:"Model Card" },
  DownstreamTask:{ bg:"#f1f5f9", border:"#94a3b8", text:"#475569", badge:"#e2e8f0", icon:"🎯", label:"Downstream Task" },
};

const EDGE_STYLE = {
  "USED":             { color:"#3b82f6", dash:"none", width:1.8 },
  "GENERATED_BY":     { color:"#22c55e", dash:"none", width:1.8 },
  "TRAINED_ON":       { color:"#8b5cf6", dash:"none", width:2.2 },
  "EVALUATED_ON":     { color:"#6366f1", dash:"none", width:2.0 },
  "DOCUMENTED_BY":    { color:"#f59e0b", dash:"5,3",  width:1.6 },
  "LINKED_TO":        { color:"#f43f5e", dash:"8,3",  width:2.2 },
  "ENABLES":          { color:"#94a3b8", dash:"4,2",  width:1.4 },
  "DERIVED_FROM":     { color:"#14b8a6", dash:"1,2",  width:1.8 },
  "EMBEDDED_BY":      { color:"#0ea5e9", dash:"3,3",  width:1.8 },
  "FINETUNED_ON":     { color:"#ec4899", dash:"6,2",  width:2.0 },
  "HAD_MEMBER":      { color:"#06b6d4", dash:"2,2",  width:1.2 },
};

const EDGE_LEGEND = [
  { key:"USED",             label:"USED" },
  { key:"GENERATED_BY", label:"GENERATED_BY" },
  { key:"TRAINED_ON",       label:"TRAINED_ON" },
  { key:"EVALUATED_ON",     label:"EVALUATED_ON" },
  { key:"DOCUMENTED_BY",    label:"DOCUMENTED_BY" },
  { key:"LINKED_TO",        label:"LINKED_TO" },
  { key:"ENABLES",          label:"ENABLES" },
  { key:"DERIVED_FROM",     label:"DERIVED_FROM" },
  { key:"EMBEDDED_BY",      label:"EMBEDDED_BY" },
  { key:"FINETUNED_ON",     label:"FINETUNED_ON" },
  { key:"HAD_MEMBER",       label:"HAD_MEMBER" },
];

//  NODES 


//  HELPERS: safe edge id extraction 
const edgeSrcId = e => typeof e.source === "object" ? e.source.id : e.source;
const edgeTgtId = e => typeof e.target === "object" ? e.target.id : e.target;
const normalizeLabel = (label = "") => String(label).replace(/\\n/g, "\n");
const labelSingleLine = (label = "") => normalizeLabel(label).replace(/\n/g, " ");
const isDonorNode = id => String(id).startsWith("donor_");
const isSampleNode = id => String(id).startsWith("sample_");
const isCohortNode = id => String(id).startsWith("cohort_");

//  GRAPH MODES 
const GRAPH_MODES = {
  full:    { label:"Full graph",            ids: NODES.map(n=>n.id) },
  scfm:   { label:"Single-cell FM lineage", ids:["cohort_snmultiomics","qc_snmultiomics","proc_snmultiomics_v1","dc_snmultiomics_v1","emb_genomic_all_modalities_v1","model_scfm","model_scfm_ft_v1","mc_scfm","task_celltype","task_deconv","task_5"] },
  genomic:{ label:"Genomic FM lineage",    ids:["cohort_bulk_rna_seq","qc_bulk_rna","proc_bulk_rna_v1","dc_bulk_rna_v1","cohort_bulk_atac_seq","qc_bulk_atac","proc_bulk_atac_v1","dc_bulk_atac_v1","cohort_scrna_seq","qc_scrna","proc_scrna_v1","dc_scrna_v1","cohort_scatac_seq","qc_scatac","proc_scatac_v1","dc_scatac_v1","cohort_snmultiomics","qc_snmultiomics","proc_snmultiomics_v1","dc_snmultiomics_v1","emb_genomic_all_modalities_v1","model_genomic","mc_genomic","task_eqtl","task_epigenome"] },
  hpap002:{ label:"HPAP-002 downstream",   ids:["emb_genomic_all_modalities_v1","model_scfm","model_scfm_ft_v1","model_genomic","mc_scfm","mc_genomic","task_celltype","task_deconv","task_eqtl","task_epigenome","task_5"] },
};

//  IMPACT SCENARIOS 
const IMPACT = {
  revision:   { label:" Dataset Revised (Type B)",   trigger:"proc_bulk_rna_v1", affected:new Set(["proc_bulk_rna_v1","model_genomic","mc_genomic","task_eqtl","task_epigenome"]), outdated:new Set(["model_genomic","mc_genomic"]), notes:{ "model_genomic":"?Outdated ?retrain required (TRAINED_ON ?revised data)","mc_genomic":"?Model Card outdated ?linked dataset changed" }},
  deprecation:{ label:" Consent Withdrawn (Type C)", trigger:"proc_bulk_atac_v1", affected:new Set(["proc_bulk_atac_v1","model_genomic","mc_genomic","task_eqtl","task_epigenome"]), outdated:new Set(["model_genomic","mc_genomic"]), notes:{ "model_genomic":"?COMPLIANCE HOLD ?TRAINED_ON edge traces to retracted data","mc_genomic":"?Model Card outdated ?upstream dataset changed" }},
  pipeline:   { label:" QC Pipeline Updated",        trigger:"qc_bulk_rna", affected:new Set(["qc_bulk_rna","proc_bulk_rna_v1","model_genomic","mc_genomic","task_eqtl","task_epigenome"]), outdated:new Set(["proc_bulk_rna_v1","model_genomic","mc_genomic"]), notes:{ "proc_bulk_rna_v1":"?Re-processing recommended with new pipeline","model_genomic":"?TRAINED_ON data produced by outdated pipeline","mc_genomic":"?Model Card should be reviewed after retraining" }},
};

//  PROV LOG CONFIG 
const NODE_OPTIONS = {
  RawData:    { label:"Raw Data update",                icon:"🧬", instances:[{id:"raw_scrna",label:"HPAP scRNA-seq"},{id:"raw_atac",label:"HPAP scATAC-seq"},{id:"raw_wgs",label:"HPAP WGS"},{id:"raw_spatial",label:"Spatial CODEX/IMC"}], fields:[{key:"donor_range",label:"Donor range / batch",placeholder:"e.g. HPAP-002 ?HPAP-049"},{key:"portal_url",label:"Portal URL",placeholder:"hpap.pmacs.upenn.edu/..."},{key:"lighthouse",label:"Lighthouse path",placeholder:"/lighthouse/mai-t1d/raw/..."},{key:"access",label:"DUA / access level",placeholder:"DUA-HPAP-2024-001"},{key:"checksum",label:"Checksum",placeholder:"sha256:..."}] },
  Pipeline:   { label:"QC Pipeline update",             icon:"⚙️", instances:[{id:"qc_scrna",label:"scRNA QC Pipeline"},{id:"qc_atac",label:"scATAC QC Pipeline"},{id:"qc_wgs",label:"WGS Variant Calling"},{id:"qc_spatial",label:"Spatial QC Pipeline"}], fields:[{key:"version",label:"New version",placeholder:"e.g. v4.0"},{key:"tool",label:"Main tool(s)",placeholder:"e.g. Scanpy 2.0"},{key:"github",label:"GitHub link",placeholder:"github.com/mai-t1d/pipelines/..."},{key:"script_hash",label:"Script hash",placeholder:"sha256: or git commit"},{key:"slurm_job",label:"SLURM Job ID",placeholder:"e.g. 12345678"},{key:"change_note",label:"What changed?",placeholder:"e.g. Updated doublet detection thresholds"}] },
  ProcessedData:{ label:"Processed dataset update",    icon:"📊", instances:[{id:"proc_scrna",label:"scRNA Dataset"},{id:"proc_atac",label:"scATAC Dataset"},{id:"proc_wgs",label:"WGS Variant Matrix"},{id:"proc_spatial",label:"Spatial Protein Matrix"}], fields:[{key:"version",label:"New version",placeholder:"e.g. v2.2"},{key:"cells_before",label:"Cells before QC",placeholder:"e.g. 90,000"},{key:"cells_after",label:"Cells after QC",placeholder:"e.g. 76,000"},{key:"lighthouse",label:"Lighthouse path",placeholder:"/lighthouse/mai-t1d/processed/..."},{key:"checksum",label:"Checksum",placeholder:"sha256:..."},{key:"change_note",label:"What changed?",placeholder:"e.g. Re-processed with QC pipeline v4"}] },
  TrainingRun:{ label:"New training run (TRAINED_ON edge)",               icon:"🏋️", instances:[{id:"scfm",label:"scFM-T1D (Single-cell FM)"},{id:"genomic_fm",label:"Genomic FM (EPCOT-v2)"},{id:"spatial_fm",label:"Spatial FM (Kronos) ?planned"},{id:"spatial_prot",label:"Spatial Proteomics FM ?planned"}], fields:[{key:"model_version",label:"Model version",placeholder:"e.g. v1.1"},{key:"train_date",label:"Training date",type:"date"},{key:"slurm_job",label:"SLURM Job ID",placeholder:"e.g. 99887766"},{key:"github",label:"Training script (GitHub)",placeholder:"github.com/mai-t1d/pipelines/..."},{key:"script_hash",label:"Script hash",placeholder:"sha256: or git commit"},{key:"gpu",label:"GPU / cluster",placeholder:"e.g. 8 A100 80GB ?Lighthouse HPC"}], hasDatasets:true },
  Model:      { label:"Model checkpoint update",        icon:"🧠", instances:[{id:"scfm",label:"scFM-T1D (Single-cell FM)"},{id:"genomic_fm",label:"Genomic FM (EPCOT-v2)"},{id:"spatial_fm",label:"Spatial FM (Kronos) ?planned"},{id:"spatial_prot",label:"Spatial Proteomics FM ?planned"}], fields:[{key:"version",label:"Version",placeholder:"e.g. v1.1"},{key:"lighthouse",label:"Lighthouse path",placeholder:"/lighthouse/mai-t1d/models/..."},{key:"checksum",label:"Checksum",placeholder:"sha256:..."},{key:"f1",label:"Primary metric",placeholder:"e.g. F1 macro: 0.94"},{key:"change_note",label:"What changed?",placeholder:"e.g. Fine-tuned on additional donors"}] },
  DatasetCard:{ label:"Dataset Card publish / update",  icon:"📄", instances:[{id:"dc_scrna",label:"Dataset Card ?scRNA"},{id:"dc_atac",label:"Dataset Card ?scATAC"},{id:"dc_wgs",label:"Dataset Card ?WGS"},{id:"dc_spatial",label:"Dataset Card ?Spatial"}], fields:[{key:"github",label:"GitHub link (JSON-LD file)",placeholder:"github.com/mai-t1d/governance/dataset-cards/..."},{key:"linked_data",label:"Linked dataset ID + version",placeholder:"e.g. scrna_v2.2"},{key:"change_note",label:"What changed?",placeholder:"e.g. Updated consent status"}] },
  ModelCard:  { label:"Model Card publish / update",    icon:"📋", instances:[{id:"mc_scfm",label:"Model Card ?scFM-T1D"},{id:"mc_genomic",label:"Model Card ?Genomic FM"},{id:"mc_spatial",label:"Model Card ?Spatial FM ?planned"}], fields:[{key:"github",label:"GitHub link (JSON-LD file)",placeholder:"github.com/mai-t1d/governance/model-cards/..."},{key:"linked_model",label:"Linked model ID + version",placeholder:"e.g. scfm_v1.1"},{key:"linked_dc",label:"Linked Dataset Card(s)",placeholder:"e.g. dc_scrna_v2.2"},{key:"change_note",label:"What changed?",placeholder:"e.g. Updated eval metrics after retraining"}] },
  DownstreamTask: { label:"Downstream Task change", icon:"🎯",
    instances:[
      { id:"task_celltype",  label:"Cell-type Classification (scFM)" },
      { id:"task_deconv",    label:"Islet Deconvolution (scFM)" },
      { id:"task_eqtl",      label:"eQTL Prediction (Genomic FM)" },
      { id:"task_epigenome", label:"Epigenome Prediction (Genomic FM)" },
      { id:"task_new",       label:"Add new task" },
    ],
    hasTaskOp: true,
    fields_update:[
      { key:"status",      label:"New status",         placeholder:"e.g. Active / Deprecated / In development" },
      { key:"description", label:"Updated description", placeholder:"e.g. Extended to multi-donor cohort" },
      { key:"institution", label:"Responsible institution", placeholder:"e.g. Vanderbilt University" },
      { key:"change_note", label:"Reason for change",  placeholder:"e.g. Scope expanded to include TEDDY cohort" },
    ],
    fields_deprecate:[
      { key:"deprecated_date",   label:"Deprecation date",   type:"date" },
      { key:"reason",            label:"Reason",              placeholder:"e.g. Superseded by v2 classifier" },
      { key:"replacement_task",  label:"Replacement task ID", placeholder:"e.g. task_celltype_v2 (if any)" },
    ],
    fields_add:[
      { key:"task_id",     label:"New task ID *",        placeholder:"e.g. task_risk_stratification" },
      { key:"task_name",   label:"Task name *",          placeholder:"e.g. T1D Risk Stratification" },
      { key:"model_id",    label:"Enabled by model *",   placeholder:"e.g. scfm, genomic_fm, spatial_fm" },
      { key:"task_type",   label:"Task type",            placeholder:"e.g. Classification / Regression / Generation" },
      { key:"description", label:"Description *",        placeholder:"e.g. Predict T1D onset risk from islet scRNA-seq" },
      { key:"institution", label:"Responsible institution", placeholder:"e.g. University of Michigan" },
      { key:"status",      label:"Initial status",       placeholder:"e.g. In development" },
      { key:"eu_ai_act",   label:"EU AI Act risk tier (optional)", placeholder:"e.g. High-risk (Art. 6) / Limited risk" },
    ],
  },
};

const INSTITUTIONS = ["University of Michigan","Vanderbilt University","Cornell University","University of South Florida","UCLA"];
const MODALITIES   = ["scRNA-seq","scATAC-seq","WGS","Spatial (CODEX)","Spatial (IMC)","snMultiome","TEA-seq","Flow Cytometry","Clinical Metadata"];

//  PRESENTATION MODE CONTEXT 
const PresentationCtx = React.createContext(false);
const usePres = () => React.useContext(PresentationCtx);

// scaled font helper: returns base size + offset in presentation mode
function fs(base, presOffset = 2) {
  const pres = usePres();
  return pres ? base + presOffset : base;
}

//  COMPACT LEGEND (always visible in Impact / Log views) 
function CompactLegend() {
  const p = usePres();
  return (
    <div style={{ padding:"10px 14px", background:"#fff", borderBottom:"1px solid #e2e8f0" }}>
      <div style={{ fontSize:p?10:8.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Legend</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {Object.entries(TYPE).map(([t,s])=>(
          <div key={t} style={{ display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:s.bg, border:`1.5px solid ${s.border}` }} />
            <span style={{ fontSize:p?10:8.5, color:"#64748b" }}>{s.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:5 }}>
        {EDGE_LEGEND.map(({key,label})=>(
          <div key={key} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <svg width="16" height="8" style={{ flexShrink:0 }}>
              <line x1="0" y1="4" x2="10" y2="4" stroke={EDGE_STYLE[key].color} strokeWidth="1.5" strokeDasharray={EDGE_STYLE[key].dash==="none"?undefined:EDGE_STYLE[key].dash}/>
              <polygon points="9,1.5 15,4 9,6.5" fill={EDGE_STYLE[key].color}/>
            </svg>
            <span style={{ fontSize:p?9.5:8, color:EDGE_STYLE[key].color, fontStyle:"italic", fontWeight:key==="LINKED_TO"?700:400 }}>{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

//  PROVENANCE LOG VIEW 
function ProvLogView() {
  const p = usePres();
  const [nodeType,    setNodeType]    = useState(null);
  const [instanceId,  setInstanceId]  = useState("");
  const [taskOp,      setTaskOp]      = useState("update");
  const [executor,    setExecutor]    = useState("");
  const [email,       setEmail]       = useState("");
  const [institution, setInstitution] = useState("University of Michigan");
  const [fields,      setFields]      = useState({});
  const [datasets,    setDatasets]    = useState([{id:"",version:"",modality:"scRNA-seq",path:""}]);
  const [submitted,   setSubmitted]   = useState(false);
  const [logId,       setLogId]       = useState("");

  const hf = k => e => setFields(f=>({...f,[k]:e.target.value}));
  const hd = (i,k) => e => setDatasets(d=>{ const r=[...d]; r[i]={...r[i],[k]:e.target.value}; return r; });

  const cfg        = nodeType ? NODE_OPTIONS[nodeType] : null;
  const isTask     = nodeType === "DownstreamTask";
  const isAdding   = isTask && taskOp === "add";
  const activeFields = isTask
    ? (taskOp==="add" ? cfg?.fields_add : taskOp==="update" ? cfg?.fields_update : cfg?.fields_deprecate)
    : cfg?.fields;
  const step3Ready = instanceId || isAdding;
  const canSubmit = !!(
    nodeType && executor &&
    (isAdding || instanceId) &&
    !(isAdding && (!fields.task_id || !fields.task_name || !fields.model_id || !fields.description))
  );

  const reset = () => {
    setSubmitted(false); setNodeType(null); setInstanceId(""); setTaskOp("update");
    setFields({}); setExecutor(""); setEmail(""); setDatasets([{id:"",version:"",modality:"scRNA-seq",path:""}]);
  };

  const card  = { background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"16px 20px", marginBottom:14 };
  const slbl  = { fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, display:"block" };
  const inp   = { width:"100%", padding:"7px 10px", borderRadius:6, border:"1px solid #e2e8f0", fontSize:p?13:11, fontFamily:"Georgia,serif", background:"#f8fafc", outline:"none", boxSizing:"border-box", color:"#1e293b" };
  const flbl  = { fontSize:p?11:9.5, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:3, display:"block" };

  const emailValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (submitted) return (
    <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, padding:40, background:"#f8fafc" }}>
      <div style={{ fontSize:44 }}>OK</div>
      <div style={{ fontSize:p?18:16, fontWeight:700, color:"#15803d", fontFamily:"Georgia,serif" }}>Log submitted</div>
      <div style={{ fontSize:p?13:11, color:"#64748b", textAlign:"center", maxWidth:400, lineHeight:1.7, fontFamily:"Georgia,serif" }}>
        The governance graph will process this log and create or update provenance relationships automatically.
      </div>

      <div style={{ ...card, width:"100%", maxWidth:440 }}>
        <div style={slbl}>KG action preview</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:TYPE[nodeType]?.badge||"#f0fdf4", borderRadius:7, border:`1px solid ${TYPE[nodeType]?.border||"#10b981"}44` }}>
            <span style={{ fontSize:16 }}>{cfg?.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:p?12:10, fontWeight:700, color:TYPE[nodeType]?.text||"#065f46" }}>
                {isAdding ? `New node: ${fields.task_id||"new_task"}`
                : isTask && taskOp==="deprecate" ? `Deprecated: ${instanceId}`
                : isTask ? `Updated: ${instanceId}`
                : `Matched: ${instanceId}`}
              </div>
              <div style={{ fontSize:p?12:10, color:"#64748b" }}>{cfg?.label}</div>
              {email && <div style={{ fontSize:p?11:9.5, color:"#64748b", fontFamily:"monospace", marginTop:2 }}> {email}</div>}
            </div>
            <span style={{ fontSize:p?11:9.5, padding:"2px 7px", borderRadius:4, background:"#f0fdf4", border:"1px solid #86efac", color:"#166534", fontWeight:700 }}>
              {isAdding?"CREATED":isTask&&taskOp==="deprecate"?"DEPRECATED":isTask?"UPDATED":"MATCHED"}
            </span>
          </div>

          {isAdding && fields.model_id && (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#f1f5f9", borderRadius:7, border:"1px solid #94a3b844" }}>
              <span style={{ fontSize:16 }}></span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:p?12:10, fontWeight:700, color:"#475569" }}>ENABLES edge ?{fields.model_id}</div>
                <div style={{ fontSize:p?12:10, color:"#64748b" }}>New DownstreamTask node linked to model</div>
              </div>
              <span style={{ fontSize:p?11:9.5, padding:"2px 7px", borderRadius:4, background:"#f1f5f9", border:"1px solid #94a3b8", color:"#475569", fontWeight:700 }}>CREATED</span>
            </div>
          )}

          {cfg?.hasDatasets && datasets.filter(d=>d.id).map((d,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#ecfdf5", borderRadius:7, border:"1px solid #10b98144" }}>
              <span style={{ fontSize:16 }}></span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:p?12:10, fontWeight:700, color:"#065f46" }}>USED edge ?{d.id} {d.version}</div>
                <div style={{ fontSize:p?12:10, color:"#64748b" }}>{d.modality}</div>
              </div>
              <span style={{ fontSize:p?11:9.5, padding:"2px 7px", borderRadius:4, background:"#f0fdf4", border:"1px solid #86efac", color:"#166534", fontWeight:700 }}>LINKED</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop:10, padding:"7px 12px", background:"#f8fafc", borderRadius:6, fontSize:p?12:10, color:"#64748b", fontFamily:"monospace" }}>
          <div>Log ID: {logId}</div>
          <div style={{ marginTop:3 }}>Executor: {executor}{email ? `  ${email}` : ""}  {institution}</div>
        </div>
      </div>

      <button onClick={reset}
        style={{ padding:"8px 20px", borderRadius:6, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:p?13:11, fontFamily:"Georgia,serif" }}>
        Submit another log
      </button>
    </div>
  );

  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
      {/* Compact legend sidebar */}
      <div style={{ width:0, overflow:"hidden" }}>{/* placeholder for symmetry */}</div>
      <div style={{ flex:1, overflowY:"auto", padding:"24px 28px", background:"#f8fafc" }}>
        <div style={{ maxWidth:580, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:22 }}>
            <div style={{ fontSize:p?13:11, fontFamily:"monospace", color:"#94a3b8", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>Mode 1 ?Manual Provenance Log</div>
            <div style={{ fontSize:p?18:16, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif", marginBottom:5 }}>Provenance Log Entry</div>
            <div style={{ fontSize:p?13:11, color:"#64748b", fontStyle:"italic", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
              Record any update ?raw data, pipeline, processed dataset,<br/>training run, model, card, or downstream task.<br/>
              The graph will auto-match and create provenance relationships.
            </div>
          </div>

          {/* Step 1: node type */}
          <div style={card}>
            <div style={slbl}>Step 1 ?What are you logging?</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {Object.entries(NODE_OPTIONS).map(([k,v])=>(
                <button key={k} onClick={()=>{ setNodeType(k); setInstanceId(""); setFields({}); setTaskOp("update"); }}
                  style={{ padding:"9px 12px", borderRadius:7, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:9, fontFamily:"Georgia,serif",
                    border:`2px solid ${nodeType===k?(TYPE[k]?.border||"#94a3b8"):"#e2e8f0"}`,
                    background:nodeType===k?(TYPE[k]?.bg||"#f1f5f9"):"#fff",
                    boxShadow:nodeType===k?`0 2px 8px ${TYPE[k]?.border||"#94a3b8"}22`:"none" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{v.icon}</span>
                  <span style={{ fontSize:p?12.5:10.5, fontWeight:nodeType===k?700:400, color:nodeType===k?(TYPE[k]?.text||"#475569"):"#475569", lineHeight:1.4 }}>{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2a: DownstreamTask operation */}
          {isTask && (
            <div style={card}>
              <div style={slbl}>Step 2 ?What operation?</div>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {[
                  { id:"update",    icon:"✏️", label:"Update existing task",    desc:"Change status, description, or responsible institution" },
                  { id:"deprecate", icon:"🗑️", label:"Deprecate task",           desc:"Mark as retired ?node stays in graph for audit trail" },
                  { id:"add",       icon:"➕", label:"Add new downstream task",  desc:"Create new task node + ENABLES edge from a model" },
                ].map(op=>(
                  <button key={op.id} onClick={()=>{ setTaskOp(op.id); setFields({}); if(op.id!=="add") setInstanceId(""); }}
                    style={{ padding:"9px 12px", borderRadius:7, cursor:"pointer", textAlign:"left", fontFamily:"Georgia,serif",
                      border:`1.5px solid ${taskOp===op.id?"#94a3b8":"#e2e8f0"}`,
                      background:taskOp===op.id?"#f1f5f9":"#fff" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:16 }}>{op.icon}</span>
                      <div>
                        <div style={{ fontSize:p?13:11, fontWeight:taskOp===op.id?700:400, color:taskOp===op.id?"#0f172a":"#374151", marginBottom:1 }}>{op.label}</div>
                        <div style={{ fontSize:p?12:10, color:"#64748b", fontStyle:"italic" }}>{op.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {taskOp==="deprecate" && (
                <div style={{ marginTop:10, padding:"8px 10px", borderRadius:6, background:"#fff1f2", border:"1px solid #fca5a5", fontSize:p?12.5:10.5, color:"#9f1239", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
                   Deprecating keeps the node in the graph with <code>deprecated: true</code>. The ENABLES edge is flagged inactive. No data is deleted ?required for EU AI Act audit trail.
                </div>
              )}
              {taskOp==="add" && (
                <div style={{ marginTop:10, padding:"8px 10px", borderRadius:6, background:"#f0fdf4", border:"1px solid #86efac", fontSize:p?12.5:10.5, color:"#166534", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
                  A new DownstreamTask node will be created and connected to the specified model via an ENABLES edge.
                </div>
              )}
            </div>
          )}

          {/* Step 2b: select instance */}
          {cfg && !isAdding && (
            <div style={card}>
              <div style={slbl}>{isTask ? "Step 3 ?Which task?" : `Step 2 ?Which ${cfg.label.split(" ")[0].toLowerCase()}?`}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                {cfg.instances.filter(i=>i.id!=="task_new").map(inst=>(
                  <button key={inst.id} onClick={()=>setInstanceId(inst.id)}
                    style={{ padding:"8px 12px", borderRadius:6, cursor:"pointer", textAlign:"left", fontFamily:"Georgia,serif", fontSize:p?12.5:10.5,
                      border:`1.5px solid ${instanceId===inst.id?"#0f172a":"#e2e8f0"}`,
                      background:instanceId===inst.id?"#0f172a":"#fff",
                      color:instanceId===inst.id?"#fff":(inst.label.includes("planned")||inst.label.includes("Spatial FM")?"#94a3b8":"#374151"),
                      fontWeight:instanceId===inst.id?700:400 }}>
                    {inst.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: who & when */}
          {step3Ready && (
            <div style={card}>
              <div style={slbl}>{isTask ? "Step 4" : "Step 3"} ?Who and when</div>
              {executor && (
                <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, background:"#f8fafc", border:"1px solid #e2e8f0", marginBottom:14 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0, fontFamily:"monospace" }}>
                    {executor.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:p?14:12, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif" }}>{executor}</div>
                    <div style={{ fontSize:p?12.5:10.5, color:"#64748b", fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {email || "no email recorded"}
                    </div>
                    <div style={{ fontSize:p?12:10, color:"#94a3b8" }}>{institution}</div>
                  </div>
                  {/* FIX #7: changed from "verified" to "valid format" */}
                  {emailValid && (
                    <span style={{ fontSize:p?11:9.5, padding:"2px 8px", borderRadius:4, background:"#eff6ff", border:"1px solid #93c5fd", color:"#1d4ed8", fontWeight:700, flexShrink:0 }}>?valid format</span>
                  )}
                </div>
              )}

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div>
                  <label style={flbl}>Your name *</label>
                  <input style={inp} placeholder="e.g. Kai Liu" value={executor} onChange={e=>setExecutor(e.target.value)} />
                </div>
                <div>
                  <label style={flbl}>Institution</label>
                  <select style={inp} value={institution} onChange={e=>setInstitution(e.target.value)}>
                    {INSTITUTIONS.map(i=><option key={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={flbl}>Email <span style={{ fontSize:p?11:9, color:"#94a3b8", fontWeight:400, textTransform:"none", letterSpacing:0 }}>(optional ?stored in KG for audit &amp; notifications)</span></label>
                <div style={{ position:"relative" }}>
                  <input
                    style={{ ...inp, paddingRight: emailValid ? 36 : 12 }}
                    placeholder="e.g. kailiu@umich.edu"
                    type="email"
                    value={email}
                    onChange={e=>setEmail(e.target.value)}
                  />
                  {emailValid && (
                    <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:13 }}>OK</span>
                  )}
                </div>
                {email && !emailValid && (
                  <div style={{ fontSize:p?11:9.5, color:"#f43f5e", marginTop:3, fontFamily:"Georgia,serif" }}>Enter a valid email address</div>
                )}
              </div>
            </div>
          )}

          {/* Detail fields */}
          {step3Ready && activeFields && (
            <div style={card}>
              <div style={slbl}>
                {isTask
                  ? (isAdding?"Step 5 ?New task details":taskOp==="deprecate"?"Step 5 ?Deprecation details":"Step 5 ?Update details")
                  : "Step 4 ?Details"}
              </div>
              {isAdding && (
                <div style={{ marginBottom:10, padding:"7px 10px", borderRadius:6, background:"#faf5ff", border:"1px solid #ddd6fe", fontSize:p?12.5:10.5, color:"#5b21b6", fontFamily:"Georgia,serif" }}>
                  Fields marked * are required. The graph will create a new <strong>DownstreamTask</strong> node and an <strong>ENABLES</strong> edge from the specified model.
                </div>
              )}
              {activeFields.map(f=>(
                <div key={f.key} style={{ marginBottom:10 }}>
                  <label style={flbl}>{f.label}</label>
                  <input type={f.type||"text"} style={inp} placeholder={f.placeholder||""} value={fields[f.key]||""} onChange={hf(f.key)} />
                </div>
              ))}
            </div>
          )}

          {/* Datasets ?Training Run only */}
          {step3Ready && cfg?.hasDatasets && (
            <div style={card}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div style={slbl}>Data used in this training run</div>
                <button onClick={()=>setDatasets(d=>[...d,{id:"",version:"",modality:"scRNA-seq",path:""}])}
                  style={{ fontSize:p?12:10, padding:"4px 10px", borderRadius:5, border:"1px solid #3b82f6", background:"#eff6ff", color:"#1d4ed8", cursor:"pointer", fontFamily:"Georgia,serif" }}>
                  + Add
                </button>
              </div>
              {datasets.map((d,i)=>(
                <div key={i} style={{ padding:"12px 14px", background:"#f8fafc", borderRadius:8, border:"1px solid #e2e8f0", marginBottom:8, position:"relative" }}>
                  <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", marginBottom:8 }}>Dataset {i+1}</div>
                  {datasets.length>1 && (
                    <button onClick={()=>setDatasets(d=>d.filter((_,j)=>j!==i))}
                      style={{ position:"absolute",top:10,right:10,fontSize:10,padding:"2px 7px",borderRadius:4,border:"1px solid #fca5a5",background:"#fff1f2",color:"#dc2626",cursor:"pointer" }}>X</button>
                  )}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                    <div><label style={flbl}>Dataset ID *</label><input style={{...inp,fontSize:p?12:10.5}} placeholder="e.g. scrna_v2.1" value={d.id} onChange={hd(i,"id")} /></div>
                    <div><label style={flbl}>Version</label><input style={{...inp,fontSize:p?12:10.5}} placeholder="e.g. v2.1" value={d.version} onChange={hd(i,"version")} /></div>
                  </div>
                  <div style={{ marginBottom:8 }}>
                    <label style={flbl}>Modality</label>
                    <select style={{...inp,fontSize:p?12:10.5}} value={d.modality} onChange={hd(i,"modality")}>
                      {MODALITIES.map(m=><option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={flbl}>Lighthouse path</label>
                    <input style={{...inp,fontSize:p?12:10.5}} placeholder="/lighthouse/mai-t1d/processed/..." value={d.path} onChange={hd(i,"path")} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Auto-match hint */}
          {step3Ready && (
            <div style={{ padding:"10px 14px", borderRadius:8, background:"#eff6ff", border:"1px solid #bfdbfe", marginBottom:14, fontSize:p?13:11, color:"#1e40af", fontFamily:"Georgia,serif", lineHeight:1.7 }}>
              {isAdding
                ? <><strong> Graph action:</strong> A new <strong>DownstreamTask</strong> node (<code>{fields.task_id||"task_id"}</code>) will be created and linked to <strong>{fields.model_id||"[model]"}</strong> via an ENABLES edge.</>
                : isTask && taskOp==="deprecate"
                ? <><strong>?Graph action:</strong> Node <strong>{instanceId}</strong> will be flagged <code>deprecated: true</code>. ENABLES edge preserved, marked inactive. No deletion.</>
                : isTask
                ? <><strong> Graph action:</strong> Properties of <strong>{instanceId}</strong> will be updated in the graph.</>
                : <><strong> Auto-matching:</strong> The graph will match this log to <strong>{instanceId}</strong> and create or update provenance relationships. If Model Card and Dataset Card both exist on GitHub, LINKED_TO edges will be created.</>
              }
            </div>
          )}

          <button disabled={!canSubmit}
            onClick={()=>{ if(canSubmit){ setLogId("log_"+Date.now().toString(36).toUpperCase()); setSubmitted(true); }}}
            style={{ width:"100%", padding:"11px", borderRadius:8, border:"none", cursor:canSubmit?"pointer":"not-allowed", background:canSubmit?"#0f172a":"#cbd5e1", color:"#fff", fontSize:p?14:12, fontWeight:700, fontFamily:"Georgia,serif", transition:"background 0.2s", opacity:canSubmit?1:0.55 }}>
            Submit provenance log ?          </button>
          <div style={{ textAlign:"center", marginTop:8, fontSize:p?11:9.5, color:"#94a3b8", fontStyle:"italic", fontFamily:"Georgia,serif" }}>
            Requires: node type  operation  your name
            {isAdding && "  task ID, name, model ID, description"}
          </div>
        </div>
      </div>
    </div>
  );
}

//  IMPACT VIEW 
function computeImpact(triggerId, eventType) {
  const affected = new Set();
  const outdated  = new Set();
  const downEdges = ["GENERATED_BY","TRAINED_ON","EVALUATED_ON","DOCUMENTED_BY","LINKED_TO","ENABLES"];
  const traverse = (id) => {
    EDGES.forEach(e => {
      const src = edgeSrcId(e);
      const tgt = edgeTgtId(e);
      if (src===id && downEdges.includes(e.label) && !affected.has(tgt)) {
        affected.add(tgt);
        const node = NODES.find(n=>n.id===tgt);
        if (node && (node.type==="Model"||node.type==="ModelCard"||node.type==="ProcessedData")) outdated.add(tgt);
        if (eventType==="C" && node && node.type==="Model") outdated.add(tgt);
        traverse(tgt);
      }
    });
  };
  traverse(triggerId);
  return { affected, outdated };
}

const CUSTOM_NODE_OPTIONS = [
  { id:"cohort_bulk_rna_seq", label:"HPAP cohort Bulk RNA-seq", type:"RawData" },
  { id:"cohort_bulk_atac_seq", label:"HPAP cohort Bulk ATAC-seq", type:"RawData" },
  { id:"qc_bulk_rna",    label:"Bulk RNA QC Pipeline v1.0", type:"Pipeline" },
  { id:"qc_bulk_atac",   label:"Bulk ATAC QC Pipeline v1.0", type:"Pipeline" },
  { id:"proc_bulk_rna_v1", label:"Bulk RNA-seq Dataset v1.0", type:"ProcessedData" },
  { id:"proc_bulk_atac_v1", label:"Bulk ATAC-seq Dataset v1.0", type:"ProcessedData" },
];

const EVENT_TYPES = [
  { id:"B", label:"Type B ?Data revised",              desc:"QC parameters changed, re-processing applied" },
  { id:"C", label:"Type C ?Deprecated / retracted",    desc:"Consent withdrawn or data pulled from portal" },
  { id:"A", label:"Type A ?New data added",            desc:"New donor batch appended to existing dataset" },
];

const ORDER = ["cohort_bulk_rna_seq","cohort_bulk_atac_seq","qc_bulk_rna","qc_bulk_atac","proc_bulk_rna_v1","proc_bulk_atac_v1","dc_bulk_rna_v1","dc_bulk_atac_v1","model_scfm","model_genomic","mc_scfm","mc_genomic","task_celltype","task_deconv","task_eqtl","task_epigenome"];

function ImpactView() {
  const p = usePres();
  const [tab,         setTab]         = useState("scenario");
  const [sc,          setSc]          = useState("pipeline");
  const [customNode,  setCustomNode]  = useState("qc_bulk_rna");
  const [eventType,   setEventType]   = useState("B");
  const [customResult,setCustomResult]= useState(null);

  const s = IMPACT[sc];

  const runCustom = () => {
    const { affected, outdated } = computeImpact(customNode, eventType);
    setCustomResult({ triggerId:customNode, eventType, affected, outdated });
  };

  const renderNodeList = (triggerId, affected, outdated) => (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {ORDER.map(id => {
        const node = NODES.find(n=>n.id===id); if(!node) return null;
        const t = TYPE[node.type];
        const isTrig = id===triggerId;
        const isOut  = outdated.has(id);
        const isAff  = affected.has(id);
        const isOk   = !isTrig && !isAff;
        const bc = isTrig?"#f59e0b" : isOut?"#f43f5e" : isAff?"#f97316" : "#86efac";
        const bg = isTrig?"#fffbeb" : isOut?"#fff1f2" : isAff?"#fff7ed" : "#f0fdf4";

        return (
          <div key={id} style={{ padding:"9px 13px", borderRadius:8, background:bg, border:`1.5px solid ${bc}`, opacity:isOk?0.55:1, transition:"opacity 0.15s", boxShadow:isOut?`0 2px 6px ${bc}22`:"none" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:p?18:16 }}>{t.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:p?11:9, fontWeight:700, color:t.text, textTransform:"uppercase", letterSpacing:"0.08em" }}>{t.label}</div>
                <div style={{ fontSize:p?13.5:11.5, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif" }}>{labelSingleLine(node.label)}</div>
              </div>
              {isTrig  && <span style={{ fontSize:p?11:9, padding:"2px 8px", borderRadius:4, background:"#fef3c7", border:"1px solid #f59e0b", color:"#92400e", fontWeight:700, fontFamily:"monospace", flexShrink:0 }}>TRIGGER</span>}
              {isOut && !isTrig && <span style={{ fontSize:p?11:9, padding:"2px 8px", borderRadius:4, background:"#ffe4e6", border:"1px solid #f43f5e", color:"#9f1239", fontWeight:700, fontFamily:"monospace", flexShrink:0 }}>OUTDATED</span>}
              {isAff && !isOut && !isTrig && <span style={{ fontSize:p?11:9, padding:"2px 8px", borderRadius:4, background:"#ffedd5", border:"1px solid #f97316", color:"#9a3412", fontWeight:700, fontFamily:"monospace", flexShrink:0 }}>AFFECTED</span>}
              {isOk  && <span style={{ fontSize:p?11:9, padding:"2px 8px", borderRadius:4, background:"#f0fdf4", border:"1px solid #86efac", color:"#166534", fontWeight:700, fontFamily:"monospace", flexShrink:0 }}>?OK</span>}
            </div>
            {s?.notes?.[id] && <div style={{ marginTop:5, padding:"4px 9px", background:"rgba(0,0,0,0.04)", borderRadius:4, fontSize:p?12:10, color:"#374151", lineHeight:1.5, borderLeft:`3px solid ${bc}`, fontFamily:"Georgia,serif" }}>{s.notes[id]}</div>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden", background:"#f8fafc" }}>
      <div style={{ flex:1, overflowY:"auto", padding:"24px 28px 40px" }}>
        <div style={{ maxWidth:580, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ fontSize:p?13:11, fontFamily:"monospace", color:"#94a3b8", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:6 }}>Automated Impact Analysis</div>
            <div style={{ fontSize:p?18:16, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif", marginBottom:5 }}>Living Dataset Governance</div>
            <div style={{ fontSize:p?13:11, color:"#64748b", fontStyle:"italic" }}>When upstream data changes, which downstream models and cards are affected?</div>
          </div>

          <div style={{ display:"flex", gap:6, marginBottom:20, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:4 }}>
            {[["scenario"," Scenario examples"],["custom"," Run your own"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{ flex:1, padding:"7px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"Georgia,serif", fontSize:p?13:11,
                  background:tab===id?"#0f172a":"transparent", color:tab===id?"#fff":"#475569", fontWeight:tab===id?700:400 }}>
                {label}
              </button>
            ))}
          </div>

          {tab==="scenario" && (<>
            <div style={{ display:"flex", gap:7, marginBottom:16, flexWrap:"wrap" }}>
              {Object.entries(IMPACT).map(([k,v])=>(
                <button key={k} onClick={()=>setSc(k)}
                  style={{ flex:1, minWidth:150, padding:"9px 12px", borderRadius:8, cursor:"pointer", fontFamily:"Georgia,serif", textAlign:"left",
                    border:`2px solid ${sc===k?"#f43f5e":"#e2e8f0"}`, background:sc===k?"#fff1f2":"#fff",
                    color:sc===k?"#9f1239":"#475569", fontSize:p?13:11, fontWeight:sc===k?700:400 }}>
                  {v.label}
                </button>
              ))}
            </div>

            <div style={{ padding:"10px 14px", borderRadius:8, background:"#fffbeb", border:"1px solid #fcd34d", marginBottom:16, fontSize:p?13:11, color:"#78350f", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
              <strong>Trigger: </strong>
              {sc==="revision"    ? "Bulk RNA dataset revised: metadata/QC refresh propagates to Genomic FM and dependent artifacts."
              :sc==="deprecation" ? "Bulk ATAC dataset deprecated/retracted: downstream Genomic FM lineage is flagged for compliance review."
              :                     "Bulk RNA QC pipeline updated from v1.0: processed dataset and model lineage require re-evaluation."}
            </div>

            {renderNodeList(s.trigger, s.affected, s.outdated)}

            <div style={{ marginTop:16, display:"flex", gap:8 }}>
              {[["Nodes affected",s.affected.size,"#f97316","#fff7ed"],["Outdated / re-eval",s.outdated.size,"#f43f5e","#fff1f2"],["?OK / unaffected",ORDER.length-s.affected.size-1,"#10b981","#f0fdf4"]].map(([l,v,c,bg])=>(
                <div key={l} style={{ flex:1, textAlign:"center", padding:"10px 6px", background:bg, borderRadius:8, border:`1px solid ${c}44` }}>
                  <div style={{ fontSize:p?24:22, fontWeight:700, color:c, fontFamily:"Georgia,serif" }}>{v}</div>
                  <div style={{ fontSize:p?11:9.5, color:"#64748b" }}>{l}</div>
                </div>
              ))}
            </div>
          </>)}

          {tab==="custom" && (<>
            <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"16px 18px", marginBottom:14 }}>
              <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Step 1 ?Which node changed?</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                {CUSTOM_NODE_OPTIONS.map(opt=>{
                  const t = TYPE[opt.type];
                  return (
                    <button key={opt.id} onClick={()=>{ setCustomNode(opt.id); setCustomResult(null); }}
                      style={{ padding:"8px 10px", borderRadius:7, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8, fontFamily:"Georgia,serif",
                        border:`1.5px solid ${customNode===opt.id?(t?.border||"#3b82f6"):"#e2e8f0"}`,
                        background:customNode===opt.id?(t?.bg||"#eff6ff"):"#fff" }}>
                      <span style={{ fontSize:16, flexShrink:0 }}>{t?.icon}</span>
                      <span style={{ fontSize:p?12:10, fontWeight:customNode===opt.id?700:400, color:customNode===opt.id?(t?.text||"#1e40af"):"#475569", lineHeight:1.4 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"16px 18px", marginBottom:14 }}>
              <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Step 2 ?What type of change?</div>
              <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                {EVENT_TYPES.map(ev=>(
                  <button key={ev.id} onClick={()=>{ setEventType(ev.id); setCustomResult(null); }}
                    style={{ padding:"9px 12px", borderRadius:7, cursor:"pointer", textAlign:"left", fontFamily:"Georgia,serif",
                      border:`1.5px solid ${eventType===ev.id?"#f43f5e":"#e2e8f0"}`,
                      background:eventType===ev.id?"#fff1f2":"#fff" }}>
                    <div style={{ fontSize:p?13:11, fontWeight:eventType===ev.id?700:400, color:eventType===ev.id?"#9f1239":"#374151", marginBottom:2 }}>{ev.label}</div>
                    <div style={{ fontSize:p?12:10, color:"#64748b", fontStyle:"italic" }}>{ev.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={runCustom}
              style={{ width:"100%", padding:"11px", borderRadius:8, border:"none", cursor:"pointer", background:"#0f172a", color:"#fff", fontSize:p?14:12, fontWeight:700, fontFamily:"Georgia,serif", marginBottom:18 }}>
              Run Impact Analysis ?            </button>

            {customResult && (<>
              <div style={{ padding:"10px 14px", borderRadius:8, background:"#fffbeb", border:"1px solid #fcd34d", marginBottom:14, fontSize:p?13:11, color:"#78350f", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
                <strong>Trigger: </strong>
                {CUSTOM_NODE_OPTIONS.find(o=>o.id===customResult.triggerId)?.label} ?Event {customResult.eventType} ({EVENT_TYPES.find(e=>e.id===customResult.eventType)?.desc})
              </div>

              {renderNodeList(customResult.triggerId, customResult.affected, customResult.outdated)}

              <div style={{ marginTop:16, display:"flex", gap:8 }}>
                {[["Nodes affected",customResult.affected.size,"#f97316","#fff7ed"],["Outdated / re-eval",customResult.outdated.size,"#f43f5e","#fff1f2"],["?OK / unaffected",ORDER.length-customResult.affected.size-1,"#10b981","#f0fdf4"]].map(([l,v,c,bg])=>(
                  <div key={l} style={{ flex:1, textAlign:"center", padding:"10px 6px", background:bg, borderRadius:8, border:`1px solid ${c}44` }}>
                    <div style={{ fontSize:p?24:22, fontWeight:700, color:c, fontFamily:"Georgia,serif" }}>{v}</div>
                    <div style={{ fontSize:p?11:9.5, color:"#64748b" }}>{l}</div>
                  </div>
                ))}
              </div>
            </>)}
          </>)}
        </div>
      </div>
    </div>
  );
}

//  D3 GRAPH 
const NW=140, NH=58;
function GraphView({ graphMode, highlightLinked }) {
  const p = usePres();
  const svgRef  = useRef(null);
  const wrapRef = useRef(null);
  const [size, setSize]         = useState({w:900,h:600});
  const [selected, setSelected] = useState(null);
  const [selEdge,  setSelEdge]  = useState(null);
  const [expandedCohorts, setExpandedCohorts] = useState(new Set());
  const [visibleNodeCount, setVisibleNodeCount] = useState(0);

  const visIds = useMemo(() => {
    const baseIds = new Set(GRAPH_MODES[graphMode].ids);
    if (graphMode !== "full") return baseIds;

    const visible = new Set([...baseIds].filter(id => !isDonorNode(id) && !isSampleNode(id)));
    for (const cohortId of expandedCohorts) {
      if (!baseIds.has(cohortId)) continue;
      visible.add(cohortId);

      const sampleIds = EDGES
        .filter(e => e.label === "HAD_MEMBER" && edgeSrcId(e) === cohortId && isSampleNode(edgeTgtId(e)))
        .map(e => edgeTgtId(e));

      for (const sampleId of sampleIds) {
        visible.add(sampleId);
        EDGES
          .filter(e => e.label === "HAD_MEMBER" && edgeTgtId(e) === sampleId && isDonorNode(edgeSrcId(e)))
          .forEach(e => visible.add(edgeSrcId(e)));
      }
    }
    return visible;
  }, [graphMode, expandedCohorts]);

  useEffect(()=>{
    if(!wrapRef.current) return;
    const obs=new ResizeObserver(e=>{ const{width,height}=e[0].contentRect; setSize({w:width,h:height}); });
    obs.observe(wrapRef.current); return()=>obs.disconnect();
  },[]);

  useEffect(()=>{
    setExpandedCohorts(new Set());
    setSelected(null);
    setSelEdge(null);
  }, [graphMode]);

  useEffect(()=>{
    if(!svgRef.current) return;
    const{w,h}=size;
    const svg=d3.select(svgRef.current); svg.selectAll("*").remove();

    const nodes=NODES.filter(n=>visIds.has(n.id)).map(n=>({...n}));
    const edges=EDGES
      .filter(e=>visIds.has(edgeSrcId(e))&&visIds.has(edgeTgtId(e)))
      .filter(e => !(graphMode==="full" && e.hiddenInFullGraph))
      .map(e=>({...e}));
    setVisibleNodeCount(nodes.length);

    const defs=svg.append("defs");
    const pat=defs.append("pattern").attr("id","grid").attr("width",30).attr("height",30).attr("patternUnits","userSpaceOnUse");
    pat.append("path").attr("d","M 30 0 L 0 0 0 30").attr("fill","none").attr("stroke","#e2e8f0").attr("stroke-width",0.5);
    defs.append("filter").attr("id","shadow").attr("x","-20%").attr("y","-20%").attr("width","140%").attr("height","140%")
      .call(f=>f.append("feDropShadow").attr("dx",0).attr("dy",2).attr("stdDeviation",3).attr("flood-color","#00000018"));
    defs.append("filter").attr("id","glow").attr("x","-40%").attr("y","-40%").attr("width","180%").attr("height","180%")
      .call(f=>f.append("feDropShadow").attr("dx",0).attr("dy",0).attr("stdDeviation",8).attr("flood-color","#3b82f660"));
    // FIX #8: special glow for LINKED_TO highlight
    defs.append("filter").attr("id","glow-linked").attr("x","-40%").attr("y","-40%").attr("width","180%").attr("height","180%")
      .call(f=>f.append("feDropShadow").attr("dx",0).attr("dy",0).attr("stdDeviation",6).attr("flood-color","#f43f5e80"));
    Object.entries(EDGE_STYLE).forEach(([k,v])=>{
      defs.append("marker").attr("id",`arr-${k}`).attr("viewBox","0 -5 10 10").attr("refX",10).attr("refY",0).attr("markerWidth",6).attr("markerHeight",6).attr("orient","auto")
        .append("path").attr("d","M0,-5L10,0L0,5").attr("fill",v.color).attr("opacity",0.8);
    });
    svg.insert("rect",":first-child").attr("width","100%").attr("height","100%").attr("fill","#f8fafc").lower();
    svg.insert("rect",":nth-child(2)").attr("width","100%").attr("height","100%").attr("fill","url(#grid)").lower();

    const g=svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2,3]).on("zoom",e=>g.attr("transform",e.transform)));

    const eG=g.append("g").selectAll(".eg").data(edges).enter().append("g").attr("class","eg")
      .style("cursor", d => d.label==="TRAINED_ON" ? "pointer" : "default")
      .on("click", (e,d) => { if(d.label==="TRAINED_ON"){ e.stopPropagation(); setSelEdge(prev=>prev===d?null:d); setSelected(null); }});
    eG.append("line").attr("class","hit")
      .attr("stroke","transparent").attr("stroke-width",12)
      .attr("display", d => d.label==="TRAINED_ON" ? null : "none");
    eG.append("line").attr("stroke",d=>EDGE_STYLE[d.label]?.color||"#aaa").attr("stroke-width",d=>EDGE_STYLE[d.label]?.width||1.8).attr("stroke-opacity",0.55).attr("stroke-dasharray",d=>EDGE_STYLE[d.label]?.dash==="none"?null:EDGE_STYLE[d.label]?.dash).attr("marker-end",d=>`url(#arr-${d.label})`);
    const eLT=eG.append("text").attr("text-anchor","middle").attr("font-size",p?10:8).attr("font-family","Georgia,serif").attr("font-style","italic").attr("fill",d=>EDGE_STYLE[d.label]?.color||"#aaa").attr("opacity",0.9).text(d=>d.label);
    eG.insert("rect","text").attr("fill","#f8fafc").attr("rx",3).attr("opacity",0.92);

    const nG=g.append("g").selectAll(".ng").data(nodes).enter().append("g").attr("class","ng").style("cursor","pointer")
      .call(d3.drag().on("start",(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;}).on("drag",(e,d)=>{d.fx=e.x;d.fy=e.y;}).on("end",(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}))
      .on("click",(e,d)=>{
        e.stopPropagation();
        if (graphMode==="full" && isCohortNode(d.id)) {
          setExpandedCohorts(prev=>{
            const next = new Set(prev);
            if (next.has(d.id)) next.delete(d.id);
            else next.add(d.id);
            return next;
          });
        }
        setSelected(prev=>prev?.id===d.id?null:d);
        setSelEdge(null);
      });

    nG.append("rect").attr("x",-NW/2).attr("y",-NH/2).attr("width",NW).attr("height",NH).attr("rx",8)
      .attr("fill",d=>TYPE[d.type].bg).attr("stroke",d=>TYPE[d.type].border).attr("stroke-width",1.8).attr("filter","url(#shadow)");
    nG.append("rect").attr("x",-NW/2).attr("y",-NH/2).attr("width",NW).attr("height",5).attr("rx",8).attr("fill",d=>TYPE[d.type].border);
    nG.append("rect").attr("x",-NW/2).attr("y",-NH/2+3).attr("width",NW).attr("height",2).attr("fill",d=>TYPE[d.type].border);
    nG.append("text").attr("text-anchor","middle").attr("y",-8).attr("font-size",13).attr("pointer-events","none").text(d=>TYPE[d.type].icon);
    nG.each(function(d){
      const lines=normalizeLabel(d.label).split("\n");
      const t=d3.select(this).append("text").attr("text-anchor","middle").attr("font-size",p?11:9).attr("font-weight","700").attr("font-family","Georgia,serif").attr("fill",TYPE[d.type].text).attr("pointer-events","none");
      lines.forEach((l,i)=>t.append("tspan").attr("x",0).attr("dy",i===0?9:11).text(l));
    });

    const sim=d3.forceSimulation(nodes)
      .force("link",d3.forceLink(edges).id(d=>d.id).distance(d=>["DOCUMENTED_BY","LINKED_TO","ENABLES"].includes(d.label)?110:200).strength(0.42))
      .force("charge",d3.forceManyBody().strength(-580))
      .force("center",d3.forceCenter(w/2,h/2))
      .force("collision",d3.forceCollide(88));

    sim.on("tick",()=>{
      eG.select("line.hit").attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      eG.select("line:not(.hit)").attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      eLT.attr("x",d=>(d.source.x+d.target.x)/2).attr("y",d=>(d.source.y+d.target.y)/2);
      eLT.each(function(){try{const bb=this.getBBox();d3.select(this.previousSibling).attr("x",bb.x-3).attr("y",bb.y-2).attr("width",bb.width+6).attr("height",bb.height+4);}catch(_){}});
      nG.attr("transform",d=>`translate(${d.x},${d.y})`);
    });
    svg.on("click",()=>{ setSelected(null); setSelEdge(null); });
    return()=>sim.stop();
  },[size,graphMode,p,visIds]);

  // FIX: selection highlighting + LINKED_TO highlight mode
  useEffect(()=>{
    if(!svgRef.current) return;
    const svg=d3.select(svgRef.current);
    const anyActive = selected || selEdge;

    // LINKED_TO highlight: nodes involved in LINKED_TO edges
    const linkedNodeIds = new Set();
    if (highlightLinked) {
      EDGES.filter(e=>e.label==="LINKED_TO").forEach(e=>{
        linkedNodeIds.add(edgeSrcId(e));
        linkedNodeIds.add(edgeTgtId(e));
      });
    }

    svg.selectAll(".ng").attr("opacity",d=>{
      if (highlightLinked && !anyActive) return linkedNodeIds.has(d.id) ? 1 : 0.15;
      if (!anyActive) return 1;
      return d.id===selected?.id ? 1 : 0.12;
    });
    svg.selectAll(".ng rect:first-child")
      .attr("stroke-width",d=>{
        if (selected?.id===d.id) return 3;
        if (highlightLinked && linkedNodeIds.has(d.id)) return 2.5;
        return 1.8;
      })
      .attr("filter",d=>{
        if (selected?.id===d.id) return "url(#glow)";
        if (highlightLinked && linkedNodeIds.has(d.id)) return "url(#glow-linked)";
        return "url(#shadow)";
      });

    svg.selectAll(".eg").attr("opacity", d => {
      if (highlightLinked && !anyActive) return d.label==="LINKED_TO" ? 1 : 0.07;
      if (!anyActive) return 0.85;
      if (selEdge && d===selEdge) return 1;
      return 0.07;
    });
    svg.selectAll(".eg line:not(.hit)").attr("stroke-width", d => {
      if (highlightLinked && !anyActive && d.label==="LINKED_TO") return (EDGE_STYLE[d.label]?.width||1.8)*2.5;
      if (selEdge && d===selEdge) return (EDGE_STYLE[d.label]?.width||1.8)*2;
      return EDGE_STYLE[d.label]?.width||1.8;
    }).attr("stroke-opacity", d => {
      if (highlightLinked && !anyActive && d.label==="LINKED_TO") return 0.95;
      return 0.55;
    });
  },[selected, selEdge, highlightLinked]);

  const connEdges=selected?EDGES.filter(e=>(e.source===selected.id||e.target===selected.id||(typeof e.source==="object"&&e.source.id===selected.id)||(typeof e.target==="object"&&e.target.id===selected.id)) && !(graphMode==="full" && e.hiddenInFullGraph)):[];
  const hiddenHadMemberOut=selected?EDGES.filter(e=>e.label==="HAD_MEMBER" && e.hiddenInFullGraph && edgeSrcId(e)===selected.id):[];
  const hiddenHadMemberIn=selected?EDGES.filter(e=>e.label==="HAD_MEMBER" && e.hiddenInFullGraph && edgeTgtId(e)===selected.id):[];
  const srcNode = selEdge ? NODES.find(n=>n.id===(typeof selEdge.source==="object"?selEdge.source.id:selEdge.source)) : null;
  const tgtNode = selEdge ? NODES.find(n=>n.id===(typeof selEdge.target==="object"?selEdge.target.id:selEdge.target)) : null;

  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
      <div ref={wrapRef} style={{ flex:1, overflow:"hidden" }}>
        <svg ref={svgRef} style={{ width:"100%", height:"100%", display:"block" }} />
      </div>
      {/* right panel */}
      <div style={{ width:p?300:272, borderLeft:"1px solid #cbd5e1", background:"#fff", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
        {selEdge && selEdge.train ? (
          <div style={{ padding:15 }}>
            <div style={{ padding:"11px 12px", background:"#faf5ff", border:"1.5px solid #8b5cf6", borderRadius:8, marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                <span style={{ fontSize:20 }}>Run</span>
                <div>
                  <div style={{ fontSize:p?10.5:8.5, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"#5b21b6", marginBottom:2 }}>Training Run ?edge metadata</div>
                  <div style={{ fontSize:p?13:11, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif" }}>
                    {labelSingleLine(srcNode?.label)} ?{labelSingleLine(tgtNode?.label)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize:p?11.5:9.5, color:"#7c3aed", fontStyle:"italic", fontFamily:"Georgia,serif", lineHeight:1.5 }}>
                Click this edge in the graph to inspect which dataset trained which model, and the full training provenance.
              </div>
            </div>
            <div style={{ fontSize:p?11:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>Training Metadata</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {Object.entries(selEdge.train).map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", background:"#faf5ff", border:"1px solid #ddd6fe", borderRadius:5, padding:"4px 8px" }}>
                  <span style={{ fontSize:p?11:9, color:"#7c3aed", fontFamily:"monospace", flexShrink:0, marginRight:8 }}>{k}</span>
                  <span style={{ fontSize:p?12:10, color:"#1e293b", fontWeight:600, textAlign:"right", wordBreak:"break-word", fontFamily:"Georgia,serif" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, padding:"8px 10px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:6, fontSize:p?12:10, color:"#166534", fontFamily:"Georgia,serif", lineHeight:1.6 }}>
               This TRAINED_ON edge replaces a separate Training Run node ?all provenance is captured directly on the relationship between dataset and model.
            </div>
          </div>
        ) : selected ? (
          <div style={{ padding:15 }}>
            <div style={{ padding:"11px 12px", background:TYPE[selected.type].badge, border:`1.5px solid ${TYPE[selected.type].border}`, borderRadius:8, marginBottom:14, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:24 }}>{TYPE[selected.type].icon}</span>
              <div>
                <div style={{ fontSize:p?10.5:8.5, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:TYPE[selected.type].text, marginBottom:2 }}>{TYPE[selected.type].label}</div>
                <div style={{ fontSize:p?14.5:12.5, fontWeight:700, color:"#0f172a", lineHeight:1.3, fontFamily:"Georgia,serif" }}>{labelSingleLine(selected.label)}</div>
              </div>
            </div>
            <div style={{ fontSize:p?11:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>Properties</div>
            <div style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:14 }}>
              {Object.entries(selected.detail).map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:5, padding:"4px 8px" }}>
                  <span style={{ fontSize:p?11:9, color:"#64748b", fontFamily:"monospace", flexShrink:0, marginRight:8 }}>{k}</span>
                  <span style={{ fontSize:p?12:10, color:"#1e293b", fontWeight:600, textAlign:"right", wordBreak:"break-word", fontFamily:"Georgia,serif" }}>{v}</span>
                </div>
              ))}
            </div>
            {(hiddenHadMemberOut.length>0 || hiddenHadMemberIn.length>0) && (
              <>
                <div style={{ fontSize:p?11:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>HAD_MEMBER (Hidden in Full graph)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:14 }}>
                  {hiddenHadMemberOut.map((e,i)=>{
                    const other=NODES.find(n=>n.id===edgeTgtId(e));
                    if(!other) return null;
                    return(
                      <div key={`hmo-${i}`} onClick={()=>setSelected(other)} style={{ display:"flex", alignItems:"center", gap:6, background:"#f8fafc", border:"1px solid #06b6d433", borderRadius:5, padding:"5px 8px", cursor:"pointer" }}>
                        <span style={{ color:"#0891b2", fontStyle:"italic", fontSize:p?10:8, fontWeight:700, flexShrink:0 }}>-&gt; HAD_MEMBER</span>
                        <span style={{ fontSize:13 }}>{TYPE[other.type]?.icon}</span>
                        <span style={{ color:"#374151", fontSize:p?12.5:10.5, fontWeight:600, fontFamily:"Georgia,serif" }}>{labelSingleLine(other.label)}</span>
                      </div>
                    );
                  })}
                  {hiddenHadMemberIn.map((e,i)=>{
                    const other=NODES.find(n=>n.id===edgeSrcId(e));
                    if(!other) return null;
                    return(
                      <div key={`hmi-${i}`} onClick={()=>setSelected(other)} style={{ display:"flex", alignItems:"center", gap:6, background:"#f8fafc", border:"1px solid #06b6d433", borderRadius:5, padding:"5px 8px", cursor:"pointer" }}>
                        <span style={{ color:"#0891b2", fontStyle:"italic", fontSize:p?10:8, fontWeight:700, flexShrink:0 }}>&lt;- HAD_MEMBER</span>
                        <span style={{ fontSize:13 }}>{TYPE[other.type]?.icon}</span>
                        <span style={{ color:"#374151", fontSize:p?12.5:10.5, fontWeight:600, fontFamily:"Georgia,serif" }}>{labelSingleLine(other.label)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {connEdges.length>0 && (
              <>
                <div style={{ fontSize:p?11:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>Connections ({connEdges.length})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {connEdges.map((e,i)=>{
                    const srcId = edgeSrcId(e);
                    const tgtId = edgeTgtId(e);
                    const oid=srcId===selected.id?tgtId:srcId;
                    const dir = srcId===selected.id ? "->" : "<-";
                    const other=NODES.find(n=>n.id===oid);
                    const ec=EDGE_STYLE[e.label]?.color||"#aaa";
                    return(
                      <div key={i} onClick={()=>setSelected(other)} style={{ display:"flex", alignItems:"center", gap:6, background:"#f8fafc", border:`1px solid ${ec}44`, borderRadius:5, padding:"5px 8px", cursor:"pointer" }}>
                        <span style={{ color:ec, fontStyle:"italic", fontSize:p?10:8, fontWeight:700, flexShrink:0 }}>{dir} {e.label}</span>
                        <span style={{ fontSize:13 }}>{other&&TYPE[other.type].icon}</span>
                        <span style={{ color:"#374151", fontSize:p?12.5:10.5, fontWeight:600, fontFamily:"Georgia,serif" }}>{labelSingleLine(other?.label)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, color:"#94a3b8", textAlign:"center", padding:24 }}>
            <div style={{ fontSize:32, opacity:0.2 }}></div>
            <div style={{ fontSize:p?14:12, fontWeight:700, color:"#64748b", fontFamily:"Georgia,serif" }}>Click any node</div>
            <div style={{ fontSize:p?12.5:10.5, lineHeight:1.9, fontStyle:"italic", fontFamily:"Georgia,serif" }}>Inspect provenance properties,<br/>QC statistics, Lighthouse paths,<br/>and governance connections.</div>
            <div style={{ marginTop:12, padding:"10px 14px", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, fontSize:p?12:10, color:"#374151", lineHeight:1.8, textAlign:"left", fontFamily:"Georgia,serif" }}>
              <strong>Showing</strong><br/>
              {GRAPH_MODES[graphMode].label}<br/>
              <span style={{ fontFamily:"monospace", fontSize:p?11.5:9.5 }}>{visibleNodeCount} nodes visible</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

//  GRAPH QUERY ENGINE 
function queryGraph(intent, params) {
  const resolveNode = (raw, preferredTypes=[]) => {
    const q = String(raw ?? "").trim().toLowerCase();
    if (!q) return null;
    const byId = NODES.find(n => n.id.toLowerCase() === q);
    if (byId) return byId;
    const pool = preferredTypes.length ? NODES.filter(n => preferredTypes.includes(n.type)) : NODES;
    const byLabelExact = pool.find(n => labelSingleLine(n.label).toLowerCase() === q);
    if (byLabelExact) return byLabelExact;
    return pool.find(n => labelSingleLine(n.label).toLowerCase().includes(q)) || null;
  };

  switch (intent) {
    case "datasets_for_model": {
      const modelNode =
        resolveNode(params.modelId, ["Model", "FineTunedModel"]) ||
        resolveNode(params.query, ["Model", "FineTunedModel"]);
      const modelId = modelNode?.id || params.modelId;
      const trainEdges = EDGES.filter(e => e.label==="TRAINED_ON" && edgeTgtId(e)===modelId);
      const datasets = trainEdges.map(e => {
        const node = NODES.find(n=>n.id===edgeSrcId(e));
        return { node, trainMeta: e.train };
      }).filter(x=>x.node);
      return { rows: datasets.map(d=>({ id:d.node.id, label:labelSingleLine(d.node.label), type:d.node.type, trainMeta:d.trainMeta })) };
    }
    case "models_for_dataset": {
      const datasetNode =
        resolveNode(params.datasetId, ["ProcessedData"]) ||
        resolveNode(params.query, ["ProcessedData"]);
      const datasetId = datasetNode?.id || params.datasetId;
      const trainEdges = EDGES.filter(e => e.label==="TRAINED_ON" && edgeSrcId(e)===datasetId);
      const models = trainEdges.map(e => NODES.find(n=>n.id===edgeTgtId(e))).filter(Boolean);
      return { rows: models.map(m=>({ id:m.id, label:labelSingleLine(m.label), type:m.type, detail:m.detail })) };
    }
    case "compliance_status": {
      const models = NODES.filter(n=>n.type==="Model");
      return { rows: models.map(m=>({ id:m.id, label:labelSingleLine(m.label), compliance_hold:m.detail["Compliance hold"], status:m.detail["Status"] })) };
    }
    case "pipeline_for_dataset": {
      const datasetNode =
        resolveNode(params.datasetId, ["ProcessedData"]) ||
        resolveNode(params.query, ["ProcessedData"]);
      const datasetId = datasetNode?.id || params.datasetId;
      const genEdge = EDGES.find(
        e => (e.label==="GENERATED_BY" || e.label==="WAS_GENERATED_BY") && edgeTgtId(e)===datasetId
      );
      if (!genEdge) return { rows:[] };
      const pipeline = NODES.find(n=>n.id===edgeSrcId(genEdge));
      return { rows: pipeline ? [{ id:pipeline.id, label:labelSingleLine(pipeline.label), detail:pipeline.detail }] : [] };
    }
    case "downstream_tasks": {
      const modelNode =
        resolveNode(params.modelId, ["Model", "FineTunedModel"]) ||
        resolveNode(params.query, ["Model", "FineTunedModel"]);
      const modelId = modelNode?.id || params.modelId;
      const enableEdges = EDGES.filter(e => e.label==="ENABLES" && edgeSrcId(e)===modelId);
      const tasks = enableEdges.map(e => NODES.find(n=>n.id===edgeTgtId(e))).filter(Boolean);
      return { rows: tasks.map(t=>({ id:t.id, label:labelSingleLine(t.label), detail:t.detail })) };
    }
    case "provenance_chain": {
      const node = resolveNode(params.nodeId) || resolveNode(params.query);
      const nodeId = node?.id || params.nodeId;
      const visited = new Set(); const chain = [];
      const traverse = (id) => {
        if (visited.has(id)) return; visited.add(id);
        const node = NODES.find(n=>n.id===id); if(!node) return;
        chain.push({ id, label:labelSingleLine(node.label), type:node.type });
        EDGES.forEach(e => {
          if (edgeTgtId(e)===id && ["USED","GENERATED_BY","WAS_GENERATED_BY","TRAINED_ON","EVALUATED_ON"].includes(e.label)) traverse(edgeSrcId(e));
        });
      };
      traverse(nodeId);
      return { rows: chain };
    }
    case "card_links": {
      let mcId = (
        resolveNode(params.mcId, ["ModelCard"]) ||
        resolveNode(params.query, ["ModelCard"])
      )?.id || params.mcId;

      if (mcId && !NODES.find(n => n.id===mcId && n.type==="ModelCard")) {
        const modelCardEdge = EDGES.find(e => e.label==="DOCUMENTED_BY" && edgeSrcId(e)===mcId);
        if (modelCardEdge) mcId = edgeTgtId(modelCardEdge);
      }

      if (!mcId) {
        const modelNode = resolveNode(params.modelId, ["Model", "FineTunedModel"]) || resolveNode(params.query, ["Model", "FineTunedModel"]);
        if (modelNode) {
          const modelCardEdge = EDGES.find(e => e.label==="DOCUMENTED_BY" && edgeSrcId(e)===modelNode.id);
          if (modelCardEdge) mcId = edgeTgtId(modelCardEdge);
        }
      }

      if (!mcId && typeof params.nodeId === "string") {
        const node = resolveNode(params.nodeId);
        if (node?.type === "ModelCard") {
          mcId = node.id;
        } else if (node?.type === "Model" || node?.type === "FineTunedModel") {
          const modelCardEdge = EDGES.find(e => e.label==="DOCUMENTED_BY" && edgeSrcId(e)===node.id);
          if (modelCardEdge) mcId = edgeTgtId(modelCardEdge);
        }
      }

      const linkedEdges = EDGES.filter(e => e.label==="LINKED_TO" && edgeSrcId(e)===mcId);
      const cards = linkedEdges.map(e => NODES.find(n=>n.id===edgeTgtId(e))).filter(Boolean);
      return { rows: cards.map(c=>({ id:c.id, label:labelSingleLine(c.label), detail:c.detail })) };
    }
    case "node_detail": {
      const node = resolveNode(params.nodeId) || resolveNode(params.query);
      return { rows: node ? [{ id:node.id, label:labelSingleLine(node.label), type:node.type, detail:node.detail }] : [] };
    }
    default:
      return { rows:[], error:"Unknown intent" };
  }
}

//  AGENT VIEW 
const GRAPH_CONTEXT = `
You are a governance agent for the MAI-T1D (Multimodal AI for Type 1 Diabetes) project knowledge graph.
Do not rely on embedded full-graph text. Always use the queryGraph tool to retrieve data.
Available intents:
- datasets_for_model
- models_for_dataset
- compliance_status
- pipeline_for_dataset
- downstream_tasks
- provenance_chain
- card_links
- node_detail
Workflow:
1) Pick the best intent and params.
2) Call queryGraph.
3) Answer only from tool results.
Answer style requirements:
- Return a direct final answer, not your search process.
- Never write phrases like "let me try/search/look up".
- If query results are empty, clearly say no matching records were found in the current graph.
- Keep answers concise and precise for AI researchers.
`;

const AGENT_TOOLS = [
  { name:"queryGraph", description:"Execute a structured query against the MAI-T1D provenance graph",
    input_schema:{ type:"object", properties:{
      intent:{ type:"string", enum:["datasets_for_model","models_for_dataset","compliance_status","pipeline_for_dataset","downstream_tasks","provenance_chain","card_links","node_detail"], description:"The query pattern to execute" },
      params:{ type:"object", description:"Parameters for the query. For card_links, prefer {mcId:'mc_genomic'} or {modelId:'model_genomic'}. {nodeId:'model_genomic'} is also accepted." }
    }, required:["intent","params"] }
  }
];

const SUGGESTIONS = [
  "What datasets trained Single-cell FM?",
  "Which models used scRNA data?",
  "Is any model on compliance hold?",
  "Show the provenance chain for Genomic FM",
  "What downstream tasks does Single-cell FM enable?",
  "Who ran the WGS pipeline?",
  "Which Dataset Cards does the Genomic FM Model Card link to?",
];

function AgentView() {
  const p = usePres();
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [phase,      setPhase]      = useState(null);
  const [liveTrace,  setLiveTrace]  = useState([]);
  const [elapsed,    setElapsed]    = useState(null);
  const [lastError,  setLastError]  = useState(null); // FIX #4: retry support
  const [lastQuery,  setLastQuery]  = useState(null);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const timerRef   = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages, loading, phase]);

  const startTimer = () => { timerRef.current = Date.now(); };
  const stopTimer  = () => { if(timerRef.current){ setElapsed(((Date.now()-timerRef.current)/1000).toFixed(1)); timerRef.current=null; }};

  const addTrace = (step) => setLiveTrace(t=>[...t, { ...step, ts: Date.now() }]);

  const sendMessage = async (text) => {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setLastError(null);
    setLastQuery(userMsg);
    inputRef.current?.focus();
    const history = [...messages, { role:"user", content:userMsg }];
    setMessages(history);
    setLoading(true);
    setLiveTrace([]);
    setElapsed(null);
    startTimer();

    try {
      setPhase("thinking");
      addTrace({ kind:"step", icon:"🧠", label:"Step 1 - LLM analysis", detail:"Parsing question and selecting query intent..." });

      const res1 = await fetch("/api/anthropic/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: GRAPH_CONTEXT, tools: AGENT_TOOLS,
          messages: history.map(m=>({role:m.role, content:m.content})),
        })
      });

      if (!res1.ok) throw new Error(`API returned ${res1.status}: ${res1.statusText}`);

      const data1 = await res1.json();
      if (data1.error) throw new Error(data1.error.message || "API error");

      const toolUses  = (data1.content||[]).filter(b=>b.type==="tool_use");
      const textParts = (data1.content||[]).filter(b=>b.type==="text");

      if (toolUses.length === 0) {
        addTrace({ kind:"info", icon:"💬", label:"Direct answer", detail:"No graph query required" });
        const answer = textParts.map(b=>b.text).join("\n");
        stopTimer();
        setMessages(m=>[...m, { role:"assistant", content:answer, trace:[] }]);
        setLoading(false); setPhase(null);
        return;
      }

      toolUses.forEach(tu => {
        addTrace({ kind:"intent", icon:"🎯", label:`Intent: ${tu.input.intent}`, detail:`params: ${JSON.stringify(tu.input.params||{})}` });
      });

      setPhase("querying");
      addTrace({ kind:"step", icon:"🔎", label:"Step 2 - graph query", detail:"Executing against provenance graph..." });

      const toolResults = [];
      const traceQueries = [];
      for (const tu of toolUses) {
        const { intent, params } = tu.input;
        const result = queryGraph(intent, params || {});
        const nRows = result.rows?.length ?? 0;
        addTrace({ kind:"result", icon: nRows>0?"OK":"INFO", label:`${intent}`, detail:`${nRows} row${nRows!==1?"s":""} returned`, rows: result.rows?.slice(0,3) });
        traceQueries.push({ intent, params, result });
        toolResults.push({ type:"tool_result", tool_use_id:tu.id, content: JSON.stringify(result) });
      }

      setPhase("answering");
      addTrace({ kind:"step", icon:"✍️", label:"Step 3 - generating answer", detail:"Claude interpreting query results..." });

      const assistantToolOnly = toolUses.map(tu => ({ type:"tool_use", id:tu.id, name:tu.name, input:tu.input }));
      const res2 = await fetch("/api/anthropic/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:1000,
          system: GRAPH_CONTEXT, tools: AGENT_TOOLS,
          messages:[
            ...history.map(m=>({role:m.role,content:m.content})),
            { role:"assistant", content:assistantToolOnly },
            { role:"user",      content:toolResults },
            { role:"user",      content:"Provide the final user-facing answer only. Do not describe your search steps. If no rows were returned, explicitly say no matching records were found in the current graph." },
          ],
        })
      });

      if (!res2.ok) throw new Error(`API returned ${res2.status}: ${res2.statusText}`);

      const data2 = await res2.json();
      if (data2.error) throw new Error(data2.error.message || "API error");

      const answer = (data2.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");

      stopTimer();
      addTrace({ kind:"done", icon:"✅", label:"Done", detail:`Answer ready` });
      setMessages(m=>[...m, { role:"assistant", content:answer||"(no response)", trace:traceQueries }]);
    } catch(err) {
      stopTimer();
      addTrace({ kind:"error", icon:"❌", label:"Error", detail:err.message });
      setLastError(err.message);
      setMessages(m=>[...m, { role:"assistant", content:`Error: ${err.message}`, trace:[], isError:true }]);
    }
    setLoading(false);
    setPhase(null);
  };

  // FIX #4: retry function
  const retryLast = () => {
    if (!lastQuery) return;
    // remove the error message from history
    setMessages(m => m.slice(0, -2)); // remove user msg + error response
    sendMessage(lastQuery);
  };

  const clearChat = () => { setMessages([]); setLiveTrace([]); setElapsed(null); setPhase(null); setLastError(null); inputRef.current?.focus(); };

  const userBubble = { alignSelf:"flex-end", maxWidth:"82%", padding:"10px 14px", borderRadius:"12px 12px 3px 12px", background:"#0f172a", color:"#fff", fontSize:p?14:12, fontFamily:"Georgia,serif", lineHeight:1.7, whiteSpace:"pre-wrap" };
  const agentBubble = { alignSelf:"flex-start", maxWidth:"82%", padding:"10px 14px", borderRadius:"3px 12px 12px 12px", background:"#fff", border:"1.5px solid #e2e8f0", color:"#1e293b", fontSize:p?14:12, fontFamily:"Georgia,serif", lineHeight:1.7, whiteSpace:"pre-wrap", boxShadow:"0 1px 4px #00000008" };
  const thinkingBubble = { ...agentBubble, color:"#94a3b8", fontStyle:"italic", borderColor:"#ddd6fe", background:"#faf5ff" };

  const traceColor = { step:"#3b82f6", intent:"#8b5cf6", result:"#10b981", info:"#64748b", done:"#10b981", error:"#f43f5e" };

  return (
    <div style={{ flex:1, display:"flex", overflow:"hidden", background:"#f8fafc" }}>
      {/* LEFT PANEL ?suggestions */}
      <div style={{ width:p?230:210, borderRight:"1px solid #e2e8f0", background:"#fff", display:"flex", flexDirection:"column", overflowY:"auto", flexShrink:0 }}>
        <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Suggested questions</div>
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {SUGGESTIONS.map(s=>(
              <button key={s} onClick={()=>sendMessage(s)} disabled={loading}
                style={{ padding:"7px 10px", borderRadius:6, border:"1px solid #e2e8f0", background:loading?"#f8fafc":"#fff", cursor:loading?"not-allowed":"pointer", textAlign:"left", fontSize:p?12.5:10.5, fontFamily:"Georgia,serif", color:"#374151", lineHeight:1.5, transition:"all 0.12s", opacity:loading?0.5:1 }}
                onMouseEnter={e=>{ if(!loading){ e.currentTarget.style.borderColor="#8b5cf6"; e.currentTarget.style.background="#faf5ff"; }}}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.background="#fff"; }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {messages.filter(m=>m.role==="user").length > 0 && (
          <div style={{ padding:"12px 14px" }}>
            <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Past queries</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {messages.filter(m=>m.role==="user").map((m,i)=>(
                <button key={i} onClick={()=>sendMessage(m.content)} disabled={loading}
                  style={{ padding:"6px 9px", borderRadius:5, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:loading?"not-allowed":"pointer", textAlign:"left", fontSize:p?12:10, fontFamily:"Georgia,serif", color:"#64748b", lineHeight:1.4, opacity:loading?0.4:1 }}>
                  ↪ {m.content.length>48 ? m.content.slice(0,48)+"..." : m.content}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding:"10px 14px", marginTop:"auto", borderTop:"1px solid #e2e8f0" }}>
          <div style={{ fontSize:p?11:9, color:"#94a3b8", lineHeight:1.8, fontStyle:"italic", fontFamily:"Georgia,serif" }}>
            Click any suggestion<br/>or type your own question.<br/>Enter to send.
          </div>
        </div>
      </div>

      {/* CENTER PANEL ?chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        <div style={{ padding:"10px 18px", background:"#fff", borderBottom:"1px solid #e2e8f0", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>AI Agent Interface ?Mode 4</div>
            <div style={{ fontSize:p?15.5:13.5, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif" }}>MAI-T1D Governance Agent</div>
            <div style={{ fontSize:p?12:10, color:"#64748b", fontStyle:"italic", fontFamily:"Georgia,serif" }}>Queries the provenance graph via structured tool calls  Claude Sonnet</div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat}
              style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:"pointer", fontSize:p?12.5:10.5, fontFamily:"Georgia,serif", color:"#64748b" }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor="#f43f5e"; e.currentTarget.style.color="#9f1239"; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.color="#64748b"; }}>
              🧹 Clear
            </button>
          )}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"20px 20px 12px", display:"flex", flexDirection:"column", gap:10 }}>
          {messages.length === 0 && !loading && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, paddingBottom:40 }}>
              <div style={{ fontSize:36, opacity:0.12 }}>🤖</div>
              <div style={{ fontSize:p?15:13, fontWeight:700, color:"#94a3b8", fontFamily:"Georgia,serif" }}>Ask a governance question</div>
              <div style={{ fontSize:p?13:11, color:"#94a3b8", fontStyle:"italic", fontFamily:"Georgia,serif", textAlign:"center", lineHeight:1.7 }}>
                The agent will query the MAI-T1D<br/>provenance graph and explain the results.
              </div>
            </div>
          )}

          {messages.map((m,i)=>(
            <div key={i} style={{ display:"flex", flexDirection:"column" }}>
              {m.role==="user" ? (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, justifyContent:"flex-end" }}>
                  <div style={userBubble}>{m.content}</div>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>👤</div>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:m.isError?"#fff1f2":"#faf5ff", border:`1.5px solid ${m.isError?"#f43f5e":"#8b5cf6"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>{m.isError?"⚠️":"🤖"}</div>
                  <div>
                    <div style={{...agentBubble, ...(m.isError?{borderColor:"#fca5a5",background:"#fff1f2",color:"#9f1239"}:{})}}>{m.content}</div>
                    {/* FIX #4: retry button on error */}
                    {m.isError && !loading && (
                      <button onClick={retryLast}
                        style={{ marginTop:6, padding:"5px 14px", borderRadius:6, border:"1px solid #f43f5e", background:"#fff1f2", color:"#9f1239", cursor:"pointer", fontSize:p?12:10.5, fontFamily:"Georgia,serif", fontWeight:700 }}>
                        🔁 Retry
                      </button>
                    )}
                    {m.trace?.length > 0 && (
                      <div style={{ marginTop:5, display:"flex", gap:5, flexWrap:"wrap" }}>
                        {m.trace.map((q,j)=>(
                          <div key={j} style={{ padding:"3px 8px", borderRadius:4, background:"#faf5ff", border:"1px solid #ddd6fe", fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#7c3aed" }}>
                             {q.intent} ?{q.result.rows?.length ?? 0} rows
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#faf5ff", border:"1.5px solid #8b5cf6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>🤖</div>
              <div style={thinkingBubble}>
                { phase==="thinking"  ? "Analyzing question and selecting query pattern..."
                : phase==="querying"  ? "Executing graph query against provenance store..."
                : phase==="answering" ? "Interpreting results and generating response..."
                : "Processing..." }
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding:"12px 16px 14px", background:"#fff", borderTop:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <textarea ref={inputRef}
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage(); }}}
              placeholder="Ask a governance question?(Enter to send, Shift+Enter for new line)"
              rows={2}
              style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${input.trim()?"#8b5cf6":"#e2e8f0"}`, fontSize:p?13:11, fontFamily:"Georgia,serif", resize:"none", outline:"none", lineHeight:1.6, background:"#f8fafc", color:"#1e293b", transition:"border-color 0.15s" }}
            />
            <button onClick={()=>sendMessage()} disabled={!input.trim()||loading}
              style={{ padding:"10px 18px", height:56, borderRadius:8, border:"none", background:input.trim()&&!loading?"#0f172a":"#cbd5e1", color:"#fff", fontSize:p?13:11, fontWeight:700, fontFamily:"Georgia,serif", cursor:input.trim()&&!loading?"pointer":"not-allowed", flexShrink:0 }}>
              Ask ➤            </button>
          </div>
          <div style={{ marginTop:5, fontSize:p?11.5:9.5, color:"#94a3b8", fontFamily:"monospace" }}>
            {loading ? `${phase==="thinking"?"Thinking":phase==="querying"?"Querying graph":phase==="answering"?"Answering":"Loading"}...`
            : `${NODES.length} nodes  ${EDGES.length} edges  ${EDGES.filter(e=>e.label==="TRAINED_ON").length} TRAINED_ON  ${EDGES.filter(e=>e.label==="LINKED_TO").length} LINKED_TO`}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL ?trace */}
      <div style={{ width:p?240:220, borderLeft:"1px solid #e2e8f0", background:"#fff", display:"flex", flexDirection:"column", overflowY:"auto", flexShrink:0 }}>
        <div style={{ padding:"12px 14px 10px", borderBottom:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>Query Trace</div>
          <div style={{ fontSize:p?12:10, color:"#64748b", fontStyle:"italic", fontFamily:"Georgia,serif" }}>Live execution log</div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"12px 12px" }}>
          {liveTrace.length === 0 && (
            <div style={{ fontSize:p?12:10, color:"#94a3b8", fontStyle:"italic", fontFamily:"Georgia,serif", lineHeight:1.8 }}>
              The step-by-step execution trace will appear here when you ask a question.
            </div>
          )}
          {liveTrace.map((t,i)=>(
            <div key={i} style={{ marginBottom:8, padding:"7px 9px", borderRadius:6,
              background: t.kind==="step"?"#eff6ff": t.kind==="intent"?"#faf5ff": t.kind==="result"?"#f0fdf4": t.kind==="done"?"#f0fdf4": t.kind==="error"?"#fff1f2":"#f8fafc",
              border:`1px solid ${t.kind==="step"?"#bfdbfe":t.kind==="intent"?"#ddd6fe":t.kind==="result"?"#bbf7d0":t.kind==="done"?"#86efac":t.kind==="error"?"#fca5a5":"#e2e8f0"}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:t.detail||t.rows?4:0 }}>
                <span style={{ fontSize:12 }}>{t.icon}</span>
                <span style={{ fontSize:p?12:10, fontWeight:700, color: traceColor[t.kind]||"#64748b" }}>{t.label}</span>
              </div>
              {t.detail && <div style={{ fontSize:p?11.5:9.5, color:"#64748b", fontFamily:"monospace", lineHeight:1.5, wordBreak:"break-all" }}>{t.detail}</div>}
              {t.rows?.length > 0 && (
                <div style={{ marginTop:4, display:"flex", flexDirection:"column", gap:2 }}>
                  {t.rows.map((r,j)=>(
                    <div key={j} style={{ fontSize:p?11:9, fontFamily:"monospace", color:"#374151", padding:"2px 5px", background:"rgba(0,0,0,0.04)", borderRadius:3 }}>
                      {r.label || r.id}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {elapsed && (
            <div style={{ marginTop:4, padding:"6px 9px", borderRadius:6, background:"#f0fdf4", border:"1px solid #86efac", fontSize:p?12:10, color:"#166534", fontFamily:"monospace" }}>
              ✅ Completed in {elapsed}s
            </div>
          )}
        </div>

        <div style={{ padding:"10px 12px", borderTop:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Available intents</div>
          {["datasets_for_model","models_for_dataset","compliance_status","pipeline_for_dataset","downstream_tasks","provenance_chain","card_links"].map(intent=>(
            <div key={intent} style={{ fontSize:p?11:9, fontFamily:"monospace", color:"#7c3aed", padding:"2px 0", lineHeight:1.7 }}>{intent}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

//  MAIN APP 
export default function App() {
  const [mode,           setMode]           = useState("full");
  const [graphMode,      setGraphMode]      = useState("full");
  const [presMode,       setPresMode]       = useState(false);  // FIX #6: presentation mode
  const [highlightLinked,setHighlightLinked] = useState(false); // FIX #8: LINKED_TO highlight

  const MODES = [
    { id:"full",   label:"🕸️ Provenance Graph" },
    { id:"impact", label:"⚡ Impact Analysis" },
    { id:"log",    label:"📝 Provenance Log Entry" },
    { id:"agent",  label:"🤖 Governance Agent" },
  ];

  const GMODES = [
    { id:"full",    label:"Full graph" },
    { id:"scfm",    label:"Single-cell FM lineage" },
    { id:"genomic", label:"Genomic FM lineage" },
    { id:"hpap002", label:"HPAP-002 downstream" },
  ];

  const p = presMode;

  return (
    <PresentationCtx.Provider value={presMode}>
    <div style={{ display:"flex", height:"100vh", background:"#f1f5f9", fontFamily:"Georgia,'Times New Roman',serif", color:"#1e293b", overflow:"hidden" }}>

      {/* LEFT SIDEBAR */}
      {mode==="full" && (
        <div style={{ width:p?220:195, borderRight:"1px solid #cbd5e1", background:"#fff", display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>
          {/* graph view selector */}
          <div style={{ padding:"14px 14px 10px", borderBottom:"1px solid #e2e8f0" }}>
            <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Graph View</div>
            {GMODES.map(gm=>(
              <div key={gm.id} onClick={()=>setGraphMode(gm.id)}
                style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 8px", borderRadius:6, cursor:"pointer", marginBottom:3,
                  background:graphMode===gm.id?"#0f172a":"transparent",
                  border:graphMode===gm.id?"1px solid #0f172a":"1px solid transparent" }}>
                <span style={{ fontSize:p?12.5:10.5, color:graphMode===gm.id?"#fff":"#374151", fontWeight:graphMode===gm.id?700:400 }}>{gm.label}</span>
              </div>
            ))}
          </div>

          {/* FIX #8: LINKED_TO highlight toggle */}
          <div style={{ padding:"10px 14px", borderBottom:"1px solid #e2e8f0" }}>
            <button onClick={()=>setHighlightLinked(h=>!h)}
              style={{ width:"100%", padding:"7px 10px", borderRadius:6, cursor:"pointer", fontFamily:"Georgia,serif", textAlign:"left", display:"flex", alignItems:"center", gap:7,
                border:`1.5px solid ${highlightLinked?"#f43f5e":"#e2e8f0"}`,
                background:highlightLinked?"#fff1f2":"#fff",
                color:highlightLinked?"#9f1239":"#475569",
                fontSize:p?12:10.5, fontWeight:highlightLinked?700:400 }}>
              <span style={{ fontSize:14 }}>🔗</span>
              Highlight LINKED_TO
            </button>
            <div style={{ fontSize:p?10:8.5, color:"#94a3b8", marginTop:4, fontStyle:"italic", lineHeight:1.4 }}>Core contribution: Model Card ?Dataset Card edges</div>
          </div>

          {/* node type legend */}
          <div style={{ padding:"12px 14px 10px", borderBottom:"1px solid #e2e8f0" }}>
            <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Provenance Node Types</div>
            {Object.entries(TYPE).map(([t,s])=>(
              <div key={t} style={{ display:"flex", alignItems:"center", gap:7, padding:"3px 4px", marginBottom:2 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:s.bg, border:`2px solid ${s.border}`, flexShrink:0 }} />
                <span style={{ fontSize:p?12:10, color:"#374151" }}>{s.label}</span>
              </div>
            ))}
          </div>
          {/* edge legend */}
          <div style={{ padding:"12px 14px" }}>
            <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>PROV Relations</div>
            {EDGE_LEGEND.map(({key,label})=>(
              <div key={key} style={{ display:"flex", alignItems:"center", gap:7, padding:"3px 0" }}>
                <svg width="22" height="10" style={{ flexShrink:0 }}>
                  <line x1="0" y1="5" x2="14" y2="5" stroke={EDGE_STYLE[key].color} strokeWidth="1.5" strokeDasharray={EDGE_STYLE[key].dash==="none"?undefined:EDGE_STYLE[key].dash}/>
                  <polygon points="12,2 20,5 12,8" fill={EDGE_STYLE[key].color}/>
                </svg>
                <span style={{ fontStyle:"italic", fontSize:p?11:9, color:EDGE_STYLE[key].color, fontWeight:key==="LINKED_TO"?700:400 }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ padding:"10px 14px", marginTop:"auto" }}>
            <div style={{ fontSize:p?11:9, color:"#94a3b8", lineHeight:1.9, fontStyle:"italic" }}>Drag  Scroll to zoom<br/>Click node for properties</div>
          </div>
        </div>
      )}

      {/* FIX #5: Show compact legend for non-graph views */}
      {mode!=="full" && mode!=="agent" && (
        <div style={{ width:p?220:195, borderRight:"1px solid #cbd5e1", background:"#fff", flexShrink:0, overflowY:"auto" }}>
          <CompactLegend />
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* top bar */}
        <div style={{ padding:"9px 18px", background:"rgba(241,245,249,0.97)", borderBottom:"1px solid #cbd5e1", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <span style={{ fontWeight:700, fontSize:p?15.5:13.5, color:"#0f172a" }}>MAI-T1D  Data Traceability & Model Governance</span>
            <span style={{ marginLeft:10, fontSize:p?12:10, color:"#64748b", fontFamily:"monospace" }}>HPAP scRNA-seq  W3C PROV  Knowledge Graph</span>
          </div>
          <div style={{ display:"flex", gap:5, alignItems:"center" }}>
            {[["#3b82f6",`${NODES.length} nodes`],["#10b981",`${EDGES.length} edges`],["#f43f5e","Model Card ?Dataset Card"]].map(([c,l])=>(
              <span key={l} style={{ fontSize:p?11.5:9.5, padding:"2px 7px", borderRadius:3, background:c+"12", color:c, border:`1px solid ${c}40`, fontFamily:"monospace" }}>{l}</span>
            ))}
            {/* FIX #6: presentation mode toggle */}
            <button onClick={()=>setPresMode(m=>!m)}
              style={{ marginLeft:6, padding:"3px 10px", borderRadius:4, border:`1.5px solid ${presMode?"#0f172a":"#e2e8f0"}`, background:presMode?"#0f172a":"#fff", color:presMode?"#fff":"#64748b", fontSize:10, cursor:"pointer", fontFamily:"monospace", fontWeight:700 }}>
              {presMode ? " PRES" : " Pres"}
            </button>
          </div>
        </div>

        {/* mode tabs */}
        <div style={{ padding:"7px 16px", background:"#fff", borderBottom:"1px solid #e2e8f0", display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
          <span style={{ fontSize:p?11.5:9.5, color:"#94a3b8", fontFamily:"monospace", marginRight:4 }}>VIEW:</span>
          {MODES.map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)}
              style={{ fontSize:p?12.5:10.5, fontFamily:"Georgia,serif", padding:"5px 14px", borderRadius:5, cursor:"pointer",
                border:`1px solid ${mode===m.id?(m.id==="impact"?"#f43f5e":m.id==="agent"?"#8b5cf6":"#3b82f6"):"#e2e8f0"}`,
                background:mode===m.id?(m.id==="impact"?"#fff1f2":m.id==="agent"?"#faf5ff":"#eff6ff"):"#f8fafc",
                color:mode===m.id?(m.id==="impact"?"#9f1239":m.id==="agent"?"#5b21b6":"#1d4ed8"):"#475569",
                fontWeight:mode===m.id?700:400, transition:"all 0.15s" }}>
              {m.label}
            </button>
          ))}
        </div>

        <div style={{ flex:1, overflow:"hidden", display:"flex" }}>
          {mode==="full"   && <GraphView graphMode={graphMode} highlightLinked={highlightLinked} />}
          {mode==="impact" && <ImpactView />}
          {mode==="log"    && <ProvLogView />}
          {mode==="agent"  && <AgentView />}
        </div>
      </div>
    </div>
    </PresentationCtx.Provider>
  );
}
















