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
      "path", "version", "status", "负责人", "谁负责", "联系方式", "邮箱", "路径", "版本",
    ]);
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

    return {
      id: `graph-${idx}-${Date.now()}`,
      name: "queryGraph",
      input: {
        intent: safeIntent,
        params: safeParams,
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
        if (linkedCandidates.length) {
          const hintText = linkedCandidates
            .slice(0, 3)
            .map((x) => `${x.label} (${x.score.toFixed(2)})`)
            .join("; ");
          addTrace({ kind:"info", icon:ICON.link, label:"Entity linker", detail:`Model candidates: ${hintText}` });
        }
        if (forced.length) {
          addTrace({ kind:"intent", icon:ICON.route, label:"LangGraph route", detail:`Forced route with ${forced.length} tool step(s).` });
        }
        return {
          forcedQueue: forced,
          forceOnly: forced.length > 0,
          linkedEntities: { modelIds: linkedModelIds, candidates: linkedCandidates },
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

        addTrace({ kind:"step", icon:ICON.planner, label:`LangGraph plan step ${state.step + 1}`, detail:"Selecting next tool action..." });
        const evidence = state.traceQueries.map((q) => summarizeResultForPlanner(q.intent, q.result));
        const plannerMsg = {
          role: "user",
          content: JSON.stringify({
            question: state.question,
            step: state.step + 1,
            maxSteps: LANGGRAPH_MAX_STEPS,
            linked_entities: state.linkedEntities || { modelIds: [], candidates: [] },
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

        const nextTool = normalizeToolUse(planJson.intent, planJson.params, state.step + 1, state.linkedEntities);
        if (nextTool) {
          const sig = `${nextTool.input.intent}:${JSON.stringify(nextTool.input.params || {})}`;
          if (sig === state.lastActionSignature) {
            addTrace({ kind:"info", icon:ICON.noProgress, label:"LangGraph dedup", detail:"Planner proposed the same query again; ending iterative loop." });
            return { done: true };
          }
          addTrace({ kind:"intent", icon:ICON.intent, label:`Intent: ${nextTool.input.intent}`, detail:`params: ${JSON.stringify(nextTool.input.params||{})}` });
          return { nextToolUse: nextTool };
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
          const fallbackNext = normalizeToolUse(fallbackTool.input.intent, fallbackTool.input.params, state.step + 1, state.linkedEntities);
          if (fallbackNext) {
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

      const verifyCoverage = (question, traceQueries) => {
        const q = normalizeQ(question);
        const impactNeed = !!parseImpactRequest(question);
        const hasOverlapNeed = qHas(q, "donor") && hasOverlapSignal(q) && hasMultiModelSignal(q);
        const ratioTarget = parseDonorAttributeTargetFromQuestion(q);
        const ratioNeed = !!ratioTarget?.needsAttributeStats;
        const last = traceQueries[traceQueries.length - 1];
        if (!last) return { ok: false, reason: "No query result yet." };
        const rows = Array.isArray(last.result?.rows) ? last.result.rows : [];
        const isReclassWhatIf = isReclassificationWhatIfQuestion(question);

        // Ratio questions must include donor-attribute evidence.
        if (ratioNeed) {
          const attrHit = traceQueries.some(
            (x) => x.intent === "donor_attribute_ratio" && (x.result?.summary?.totalDonors || 0) > 0
          );
          if (!attrHit) {
            return { ok: false, reason: "Ratio question needs donor_attribute_ratio evidence." };
          }
          return { ok: true, reason: "Donor attribute ratio evidence is present." };
        }
        if (isReclassWhatIf) {
          const hit = traceQueries.some((x) => x.intent === "reclassification_distribution_impact");
          return hit
            ? { ok: true, reason: "Reclassification drift evidence found." }
            : { ok: false, reason: "What-if reclassification question requires reclassification_distribution_impact evidence." };
        }
        if (impactNeed) {
          const impactHit = traceQueries.some(
            (x) => x.intent === "impact_downstream" && (x.result?.summary?.found || (x.result?.rows?.length || 0) > 0)
          );
          if (!impactHit) return { ok: false, reason: "Impact question needs impact_downstream evidence." };
          return { ok: true, reason: "Impact analysis evidence is present." };
        }

        if (hasOverlapNeed) {
          const overlapHit = traceQueries.some((x) =>
            x.intent === "training_donor_overlap_between_models" || x.intent === "donor_overlap_between_models"
          );
          if (!overlapHit) {
            return { ok: false, reason: "Question asks overlap across models, but overlap query has not been executed yet." };
          }
          return { ok: true, reason: "Overlap query evidence is present." };
        }

        if (qHasAny(q, ["provenance chain", "lineage chain", "溯源链"])) {
          const chainHit = traceQueries.some((x) => x.intent === "provenance_chain" && (x.result?.rows?.length || 0) > 0);
          return chainHit
            ? { ok: true, reason: "Provenance chain evidence found." }
            : { ok: false, reason: "Provenance chain question requires non-empty provenance_chain result." };
        }

        if (qHasAll(q, ["training set", "donor"])) {
          const donorHit = traceQueries.some((x) => {
            if (x.intent === "training_donors_by_models" && (x.result?.rows?.length || 0) > 0) return true;
            if (x.intent === "donor_overlap_between_models" && (x.result?.rows?.length || 0) > 0) return true;
            if (x.intent === "extract_donors") {
              const split = String(x.result?.summary?.split || "").toLowerCase();
              return split === "training" || (x.result?.summary?.sourceCount || 0) > 0;
            }
            return false;
          });
          return donorHit
            ? { ok: true, reason: "Training donor evidence found." }
            : { ok: false, reason: "Training-set donor question requires donor extraction evidence." };
        }
        if (isTrainingDonorListQuestion(question, extractModelMentions(q))) {
          const donorHit = traceQueries.some((x) => x.intent === "training_donors_by_models" && (x.result?.rows?.length || 0) > 0);
          return donorHit
            ? { ok: true, reason: "Training donor list evidence found." }
            : { ok: false, reason: "Training-donor list question requires training_donors_by_models evidence." };
        }

        if (isNodeAttributeQuestion(question)) {
          const detailHit = traceQueries.some((x) => x.intent === "node_detail" && (x.result?.rows?.length || 0) > 0);
          return detailHit
            ? { ok: true, reason: "Node detail evidence found." }
            : { ok: false, reason: "Node-attribute question requires node_detail evidence." };
        }
        if (isDatasetToModelsQuestion(question)) {
          const hit = traceQueries.some((x) => x.intent === "models_for_dataset" && (x.result?.rows?.length || 0) > 0);
          return hit
            ? { ok: true, reason: "Dataset-to-model evidence found." }
            : { ok: false, reason: "Dataset-downstream-model question requires models_for_dataset evidence." };
        }
        if (isQcPipelineQuestion(question)) {
          const hit = traceQueries.some((x) => x.intent === "qc_pipeline_for_model_modality" && (x.result?.rows?.length || 0) > 0);
          return hit
            ? { ok: true, reason: "QC pipeline lineage evidence found." }
            : { ok: false, reason: "QC pipeline question requires qc_pipeline_for_model_modality evidence." };
        }
        if (isEmbeddingLeakageQuestion(question)) {
          const hit = traceQueries.some((x) => x.intent === "embedding_leakage_between_models");
          return hit
            ? { ok: true, reason: "Embedding leakage evidence found." }
            : { ok: false, reason: "Embedding leakage question requires embedding_leakage_between_models evidence." };
        }
        const linkedModelIds = extractModelMentions(q);
        if (isModelDatasetQuestion(question, linkedModelIds)) {
          const dsHit = traceQueries.some((x) => x.intent === "datasets_for_model" && (x.result?.rows?.length || 0) > 0);
          return dsHit
            ? { ok: true, reason: "Model-to-dataset evidence found." }
            : { ok: false, reason: "Model-specific dataset question requires datasets_for_model evidence." };
        }

        return rows.length > 0
          ? { ok: true, reason: "Latest query returned non-empty evidence." }
          : { ok: false, reason: "Latest query returned empty rows." };
      };

      const verifyNode = async (state) => {
        if (state.done) return { verified: true };
        const verdict = verifyCoverage(state.question, state.traceQueries || []);
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
          .find((q) => deterministicIntents.has(String(q.intent || "")));
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





