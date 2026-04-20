import React, { useEffect, useRef, useState } from "react";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { NODES, EDGES } from "./graphData";
import {
  queryGraph,
  GRAPH_CONTEXT,
  INTENT_ENUM,
  AGENT_TOOLS,
  SUGGESTIONS,
  normalizeQ,
  qHas,
  qHasAny,
  qHasAll,
  extractJsonFromText,
  getForcedToolUses,
  formatIntentAnswer,
  linkModelEntities,
  extractModelMentions,
  detectSplitFromQuestion,
  hasOverlapSignal,
  hasMultiModelSignal,
  parseInventoryRequest,
  parseImpactRequest,
  parseDonorAttributeTargetFromQuestion,
  resolveModelIdFromText,
  LANGGRAPH_MAX_STEPS,
  AGENT_LANGGRAPH_PLANNER_SYSTEM,
  AGENT_LANGGRAPH_ANSWER_SYSTEM,
} from "./agentCore";

const ICON = {
  robot: "\uD83E\uDD16",
  user: "\uD83D\uDC64",
  clear: "\uD83E\uDDF9",
  retry: "\uD83D\uDD01",
  route: "\uD83E\uDDE0",
  link: "\uD83D\uDD17",
  planner: "\uD83D\uDDFA",
  stop: "\u23F9",
  clarify: "\u2753",
  answer: "\uD83D\uDCA1",
  intent: "\uD83C\uDFAF",
  fallback: "\u21A9",
  act: "\uD83D\uDD0E",
  noProgress: "\u26A0",
  verifyOk: "\u2705",
  verifyNo: "\u274C",
  done: "\u2705",
  error: "\u274C",
};
const ENABLE_RULE_BASED_ROUTING = false;

function AgentView({ p = false }) {
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
  const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));
  const callAnthropic = async ({ system, messages, tools, max_tokens=1000 }) => {
    const res = await fetch("/api/anthropic/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514",
        max_tokens,
        system,
        ...(tools ? { tools } : {}),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "API error");
    return data;
  };
  const summarizeResultForPlanner = (intent, result) => {
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    return {
      intent,
      rowCount: rows.length,
      preview: rows.slice(0, 5),
      summary: result?.summary || null,
    };
  };
  const isNodeAttributeQuestion = (q = "") =>
    qHasAny(normalizeQ(q), [
      "who is responsible", "responsible", "owner", "contact", "email",
      "path", "version", "status", "metadata", "meta data", "details", "detail",
      "properties", "property", "full record",
      "负责人", "谁负责", "联系方式", "邮箱", "路径", "版本", "元数据", "详情", "属性", "完整记录",
    ]);
  const extractDonorCodeFromText = (q = "") => {
    const m = String(q || "").toUpperCase().match(/HPAP[-_\s]?(\d{1,3})/);
    if (!m) return "";
    return `HPAP-${String(Number(m[1])).padStart(3, "0")}`;
  };
  const isLikelySampleOrReplicate = (row) => {
    const id = String(row?.id || "").toLowerCase();
    const label = String(row?.label || "").toLowerCase();
    if (id.startsWith("sample_")) return true;
    return label.includes("replicate") || label.includes("sample");
  };
  const isDonorLevelRow = (row, donorCode = "") => {
    const id = String(row?.id || "").toLowerCase();
    const type = String(row?.type || "").toLowerCase();
    const label = String(row?.label || "").toUpperCase();
    if (id.startsWith("donor_hpap_")) return true;
    if (type === "donor") return true;
    if (donorCode && label === donorCode && !isLikelySampleOrReplicate(row)) return true;
    return false;
  };
  const pickPreferredNodeDetailCandidate = (rows = [], question = "") => {
    if (!Array.isArray(rows) || rows.length === 0) return { preferred: null, donorCode: "" };
    const donorCode = extractDonorCodeFromText(question);
    if (donorCode) {
      const donorCandidates = rows.filter((r) => isDonorLevelRow(r, donorCode));
      if (donorCandidates.length) {
        donorCandidates.sort((a, b) => (Number(b?.score || 0) - Number(a?.score || 0)));
        return { preferred: donorCandidates[0], donorCode };
      }
      return { preferred: null, donorCode };
    }
    return { preferred: rows[0], donorCode: "" };
  };
  const isModelDatasetQuestion = (q = "", modelIds = []) => {
    const s = normalizeQ(q);
    const asksDataset = qHasAny(s, ["dataset", "datasets", "data", "数据集", "数据"]);
    const hasModel = (Array.isArray(modelIds) && modelIds.length > 0) || qHasAny(s, ["model", "fm", "foundation model", "模型"]);
    const asksRelation = qHasAny(s, ["train", "trained", "used", "input", "for", "训练", "用于", "用了"]);
    return asksDataset && hasModel && asksRelation;
  };
  const isDatasetToModelsQuestion = (q = "") => {
    const s = normalizeQ(q);
    const asksModels = qHasAny(s, ["which model", "which models", "what model", "what models", "模型"]);
    const asksDownstream = qHasAny(s, ["downstream", "used by", "of", "下游", "由"]);
    const hasDatasetLike = qHasAny(s, [
      "dataset", "data", "rna", "scrna", "sc rna", "scRNA-seq", "single-cell rna", "modality", "数据集", "数据",
    ]);
    return asksModels && asksDownstream && hasDatasetLike;
  };
  const isQcPipelineQuestion = (q = "") => {
    const s = normalizeQ(q);
    const asksPipeline = qHasAny(s, ["qc pipeline", "pipeline", "流程", "质控"]);
    const asksProduction = qHasAny(s, ["produced", "generate", "generated", "used for", "for", "生成", "用于", "哪个"]);
    return asksPipeline && asksProduction;
  };
  const isPipelineFromDatasetQuestion = (q = "") => {
    const s = String(q || "").toLowerCase();
    const asksPipeline = /\b(qc\s*pipeline|pipeline)\b/.test(s);
    const asksVersion = /\bversion\b/.test(s);
    const asksGenerateRelation = /\b(generates?|generated|generated by|produced|produced by)\b/.test(s);
    const asksDataset = /\b(dataset|data)\b/.test(s);
    return asksPipeline && (asksGenerateRelation || asksVersion) && asksDataset;
  };
  const isExplicitSearchRequest = (q = "") => {
    const s = String(q || "").toLowerCase().trim();
    if (!s) return false;
    return (
      /\b(find nodes?|search for|search nodes?|show matching nodes?|list nodes?)\b/.test(s) ||
      /\b(find|search|list|show)\b.*\bnodes?\b/.test(s)
    );
  };
  const isModelsForDatasetQuestion = (q = "") => {
    const s = String(q || "").toLowerCase();
    const asksModels = /\b(which|what|show|list)\b.*\bmodels?\b/.test(s) || /\bmodels?\b.*\b(use|used|trained|evaluated|downstream)\b/.test(s);
    const asksDataset = /\bdataset|data|modality|scrna|atac|bulk atac|bulk rna\b/.test(s);
    return asksModels && asksDataset;
  };
  const isProvenanceQuestion = (q = "") => /\b(provenance|lineage|trace|chain|upstream)\b/i.test(String(q || ""));
  const isImpactQuestion = (q = "") => /\b(impact|impacted|affected|downstream impact)\b/i.test(String(q || "")) || /影响|受影响|下游/.test(String(q || ""));
  const pickBestGenericCandidate = (rows = [], question = "") => {
    const q = String(question || "").toLowerCase();
    const list = Array.isArray(rows) ? rows.slice() : [];
    if (!list.length) return null;
    const score = (r) => {
      const id = String(r?.id || "").toLowerCase();
      const label = String(r?.label || "").toLowerCase();
      const type = String(r?.type || "").toLowerCase();
      let s = Number(r?.score || 0);
      if (isLikelySampleOrReplicate(r)) s -= 30;
      if (q.includes("donor") && id.startsWith("donor_hpap_")) s += 35;
      if (q.includes("model") && (type === "model" || type === "finetunedmodel")) s += 25;
      if (q.includes("dataset") && type === "processeddata") s += 20;
      if (q.includes("pipeline") && type === "pipeline") s += 20;
      if (id.includes("__training") || id.includes("__evaluation")) s -= 10;
      if (label.includes("(training)") || label.includes("(evaluation)")) s -= 8;
      return s;
    };
    return list.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)))[0] || null;
  };
  const pickBestProcessedDatasetCandidate = (rows = [], question = "") => {
    const q = String(question || "").toLowerCase();
    const mentionsDataset = /\bdataset\b/.test(q);
    const prefersBulkAtac = /\bbulk\b/.test(q) && /\batac\b/.test(q);
    const candidates = (Array.isArray(rows) ? rows : []).filter((r) => String(r?.type || "").toLowerCase() === "processeddata");
    if (!candidates.length) return null;
    const score = (r) => {
      const id = String(r?.id || "").toLowerCase();
      const label = String(r?.label || "").toLowerCase();
      let s = Number(r?.score || 0);
      if (mentionsDataset) {
        if (label.includes("dataset")) s += 40;
        if (id.startsWith("proc_")) s += 25;
      }
      if (!id.includes("__training") && !id.includes("__evaluation")) s += 35;
      if (!label.includes("(training)") && !label.includes("(evaluation)")) s += 30;
      if (id.includes("__training") || id.includes("__evaluation")) s -= 25;
      if (label.includes("(training)") || label.includes("(evaluation)")) s -= 20;
      if (id.startsWith("emb_") || label.includes("embedding")) s -= 45;
      if (prefersBulkAtac) {
        if (label.includes("bulk atac") || id.includes("bulk_atac")) s += 80;
      }
      return s;
    };
    return candidates.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)))[0] || null;
  };
  const isQcPipelineOwnerQuestion = (q = "") => {
    const s = normalizeQ(q);
    const asksPipeline = qHasAny(s, ["qc pipeline", "pipeline", "流程", "质控"]);
    const asksOwner = qHasAny(s, ["who is responsible", "responsible", "owner", "contact", "负责人", "谁负责", "联系方式"]);
    return asksPipeline && asksOwner;
  };
  const extractModalityHint = (q = "") => {
    const s = normalizeQ(q);
    if (qHasAny(s, ["scrna", "sc rna", "single-cell rna", "single cell rna", "scrna-seq", "scrna seq"])) return "scRNA-seq";
    if (qHasAny(s, ["scatac", "sc atac", "atac"])) return "scATAC-seq";
    if (qHasAny(s, ["snmultiomic", "snmultiomics", "single-cell multiome", "single cell multiome"])) return "snMultiomics";
    if (qHasAny(s, ["histology"])) return "Histology";
    if (qHasAny(s, ["codex"])) return "CODEX";
    if (qHasAny(s, ["imc", "imaging mass cytometry"])) return "IMC";
    if (qHasAny(s, ["cite-seq", "cite seq"])) return "CITE-seq";
    return "";
  };
  const extractDatasetQueryHint = (q = "") => {
    const s = normalizeQ(q);
    if (qHasAny(s, ["scrna", "sc rna", "single-cell rna", "single cell rna", "scrna-seq", "scrna seq"])) return "scRNA-seq";
    if (qHasAny(s, ["atac", "scatac", "sc atac"])) return "scATAC-seq";
    if (qHasAny(s, ["histology"])) return "Histology";
    if (qHasAny(s, ["codex"])) return "CODEX";
    if (qHasAny(s, ["imc", "imaging mass cytometry"])) return "IMC";
    return String(q || "").trim();
  };
  const extractRequestedVersion = (q = "") => {
    const m = String(q || "").toLowerCase().match(/\bv\s*([0-9]+(?:\.[0-9]+)*)\b/);
    return m ? `v${m[1]}` : "";
  };
  const isReclassificationWhatIfQuestion = (q = "") => {
    const s = normalizeQ(q);
    const hasIf = qHasAny(s, ["if", "如果", "假如", "what if"]);
    const hasReclass = qHasAny(s, ["become", "变成", "reclass", "reclassification", "改成"]);
    const hasRatioOrDrift = qHasAny(s, ["ratio", "比例", "distribution", "drift", "影响", "impact"]);
    return hasIf && hasReclass && hasRatioOrDrift;
  };
  const parseReclassificationOverrides = (q = "") => {
    const raw = String(q || "");
    const upper = raw.toUpperCase();
    const range = upper.match(/HPAP[-_\s]?(\d{1,3})\s*(?:TO|到|~|～|-)\s*HPAP[-_\s]?(\d{1,3})/);
    const toT1D = /(?:BECOME|TO|变成|改成)\s*T1D/i.test(raw);
    if (range && toT1D) {
      return {
        rangeStart: `HPAP-${String(Number(range[1])).padStart(3, "0")}`,
        rangeEnd: `HPAP-${String(Number(range[2])).padStart(3, "0")}`,
        rangeTo: "T1D",
      };
    }
    return null;
  };
  const isEmbeddingLeakageQuestion = (q = "") => {
    const s = normalizeQ(q);
    const hasEmbedding = qHasAny(s, ["embedding", "embedded", "嵌入"]);
    const hasLeakage = qHasAny(s, ["leakage", "data leakage", "交叉", "泄露", "泄漏", "cross-model", "cross model"]);
    const hasModelContext = qHasAny(s, ["fm", "model", "foundation model", "模型"]);
    return hasEmbedding && (hasLeakage || hasModelContext);
  };
  const isTrainingDonorListQuestion = (q = "", modelIds = []) => {
    const s = normalizeQ(q);
    const asksDonor = qHasAny(s, ["donor", "donors", "供体"]);
    const asksTraining = qHasAny(s, ["training", "training set", "训练", "训练集"]);
    const asksList = qHasAny(s, ["which", "what", "list", "有哪些", "哪些", "多少"]);
    const hasModel = (Array.isArray(modelIds) && modelIds.length > 0) || qHasAny(s, ["fm", "model", "模型"]);
    const asksOverlap = hasOverlapSignal(s);
    return asksDonor && asksTraining && asksList && hasModel && !asksOverlap;
  };
  const normalizeToolUse = (intent, params, idx=1, linkedEntities=null) => {
    const safeIntent = String(intent || "").trim();
    if (!INTENT_ENUM.includes(safeIntent)) return null;
    const safeParams = params && typeof params === "object" ? { ...params } : {};
    const linkedModelIds = Array.isArray(linkedEntities?.modelIds) ? linkedEntities.modelIds : [];
    const normalizeModelParam = (v) => {
      const id = resolveModelIdFromText(v);
      return id || String(v || "").trim();
    };

    if (safeIntent === "donor_overlap_between_models" || safeIntent === "training_donor_overlap_between_models") {
      const a = safeParams.modelAId || safeParams.modelA || safeParams.modelAName || safeParams.model1 || safeParams.modelId1 || "";
      const b = safeParams.modelBId || safeParams.modelB || safeParams.modelBName || safeParams.model2 || safeParams.modelId2 || "";
      let aId = normalizeModelParam(a);
      let bId = normalizeModelParam(b);
      if (!aId && linkedModelIds.length >= 1) aId = linkedModelIds[0];
      if (!bId && linkedModelIds.length >= 2) bId = linkedModelIds[1];
      if (aId) safeParams.modelAId = aId;
      if (bId) safeParams.modelBId = bId;
    }

    if (safeIntent === "training_donors_by_models") {
      const modelIdsRaw = Array.isArray(safeParams.modelIds) ? safeParams.modelIds : [];
      const normalizedIds = modelIdsRaw.map(normalizeModelParam).filter(Boolean);
      if (normalizedIds.length) safeParams.modelIds = [...new Set(normalizedIds)];
      if (!safeParams.modelId && linkedModelIds.length === 1) safeParams.modelId = linkedModelIds[0];
      if (!safeParams.modelIds && linkedModelIds.length > 1) safeParams.modelIds = linkedModelIds;
      if (safeParams.modelId) safeParams.modelId = normalizeModelParam(safeParams.modelId);
    }

    if (safeIntent === "extract_donors") {
      const nodeIdsRaw = Array.isArray(safeParams.nodeIds) ? safeParams.nodeIds : [];
      const normalizedNodeIds = nodeIdsRaw
        .map((x) => {
          const mid = resolveModelIdFromText(x);
          return mid || x;
        })
        .filter(Boolean);
      if (normalizedNodeIds.length) safeParams.nodeIds = normalizedNodeIds;
      if (!safeParams.nodeIds && !safeParams.nodeId && linkedModelIds.length >= 1) {
        safeParams.nodeIds = linkedModelIds.slice(0, 3);
      }
      if (safeParams.nodeId) {
        const mid = resolveModelIdFromText(safeParams.nodeId);
        if (mid) safeParams.nodeId = mid;
      }
    }
    if (safeIntent === "donor_attribute_ratio") {
      if (safeParams.modelId) safeParams.modelId = normalizeModelParam(safeParams.modelId);
      if (!safeParams.modelId && linkedModelIds.length === 1) safeParams.modelId = linkedModelIds[0];
      if (Array.isArray(safeParams.donorIds)) {
        safeParams.donorIds = safeParams.donorIds.map((x) => String(x || "").trim()).filter(Boolean);
      }
    }
    if (safeIntent === "datasets_for_model" || safeIntent === "downstream_tasks") {
      if (safeParams.modelId) safeParams.modelId = normalizeModelParam(safeParams.modelId);
      if (!safeParams.modelId && linkedModelIds.length >= 1) safeParams.modelId = linkedModelIds[0];
      if (!safeParams.modelId && safeParams.query) {
        const resolved = normalizeModelParam(safeParams.query);
        if (resolved) safeParams.modelId = resolved;
      }
    }

    return {
      id: `graph-${idx}-${Date.now()}`,
      name: "queryGraph",
      input: {
        intent: safeIntent,
        params: safeParams,
      },
    };
  };
  const extractEntityCandidates = (question = "", linkedEntities = null) => {
    const raw = String(question || "").trim();
    const out = [];
    const push = (v) => {
      const s = String(v || "").trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (!out.some((x) => x.toLowerCase() === key)) out.push(s);
    };
    const impactReq = parseImpactRequest(raw);
    if (impactReq?.entityQuery && impactReq.entityQuery !== raw) push(impactReq.entityQuery);

    const quoteRegex = /["']([^"']{2,})["']/g;
    let m;
    while ((m = quoteRegex.exec(raw)) !== null) push(m[1]);

    const scopedMatch = raw.match(/\b(?:in|of|for|on|after)\s+([A-Za-z0-9_+\-\/().\s]{3,}?\b(?:dataset|data|model|pipeline)\b(?:\s*v?\d+(?:\.\d+)*)?)/i);
    if (scopedMatch?.[1]) push(scopedMatch[1]);

    const entityLikeMatch = raw.match(/([A-Za-z0-9_+\-\/().\s]{3,}?\b(?:dataset|model|pipeline)\b(?:\s*v?\d+(?:\.\d+)*)?)/i);
    if (entityLikeMatch?.[1]) push(entityLikeMatch[1]);

    (linkedEntities?.candidates || []).slice(0, 3).forEach((c) => {
      push(c?.id);
      push(c?.label);
    });

    return out.slice(0, 6);
  };
  const hydrateToolUseWithEntityContext = (toolUse, state) => {
    if (!toolUse?.input?.intent) return toolUse;
    const ctxHits = Array.isArray(state?.entityContext?.hits) ? state.entityContext.hits : [];
    const ctxCandidates = Array.isArray(state?.entityContext?.candidates) ? state.entityContext.candidates : [];
    const rows = ctxHits.flatMap((h) => (Array.isArray(h?.rows) ? h.rows : []));
    const byType = (type) => rows.find((r) => String(r?.type || "").toLowerCase() === String(type || "").toLowerCase());
    const firstAny = rows[0];
    const p = toolUse.input.params && typeof toolUse.input.params === "object" ? { ...toolUse.input.params } : {};
    const intent = String(toolUse.input.intent || "");

    if (intent === "impact_downstream") {
      const hasEntity = !!(p.entityId || p.nodeId || p.donorCode || p.query);
      if (!hasEntity) {
        const ds = byType("ProcessedData");
        const donor = rows.find((r) => String(r?.id || "").toLowerCase().startsWith("donor_hpap_"));
        const model = byType("Model") || byType("FineTunedModel");
        p.query = ds?.id || donor?.id || model?.id || firstAny?.id || ctxCandidates[0] || p.query;
      }
    }
    if (intent === "datasets_for_model" && !p.modelId) {
      const model = byType("Model") || byType("FineTunedModel");
      if (model?.id) p.modelId = model.id;
    }
    if (intent === "models_for_dataset" && !p.datasetId && !p.query) {
      const ds = byType("ProcessedData");
      if (ds?.id) p.datasetId = ds.id;
    }
    if (intent === "node_detail" && !p.nodeId) {
      if (firstAny?.id) p.nodeId = firstAny.id;
    }
    return {
      ...toolUse,
      input: {
        ...toolUse.input,
        params: p,
      },
    };
  };

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
      addTrace({ kind:"step", icon:ICON.route, label:"LangGraph - route", detail:"Initializing graph state..." });
      // Let React paint user bubble + thinking state before running graph workflow.
      await yieldToUI();

      const LGState = Annotation.Root({
        question: Annotation({ default: () => "" }),
        linkedEntities: Annotation({ default: () => ({ modelIds: [], candidates: [] }), reducer: (_x, y) => y }),
        entityContext: Annotation({ default: () => ({ candidates: [], hits: [] }), reducer: (_x, y) => y }),
        history: Annotation({ default: () => [] }),
        forceOnly: Annotation({ default: () => false, reducer: (_x, y) => y }),
        forcedQueue: Annotation({ default: () => [], reducer: (_x, y) => y }),
        nextToolUse: Annotation({ default: () => null, reducer: (_x, y) => y }),
        traceQueries: Annotation({ default: () => [], reducer: (x, y) => x.concat(y) }),
        finalAnswer: Annotation({ default: () => "", reducer: (_x, y) => y }),
        lastActionSignature: Annotation({ default: () => "", reducer: (_x, y) => y }),
        noProgressCount: Annotation({ default: () => 0, reducer: (_x, y) => y }),
        done: Annotation({ default: () => false, reducer: (_x, y) => y }),
        verified: Annotation({ default: () => false, reducer: (_x, y) => y }),
        step: Annotation({ default: () => 0, reducer: (_x, y) => y }),
      });

      const routeNode = async (state) => {
        const forced = getForcedToolUses(state.question);
        const linkedCandidates = linkModelEntities(state.question);
        const linkedModelIds = [...new Set(linkedCandidates.map((x) => x.id))];
        const entityCandidates = extractEntityCandidates(state.question, { candidates: linkedCandidates });
        const entityHits = [];
        entityCandidates.forEach((q) => {
          const res = queryGraph("search_nodes", { query: q, limit: 5 });
          if ((res?.rows?.length || 0) > 0) {
            entityHits.push({ query: q, rows: res.rows.slice(0, 5) });
          }
        });
        if (linkedCandidates.length) {
          const hintText = linkedCandidates
            .slice(0, 3)
            .map((x) => `${x.label} (${x.score.toFixed(2)})`)
            .join("; ");
          addTrace({ kind:"info", icon:ICON.link, label:"Entity linker", detail:`Model candidates: ${hintText}` });
        }
        if (entityHits.length) {
          const detail = entityHits
            .slice(0, 3)
            .map((h) => `${h.query} -> ${h.rows[0]?.label || h.rows[0]?.id}`)
            .join(" | ");
          addTrace({ kind:"info", icon:ICON.link, label:"Entity prefetch", detail });
        }
        if (forced.length) {
          addTrace({ kind:"intent", icon:ICON.route, label:"LangGraph route", detail:`Forced route with ${forced.length} tool step(s).` });
        }
        return {
          forcedQueue: forced,
          forceOnly: forced.length > 0,
          linkedEntities: { modelIds: linkedModelIds, candidates: linkedCandidates },
          entityContext: { candidates: entityCandidates, hits: entityHits },
        };
      };

      const planNode = async (state) => {
        if (state.done) return {};
        if (state.noProgressCount >= 1) {
          addTrace({ kind:"info", icon:ICON.stop, label:"LangGraph stop", detail:"Stopping due to repeated no-progress tool calls." });
          return { done: true };
        }
        if (state.step >= LANGGRAPH_MAX_STEPS) {
          addTrace({ kind:"info", icon:ICON.planner, label:"LangGraph planner", detail:"Reached max steps, moving to answer node." });
          return { done: true };
        }
        if (state.forceOnly && (!state.forcedQueue || state.forcedQueue.length === 0) && state.traceQueries.length > 0) {
          addTrace({ kind:"info", icon:ICON.done, label:"LangGraph fast-exit", detail:"Forced route satisfied; skipping extra planner rounds." });
          return { done: true };
        }

        if (state.forcedQueue?.length) {
          const [next, ...rest] = state.forcedQueue;
          return { nextToolUse: next, forcedQueue: rest };
        }

        // Always-on follow-up for node metadata/detail questions:
        // search_nodes -> node_detail (prefer donor-level candidate for HPAP code queries).
        // Keep this as a fallback for attribute lookups, but do not hijack
        // relation/governance questions that should route to dedicated intents.
        if (
          isNodeAttributeQuestion(state.question) &&
          !isPipelineFromDatasetQuestion(state.question) &&
          !isModelsForDatasetQuestion(state.question) &&
          !isProvenanceQuestion(state.question) &&
          !isImpactQuestion(state.question)
        ) {
          const alreadyDetailed = (state.traceQueries || []).some(
            (x) => x.intent === "node_detail" && (x.result?.rows?.length || 0) > 0
          );
          if (!alreadyDetailed) {
            const last = state.traceQueries[state.traceQueries.length - 1];
            if (!last) {
              return {
                nextToolUse: normalizeToolUse(
                  "search_nodes",
                  { query: state.question, limit: 20 },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
            if (last.intent === "search_nodes") {
              const rows = Array.isArray(last.result?.rows) ? last.result.rows : [];
              const { preferred, donorCode } = pickPreferredNodeDetailCandidate(rows, state.question);
              if (preferred?.id) {
                return {
                  nextToolUse: normalizeToolUse(
                    "node_detail",
                    { nodeId: preferred.id },
                    state.step + 1,
                    state.linkedEntities
                  ),
                };
              }
              if (donorCode) {
                const sampleCandidates = rows
                  .slice(0, 5)
                  .map((r) => `${r.label} [${r.type}]`)
                  .join("; ");
                return {
                  done: true,
                  finalAnswer: sampleCandidates
                    ? `No donor-level node was found for ${donorCode} in the current graph. Sample-level candidates: ${sampleCandidates}`
                    : `No donor-level node was found for ${donorCode} in the current graph.`,
                };
              }
            }
          }
        }

        // Narrow bridge: if pipeline-from-dataset question ran search_nodes, route to pipeline_for_dataset.
        if (isPipelineFromDatasetQuestion(state.question)) {
          const alreadyHasPipeline = (state.traceQueries || []).some(
            (x) => x.intent === "pipeline_for_dataset" && (x.result?.rows?.length || 0) > 0
          );
          if (!alreadyHasPipeline) {
            const last = state.traceQueries[state.traceQueries.length - 1];
            if (!last) {
              return {
                nextToolUse: normalizeToolUse(
                  "search_nodes",
                  { query: state.question, preferredTypes: ["ProcessedData"], limit: 20 },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
            if (last.intent === "search_nodes") {
              const rows = Array.isArray(last.result?.rows) ? last.result.rows : [];
              const bestProcessedData = pickBestProcessedDatasetCandidate(rows, state.question);
              if (bestProcessedData?.id) {
                return {
                  nextToolUse: normalizeToolUse(
                    "pipeline_for_dataset",
                    { datasetId: bestProcessedData.id },
                    state.step + 1,
                    state.linkedEntities
                  ),
                };
              }
            }
          }
        }

        // Generic evidence-driven follow-up bridge after search_nodes:
        // map resolved entity candidates to governance intents.
        {
          const last = state.traceQueries[state.traceQueries.length - 1];
          if (last?.intent === "search_nodes") {
            const rows = Array.isArray(last.result?.rows) ? last.result.rows : [];
            if (rows.length && !isExplicitSearchRequest(state.question)) {
              if (isModelsForDatasetQuestion(state.question)) {
                const bestProcessedData = pickBestProcessedDatasetCandidate(rows, state.question);
                if (bestProcessedData?.id) {
                  return {
                    nextToolUse: normalizeToolUse(
                      "models_for_dataset",
                      { datasetId: bestProcessedData.id },
                      state.step + 1,
                      state.linkedEntities
                    ),
                  };
                }
              }
              if (isProvenanceQuestion(state.question)) {
                const best = pickBestGenericCandidate(rows, state.question);
                if (best?.id) {
                  return {
                    nextToolUse: normalizeToolUse(
                      "provenance_chain",
                      { nodeId: best.id },
                      state.step + 1,
                      state.linkedEntities
                    ),
                  };
                }
              }
              if (isImpactQuestion(state.question)) {
                const best = pickBestGenericCandidate(rows, state.question);
                if (best?.id) {
                  return {
                    nextToolUse: normalizeToolUse(
                      "impact_downstream",
                      { query: best.id },
                      state.step + 1,
                      state.linkedEntities
                    ),
                  };
                }
              }
              if (isNodeAttributeQuestion(state.question)) {
                const best = pickBestGenericCandidate(rows, state.question);
                if (best?.id) {
                  return {
                    nextToolUse: normalizeToolUse(
                      "node_detail",
                      { nodeId: best.id },
                      state.step + 1,
                      state.linkedEntities
                    ),
                  };
                }
              }
              return {
                done: true,
                finalAnswer: "I resolved candidate entities but need one more constraint to choose the correct governance query. Please specify target type: dataset, model, pipeline, or donor.",
              };
            }
          }
        }

        if (ENABLE_RULE_BASED_ROUTING) {
          const qNormEarly = normalizeQ(state.question);
          const ratioTarget = parseDonorAttributeTargetFromQuestion(qNormEarly);
          const linkedModelIds = Array.isArray(state.linkedEntities?.modelIds) ? state.linkedEntities.modelIds : [];
          const mentionedModels = [...new Set(linkedModelIds.length ? linkedModelIds : extractModelMentions(qNormEarly))];
          if (isQcPipelineOwnerQuestion(state.question)) {
          const hasOwnerEvidence = (state.traceQueries || []).some(
            (x) => x.intent === "qc_pipeline_owner" && (x.result?.rows?.length || 0) > 0
          );
          if (!hasOwnerEvidence) {
            return {
              nextToolUse: normalizeToolUse(
                "qc_pipeline_owner",
                { query: state.question },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (isReclassificationWhatIfQuestion(state.question)) {
          const parsed = parseReclassificationOverrides(state.question);
          const scopeModelId = mentionedModels[0] || "";
          const modalityHint = extractModalityHint(state.question);
          const scopeType = scopeModelId ? "model" : (modalityHint ? "modality" : "model");
          const scopeRef = scopeModelId || modalityHint || "";
          if (scopeRef && parsed) {
            const already = (state.traceQueries || []).some((x) => x.intent === "reclassification_distribution_impact");
            if (!already) {
              return {
                nextToolUse: normalizeToolUse(
                  "reclassification_distribution_impact",
                  {
                    scopeType,
                    scopeRef,
                    split: detectSplitFromQuestion(state.question),
                    rangeStart: parsed.rangeStart,
                    rangeEnd: parsed.rangeEnd,
                    rangeTo: parsed.rangeTo,
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
          }
        }
        const impactReq = parseImpactRequest(state.question);
        if (impactReq && !(state.traceQueries || []).length) {
          return {
            nextToolUse: normalizeToolUse(
              "impact_downstream",
              {
                query: impactReq.entityQuery,
                depth: impactReq.depth,
              },
              state.step + 1,
              state.linkedEntities
            ),
          };
        }
        const inventoryReq = parseInventoryRequest(state.question);
        if (inventoryReq && !(state.traceQueries || []).length) {
          return {
            nextToolUse: normalizeToolUse(
              "list_nodes_by_type",
              {
                nodeType: inventoryReq.nodeType,
                query: inventoryReq.query || "",
                limit: 120,
              },
              state.step + 1,
              state.linkedEntities
            ),
          };
        }
        if (isTrainingDonorListQuestion(state.question, mentionedModels)) {
          if (mentionedModels.length >= 1) {
            const split = detectSplitFromQuestion(state.question);
            const already = (state.traceQueries || []).some(
              (x) => x.intent === "training_donors_by_models" && (x.result?.rows?.length || 0) > 0
            );
            if (!already) {
              return {
                nextToolUse: normalizeToolUse(
                  "training_donors_by_models",
                  {
                    modelIds: mentionedModels,
                    split,
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
          }
        }
        if (isEmbeddingLeakageQuestion(state.question) && mentionedModels.length >= 2) {
          const already = (state.traceQueries || []).some(
            (x) => x.intent === "embedding_leakage_between_models" && (x.result?.summary?.directionCount || 0) > 0
          );
          if (!already) {
            return {
              nextToolUse: normalizeToolUse(
                "embedding_leakage_between_models",
                {
                  modelAId: mentionedModels[0],
                  modelBId: mentionedModels[1],
                  sourceSplit: "training",
                  targetTrainSplit: "training",
                  targetUseSplit: detectSplitFromQuestion(state.question),
                  requireEmbeddingUsage: true,
                },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (isQcPipelineQuestion(state.question)) {
          const modality = extractModalityHint(state.question);
          const hasQcEvidence = (state.traceQueries || []).some(
            (x) => x.intent === "qc_pipeline_for_model_modality" && (x.result?.rows?.length || 0) > 0
          );
          if (!hasQcEvidence) {
            if (mentionedModels.length >= 1) {
              return {
                nextToolUse: normalizeToolUse(
                  "qc_pipeline_for_model_modality",
                  {
                    modelId: mentionedModels[0],
                    ...(modality ? { modality } : {}),
                    split: detectSplitFromQuestion(state.question),
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
            return {
              nextToolUse: normalizeToolUse(
                "search_nodes",
                { query: state.question, typeHints: ["Model"], limit: 20 },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (isModelDatasetQuestion(state.question, mentionedModels)) {
          if (mentionedModels.length === 0) {
            const reqVer = extractRequestedVersion(state.question);
            const verHint = reqVer ? ` (requested version: ${reqVer})` : "";
            return {
              done: true,
              finalAnswer: `I could not find a matching model node in the current graph${verHint}. Please confirm the exact model name/version available in this graph.`,
            };
          }
          const split = detectSplitFromQuestion(state.question);
          const alreadyHasDatasetEvidence = (state.traceQueries || []).some((x) => {
            if (x.intent !== "datasets_for_model") return false;
            const pmid = String(x.params?.modelId || "");
            const smid = mentionedModels[0] || "";
            return (x.result?.rows?.length || 0) > 0 && (!smid || pmid === smid);
          });
          if (!alreadyHasDatasetEvidence && mentionedModels.length >= 1) {
            const modelId = mentionedModels[0];
            return {
              nextToolUse: normalizeToolUse(
                "datasets_for_model",
                { modelId, split },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (isDatasetToModelsQuestion(state.question)) {
          const hasEvidence = (state.traceQueries || []).some((x) => x.intent === "models_for_dataset" && (x.result?.rows?.length || 0) > 0);
          if (!hasEvidence) {
            return {
              nextToolUse: normalizeToolUse(
                "models_for_dataset",
                { query: extractDatasetQueryHint(state.question) },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (qHas(qNormEarly, "donor") && hasOverlapSignal(qNormEarly) && mentionedModels.length >= 3) {
          const overlapAlreadyDone = state.traceQueries.some(
            (q) =>
              q.intent === "extract_donors" &&
              String(q.result?.summary?.combine || "").toLowerCase() === "intersection"
          );
          if (!overlapAlreadyDone) {
            return {
              nextToolUse: normalizeToolUse(
                "extract_donors",
                {
                  nodeIds: mentionedModels,
                  split: detectSplitFromQuestion(state.question),
                  combine: "intersection",
                },
                state.step + 1,
                state.linkedEntities
              ),
            };
          }
        }
        if (ratioTarget?.needsAttributeStats) {
          const donorAttrDone = (state.traceQueries || []).some(
            (q) => q.intent === "donor_attribute_ratio" && (q.result?.summary?.totalDonors || 0) > 0
          );
          if (!donorAttrDone) {
            const split = detectSplitFromQuestion(state.question);
            const overlapEvidence = [...(state.traceQueries || [])]
              .reverse()
              .find((q) => q.intent === "donor_overlap_between_models" || q.intent === "training_donor_overlap_between_models");
            const donorSetEvidence = [...(state.traceQueries || [])]
              .reverse()
              .find((q) => q.intent === "extract_donors" && (q.result?.rows?.length || 0) > 0);
            const sourceDonorIds = overlapEvidence
              ? (overlapEvidence.result?.rows || []).map((r) => r.id).filter(Boolean)
              : (donorSetEvidence ? (donorSetEvidence.result?.rows || []).map((r) => r.id).filter(Boolean) : []);
            if (sourceDonorIds.length) {
              return {
                nextToolUse: normalizeToolUse(
                  "donor_attribute_ratio",
                  {
                    donorIds: sourceDonorIds,
                    split,
                    attribute: ratioTarget.mode === "ethnicity" ? "Ethnicities" : "clinical_diagnosis",
                    targetValue: ratioTarget.targetValue || "",
                    askType: ratioTarget.askType || "ratio",
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
            if (!hasOverlapSignal(qNormEarly) && mentionedModels.length === 1) {
              return {
                nextToolUse: normalizeToolUse(
                  "donor_attribute_ratio",
                  {
                    modelId: mentionedModels[0],
                    split,
                    attribute: ratioTarget.mode === "ethnicity" ? "Ethnicities" : "clinical_diagnosis",
                    targetValue: ratioTarget.targetValue || "",
                    askType: ratioTarget.askType || "ratio",
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }

            // Modality-level ratio pipeline:
            // modality -> processed datasets -> extract_donors(split) -> donor_attribute_ratio
            const modalityHint = extractModalityHint(state.question);
            if (!hasOverlapSignal(qNormEarly) && modalityHint) {
              const extractForModality = [...(state.traceQueries || [])]
                .reverse()
                .find((q) => {
                  if (q.intent !== "extract_donors" || (q.result?.rows?.length || 0) === 0) return false;
                  const srcs = q.result?.summary?.sources || [];
                  return srcs.some((s) => String(s?.sourceLabel || "").toLowerCase().includes(modalityHint.toLowerCase()));
                });
              if (extractForModality) {
                const donorIds = (extractForModality.result?.rows || []).map((r) => r.id).filter(Boolean);
                if (donorIds.length) {
                  return {
                    nextToolUse: normalizeToolUse(
                      "donor_attribute_ratio",
                      {
                        donorIds,
                        split,
                        attribute: ratioTarget.mode === "ethnicity" ? "Ethnicities" : "clinical_diagnosis",
                        targetValue: ratioTarget.targetValue || "",
                        askType: ratioTarget.askType || "ratio",
                      },
                      state.step + 1,
                      state.linkedEntities
                    ),
                  };
                }
              }

              const datasetCandidates = [];
              [...(state.traceQueries || [])].reverse().forEach((q) => {
                const rows = Array.isArray(q.result?.rows) ? q.result.rows : [];
                rows.forEach((r) => {
                  const type = String(r?.type || "").toLowerCase();
                  const label = String(r?.label || "").toLowerCase();
                  if (type === "processeddata" && label.includes(modalityHint.toLowerCase())) {
                    datasetCandidates.push(r.id);
                  }
                });
              });
              const uniqueDatasetIds = [...new Set(datasetCandidates)].slice(0, 6);
              if (uniqueDatasetIds.length) {
                return {
                  nextToolUse: normalizeToolUse(
                    "extract_donors",
                    {
                      nodeIds: uniqueDatasetIds,
                      split,
                      combine: "union",
                    },
                    state.step + 1,
                    state.linkedEntities
                  ),
                };
              }

              return {
                nextToolUse: normalizeToolUse(
                  "list_nodes_by_type",
                  {
                    nodeType: "ProcessedData",
                    query: modalityHint,
                    limit: 60,
                  },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
          }
          }

          // Generic node-info retrieval: if search matched node(s), follow with node_detail.
          if (isNodeAttributeQuestion(state.question)) {
          const alreadyDetailed = state.traceQueries.some((x) => x.intent === "node_detail" && (x.result?.rows?.length || 0) > 0);
          if (!alreadyDetailed) {
            const last = state.traceQueries[state.traceQueries.length - 1];
            if (last?.intent === "search_nodes" && (last.result?.rows?.length || 0) > 0) {
              const best = last.result.rows[0];
              if (best?.id) {
                return {
                  nextToolUse: normalizeToolUse(
                    "node_detail",
                    { nodeId: best.id },
                    state.step + 1,
                    state.linkedEntities
                  ),
                };
              }
            }
            if (!state.traceQueries.length) {
              return {
                nextToolUse: normalizeToolUse(
                  "search_nodes",
                  { query: state.question, limit: 20 },
                  state.step + 1,
                  state.linkedEntities
                ),
              };
            }
          }
        }
        }

        addTrace({ kind:"step", icon:ICON.planner, label:`LangGraph plan step ${state.step + 1}`, detail:"Selecting next tool action..." });
        const evidence = state.traceQueries.map((q) => summarizeResultForPlanner(q.intent, q.result));
        const plannerMsg = {
          role: "user",
          content: JSON.stringify({
            question: state.question,
            step: state.step + 1,
            maxSteps: LANGGRAPH_MAX_STEPS,
            linked_entities: state.linkedEntities || { modelIds: [], candidates: [] },
            entity_context: state.entityContext || { candidates: [], hits: [] },
            evidence,
          }),
        };

        const plannerData = await callAnthropic({
          system: AGENT_LANGGRAPH_PLANNER_SYSTEM,
          messages: [plannerMsg],
          max_tokens: 500,
        });
        const plannerText = (plannerData.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const planJson = extractJsonFromText(plannerText) || {};
        const mode = String(planJson.mode || "").toLowerCase();
        const confidence = Number(planJson.confidence ?? 0);

        if (mode === "clarify") {
          addTrace({ kind:"intent", icon:ICON.clarify, label:"LangGraph planner: clarify", detail:`confidence=${confidence.toFixed(2)}` });
          return { done: true, finalAnswer: String(planJson.clarify_question || "Could you clarify your target model/dataset/donor?") };
        }
        if (mode === "answer") {
          addTrace({ kind:"intent", icon:ICON.answer, label:"LangGraph planner: answer", detail:`confidence=${confidence.toFixed(2)}` });
          return { done: true, finalAnswer: String(planJson.answer || "") };
        }

        const nextToolRaw = normalizeToolUse(planJson.intent, planJson.params, state.step + 1, state.linkedEntities);
        const nextTool = hydrateToolUseWithEntityContext(nextToolRaw, state);
        if (nextTool) {
          if (nextTool.input.intent === "impact_downstream") {
            const p = nextTool.input.params && typeof nextTool.input.params === "object" ? nextTool.input.params : {};
            const hasEntityRef = !!(p.entityId || p.nodeId || p.donorCode || p.query);
            if (!hasEntityRef) {
              const inferred = parseImpactRequest(state.question);
              if (inferred?.entityQuery) {
                nextTool.input.params = {
                  ...p,
                  query: inferred.entityQuery,
                  depth: p.depth ?? inferred.depth,
                };
              }
            }
          }
          const sig = `${nextTool.input.intent}:${JSON.stringify(nextTool.input.params || {})}`;
          if (sig === state.lastActionSignature) {
            addTrace({ kind:"info", icon:ICON.noProgress, label:"LangGraph dedup", detail:"Planner proposed the same query again; trying fallback tool selection." });
          } else {
            addTrace({ kind:"intent", icon:ICON.intent, label:`Intent: ${nextTool.input.intent}`, detail:`params: ${JSON.stringify(nextTool.input.params||{})}` });
            return { nextToolUse: nextTool };
          }
        }

        addTrace({ kind:"info", icon:ICON.fallback, label:"LangGraph planner fallback", detail:"Planner output invalid; using tool-call fallback." });
        const fallbackData = await callAnthropic({
          system: GRAPH_CONTEXT,
          tools: AGENT_TOOLS,
          messages: state.history.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 900,
        });
        const fallbackTool = (fallbackData.content || []).find((b) => b.type === "tool_use");
        if (fallbackTool?.input?.intent) {
          const fallbackRaw = normalizeToolUse(fallbackTool.input.intent, fallbackTool.input.params, state.step + 1, state.linkedEntities);
          const fallbackNext = hydrateToolUseWithEntityContext(fallbackRaw, state);
          if (fallbackNext) {
            if (fallbackNext.input.intent === "impact_downstream") {
              const p = fallbackNext.input.params && typeof fallbackNext.input.params === "object" ? fallbackNext.input.params : {};
              const hasEntityRef = !!(p.entityId || p.nodeId || p.donorCode || p.query);
              if (!hasEntityRef) {
                const inferred = parseImpactRequest(state.question);
                if (inferred?.entityQuery) {
                  fallbackNext.input.params = {
                    ...p,
                    query: inferred.entityQuery,
                    depth: p.depth ?? inferred.depth,
                  };
                }
              }
            }
            const sig = `${fallbackNext.input.intent}:${JSON.stringify(fallbackNext.input.params || {})}`;
            if (sig === state.lastActionSignature) return { done: true };
            return { nextToolUse: fallbackNext };
          }
        }
        const fallbackText = (fallbackData.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        return { done: true, finalAnswer: fallbackText || "I could not determine a reliable next query from the current question." };
      };

      const actNode = async (state) => {
        const tu = state.nextToolUse;
        if (!tu?.input?.intent) return { step: state.step + 1 };
        setPhase("querying");
        addTrace({ kind:"step", icon:ICON.act, label:"LangGraph - act", detail:`Executing ${tu.input.intent}` });
        // Allow trace/state updates to render before synchronous graph computation.
        await yieldToUI();
        const { intent, params } = tu.input;
        const result = queryGraph(intent, params || {});
        const nRows = result.rows?.length ?? 0;
        const actionSignature = `${intent}:${JSON.stringify(params || {})}`;
        const repeatedSameAction = actionSignature === state.lastActionSignature;
        const noProgressCount = repeatedSameAction && nRows === 0 ? (state.noProgressCount || 0) + 1 : 0;
        addTrace({ kind:"result", icon: nRows>0?"OK":"INFO", label:`${intent}`, detail:`${nRows} row${nRows!==1?"s":""} returned`, rows: result.rows?.slice(0,3) });
        if (repeatedSameAction && nRows === 0) {
          addTrace({ kind:"info", icon:ICON.noProgress, label:"LangGraph no-progress", detail:"Repeated empty result for the same query; stopping to avoid loop." });
        }
        const forceQueueEmptyAfterThis = !state.forcedQueue || state.forcedQueue.length === 0;
        const shouldFinishForced = state.forceOnly && forceQueueEmptyAfterThis && nRows > 0;
        return {
          traceQueries: [{ intent, params, result }],
          nextToolUse: null,
          lastActionSignature: actionSignature,
          noProgressCount,
          done: shouldFinishForced ? true : state.done,
          verified: false,
          step: state.step + 1,
        };
      };

      const verifyCoverage = (state) => {
        const traceQueries = Array.isArray(state?.traceQueries) ? state.traceQueries : [];
        const last = traceQueries[traceQueries.length - 1];
        if (!last) return { ok: false, reason: "No query result yet. Resolve entity with search_nodes first." };

        const intent = String(last.intent || "");
        const result = last.result || {};
        const summary = result.summary && typeof result.summary === "object" ? result.summary : {};
        const rows = Array.isArray(result.rows) ? result.rows : [];
        const rowCount = rows.length;

        const hasNumeric = (v) => typeof v === "number" && Number.isFinite(v);
        const hasAnyCount = (...keys) => keys.some((k) => hasNumeric(summary[k]));
        const donorLikeRow = rows.some((r) => {
          const id = String(r?.id || "").toLowerCase();
          const label = String(r?.label || "").toLowerCase();
          return id.startsWith("donor_hpap_") || /\bhpap[-_\s]?\d{1,3}\b/i.test(label);
        });
        const hasPathLikeSummary =
          hasAnyCount("chainLength", "pathLength", "pathCount", "hopCount") ||
          !!summary.path ||
          !!summary.chain ||
          !!summary.lineage;

        const hasResolvedEntity = (() => {
          const linkedModelIds = Array.isArray(state?.linkedEntities?.modelIds) ? state.linkedEntities.modelIds : [];
          if (linkedModelIds.length) return true;
          const entityHits = Array.isArray(state?.entityContext?.hits) ? state.entityContext.hits : [];
          if (entityHits.some((h) => (h?.rows?.length || 0) > 0)) return true;
          if (traceQueries.some((q) => q.intent === "search_nodes" && (q.result?.rows?.length || 0) > 0)) return true;
          const p = last.params && typeof last.params === "object" ? last.params : {};
          const hasCanonicalParam =
            !!(
              p.nodeId ||
              p.modelId ||
              p.datasetId ||
              p.pipelineId ||
              p.donorCode ||
              p.modelAId ||
              p.modelBId ||
              p.sourceModelId ||
              p.targetModelId ||
              p.scopeRef ||
              (Array.isArray(p.donorIds) && p.donorIds.length) ||
              (Array.isArray(p.nodeIds) && p.nodeIds.length)
            );
          return hasCanonicalParam;
        })();

        let sufficient = false;
        let reason = "";

        switch (intent) {
          case "datasets_for_model":
          case "models_for_dataset":
          case "pipeline_for_dataset":
          case "qc_pipeline_for_model_modality":
          case "qc_pipeline_owner":
          case "node_detail":
          case "list_nodes_by_type":
          case "downstream_tasks":
            sufficient = rowCount > 0;
            reason = `${intent} evidence ${sufficient ? "present" : "empty"}.`;
            break;
          case "search_nodes":
            sufficient = rowCount > 0 && isExplicitSearchRequest(state?.question || "");
            reason = sufficient
              ? "Explicit search request satisfied by search_nodes candidates."
              : "search_nodes only resolved candidate entities; a follow-up governance query is needed.";
            break;
          case "provenance_chain":
            sufficient = rowCount >= 2 || hasPathLikeSummary;
            reason = sufficient
              ? "Provenance chain evidence is sufficient."
              : "Provenance chain needs at least 2 linked nodes or path summary.";
            break;
          case "impact_downstream":
            sufficient =
              rowCount > 0 ||
              hasAnyCount(
                "impactedModelCount", "impactedDatasetCount", "impactedTaskCount",
                "modelCount", "datasetCount", "taskCount", "impactedSampleCount", "sampleCount"
              ) ||
              summary.found === true;
            reason = sufficient
              ? "Impact evidence is sufficient."
              : "Impact evidence missing affected models/datasets/tasks.";
            break;
          case "training_donor_overlap_between_models":
          case "donor_overlap_between_models":
            sufficient = hasNumeric(summary.overlapCount) || donorLikeRow;
            reason = sufficient
              ? "Overlap evidence is sufficient."
              : "Overlap evidence requires overlapCount or donor-like rows.";
            break;
          case "embedding_leakage_between_models":
            sufficient =
              hasAnyCount("leakageDonorCount", "directionCount", "sourceEmbeddingCount", "embeddingsUsedByTargetCount") ||
              donorLikeRow ||
              rowCount > 0;
            reason = sufficient
              ? "Embedding leakage evidence is sufficient."
              : "Embedding leakage evidence is insufficient.";
            break;
          case "reclassification_distribution_impact":
            sufficient = !!summary.before && !!summary.after;
            reason = sufficient
              ? "Reclassification impact evidence is sufficient."
              : "Reclassification impact requires summary.before and summary.after.";
            break;
          case "donor_attribute_ratio":
            sufficient =
              hasAnyCount("totalDonors", "matchedDonors") ||
              typeof summary.ratio === "number" ||
              !!summary.composition ||
              rowCount > 0;
            reason = sufficient
              ? "Donor attribute evidence is sufficient."
              : "Donor attribute evidence is insufficient.";
            break;
          default:
            sufficient = rowCount > 0 || Object.keys(summary).length > 0;
            reason = sufficient
              ? "Latest intent produced evidence."
              : "Latest intent did not produce sufficient evidence.";
            break;
        }

        if (sufficient) return { ok: true, reason };

        if (!hasResolvedEntity) {
          return { ok: false, reason: `Insufficient evidence for ${intent}; entity unresolved. Use search_nodes first.` };
        }
        if (rowCount === 0) {
          return { ok: true, reason: `Entity resolved but ${intent} returned no rows; allow final answer to report no evidence in current demo graph.` };
        }
        return { ok: false, reason };
      };

      const verifyNode = async (state) => {
        if (state.done) return { verified: true };
        const verdict = verifyCoverage(state);
        addTrace({
          kind: verdict.ok ? "done" : "info",
          icon: verdict.ok ? ICON.verifyOk : ICON.verifyNo,
          label: "LangGraph - verify",
          detail: verdict.reason,
        });
        if (verdict.ok) return { done: true, verified: true };
        return { verified: false };
      };

      const answerNode = async (state) => {
        setPhase("answering");
        if (state.finalAnswer) return { finalAnswer: state.finalAnswer };
        const deterministicIntents = new Set([
          "impact_downstream",
          "embedding_leakage_between_models",
        ]);
        const deterministicHit = [...(state.traceQueries || [])]
          .reverse()
          .find((q) => {
            if (!deterministicIntents.has(String(q.intent || ""))) return false;
            if (q.intent === "impact_downstream") {
              const found = !!q.result?.summary?.found;
              const rowCount = Array.isArray(q.result?.rows) ? q.result.rows.length : 0;
              return found || rowCount > 0;
            }
            return true;
          });
        if (deterministicHit) {
          const templated = formatIntentAnswer(
            deterministicHit.intent,
            deterministicHit.params,
            deterministicHit.result,
            { question: state.question }
          );
          if (templated) return { finalAnswer: templated };
        }
        if (state.traceQueries.length === 1) {
          const only = state.traceQueries[0];
          // For reclassification-impact questions, prefer LLM narrative synthesis over rigid template.
          if (String(only.intent || "") !== "reclassification_distribution_impact") {
            const templated = formatIntentAnswer(only.intent, only.params, only.result, { question: state.question });
            if (templated) return { finalAnswer: templated };
          }
        }
        const evidence = state.traceQueries.map((q) => ({
          intent: q.intent,
          params: q.params,
          rowCount: q.result?.rows?.length ?? 0,
          rows: (q.result?.rows || []).slice(0, 12),
          summary: q.result?.summary || null,
        }));
        const answerData = await callAnthropic({
          system: AGENT_LANGGRAPH_ANSWER_SYSTEM,
          messages: [{
            role: "user",
            content: JSON.stringify({
              question: state.question,
              evidence,
              instruction: "Answer with the available evidence only.",
            }),
          }],
          max_tokens: 1000,
        });
        const answerText = (answerData.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
        if (answerText) return { finalAnswer: answerText };

        // Fallback to deterministic formatting if LLM answer is empty.
        const last = [...(state.traceQueries || [])].reverse()[0];
        if (last) {
          const templated = formatIntentAnswer(last.intent, last.params, last.result, { question: state.question });
          if (templated) return { finalAnswer: templated };
        }
        return { finalAnswer: "No answer generated." };
      };

      const workflow = new StateGraph(LGState)
        .addNode("route", routeNode)
        .addNode("plan", planNode)
        .addNode("act", actNode)
        .addNode("verify", verifyNode)
        .addNode("answer", answerNode)
        .addEdge(START, "route")
        .addEdge("route", "plan")
        .addConditionalEdges("plan", (state) => {
          if (state.done) return "answer";
          if (state.nextToolUse) return "act";
          return "answer";
        }, { act: "act", answer: "answer" })
        .addConditionalEdges("act", (state) => {
          if (state.done || state.noProgressCount >= 1 || state.step >= LANGGRAPH_MAX_STEPS) return "answer";
          return "verify";
        }, { verify: "verify", answer: "answer" })
        .addConditionalEdges("verify", (state) => {
          if (state.done || state.verified || state.step >= LANGGRAPH_MAX_STEPS) return "answer";
          return "plan";
        }, { plan: "plan", answer: "answer" })
        .addEdge("answer", END);

      const app = workflow.compile();
      const finalState = await app.invoke({
        question: userMsg,
        linkedEntities: { modelIds: [], candidates: [] },
        entityContext: { candidates: [], hits: [] },
        history,
        forceOnly: false,
        forcedQueue: [],
        nextToolUse: null,
        traceQueries: [],
        finalAnswer: "",
        lastActionSignature: "",
        noProgressCount: 0,
        done: false,
        verified: false,
        step: 0,
      });

      const answer = String(finalState.finalAnswer || "").trim() || "(no response)";
      stopTimer();
      addTrace({ kind:"done", icon:ICON.done, label:"Done", detail:`LangGraph run completed in ${finalState.step ?? 0} step(s)` });
      setMessages(m=>[...m, { role:"assistant", content:answer, trace:finalState.traceQueries || [] }]);
    } catch(err) {
      stopTimer();
      addTrace({ kind:"error", icon:ICON.error, label:"Error", detail:err.message });
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
      {/* LEFT PANEL suggestions */}
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
                  - {m.content.length>48 ? m.content.slice(0,48)+"..." : m.content}
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

      {/* CENTER PANEL chat */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
        <div style={{ padding:"10px 18px", background:"#fff", borderBottom:"1px solid #e2e8f0", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 }}>AI Agent Interface | Mode 4</div>
            <div style={{ fontSize:p?15.5:13.5, fontWeight:700, color:"#0f172a", fontFamily:"Georgia,serif" }}>MAI-T1D Governance Agent</div>
            <div style={{ fontSize:p?12:10, color:"#64748b", fontStyle:"italic", fontFamily:"Georgia,serif" }}>Queries the provenance graph via structured tool calls  Claude Sonnet</div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat}
              style={{ padding:"5px 12px", borderRadius:6, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:"pointer", fontSize:p?12.5:10.5, fontFamily:"Georgia,serif", color:"#64748b" }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor="#f43f5e"; e.currentTarget.style.color="#9f1239"; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.color="#64748b"; }}>
              {ICON.clear} Clear
            </button>
          )}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"20px 20px 12px", display:"flex", flexDirection:"column", gap:10 }}>
          {messages.length === 0 && !loading && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, paddingBottom:40 }}>
              <div style={{ fontSize:36, opacity:0.12 }}>{ICON.robot}</div>
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
                  <div style={{ width:28, height:28, borderRadius:"50%", background:"#0f172a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>{ICON.user}</div>
                </div>
              ) : (
                <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:m.isError?"#fff1f2":"#faf5ff", border:`1.5px solid ${m.isError?"#f43f5e":"#8b5cf6"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>{m.isError?ICON.error:ICON.robot}</div>
                  <div>
                    <div style={{...agentBubble, ...(m.isError?{borderColor:"#fca5a5",background:"#fff1f2",color:"#9f1239"}:{})}}>{m.content}</div>
                    {/* FIX #4: retry button on error */}
                    {m.isError && !loading && (
                      <button onClick={retryLast}
                        style={{ marginTop:6, padding:"5px 14px", borderRadius:6, border:"1px solid #f43f5e", background:"#fff1f2", color:"#9f1239", cursor:"pointer", fontSize:p?12:10.5, fontFamily:"Georgia,serif", fontWeight:700 }}>
                        {ICON.retry} Retry
                      </button>
                    )}
                    {m.trace?.length > 0 && (
                      <div style={{ marginTop:5, display:"flex", gap:5, flexWrap:"wrap" }}>
                        {m.trace.map((q,j)=>(
                          <div key={j} style={{ padding:"3px 8px", borderRadius:4, background:"#faf5ff", border:"1px solid #ddd6fe", fontSize:p?11.5:9.5, fontFamily:"monospace", color:"#7c3aed" }}>
                             {q.intent} {q.result.rows?.length ?? 0} rows
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
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#faf5ff", border:"1.5px solid #8b5cf6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, marginTop:2 }}>{ICON.robot}</div>
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
              placeholder="Ask a governance question (Enter to send, Shift+Enter for new line)"
              rows={2}
              style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1.5px solid ${input.trim()?"#8b5cf6":"#e2e8f0"}`, fontSize:p?13:11, fontFamily:"Georgia,serif", resize:"none", outline:"none", lineHeight:1.6, background:"#f8fafc", color:"#1e293b", transition:"border-color 0.15s" }}
            />
            <button onClick={()=>sendMessage()} disabled={!input.trim()||loading}
              style={{ padding:"10px 18px", height:56, borderRadius:8, border:"none", background:input.trim()&&!loading?"#0f172a":"#cbd5e1", color:"#fff", fontSize:p?13:11, fontWeight:700, fontFamily:"Georgia,serif", cursor:input.trim()&&!loading?"pointer":"not-allowed", flexShrink:0 }}>
              Ask</button>
          </div>
          <div style={{ marginTop:5, fontSize:p?11.5:9.5, color:"#94a3b8", fontFamily:"monospace" }}>
            {loading ? `${phase==="thinking"?"Thinking":phase==="querying"?"Querying graph":phase==="answering"?"Answering":"Loading"}...`
            : `${NODES.length} nodes  ${EDGES.length} edges  ${EDGES.filter(e=>e.label==="TRAINED_ON").length} TRAINED_ON  ${EDGES.filter(e=>e.label==="LINKED_TO").length} LINKED_TO`}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL trace */}
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
              ? Completed in {elapsed}s
            </div>
          )}
        </div>

        <div style={{ padding:"10px 12px", borderTop:"1px solid #e2e8f0", flexShrink:0 }}>
          <div style={{ fontSize:p?11:9.5, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Available intents</div>
          {INTENT_ENUM.map(intent=>(
            <div key={intent} style={{ fontSize:p?11:9, fontFamily:"monospace", color:"#7c3aed", padding:"2px 0", lineHeight:1.7 }}>{intent}</div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default AgentView;





