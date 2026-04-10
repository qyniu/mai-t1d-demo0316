import React, { useEffect, useRef, useState } from "react";
import { NODES, EDGES } from "./graphData";
const edgeSrcId = e => typeof e.source === "object" ? e.source.id : e.source;
const edgeTgtId = e => typeof e.target === "object" ? e.target.id : e.target;
const normalizeLabel = (label = "") => String(label).replace(/\\n/g, "\n");
const labelSingleLine = (label = "") => normalizeLabel(label).replace(/\n/g, " ");

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
  const donorIdsForModelTraining = (modelId) => {
    if (!modelId) return new Set();
    const donorNodes = NODES.filter((n) => n.id.startsWith("donor_hpap_"));
    const donorNodeIds = new Set(donorNodes.map((n) => n.id));
    const donorCodeToNodeId = new Map(
      donorNodes.map((n) => [String(labelSingleLine(n.label)).toUpperCase(), n.id])
    );

    const trainingDatasets = EDGES
      .filter((e) => e.label === "TRAINED_ON" && edgeTgtId(e) === modelId)
      .map((e) => edgeSrcId(e));
    const sampleIds = new Set();
    trainingDatasets.forEach((dsId) => {
      EDGES
        .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === dsId)
        .forEach((e) => sampleIds.add(edgeTgtId(e)));
    });
    const donorIds = new Set();
    sampleIds.forEach((sampleId) => {
      let foundDirect = false;
      EDGES
        .filter((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sampleId)
        .forEach((e) => {
          const src = edgeSrcId(e);
          if (donorNodeIds.has(src)) {
            donorIds.add(src);
            foundDirect = true;
          }
        });

      // Fallback: infer donor from sample metadata if direct donor->sample edge is missing.
      if (!foundDirect) {
        const sampleNode = NODES.find((n) => n.id === sampleId);
        const donorCode = String(sampleNode?.detail?.Donor || "").toUpperCase();
        const donorNodeId = donorCodeToNodeId.get(donorCode);
        if (donorNodeId) donorIds.add(donorNodeId);
      }
    });
    return donorIds;
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
        resolveNode(params.datasetType, ["ProcessedData"]) ||
        resolveNode(params.query, ["ProcessedData"]);
      const datasetId = datasetNode?.id || params.datasetId || params.datasetType;
      if (!datasetId) return { rows: [] };

      const sourceIds = new Set([datasetId]);
      // Include split children (e.g. proc_xxx__training / proc_xxx__evaluation).
      EDGES
        .filter(e => e.label==="DERIVED_FROM" && edgeSrcId(e)===datasetId)
        .forEach(e => sourceIds.add(edgeTgtId(e)));

      const useEdges = EDGES.filter(
        e =>
          sourceIds.has(edgeSrcId(e)) &&
          (e.label==="TRAINED_ON" || e.label==="EVALUATED_ON")
      );

      const modelRows = new Map();
      for (const e of useEdges) {
        const model = NODES.find(n=>n.id===edgeTgtId(e));
        if (!model) continue;
        const key = model.id;
        const existing = modelRows.get(key) || {
          id: model.id,
          label: labelSingleLine(model.label),
          type: model.type,
          detail: model.detail,
          usage: new Set(),
          via: new Set(),
        };
        existing.usage.add(e.label);
        existing.via.add(edgeSrcId(e));
        modelRows.set(key, existing);
      }

      return {
        rows: [...modelRows.values()].map(r => ({
          id: r.id,
          label: r.label,
          type: r.type,
          detail: r.detail,
          usage: [...r.usage],
          via: [...r.via],
        })),
      };
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
    case "shared_donors_three_fms": {
      const genomicId = params.genomicModelId || "model_genomic";
      const scfmId = params.scfmModelId || "model_scfm";
      const spatialId = params.spatialModelId || "model_spatial";

      const genomic = donorIdsForModelTraining(genomicId);
      const scfm = donorIdsForModelTraining(scfmId);
      const spatial = donorIdsForModelTraining(spatialId);

      const overlap = [...genomic].filter((d) => scfm.has(d) && spatial.has(d)).sort();
      return {
        rows: overlap.map((id) => {
          const node = NODES.find((n) => n.id === id);
          return { id, label: labelSingleLine(node?.label || id), type: node?.type || "RawData", detail: node?.detail || {} };
        }),
        summary: {
          overlap_count: overlap.length,
          genomic_training_donors: genomic.size,
          scfm_training_donors: scfm.size,
          spatial_training_donors: spatial.size,
        },
      };
    }
    case "training_donors_by_models": {
      const fallbackIds = [];
      if (typeof params.modelId === "string" && params.modelId.trim()) {
        fallbackIds.push(params.modelId.trim());
      }
      if (typeof params.query === "string") {
        const q = normalizeQ(params.query);
        if (q.includes("genomic")) fallbackIds.push("model_genomic");
        if (q.includes("single-cell") || q.includes("single cell") || q.includes("scfm")) fallbackIds.push("model_scfm");
        if (q.includes("spatial")) fallbackIds.push("model_spatial");
      }

      const modelIds = Array.isArray(params.modelIds) && params.modelIds.length
        ? params.modelIds
        : [...new Set(fallbackIds)];

      if (!modelIds.length) {
        return { rows: [], summary: { note: "No model specified. Provide modelIds/modelId/query." } };
      }

      const rows = modelIds.map((modelId) => {
        const modelNode = NODES.find((n) => n.id === modelId);
        const donors = [...donorIdsForModelTraining(modelId)]
          .map((id) => labelSingleLine(NODES.find((n) => n.id === id)?.label || id))
          .sort();
        return {
          modelId,
          modelLabel: labelSingleLine(modelNode?.label || modelId),
          donorCount: donors.length,
          donors,
        };
      });
      return { rows };
    }
    default:
      return { rows:[], error:"Unknown intent" };
  }
}

if (typeof window !== "undefined") {
  window.__KG_DEBUG__ = {
    queryGraph,
    getNodes: () => NODES,
    getEdges: () => EDGES,
  };
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
- shared_donors_three_fms
- training_donors_by_models
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
      intent:{ type:"string", enum:["datasets_for_model","models_for_dataset","compliance_status","pipeline_for_dataset","downstream_tasks","provenance_chain","card_links","node_detail","shared_donors_three_fms","training_donors_by_models"], description:"The query pattern to execute" },
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

const normalizeQ = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

const getForcedToolUses = (userMsg) => {
  const q = normalizeQ(userMsg);
  if (!q) return [];

  if (q.includes("dataset cards") && q.includes("genomic fm") && q.includes("model card")) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "card_links", params: { modelId: "model_genomic" } } }];
  }
  if (q.includes("which models used") && (q.includes("scrna") || q.includes("sc rna") || q.includes("scRNA".toLowerCase()))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "models_for_dataset", params: { datasetType: "scRNA-seq" } } }];
  }
  if (q.includes("what datasets trained") && (q.includes("single-cell fm") || q.includes("single cell fm") || q.includes("scfm"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "datasets_for_model", params: { modelId: "model_scfm" } } }];
  }
  if (q.includes("compliance hold") || q.includes("on compliance hold")) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "compliance_status", params: {} } }];
  }
  if (q.includes("who ran the wgs pipeline")) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "node_detail", params: { query: "WGS" } } }];
  }
  if (
    q.includes("donor") &&
    q.includes("genomic fm") &&
    (q.includes("scfm") || q.includes("single-cell fm") || q.includes("single cell fm")) &&
    q.includes("spatial fm") &&
    (q.includes("training") || q.includes("train"))
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "shared_donors_three_fms", params: {} } }];
  }
  if (q.includes("donor") && (q.includes("single-cell fm") || q.includes("single cell fm") || q.includes("scfm"))) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "training_donors_by_models", params: { modelIds: ["model_scfm"] } },
    }];
  }
  if (q.includes("donor") && q.includes("genomic fm")) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "training_donors_by_models", params: { modelIds: ["model_genomic"] } },
    }];
  }
  if (q.includes("donor") && q.includes("spatial fm")) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "training_donors_by_models", params: { modelIds: ["model_spatial"] } },
    }];
  }
  if (
    q.includes("donor") &&
    q.includes("genomic fm") &&
    (q.includes("single cell fm") || q.includes("single-cell fm") || q.includes("scfm")) &&
    q.includes("spatial fm") &&
    (q.includes("respectively") || q.includes("分别") || q.includes("各自"))
  ) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: {
        intent: "training_donors_by_models",
        params: { modelIds: ["model_genomic", "model_scfm", "model_spatial"] },
      },
    }];
  }
  return [];
};

const formatIntentAnswer = (intent, params, result) => {
  const rows = result?.rows || [];
  if (!rows.length && intent !== "shared_donors_three_fms") {
    return `No matching records were found in the current graph for ${intent.replace(/_/g, " ")}.`;
  }

  switch (intent) {
    case "card_links":
      return `The model card links to ${rows.length} dataset card(s):\n${rows.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    case "models_for_dataset":
      return `Found ${rows.length} model(s) that used this dataset:\n${rows.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    case "datasets_for_model":
      return `Found ${rows.length} dataset(s) used by this model:\n${rows.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    case "pipeline_for_dataset":
      return `Pipeline for this dataset:\n${rows.map((r) => `- ${r.label}`).join("\n")}`;
    case "downstream_tasks":
      return `Found ${rows.length} downstream task(s):\n${rows.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    case "compliance_status": {
      const hold = rows.filter((r) => String(r.compliance_hold).toLowerCase() === "true");
      return `Models checked: ${rows.length}. Compliance hold: ${hold.length}.`;
    }
    case "provenance_chain":
      return `Provenance chain contains ${rows.length} node(s):\n${rows.slice(0, 20).map((r, i) => `${i + 1}. ${r.label} [${r.type}]`).join("\n")}`;
    case "node_detail":
      return `Node found:\n${rows.map((r) => `- ${r.label} (${r.type})`).join("\n")}`;
    case "shared_donors_three_fms": {
      const s = result?.summary || {};
      const head = `Found ${rows.length} donor(s) shared across training sets of Genomic FM, Single-cell FM, and Spatial FM.`;
      const stats = `Genomic: ${s.genomic_training_donors ?? "?"}, scFM: ${s.scfm_training_donors ?? "?"}, Spatial: ${s.spatial_training_donors ?? "?"}.`;
      const list = rows.length ? `\n${rows.map((r, i) => `${i + 1}. ${r.id}`).join("\n")}` : "";
      return `${head}\n${stats}${list}`;
    }
    case "training_donors_by_models": {
      return rows
        .map((r) => {
          const donors = Array.isArray(r.donors) ? r.donors : [];
          const donorText =
            donors.length > 120
              ? `${donors.slice(0, 120).join(", ")} ... (showing first 120 of ${donors.length})`
              : donors.join(", ");
          return `${r.modelLabel} (${r.donorCount} donors):\n${donorText || "none"}`;
        })
        .join("\n\n");
    }
    default:
      return null;
  }
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

      const forcedToolUses = getForcedToolUses(userMsg);
      let toolUses = forcedToolUses;
      let textParts = [];
      let data1 = null;

      if (forcedToolUses.length > 0) {
        addTrace({ kind:"intent", icon:"🧭", label:"Rule route", detail:"Using deterministic intent routing for this question." });
      } else {
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

        data1 = await res1.json();
        if (data1.error) throw new Error(data1.error.message || "API error");

        toolUses = (data1.content||[]).filter(b=>b.type==="tool_use");
        textParts = (data1.content||[]).filter(b=>b.type==="text");
      }

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

      if (traceQueries.length === 1) {
        const only = traceQueries[0];
        const templated = formatIntentAnswer(only.intent, only.params, only.result);
        if (templated) {
          stopTimer();
          addTrace({ kind:"done", icon:"✅", label:"Done", detail:"Answer ready (templated from graph results)" });
          setMessages(m=>[...m, { role:"assistant", content:templated, trace:traceQueries }]);
          setLoading(false);
          setPhase(null);
          return;
        }
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
            { role:"assistant", content:assistantToolOnly.length ? assistantToolOnly : (data1?.content || []) },
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
          {["datasets_for_model","models_for_dataset","compliance_status","pipeline_for_dataset","downstream_tasks","provenance_chain","card_links","shared_donors_three_fms","training_donors_by_models"].map(intent=>(
            <div key={intent} style={{ fontSize:p?11:9, fontFamily:"monospace", color:"#7c3aed", padding:"2px 0", lineHeight:1.7 }}>{intent}</div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default AgentView;

