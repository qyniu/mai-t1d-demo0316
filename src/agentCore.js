import { NODES, EDGES } from "./graphData";

const edgeSrcId = e => typeof e.source === "object" ? e.source.id : e.source;
const edgeTgtId = e => typeof e.target === "object" ? e.target.id : e.target;
const normalizeLabel = (label = "") => String(label).replace(/\\n/g, "\n");
const labelSingleLine = (label = "") => normalizeLabel(label).replace(/\n/g, " ");

//  GRAPH QUERY ENGINE 
function queryGraph(intent, params) {
  const normalizeEntityKey = (v = "") =>
    String(v || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const resolveNode = (raw, preferredTypes=[]) => {
    const q = String(raw ?? "").trim().toLowerCase();
    const qNorm = normalizeEntityKey(raw);
    if (!q) return null;
    const byId = NODES.find(n => n.id.toLowerCase() === q);
    if (byId) return byId;
    const pool = preferredTypes.length ? NODES.filter(n => preferredTypes.includes(n.type)) : NODES;
    const byLabelExact = pool.find(n => labelSingleLine(n.label).toLowerCase() === q);
    if (byLabelExact) return byLabelExact;
    const byNormalizedId = pool.find((n) => normalizeEntityKey(n.id) === qNorm);
    if (byNormalizedId) return byNormalizedId;
    const byNormalizedLabel = pool.find((n) => normalizeEntityKey(labelSingleLine(n.label)) === qNorm);
    if (byNormalizedLabel) return byNormalizedLabel;
    const byPartial = pool.find((n) => labelSingleLine(n.label).toLowerCase().includes(q));
    if (byPartial) return byPartial;
    const byNormalizedPartial = pool.find((n) => normalizeEntityKey(n.id).includes(qNorm) || normalizeEntityKey(labelSingleLine(n.label)).includes(qNorm));
    if (byNormalizedPartial) return byNormalizedPartial;

    // Long-question fallback: recover entity mentions from sentence-like inputs.
    const stop = new Set([
      "what", "which", "who", "where", "when", "how", "why", "is", "are", "was", "were",
      "the", "a", "an", "of", "in", "on", "for", "to", "by", "with", "from", "and", "or",
      "data", "dataset", "datasets", "model", "models", "change", "changed", "affected", "impact", "impacted",
    ]);
    const tokenize = (s = "") =>
      String(s || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((t) => t && t.length >= 3 && !stop.has(t));
    const qTokens = tokenize(raw);
    if (!qTokens.length) return null;
    let bestNode = null;
    let bestScore = 0;
    for (const n of pool) {
      const nodeTokens = new Set(tokenize(`${n.id} ${labelSingleLine(n.label)}`));
      if (!nodeTokens.size) continue;
      let overlap = 0;
      qTokens.forEach((t) => {
        if (nodeTokens.has(t)) overlap += 1;
      });
      if (overlap > bestScore) {
        bestScore = overlap;
        bestNode = n;
      }
    }
    return bestScore >= 2 ? bestNode : null;
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
  const donorNodes = NODES.filter((n) => n.id.startsWith("donor_hpap_"));
  const donorNodeIds = new Set(donorNodes.map((n) => n.id));
  const donorCodeToNode = new Map(
    donorNodes.map((n) => [String(labelSingleLine(n.label)).toUpperCase(), n])
  );
  const bumpBucket = (obj, key) => {
    const k = key || "Unknown";
    obj[k] = (obj[k] || 0) + 1;
  };
  const diseaseTagFromClinicalDiagnosis = (raw = "") => {
    const text = String(raw || "").toUpperCase();
    if (!text) return null;
    if (text.includes("T1D")) return "T1D";
    if (text.includes("T2D")) return "T2D";
    // Keep ND naming in outputs (No disease).
    if (text.includes("ND")) return "ND";
    return "Unknown";
  };
  const diseaseTagFromDonor = (donorNode, overrides = {}) => {
    const donorCode = String(labelSingleLine(donorNode?.label || "")).toUpperCase();
    const overrideValue = overrides[donorCode];
    const clinicalDiagnosis =
      overrideValue ||
      donorNode?.detail?.clinical_diagnosis ||
      donorNode?.detail?.Clinical_Diagnosis ||
      donorNode?.detail?.["clinical diagnosis"] ||
      donorNode?.detail?.["Clinical Diagnosis"] ||
      "";
    const fromClinical = diseaseTagFromClinicalDiagnosis(clinicalDiagnosis);
    if (fromClinical) return fromClinical;

    // Backward-compatible fallback when clinical_diagnosis is absent.
    const stageRaw = String(
      overrideValue || donorNode?.detail?.["T1D stage__2"] || donorNode?.detail?.["T1D stage"] || ""
    ).toLowerCase();
    const diseaseStatus = String(donorNode?.detail?.DiseaseStatus || "").toLowerCase();
    if (
      stageRaw.includes("stage 3") ||
      stageRaw.includes("t1d onset") ||
      diseaseStatus.includes("t1dm") ||
      diseaseStatus.includes("t1d")
    ) {
      return "T1D";
    }
    if (
      stageRaw.includes("stage 1") ||
      stageRaw.includes("stage 2") ||
      stageRaw.includes("aab+") ||
      diseaseStatus.includes("gad+") ||
      diseaseStatus.includes("aab+")
    ) {
      return "AAb+";
    }
    if (diseaseStatus.includes("t2dm") || diseaseStatus.includes("t2d")) return "T2D";
    if (
      diseaseStatus.includes("no hx diab") ||
      diseaseStatus.includes("no hx diabetes") ||
      diseaseStatus.includes("control")
    ) {
      return "ND";
    }
    return "Unknown";
  };
  const donorIdFromSampleId = (sampleId) => {
    const direct = EDGES.find((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sampleId && donorNodeIds.has(edgeSrcId(e)));
    if (direct) return edgeSrcId(direct);
    const sampleNode = NODES.find((n) => n.id === sampleId);
    const donorCode = String(sampleNode?.detail?.Donor || "").toUpperCase();
    return donorCodeToNode.get(donorCode)?.id || null;
  };
  const sampleIdsForDatasetNode = (datasetNodeId) => {
    const childSplitIds = EDGES
      .filter((e) => e.label === "DERIVED_FROM" && edgeSrcId(e) === datasetNodeId)
      .map((e) => edgeTgtId(e));
    const sourceIds = childSplitIds.length ? childSplitIds : [datasetNodeId];
    const sampleIds = new Set();
    sourceIds.forEach((srcId) => {
      EDGES
        .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === srcId)
        .forEach((e) => sampleIds.add(edgeTgtId(e)));
    });
    return sampleIds;
  };
  const donorIdsForDatasetNode = (datasetNodeId, splitHint = "") => {
    const split = normalizeSplit(splitHint || "");
    const donorIds = new Set();
    let effectiveDatasetIds = [datasetNodeId];
    const childSplitIds = EDGES
      .filter((e) => e.label === "DERIVED_FROM" && edgeSrcId(e) === datasetNodeId)
      .map((e) => edgeTgtId(e));
    if (childSplitIds.length) {
      const matched = childSplitIds.filter((cid) => {
        const id = String(cid || "").toLowerCase();
        if (split === "evaluation") return id.includes("__evaluation");
        return id.includes("__training");
      });
      effectiveDatasetIds = matched.length ? matched : childSplitIds;
    }
    const sampleIds = new Set();
    effectiveDatasetIds.forEach((dsId) => {
      sampleIdsForDatasetNode(dsId).forEach((sid) => sampleIds.add(sid));
    });
    sampleIds.forEach((sampleId) => {
      const donorId = donorIdFromSampleId(sampleId);
      if (donorId) donorIds.add(donorId);
    });
    return donorIds;
  };
  const modelTrainEvalSplitDatasetIds = (modelId) => {
    const training = EDGES.filter((e) => e.label === "TRAINED_ON" && edgeTgtId(e) === modelId).map((e) => edgeSrcId(e));
    const evaluation = EDGES.filter((e) => e.label === "EVALUATED_ON" && edgeTgtId(e) === modelId).map((e) => edgeSrcId(e));
    return { training, evaluation };
  };
  const parentDatasetOfSplit = (splitDatasetId) => {
    const edge = EDGES.find((e) => e.label === "DERIVED_FROM" && edgeTgtId(e) === splitDatasetId);
    return edge ? edgeSrcId(edge) : splitDatasetId;
  };
  const donorIdsForModelSplit = (modelId, splitType = "training") => {
    const { training, evaluation } = modelTrainEvalSplitDatasetIds(modelId);
    const splitDatasetIds = splitType === "evaluation" ? evaluation : training;
    const donorIds = new Set();
    splitDatasetIds.forEach((dsId) => {
      donorIdsForDatasetNode(dsId).forEach((d) => donorIds.add(d));
    });
    return donorIds;
  };
  const donorIdsForScope = (scopeTypeRaw = "", scopeRef = "", splitType = "training") => {
    const scopeType = String(scopeTypeRaw || "").toLowerCase();
    const out = new Set();
    if (scopeType === "model") {
      const modelNode = resolveNode(scopeRef, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === scopeRef);
      if (modelNode) donorIdsForModelSplit(modelNode.id, splitType).forEach((d) => out.add(d));
      return out;
    }
    if (scopeType === "modality") {
      datasetIdsForModalityAndSplit(scopeRef, splitType).forEach((dsId) => {
        donorIdsForDatasetNode(dsId, splitType).forEach((d) => out.add(d));
      });
      return out;
    }
    if (scopeType === "dataset") {
      const dsNode = resolveNode(scopeRef, ["ProcessedData"]) || NODES.find((n) => n.id === scopeRef);
      if (dsNode) donorIdsForDatasetNode(dsNode.id, splitType).forEach((d) => out.add(d));
      return out;
    }
    if (scopeType === "donor_set") {
      asArray(scopeRef).forEach((id) => {
        if (donorNodeIds.has(String(id || "").trim())) out.add(String(id || "").trim());
      });
      return out;
    }
    return out;
  };
  const ratio = (numerator, denominator) => (denominator ? numerator / denominator : 0);
  const parseDate = (raw) => {
    const s = String(raw || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const modalityToDatasetIds = {
    "scrna": ["proc_scrna_v1"],
    "scrna-seq": ["proc_scrna_v1"],
    "scrna seq": ["proc_scrna_v1"],
    "scrna-seq dataset": ["proc_scrna_v1"],
    "scrna dataset": ["proc_scrna_v1"],
    "sc rna": ["proc_scrna_v1"],
    "single-cell rna": ["proc_scrna_v1"],
    "single cell rna": ["proc_scrna_v1"],
    "single-cell rna-seq": ["proc_scrna_v1"],
    "single cell rna-seq": ["proc_scrna_v1"],
    "wgs": [],
  };
  const resolveModalityDatasetIds = (raw) => {
    const q = String(raw || "").toLowerCase();
    for (const key of Object.keys(modalityToDatasetIds)) {
      if (qHas(q, key)) return modalityToDatasetIds[key];
    }
    return [];
  };
  const datasetSplitTag = (datasetNodeId = "") => {
    const id = String(datasetNodeId || "").toLowerCase();
    if (id.includes("__training")) return "training";
    if (id.includes("__evaluation")) return "evaluation";
    return "";
  };
  const datasetIdsForModalityAndSplit = (modalityRaw = "", splitRaw = "training") => {
    const split = normalizeSplit(splitRaw);
    const modalityQ = String(modalityRaw || "").trim();
    const mappedParents = resolveModalityDatasetIds(modalityQ);
    const out = new Set();

    const pushSplitChildren = (parentId) => {
      const childIds = EDGES
        .filter((e) => e.label === "DERIVED_FROM" && edgeSrcId(e) === parentId)
        .map((e) => edgeTgtId(e));
      if (!childIds.length) {
        out.add(parentId);
        return;
      }
      const splitChildren = childIds.filter((cid) => datasetSplitTag(cid) === split);
      if (splitChildren.length) splitChildren.forEach((x) => out.add(x));
      else childIds.forEach((x) => out.add(x));
    };

    mappedParents.forEach((pid) => pushSplitChildren(pid));
    if (out.size) return [...out];

    // Generic fallback: fuzzy match ProcessedData labels by modality text.
    const q = normalizeSearchText(modalityQ);
    const candidates = NODES
      .filter((n) => String(n.type) === "ProcessedData")
      .filter((n) => {
        const lbl = normalizeSearchText(labelSingleLine(n.label));
        return q && (lbl.includes(q) || q.includes(lbl));
      });
    candidates.forEach((n) => {
      const tag = datasetSplitTag(n.id);
      if (!tag || tag === split) out.add(n.id);
    });
    return [...out];
  };
  const normalizeModelRef = (raw = "") => {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "";
    const aliasMap = {
      model_proteinfm: "model_protein",
      protein_fm: "model_protein",
      proteinfm: "model_protein",
      model_scfm: "model_scfm",
      scfm: "model_scfm",
      sc_fm: "model_scfm",
      model_genomic: "model_genomic",
      model_genomicfm: "model_genomic",
      model_genomic_fm: "model_genomic",
      genomicfm: "model_genomic",
      geonomicfm: "model_genomic",
      geonomic_fm: "model_genomic",
      model_spatial: "model_spatial",
      spatialfm: "model_spatial",
      model_spatial_omics: "model_spatial_omics",
    };
    return aliasMap[s] || String(raw || "").trim();
  };
  const normalizeSplit = (raw = "") => {
    const s = String(raw || "").toLowerCase();
    if (s.includes("eval") || s.includes("validation") || s.includes("test") || s.includes("测试") || s.includes("验证")) return "evaluation";
    return "training";
  };
  const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const edgeMatch = (edge, labels) =>
    !labels?.length || labels.map((x) => String(x || "").toUpperCase()).includes(String(edge.label || "").toUpperCase());
  const nodeRow = (node) => ({
    id: node.id,
    label: labelSingleLine(node.label),
    type: node.type,
    detail: node.detail,
  });

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
      const fallbackIds = [
        ...resolveModalityDatasetIds(params.datasetType),
        ...resolveModalityDatasetIds(params.query),
      ];
      const sourceIds = new Set();
      if (datasetNode?.id) sourceIds.add(datasetNode.id);
      if (params.datasetId && !datasetNode?.id) sourceIds.add(String(params.datasetId));
      if (params.datasetType && !datasetNode?.id && fallbackIds.length === 0) sourceIds.add(String(params.datasetType));
      fallbackIds.forEach((id) => sourceIds.add(id));
      if (!sourceIds.size) return { rows: [] };

      const datasetId = datasetNode?.id || [...sourceIds][0];
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
      const inputDatasetId = datasetNode?.id || params.datasetId;
      if (!inputDatasetId) return { rows:[] };
      const datasetId = parentDatasetOfSplit(String(inputDatasetId));
      const genEdge = EDGES.find(
        e => (e.label==="GENERATED_BY" || e.label==="WAS_GENERATED_BY") && edgeTgtId(e)===datasetId
      );
      if (!genEdge) return {
        rows: [],
        summary: {
          datasetId,
          inputDatasetId,
          resolvedFromSplit: String(inputDatasetId) !== String(datasetId),
        },
      };
      const pipeline = NODES.find(n=>n.id===edgeSrcId(genEdge));
      const datasetResolved = NODES.find((n) => n.id === datasetId);
      return {
        rows: pipeline ? [{
          id: pipeline.id,
          label: labelSingleLine(pipeline.label),
          detail: pipeline.detail,
          datasetId,
          datasetLabel: labelSingleLine(datasetResolved?.label || datasetId),
          inputDatasetId,
          resolvedFromSplit: String(inputDatasetId) !== String(datasetId),
        }] : [],
        summary: {
          datasetId,
          datasetLabel: labelSingleLine(datasetResolved?.label || datasetId),
          inputDatasetId,
          resolvedFromSplit: String(inputDatasetId) !== String(datasetId),
          pipelineId: pipeline?.id || "",
        },
      };
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
      const candidate =
        params.nodeId ||
        params.modelId ||
        params.datasetId ||
        params.mcId ||
        params.dcId ||
        params.query ||
        "";
      const node =
        resolveNode(candidate) ||
        resolveNode(params.nodeId) ||
        resolveNode(params.modelId, ["Model", "FineTunedModel"]) ||
        resolveNode(params.datasetId, ["ProcessedData", "RawData"]) ||
        resolveNode(params.query);
      const nodeId = node?.id || params.nodeId || params.modelId || params.datasetId || null;
      if (!nodeId) return { rows: [] };
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
        if (qHas(q, "genomic") || qHas(q, "geonomic")) fallbackIds.push("model_genomic");
        if (qHasAny(q, ["single-cell", "single cell", "scfm", "sc fm", "sc-fm"])) fallbackIds.push("model_scfm");
        if (qHas(q, "spatial")) fallbackIds.push("model_spatial");
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
    case "training_donor_overlap_between_models": {
      const a = params.modelAId || "model_genomic";
      const b = params.modelBId || "model_scfm";
      const splitA = normalizeSplit(params.splitA || params.split || "training");
      const splitB = normalizeSplit(params.splitB || params.split || "training");
      const aNode = resolveNode(a, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === a);
      const bNode = resolveNode(b, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === b);
      const aSet = donorIdsForModelSplit(aNode?.id || a, splitA);
      const bSet = donorIdsForModelSplit(bNode?.id || b, splitB);
      const overlap = [...aSet].filter((id) => bSet.has(id)).sort();
      const diseaseCounts = { T1D: 0, "AAb+": 0, T2D: 0, ND: 0, Unknown: 0 };
      return {
        rows: overlap.map((id) => {
          const donorNode = NODES.find((n) => n.id === id);
          const diseaseTag = diseaseTagFromDonor(donorNode);
          bumpBucket(diseaseCounts, diseaseTag);
          return {
            id,
            label: labelSingleLine(donorNode?.label || id),
            diseaseTag,
          };
        }),
        summary: {
          modelAId: a,
          modelBId: b,
          modelALabel: labelSingleLine(aNode?.label || (aNode?.id || a)),
          modelBLabel: labelSingleLine(bNode?.label || (bNode?.id || b)),
          splitA,
          splitB,
          modelADonorCount: aSet.size,
          modelBDonorCount: bSet.size,
          overlapCount: overlap.length,
          overlapRatioA: aSet.size ? overlap.length / aSet.size : 0,
          overlapRatioB: bSet.size ? overlap.length / bSet.size : 0,
          diseaseComposition: diseaseCounts,
          t1dRatio: overlap.length ? diseaseCounts.T1D / overlap.length : 0,
          sameModel: a === b,
        },
      };
    }
    case "donor_overlap_between_models": {
      const aRef = normalizeModelRef(
        params.modelAId || params.modelA || params.modelAName || params.model1 || params.modelId1 || "model_genomic"
      );
      const bRef = normalizeModelRef(
        params.modelBId || params.modelB || params.modelBName || params.model2 || params.modelId2 || "model_scfm"
      );
      const splitA = normalizeSplit(params.splitA || params.split || "training");
      const splitB = normalizeSplit(params.splitB || params.split || "training");
      const aNode = resolveNode(aRef, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === aRef);
      const bNode = resolveNode(bRef, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === bRef);
      if (!aNode || !bNode) {
        return { rows: [], summary: { found: false, modelA: aRef, modelB: bRef, splitA, splitB } };
      }
      const aSet = donorIdsForModelSplit(aNode.id, splitA);
      const bSet = donorIdsForModelSplit(bNode.id, splitB);
      const overlap = [...aSet].filter((id) => bSet.has(id)).sort();
      const diseaseCounts = { T1D: 0, "AAb+": 0, T2D: 0, ND: 0, Unknown: 0 };
      return {
        rows: overlap.map((id) => {
          const donorNode = NODES.find((n) => n.id === id);
          const diseaseTag = diseaseTagFromDonor(donorNode);
          bumpBucket(diseaseCounts, diseaseTag);
          return {
            id,
            label: labelSingleLine(donorNode?.label || id),
            diseaseTag,
          };
        }),
        summary: {
          found: true,
          modelAId: aNode.id,
          modelBId: bNode.id,
          modelALabel: labelSingleLine(aNode.label || aNode.id),
          modelBLabel: labelSingleLine(bNode.label || bNode.id),
          splitA,
          splitB,
          modelADonorCount: aSet.size,
          modelBDonorCount: bSet.size,
          overlapCount: overlap.length,
          overlapRatioA: aSet.size ? overlap.length / aSet.size : 0,
          overlapRatioB: bSet.size ? overlap.length / bSet.size : 0,
          diseaseComposition: diseaseCounts,
          t1dRatio: overlap.length ? diseaseCounts.T1D / overlap.length : 0,
          sameModel: aNode.id === bNode.id,
        },
      };
    }
    case "disease_composition_for_model_training": {
      const modelId = params.modelId || "model_scfm";
      const modelNode = NODES.find((n) => n.id === modelId);
      const donors = [...donorIdsForModelTraining(modelId)];
      const counts = { T1D: 0, "AAb+": 0, T2D: 0, ND: 0, Unknown: 0 };
      const rows = donors
        .map((id) => {
          const node = NODES.find((n) => n.id === id);
          const diseaseTag = diseaseTagFromDonor(node);
          bumpBucket(counts, diseaseTag);
          return {
            id,
            label: labelSingleLine(node?.label || id),
            diseaseTag,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      return {
        rows,
        summary: {
          modelId,
          modelLabel: labelSingleLine(modelNode?.label || modelId),
          donorCount: donors.length,
          composition: counts,
          t1dRatio: ratio(counts.T1D, donors.length),
          ndRatio: ratio(counts.ND, donors.length),
        },
      };
    }
    case "donor_modality_availability": {
      const donorCode = normalizeDonorCode(params.donorCode || params.donorId || params.query || "") || "";
      const modality = String(params.modality || params.datasetType || "WGS");
      const donorNode = donorCodeToNode.get(donorCode);
      if (!donorNode) return { rows: [], summary: { found: false, donorCode, modality } };
      const modalityValue = String(donorNode?.detail?.[modality] ?? donorNode?.detail?.[String(modality).toUpperCase()] ?? "").trim();
      const available = ["1", "true", "yes", "y"].includes(modalityValue.toLowerCase());
      return {
        rows: [{
          donorCode,
          modality,
          available,
          rawValue: modalityValue || "(missing)",
        }],
        summary: { found: true, donorCode, modality, available },
      };
    }
    case "qc_pipeline_for_model_modality": {
      const modelNode =
        resolveNode(params.modelId, ["Model", "FineTunedModel"]) ||
        resolveNode(params.query, ["Model", "FineTunedModel"]);
      const modelId = modelNode?.id || params.modelId || "model_scfm";
      const modalityDatasetIds = resolveModalityDatasetIds(params.modality || params.datasetType || params.query);
      const trainSourceIds = EDGES
        .filter((e) => e.label === "TRAINED_ON" && edgeTgtId(e) === modelId)
        .map((e) => parentDatasetOfSplit(edgeSrcId(e)));
      const candidateDatasetIds = modalityDatasetIds.length
        ? trainSourceIds.filter((id) => modalityDatasetIds.includes(id))
        : trainSourceIds;
      const uniqDatasetIds = [...new Set(candidateDatasetIds.length ? candidateDatasetIds : modalityDatasetIds)];
      const trainingLinked = candidateDatasetIds.length > 0;
      const rows = uniqDatasetIds.map((datasetId) => {
        const datasetNode = NODES.find((n) => n.id === datasetId);
        const genEdge = EDGES.find((e) => (e.label === "GENERATED_BY" || e.label === "WAS_GENERATED_BY") && edgeTgtId(e) === datasetId);
        const pipelineNode = genEdge ? NODES.find((n) => n.id === edgeSrcId(genEdge)) : null;
        return {
          datasetId,
          datasetLabel: labelSingleLine(datasetNode?.label || datasetId),
          pipelineId: pipelineNode?.id || null,
          pipelineLabel: labelSingleLine(pipelineNode?.label || ""),
          pipelineDetail: pipelineNode?.detail || {},
        };
      });
      return {
        rows,
        summary: {
          modelId,
          modelLabel: labelSingleLine(modelNode?.label || modelId),
          rowCount: rows.length,
          trainingLinked,
        },
      };
    }
    case "governance_events_by_period": {
      const period = String(params.period || params.query || "").toUpperCase();
      const qMatch = period.match(/(\d{4})[-\s]?Q([1-4])/);
      if (!qMatch) return { rows: [], summary: { period, parsed: false } };
      const year = Number(qMatch[1]);
      const quarter = Number(qMatch[2]);
      const monthMin = (quarter - 1) * 3 + 1;
      const monthMax = monthMin + 2;
      const eventRows = NODES
        .filter((n) => n.type === "DatasetCard" || n.type === "ModelCard")
        .map((n) => ({
          id: n.id,
          label: labelSingleLine(n.label),
          type: n.type,
          updated: String(n.detail?.Updated || ""),
          status: String(n.detail?.Status || ""),
        }))
        .filter((r) => {
          const d = parseDate(r.updated);
          if (!d) return false;
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth() + 1;
          return y === year && m >= monthMin && m <= monthMax;
        });
      return {
        rows: eventRows,
        summary: { period: `${year}-Q${quarter}`, count: eventRows.length },
      };
    }
    case "models_need_reeval_after_donor_qc": {
      const donorCode = normalizeDonorCode(params.donorCode || params.donorId || params.query || "") || "";
      const donorNode = donorCodeToNode.get(donorCode);
      if (!donorNode) return { rows: [], summary: { found: false, donorCode } };
      const donorId = donorNode.id;
      const sampleIds = EDGES.filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === donorId).map((e) => edgeTgtId(e));
      const splitDatasetIds = new Set();
      sampleIds.forEach((sid) => {
        EDGES.filter((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sid).forEach((e) => splitDatasetIds.add(edgeSrcId(e)));
      });
      const impactedBaseModels = new Set();
      splitDatasetIds.forEach((dsId) => {
        EDGES
          .filter((e) => (e.label === "TRAINED_ON" || e.label === "EVALUATED_ON") && edgeSrcId(e) === dsId)
          .forEach((e) => impactedBaseModels.add(edgeTgtId(e)));
      });
      const impactedAllModels = new Set([...impactedBaseModels]);
      [...impactedBaseModels].forEach((mid) => {
        EDGES.filter((e) => e.label === "FINETUNED_ON" && edgeTgtId(e) === mid).forEach((e) => impactedAllModels.add(edgeSrcId(e)));
        EDGES.filter((e) => e.label === "EMBEDDED_BY" && edgeTgtId(e) === mid).forEach((e) => {
          const embId = edgeSrcId(e);
          EDGES.filter((x) => x.label === "FINETUNED_ON" && edgeTgtId(x) === embId).forEach((x) => impactedAllModels.add(edgeSrcId(x)));
        });
      });
      const rows = [...impactedAllModels]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label), type: n.type, reason: "Donor samples appear in training/evaluation lineage" }));
      return {
        rows,
        summary: { found: true, donorCode, impactedModelCount: rows.length },
      };
    }
    case "qc_pipeline_owner": {
      const q = String(params.query || params.pipeline || "").toLowerCase();
      const versionMatch = q.match(/v\s*([0-9]+(?:\.[0-9]+)*)/i);
      const requestedVersion = versionMatch ? `v${versionMatch[1]}` : null;
      const isScrna = qHasAny(q, ["scrna", "sc rna"]);
      const pipelines = NODES.filter((n) => n.type === "Pipeline" || n.type === "QCPipeline");
      const matches = pipelines.filter((p) => {
        const lbl = labelSingleLine(p.label).toLowerCase();
        if (isScrna && !qHas(lbl, "scrna")) return false;
        if (requestedVersion && !versionMatches(requestedVersion, String(p.detail?.Version || ""))) return false;
        return isScrna || qHas(q, lbl);
      });
      const best = matches.length ? matches : (isScrna ? pipelines.filter((p) => qHas(labelSingleLine(p.label).toLowerCase(), "scrna")) : []);
      const rows = best.map((p) => ({
        id: p.id,
        pipelineLabel: labelSingleLine(p.label),
        version: p.detail?.Version || "unknown",
        contact: p.detail?.Contact || "unknown",
        email: p.detail?.Email || "unknown",
      }));
      return { rows, summary: { requestedVersion, exactVersionFound: matches.length > 0 } };
    }
    case "institution_datasets_used_after_year": {
      const institution = String(params.institution || params.query || "").toLowerCase();
      const year = Number(params.year || (String(params.query || "").match(/20\d{2}/)?.[0]) || 2024);
      const usedDatasetIds = new Set(
        EDGES
          .filter((e) => e.label === "TRAINED_ON" || e.label === "EVALUATED_ON")
          .map((e) => parentDatasetOfSplit(edgeSrcId(e)))
      );
      const rows = [...usedDatasetIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((ds) => {
          const cardEdge = EDGES.find((e) => e.label === "DOCUMENTED_BY" && edgeSrcId(e) === ds.id);
          const card = cardEdge ? NODES.find((n) => n.id === edgeTgtId(cardEdge)) : null;
          const updated = String(card?.detail?.Updated || "");
          const institutionFromCard = String(card?.detail?.Institution || "").toLowerCase();
          const sampleSources = [...sampleIdsForDatasetNode(ds.id)]
            .map((sid) => NODES.find((n) => n.id === sid)?.detail?.Source)
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          const hasInstitution = institution
            ? institutionFromCard.includes(institution) || sampleSources.some((s) => s.includes(institution))
            : true;
          const d = parseDate(updated);
          const yearOk = d ? d.getUTCFullYear() > year : false;
          return {
            id: ds.id,
            label: labelSingleLine(ds.label),
            updated,
            institution: card?.detail?.Institution || "unknown",
            hasInstitution,
            yearOk,
          };
        })
        .filter((r) => r.hasInstitution && r.yearOk)
        .map(({ hasInstitution, yearOk, ...rest }) => rest);
      return { rows, summary: { institution: params.institution || "", afterYear: year, count: rows.length } };
    }
    case "cross_model_donor_leakage": {
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
          return { id, label: labelSingleLine(node?.label || id), diseaseTag: diseaseTagFromDonor(node) };
        }),
        summary: {
          overlapCount: overlap.length,
          totalDonors: donorNodes.length,
          leakageRatio: ratio(overlap.length, donorNodes.length),
          genomicTrainingDonors: genomic.size,
          scfmTrainingDonors: scfm.size,
          spatialTrainingDonors: spatial.size,
        },
      };
    }
    case "cross_modality_embedding_leakage": {
      const sourceModelId = params.sourceModelId || "model_scfm";
      const targetModelId = params.targetModelId || "model_genomic";

      const sourceTrainingDonors = donorIdsForModelTraining(sourceModelId);
      const targetTrainingDonors = donorIdsForModelTraining(targetModelId);

      const sourceEmbeddings = EDGES
        .filter((e) => e.label === "EMBEDDED_BY" && edgeTgtId(e) === sourceModelId)
        .map((e) => edgeSrcId(e));

      const embeddingToTargetEval = sourceEmbeddings.filter((embId) =>
        EDGES.some((e) => e.label === "EVALUATED_ON" && edgeSrcId(e) === embId && edgeTgtId(e) === targetModelId)
      );

      const sourceDatasetIds = new Set();
      sourceEmbeddings.forEach((embId) => {
        EDGES
          .filter((e) => e.label === "DERIVED_FROM" && edgeTgtId(e) === embId)
          .forEach((e) => sourceDatasetIds.add(edgeSrcId(e)));
      });
      const embeddingDonorIds = new Set();
      [...sourceDatasetIds].forEach((dsId) => {
        donorIdsForDatasetNode(dsId).forEach((d) => embeddingDonorIds.add(d));
      });

      const leakageDonorIds = [...embeddingDonorIds].filter((d) => sourceTrainingDonors.has(d) && targetTrainingDonors.has(d)).sort();
      const overlapBulkRnaTraining = [...targetTrainingDonors].filter((d) => sourceTrainingDonors.has(d)).sort();
      return {
        rows: leakageDonorIds.map((id) => ({ id, label: labelSingleLine(NODES.find((n) => n.id === id)?.label || id) })),
        summary: {
          sourceModelId,
          targetModelId,
          sourceEmbeddingCount: sourceEmbeddings.length,
          sourceEmbeddingIds: sourceEmbeddings,
          embeddingUsedForTargetEvaluation: embeddingToTargetEval.length > 0,
          embeddingEvalEdgeCount: embeddingToTargetEval.length,
          sourceTrainingDonors: sourceTrainingDonors.size,
          targetTrainingDonors: targetTrainingDonors.size,
          sourceEmbeddingDonors: embeddingDonorIds.size,
          crossTrainingOverlapDonors: overlapBulkRnaTraining.length,
          leakageDonorCount: leakageDonorIds.length,
          leakageRatioInEmbeddingDonors: ratio(leakageDonorIds.length, embeddingDonorIds.size),
        },
      };
    }
    case "embedding_leakage_between_models": {
      const sourceModelId = params.sourceModelId || "";
      const targetModelId = params.targetModelId || "";
      const modelAId = params.modelAId || "";
      const modelBId = params.modelBId || "";
      const sourceSplit = normalizeSplit(params.sourceSplit || params.trainingSplit || "training");
      const targetTrainSplit = normalizeSplit(params.targetTrainSplit || "training");
      const targetUseSplit = normalizeSplit(params.targetUseSplit || params.targetSplit || "evaluation");
      const targetUseEdge = targetUseSplit === "evaluation" ? "EVALUATED_ON" : "TRAINED_ON";
      const requireUsage = params.requireEmbeddingUsage !== false;

      const pairList = [];
      if (sourceModelId && targetModelId) {
        pairList.push({ sourceModelId, targetModelId });
      } else if (modelAId && modelBId) {
        pairList.push({ sourceModelId: modelAId, targetModelId: modelBId });
        pairList.push({ sourceModelId: modelBId, targetModelId: modelAId });
      }
      if (!pairList.length) {
        return { rows: [], summary: { found: false, reason: "no_model_pair" } };
      }

      const outRows = [];
      const directionSummaries = [];
      pairList.forEach(({ sourceModelId: sMid, targetModelId: tMid }) => {
        const sNode = resolveNode(sMid, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === sMid);
        const tNode = resolveNode(tMid, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === tMid);
        if (!sNode || !tNode) return;

        const sourceTrainingDonors = donorIdsForModelSplit(sNode.id, sourceSplit);
        const targetTrainingDonors = donorIdsForModelSplit(tNode.id, targetTrainSplit);
        const sourceEmbeddings = EDGES
          .filter((e) => e.label === "EMBEDDED_BY" && edgeTgtId(e) === sNode.id)
          .map((e) => edgeSrcId(e));

        const embeddingsUsedByTarget = sourceEmbeddings.filter((embId) =>
          EDGES.some((e) => e.label === targetUseEdge && edgeSrcId(e) === embId && edgeTgtId(e) === tNode.id)
        );
        const candidateEmbeddings = requireUsage ? embeddingsUsedByTarget : sourceEmbeddings;
        if (!candidateEmbeddings.length) {
          directionSummaries.push({
            sourceModelId: sNode.id,
            sourceModelLabel: labelSingleLine(sNode.label),
            targetModelId: tNode.id,
            targetModelLabel: labelSingleLine(tNode.label),
            sourceEmbeddingCount: sourceEmbeddings.length,
            embeddingsUsedByTargetCount: embeddingsUsedByTarget.length,
            embeddingDonors: 0,
            leakageDonors: 0,
          });
          return;
        }

        const sourceDatasetIds = new Set();
        candidateEmbeddings.forEach((embId) => {
          EDGES
            .filter((e) => e.label === "DERIVED_FROM" && edgeTgtId(e) === embId)
            .forEach((e) => sourceDatasetIds.add(edgeSrcId(e)));
        });
        const embeddingDonorIds = new Set();
        [...sourceDatasetIds].forEach((dsId) => {
          donorIdsForDatasetNode(dsId).forEach((d) => embeddingDonorIds.add(d));
        });

        const leakageDonorIds = [...embeddingDonorIds]
          .filter((d) => sourceTrainingDonors.has(d) && targetTrainingDonors.has(d))
          .sort();
        leakageDonorIds.forEach((id) => {
          const dn = NODES.find((n) => n.id === id);
          outRows.push({
            id,
            label: labelSingleLine(dn?.label || id),
            sourceModelId: sNode.id,
            sourceModelLabel: labelSingleLine(sNode.label),
            targetModelId: tNode.id,
            targetModelLabel: labelSingleLine(tNode.label),
            targetUsageSplit: targetUseSplit,
          });
        });
        directionSummaries.push({
          sourceModelId: sNode.id,
          sourceModelLabel: labelSingleLine(sNode.label),
          targetModelId: tNode.id,
          targetModelLabel: labelSingleLine(tNode.label),
          sourceEmbeddingCount: sourceEmbeddings.length,
          embeddingsUsedByTargetCount: embeddingsUsedByTarget.length,
          embeddingDonors: embeddingDonorIds.size,
          leakageDonors: leakageDonorIds.length,
        });
      });

      const uniqueRowsMap = new Map();
      outRows.forEach((r) => {
        const key = `${r.id}:${r.sourceModelId}:${r.targetModelId}`;
        if (!uniqueRowsMap.has(key)) uniqueRowsMap.set(key, r);
      });
      const uniqueRows = [...uniqueRowsMap.values()].sort((a, b) => a.label.localeCompare(b.label));
      return {
        rows: uniqueRows,
        summary: {
          found: uniqueRows.length > 0,
          sourceSplit,
          targetTrainSplit,
          targetUseSplit,
          directionCount: directionSummaries.length,
          directions: directionSummaries,
          leakageDonorCount: uniqueRows.length,
        },
      };
    }
    case "train_eval_distribution_drift": {
      const modelId = params.modelId || "model_genomic";
      const trainingDonors = donorIdsForModelSplit(modelId, "training");
      const evaluationDonors = donorIdsForModelSplit(modelId, "evaluation");
      const defaultReclassifications = params.reclassifications || {
        "HPAP-002": "T1D onset",
        "HPAP-011": "T1D onset",
        "HPAP-015": "T1D onset",
      };

      const summarize = (donorIdSet, overrides = {}) => {
        const counts = { T1D: 0, "AAb+": 0, T2D: 0, ND: 0, Unknown: 0 };
        [...donorIdSet].forEach((id) => {
          const donorNode = NODES.find((n) => n.id === id);
          bumpBucket(counts, diseaseTagFromDonor(donorNode, overrides));
        });
        const total = [...donorIdSet].length;
        return {
          total,
          counts,
          t1dRatio: ratio(counts.T1D, total),
          ndRatio: ratio(counts.ND, total),
        };
      };

      const beforeTrain = summarize(trainingDonors);
      const beforeEval = summarize(evaluationDonors);
      const afterTrain = summarize(trainingDonors, defaultReclassifications);
      const afterEval = summarize(evaluationDonors, defaultReclassifications);
      return {
        rows: Object.entries(defaultReclassifications).map(([donorCode, newStage]) => ({ donorCode, newStage })),
        summary: {
          modelId,
          before: { training: beforeTrain, evaluation: beforeEval },
          after: { training: afterTrain, evaluation: afterEval },
          shift: {
            trainingT1DDelta: afterTrain.counts.T1D - beforeTrain.counts.T1D,
            evaluationT1DDelta: afterEval.counts.T1D - beforeEval.counts.T1D,
            trainingT1DRatioDelta: afterTrain.t1dRatio - beforeTrain.t1dRatio,
            evaluationT1DRatioDelta: afterEval.t1dRatio - beforeEval.t1dRatio,
          },
        },
      };
    }
    case "upstream_metadata_impact": {
      const donorCode = normalizeDonorCode(params.donorCode || params.donorId || "HPAP-002") || "HPAP-002";
      const oldStage = params.fromStage || "AAb+";
      const newStage = params.toStage || "T1D onset";
      const donorNode = donorCodeToNode.get(donorCode);
      if (!donorNode) {
        return { rows: [], summary: { donorCode, found: false } };
      }

      const donorId = donorNode.id;
      const donorSampleIds = EDGES
        .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === donorId)
        .map((e) => edgeTgtId(e));
      const modelExposureMap = new Map();
      donorSampleIds.forEach((sampleId) => {
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sampleId)
          .forEach((memberEdge) => {
            const splitDatasetId = edgeSrcId(memberEdge);
            const trainEdges = EDGES.filter((e) => (e.label === "TRAINED_ON" || e.label === "EVALUATED_ON") && edgeSrcId(e) === splitDatasetId);
            trainEdges.forEach((te) => {
              const modelId = edgeTgtId(te);
              const parentDatasetId = parentDatasetOfSplit(splitDatasetId);
              const key = `${modelId}:${te.label}`;
              if (!modelExposureMap.has(key)) {
                modelExposureMap.set(key, {
                  modelId,
                  modelLabel: labelSingleLine(NODES.find((n) => n.id === modelId)?.label || modelId),
                  split: te.label === "TRAINED_ON" ? "training" : "evaluation",
                  parentDatasets: new Set(),
                  sampleIds: new Set(),
                });
              }
              const entry = modelExposureMap.get(key);
              entry.parentDatasets.add(parentDatasetId);
              entry.sampleIds.add(sampleId);
            });
          });
      });

      const impactedModels = [...modelExposureMap.values()].map((r) => ({
        modelId: r.modelId,
        modelLabel: r.modelLabel,
        split: r.split,
        parentDatasets: [...r.parentDatasets],
        impactedSampleCount: r.sampleIds.size,
      }));
      const impactedDatasetIds = new Set();
      impactedModels.forEach((m) => m.parentDatasets.forEach((dsId) => impactedDatasetIds.add(dsId)));
      const inferModality = (datasetNode) => {
        const d = datasetNode?.detail || {};
        const fromDetail =
          d.modality || d.Modality || d["Data modality"] || d.DatasetType || d.dataset_type || "";
        if (String(fromDetail || "").trim()) return String(fromDetail).trim();
        const lbl = labelSingleLine(datasetNode?.label || "");
        const m = lbl.match(/^(.*?)\s+Dataset\s+v/i);
        return m ? m[1].trim() : (lbl || "Unknown");
      };
      const impactedDatasetRows = [...impactedDatasetIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label), modality: inferModality(n) }));
      const impactedModalities = [...new Set(impactedDatasetRows.map((x) => x.modality).filter(Boolean))].sort();
      const impactedModelIds = new Set(impactedModels.map((m) => m.modelId));

      const impactedFineTunedModelIds = new Set();
      impactedModelIds.forEach((mid) => {
        EDGES
          .filter((e) => e.label === "FINETUNED_ON" && edgeTgtId(e) === mid)
          .forEach((e) => impactedFineTunedModelIds.add(edgeSrcId(e)));
      });
      impactedModelIds.forEach((mid) => {
        EDGES
          .filter((e) => e.label === "EMBEDDED_BY" && edgeTgtId(e) === mid)
          .forEach((e) => {
            const embId = edgeSrcId(e);
            EDGES
              .filter((x) => x.label === "FINETUNED_ON" && edgeTgtId(x) === embId)
              .forEach((x) => impactedFineTunedModelIds.add(edgeSrcId(x)));
          });
      });

      const allImpactedModelIds = new Set([...impactedModelIds, ...impactedFineTunedModelIds]);
      const allImpactedModels = [...allImpactedModelIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label), type: n.type }));
      const impactedTasks = EDGES
        .filter((e) => e.label === "ENABLES" && allImpactedModelIds.has(edgeSrcId(e)))
        .map((e) => NODES.find((n) => n.id === edgeTgtId(e)))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label) }));

      const totalSamples = donorSampleIds.length;
      const impactedSampleSet = new Set();
      impactedModels.forEach((m) => m.parentDatasets.forEach(() => {}));
      impactedModels.forEach((m) => {
        const modelExposureKey = `${m.modelId}:${m.split === "training" ? "TRAINED_ON" : "EVALUATED_ON"}`;
        const source = modelExposureMap.get(modelExposureKey);
        if (source) source.sampleIds.forEach((sid) => impactedSampleSet.add(sid));
      });
      const impactedSampleCount = impactedSampleSet.size;
      const riskScore = impactedModels.length + impactedTasks.length;
      const predictionShiftEstimate = riskScore >= 6 ? "high" : riskScore >= 3 ? "medium" : "low";

      return {
        rows: impactedModels,
        summary: {
          found: true,
          donorCode,
          donorLabel: labelSingleLine(donorNode.label),
          reclassification: { from: oldStage, to: newStage },
          donorSampleCount: totalSamples,
          impactedSampleCount,
          impactedSampleRatio: ratio(impactedSampleCount, totalSamples),
          impactedDatasetCount: impactedDatasetIds.size,
          impactedDatasets: impactedDatasetRows,
          impactedModalities,
          impactedModelCount: allImpactedModelIds.size,
          impactedModels: allImpactedModels.map((m) => m.label),
          impactedTaskCount: impactedTasks.length,
          impactedTasks,
          predictionShiftEstimate,
        },
      };
    }
    case "shared_validation_datasets_across_fms": {
      const genomicId = params.genomicModelId || "model_genomic";
      const scfmId = params.scfmModelId || "model_scfm";
      const genomicEvalSplits = EDGES
        .filter((e) => e.label === "EVALUATED_ON" && edgeTgtId(e) === genomicId)
        .map((e) => edgeSrcId(e));
      const genomicEvalParents = new Set(genomicEvalSplits.map((sid) => parentDatasetOfSplit(sid)));

      const scfmEmbeddingIds = EDGES
        .filter((e) => e.label === "EMBEDDED_BY" && edgeTgtId(e) === scfmId)
        .map((e) => edgeSrcId(e));
      const scfmEmbeddingSourceDatasets = new Set();
      scfmEmbeddingIds.forEach((embId) => {
        EDGES
          .filter((e) => e.label === "DERIVED_FROM" && edgeTgtId(e) === embId)
          .forEach((e) => scfmEmbeddingSourceDatasets.add(edgeSrcId(e)));
      });
      const overlap = [...genomicEvalParents].filter((id) => scfmEmbeddingSourceDatasets.has(id)).sort();
      return {
        rows: overlap.map((id) => ({
          id,
          label: labelSingleLine(NODES.find((n) => n.id === id)?.label || id),
        })),
        summary: {
          genomicEvaluationDatasetCount: genomicEvalParents.size,
          scfmEmbeddingSourceDatasetCount: scfmEmbeddingSourceDatasets.size,
          overlapCount: overlap.length,
          scfmEmbeddingIds,
        },
      };
    }
    case "disease_composition_bias_three_fms": {
      const genomicId = params.genomicModelId || "model_genomic";
      const scfmId = params.scfmModelId || "model_scfm";
      const spatialId = params.spatialModelId || "model_spatial";
      const shared = [...donorIdsForModelTraining(genomicId)].filter(
        (id) => donorIdsForModelTraining(scfmId).has(id) && donorIdsForModelTraining(spatialId).has(id)
      );
      const counts = { T1D: 0, "AAb+": 0, T2D: 0, ND: 0, Unknown: 0 };
      shared.forEach((id) => {
        bumpBucket(counts, diseaseTagFromDonor(NODES.find((n) => n.id === id)));
      });
      return {
        rows: shared.sort().map((id) => {
          const node = NODES.find((n) => n.id === id);
          return { id, label: labelSingleLine(node?.label || id), diseaseTag: diseaseTagFromDonor(node) };
        }),
        summary: {
          sharedDonorCount: shared.length,
          composition: counts,
          t1dRatio: ratio(counts.T1D, shared.length),
          ndRatio: ratio(counts.ND, shared.length),
        },
      };
    }
    case "search_nodes": {
      const rawQuery = String(params.query || params.q || params.text || "").trim();
      const query = rawQuery.toLowerCase();
      const queryNorm = normalizeEntityKey(rawQuery);
      const donorCodeMatch = rawQuery.toUpperCase().match(/HPAP[-_\s]?(\d{1,3})/);
      const donorCode = donorCodeMatch ? `HPAP-${String(Number(donorCodeMatch[1])).padStart(3, "0")}` : "";
      const donorCodeNorm = donorCode ? normalizeEntityKey(donorCode) : "";
      const metadataLikeQuery = /\b(metadata|meta\s*data|detail|details|properties|property|full\s*record)\b/i.test(rawQuery);
      const preferredTypes = asArray(
        params.preferredTypes ||
        params.typeHints ||
        params.types ||
        params.node_types ||
        params.node_type ||
        params.type
      ).map((t) => String(t || "").toLowerCase());
      const limit = Math.max(1, Math.min(Number(params.limit || 20), 100));
      if (!rawQuery) return { rows: [] };

      const tokenize = (s = "") =>
        String(s || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter((t) => t.length >= 2);
      const queryTokens = tokenize(rawQuery);
      const detailEntries = (node) =>
        Object.entries(node?.detail || {})
          .map(([k, v]) => [String(k), String(v ?? "").trim()])
          .filter(([, v]) => v);
      const detailText = (node) => detailEntries(node).map(([k, v]) => `${k} ${v}`).join(" ").toLowerCase();
      const buildDetailPreview = (node) => {
        const entries = detailEntries(node);
        if (!entries.length) return {};
        const scored = entries
          .map(([k, v]) => {
            const txt = `${k} ${v}`.toLowerCase();
            let s = 0;
            if (txt.includes(query)) s += 2;
            if (queryNorm && normalizeEntityKey(txt).includes(queryNorm)) s += 2;
            return { k, v, s };
          })
          .sort((a, b) => b.s - a.s || a.k.localeCompare(b.k))
          .slice(0, 4);
        const out = {};
        scored.forEach(({ k, v }) => { out[k] = v; });
        return out;
      };

      const scoreNode = (node) => {
        const id = String(node.id || "");
        const label = labelSingleLine(node.label || "");
        const type = String(node.type || "");
        const idLower = id.toLowerCase();
        const labelLower = label.toLowerCase();
        const idNorm = normalizeEntityKey(id);
        const labelNorm = normalizeEntityKey(label);
        const dText = detailText(node);
        const dNorm = normalizeEntityKey(dText);

        let score = 0;
        const matchedBy = [];
        const add = (pts, why) => {
          score += pts;
          if (!matchedBy.includes(why)) matchedBy.push(why);
        };

        if (idLower === query) add(140, "id_exact");
        if (idNorm && idNorm === queryNorm) add(120, "id_normalized");
        if (labelLower === query) add(115, "label_exact");
        if (labelNorm && labelNorm === queryNorm) add(105, "label_normalized");

        if (idLower.startsWith(query)) add(90, "id_prefix");
        if (labelLower.startsWith(query)) add(88, "label_prefix");
        if (queryNorm && idNorm.includes(queryNorm)) add(76, "id_partial_normalized");
        if (queryNorm && labelNorm.includes(queryNorm)) add(74, "label_partial_normalized");
        if (idLower.includes(query)) add(72, "id_partial");
        if (labelLower.includes(query)) add(70, "label_partial");

        if (dText.includes(query)) add(50, "detail_partial");
        if (queryNorm && dNorm.includes(queryNorm)) add(45, "detail_partial_normalized");

        if (queryTokens.length) {
          const nodeTokenSet = new Set(tokenize(`${id} ${label} ${type} ${dText}`));
          let overlap = 0;
          queryTokens.forEach((t) => {
            if (nodeTokenSet.has(t)) overlap += 1;
          });
          if (overlap > 0) add(Math.min(24, 8 + overlap * 4), `token_overlap_${overlap}`);
        }

        if (donorCodeNorm) {
          const isDonorId = idLower.startsWith("donor_hpap_");
          const isDonorType = type.toLowerCase() === "donor";
          const isSampleLike = idLower.startsWith("sample_") || labelLower.includes("replicate") || labelLower.includes("sample");
          const labelNormEqDonor = labelNorm === donorCodeNorm;
          const idNormHasDonor = idNorm.includes(`donor${donorCodeNorm}`) || idNorm.endsWith(donorCodeNorm);
          const labelNormHasDonor = labelNorm.includes(donorCodeNorm);
          if (isDonorId && (idNormHasDonor || labelNormEqDonor || labelNormHasDonor)) add(95, "donor_code_preferred");
          if (isDonorType && (labelNormEqDonor || labelNormHasDonor)) add(85, "donor_type_preferred");
          if (labelNormEqDonor && !isSampleLike) add(70, "donor_label_exact");
          if (metadataLikeQuery && isSampleLike && labelNormHasDonor) add(-55, "sample_penalty_for_metadata_query");
        }

        if (preferredTypes.length && preferredTypes.includes(type.toLowerCase())) add(8, "preferred_type");
        return { score, matchedBy };
      };

      const scopedNodes = (() => {
        if (!preferredTypes.length) return NODES;
        const preferred = NODES.filter((n) => preferredTypes.includes(String(n.type || "").toLowerCase()));
        return preferred.length ? preferred : NODES;
      })();

      const rows = scopedNodes
        .map((n) => {
          const { score, matchedBy } = scoreNode(n);
          return {
            id: n.id,
            label: labelSingleLine(n.label),
            type: n.type,
            score,
            matchedBy,
            detailPreview: buildDetailPreview(n),
          };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
        .slice(0, limit);
      return { rows };
    }
    case "list_nodes_by_type": {
      const rawType = String(params.nodeType || params.type || params.node_type || "").trim();
      const query = String(params.query || "").toLowerCase().trim();
      const queryNorm = normalizeEntityKey(query);
      const limit = Math.max(1, Math.min(Number(params.limit || 80), 300));
      const nodeTypeNorm = rawType.toLowerCase();
      const typeMatched = NODES.filter((n) =>
        !nodeTypeNorm ? true : String(n.type || "").toLowerCase() === nodeTypeNorm
      );
      const toSearchable = (node) => {
        const d = node?.detail || {};
        const donor = d.Donor || d.donor_ID || d.donor || "";
        const modality = d.modality || d.Modality || d["Data modality"] || "";
        return `${String(node.id || "")} ${labelSingleLine(node.label)} ${String(donor)} ${String(modality)}`.toLowerCase();
      };
      const matched = typeMatched.filter((n) => {
        if (!query) return true;
        const text = toSearchable(n);
        return text.includes(query) || normalizeEntityKey(text).includes(queryNorm);
      });
      const rows = matched
        .slice(0, limit)
        .map((n) => ({
          id: n.id,
          label: labelSingleLine(n.label),
          type: n.type,
          donor: n?.detail?.Donor || n?.detail?.donor_ID || "",
          modality: n?.detail?.modality || n?.detail?.Modality || "",
        }));
      return {
        rows,
        summary: {
          nodeType: rawType || "ALL",
          totalMatched: matched.length,
          returned: rows.length,
          query: query || "",
        },
      };
    }
    case "impact_downstream": {
      const entityInput = params.entityId || params.nodeId || params.query || params.donorCode || "";
      const donorCode = normalizeDonorCode(entityInput);
      const startNode =
        (donorCode ? resolveNode(donorCode) || resolveNode(`donor_${donorCode.toLowerCase().replace("-", "_")}`) : null) ||
        resolveNode(entityInput);
      if (!startNode) {
        return { rows: [], summary: { found: false, entity: String(entityInput || "") } };
      }
      const isDonor = String(startNode.id || "").startsWith("donor_hpap_");
      const sampleIds = new Set();
      const addSample = (sid) => {
        const n = NODES.find((x) => x.id === sid);
        if (n && String(n.type) === "RawData") sampleIds.add(sid);
      };
      if (isDonor) {
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === startNode.id)
          .forEach((e) => addSample(edgeTgtId(e)));
      } else if (String(startNode.type) === "RawData") {
        addSample(startNode.id);
      } else if (String(startNode.type) === "ProcessedData") {
        // If dataset is the entry, use all its member samples.
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === startNode.id)
          .forEach((e) => addSample(edgeTgtId(e)));
      } else if (String(startNode.type) === "Pipeline" || String(startNode.type) === "QCPipeline") {
        // If pipeline is the entry, directly include datasets generated by this pipeline.
        // This enables Pipeline -> ProcessedData -> Model -> DownstreamTask impact propagation.
        // We still allow later logic to expand to split/parent datasets via DERIVED_FROM.
      }

      // Dataset closure only from anchor samples (prevents cross-donor sample fan-out).
      const datasetIds = new Set();
      sampleIds.forEach((sid) => {
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sid)
          .forEach((e) => {
            const dsId = edgeSrcId(e);
            const dsNode = NODES.find((n) => n.id === dsId);
            if (dsNode && String(dsNode.type) === "ProcessedData") datasetIds.add(dsId);
          });
      });
      if (String(startNode.type) === "ProcessedData") datasetIds.add(startNode.id);
      if (String(startNode.type) === "Pipeline" || String(startNode.type) === "QCPipeline") {
        EDGES
          .filter((e) => (e.label === "GENERATED_BY" || e.label === "WAS_GENERATED_BY") && edgeSrcId(e) === startNode.id)
          .forEach((e) => {
            const dsId = edgeTgtId(e);
            const dsNode = NODES.find((n) => n.id === dsId);
            if (dsNode && String(dsNode.type) === "ProcessedData") datasetIds.add(dsId);
          });
      }

      // Include split/parent dataset variants along DERIVED_FROM links.
      let changed = true;
      while (changed) {
        changed = false;
        EDGES
          .filter((e) => e.label === "DERIVED_FROM")
          .forEach((e) => {
            const a = edgeSrcId(e);
            const b = edgeTgtId(e);
            const aNode = NODES.find((n) => n.id === a);
            const bNode = NODES.find((n) => n.id === b);
            const aIsDs = aNode && String(aNode.type) === "ProcessedData";
            const bIsDs = bNode && String(bNode.type) === "ProcessedData";
            if (!aIsDs || !bIsDs) return;
            if (datasetIds.has(a) && !datasetIds.has(b)) {
              datasetIds.add(b);
              changed = true;
            }
            if (datasetIds.has(b) && !datasetIds.has(a)) {
              datasetIds.add(a);
              changed = true;
            }
          });
      }

      const modelIds = new Set();
      datasetIds.forEach((dsId) => {
        EDGES
          .filter((e) => (e.label === "TRAINED_ON" || e.label === "EVALUATED_ON") && edgeSrcId(e) === dsId)
          .forEach((e) => {
            const mId = edgeTgtId(e);
            const node = NODES.find((n) => n.id === mId);
            if (node && ["Model", "FineTunedModel"].includes(String(node.type))) modelIds.add(mId);
          });
      });

      // Downstream fine-tuned models that depend on impacted models.
      let expanded = true;
      while (expanded) {
        expanded = false;
        EDGES
          .filter((e) => e.label === "FINETUNED_ON")
          .forEach((e) => {
            const ftId = edgeSrcId(e);
            const baseId = edgeTgtId(e);
            const ftNode = NODES.find((n) => n.id === ftId);
            if (!ftNode || !["Model", "FineTunedModel"].includes(String(ftNode.type))) return;
            if (modelIds.has(baseId) && !modelIds.has(ftId)) {
              modelIds.add(ftId);
              expanded = true;
            }
          });
      }

      const taskIds = new Set();
      modelIds.forEach((mId) => {
        EDGES
          .filter((e) => e.label === "ENABLES" && edgeSrcId(e) === mId)
          .forEach((e) => {
            const tId = edgeTgtId(e);
            const node = NODES.find((n) => n.id === tId);
            if (node && String(node.type) === "DownstreamTask") taskIds.add(tId);
          });
      });

      const rows = [
        ...[...sampleIds].map((id) => ({ id, hop: 1, via: "HAD_MEMBER" })),
        ...[...datasetIds].map((id) => ({ id, hop: 2, via: "HAD_MEMBER/DERIVED_FROM" })),
        ...[...modelIds].map((id) => ({ id, hop: 3, via: "TRAINED_ON/EVALUATED_ON/FINETUNED_ON" })),
        ...[...taskIds].map((id) => ({ id, hop: 4, via: "ENABLES" })),
      ]
        .map((r) => {
          const n = NODES.find((x) => x.id === r.id);
          return {
            id: r.id,
            label: labelSingleLine(n?.label || r.id),
            type: n?.type || "Unknown",
            via: r.via,
            hop: r.hop,
          };
        })
        .sort((a, b) => a.hop - b.hop || String(a.label).localeCompare(String(b.label)));

      const modelRows = [...modelIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label) }));
      const inferModality = (datasetNode) => {
        const d = datasetNode?.detail || {};
        const fromDetail =
          d.modality || d.Modality || d["Data modality"] || d.DatasetType || d.dataset_type || "";
        if (String(fromDetail || "").trim()) return String(fromDetail).trim();
        const lbl = labelSingleLine(datasetNode?.label || "");
        const m = lbl.match(/^(.*?)\s+Dataset\s+v/i);
        return m ? m[1].trim() : (lbl || "Unknown");
      };
      const datasetRows = [...datasetIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label), modality: inferModality(n) }));
      const impactedModalities = [...new Set(datasetRows.map((d) => d.modality).filter(Boolean))].sort();
      const taskRows = [...taskIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({ id: n.id, label: labelSingleLine(n.label) }));
      return {
        rows,
        summary: {
          found: true,
          startId: startNode.id,
          startLabel: labelSingleLine(startNode.label),
          reachedCount: rows.length,
          sampleCount: sampleIds.size,
          datasetCount: datasetIds.size,
          impactedDatasets: datasetRows,
          impactedModalities,
          modelCount: modelIds.size,
          taskCount: taskRows.length,
          impactedModels: modelRows.map((m) => m.label),
          impactedTasks: taskRows.map((t) => t.label),
        },
      };
    }
    case "get_neighbors": {
      const seedIds = asArray(params.nodeIds || params.nodeId).map((x) => String(x || "").trim()).filter(Boolean);
      const edgeLabels = asArray(params.edgeLabels || params.edgeTypes);
      const direction = String(params.direction || "both").toLowerCase();
      const depth = Math.max(1, Math.min(Number(params.depth || 1), 2));
      const limit = Math.max(1, Math.min(Number(params.limit || 200), 500));
      if (!seedIds.length) return { rows: [] };
      const visited = new Set(seedIds);
      let frontier = [...seedIds];
      const rows = [];
      for (let hop = 1; hop <= depth && frontier.length && rows.length < limit; hop += 1) {
        const next = new Set();
        frontier.forEach((nodeId) => {
          const outEdges = (direction === "out" || direction === "both")
            ? EDGES.filter((e) => edgeSrcId(e) === nodeId && edgeMatch(e, edgeLabels))
            : [];
          const inEdges = (direction === "in" || direction === "both")
            ? EDGES.filter((e) => edgeTgtId(e) === nodeId && edgeMatch(e, edgeLabels))
            : [];
          [...outEdges, ...inEdges].forEach((e) => {
            if (rows.length >= limit) return;
            const srcId = edgeSrcId(e);
            const tgtId = edgeTgtId(e);
            const fromNode = NODES.find((n) => n.id === srcId);
            const toNode = NODES.find((n) => n.id === tgtId);
            rows.push({
              hop,
              edgeLabel: e.label,
              fromId: srcId,
              fromLabel: labelSingleLine(fromNode?.label || srcId),
              fromType: fromNode?.type,
              toId: tgtId,
              toLabel: labelSingleLine(toNode?.label || tgtId),
              toType: toNode?.type,
            });
            if (!visited.has(tgtId)) next.add(tgtId);
            if (!visited.has(srcId)) next.add(srcId);
          });
        });
        frontier = [...next];
        frontier.forEach((id) => visited.add(id));
      }
      return { rows };
    }
    case "extract_donors": {
      let nodeIds = asArray(
        params.nodeIds || params.nodeId || params.entity_ids || params.entity_id || params.id
      ).map((x) => String(x || "").trim()).filter(Boolean);
      const split = String(params.split || params.dataset_split || params.partition || "training").toLowerCase();
      const normalizedSplit = split.includes("eval") || split.includes("validation") || split.includes("test")
        ? "evaluation"
        : "training";
      const combine = String(params.combine || params.operator || "union").toLowerCase();
      const scope = String(params.scope || "").toLowerCase();
      if (!nodeIds.length && (scope === "all_models" || scope === "all_fms" || scope === "all_fm")) {
        nodeIds = NODES.filter((n) => n.type === "Model").map((n) => n.id);
      }
      if (!nodeIds.length) return { rows: [] };

      const donorSetForNode = (nodeId) => {
        const out = new Set();
        if (donorNodeIds.has(nodeId)) {
          out.add(nodeId);
          return out;
        }
        const node = NODES.find((n) => n.id === nodeId);
        if (!node) return out;
        if (String(node.type) === "Model" || String(node.type) === "FineTunedModel") {
          donorIdsForModelSplit(nodeId, normalizedSplit).forEach((d) => out.add(d));
          return out;
        }
        if (String(node.type) === "ProcessedData") {
          donorIdsForDatasetNode(nodeId, normalizedSplit).forEach((d) => out.add(d));
          return out;
        }
        if (String(node.type) === "RawData") {
          const donorId = donorIdFromSampleId(nodeId);
          if (donorId) out.add(donorId);
          return out;
        }
        // Generic fallback: look for adjacent dataset/model nodes and resolve donors from those.
        EDGES.filter((e) => edgeSrcId(e) === nodeId || edgeTgtId(e) === nodeId).forEach((e) => {
          const otherId = edgeSrcId(e) === nodeId ? edgeTgtId(e) : edgeSrcId(e);
          const otherNode = NODES.find((n) => n.id === otherId);
          if (!otherNode) return;
          if (String(otherNode.type) === "ProcessedData") donorIdsForDatasetNode(otherId, normalizedSplit).forEach((d) => out.add(d));
          if (String(otherNode.type) === "Model" || String(otherNode.type) === "FineTunedModel") {
            donorIdsForModelSplit(otherId, normalizedSplit).forEach((d) => out.add(d));
          }
        });
        return out;
      };

      const sourceSets = nodeIds.map((nid) => ({
        sourceId: nid,
        sourceLabel: labelSingleLine(NODES.find((n) => n.id === nid)?.label || nid),
        donorSet: donorSetForNode(nid),
      }));

      let donorIds = new Set();
      if ((combine === "intersection" || combine === "intersect") && sourceSets.length > 1) {
        donorIds = new Set([...sourceSets[0].donorSet]);
        sourceSets.slice(1).forEach((src) => {
          donorIds = new Set([...donorIds].filter((id) => src.donorSet.has(id)));
        });
      } else {
        sourceSets.forEach((src) => src.donorSet.forEach((id) => donorIds.add(id)));
      }

      const rows = [...donorIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .sort((a, b) => labelSingleLine(a.label).localeCompare(labelSingleLine(b.label)))
        .map((n) => ({
          id: n.id,
          label: labelSingleLine(n.label),
          diseaseTag: diseaseTagFromDonor(n),
        }));
      return {
        rows,
        summary: {
          donorCount: rows.length,
          split: normalizedSplit,
          combine: combine === "intersection" || combine === "intersect" ? "intersection" : "union",
          sourceCount: sourceSets.length,
          sources: sourceSets.map((s) => ({
            sourceId: s.sourceId,
            sourceLabel: s.sourceLabel,
            donorCount: s.donorSet.size,
          })),
        },
      };
    }
    case "donor_attribute_ratio": {
      const split = String(params.split || params.dataset_split || params.partition || "training").toLowerCase();
      const normalizedSplit = split.includes("eval") || split.includes("validation") || split.includes("test")
        ? "evaluation"
        : "training";
      const donorIdsFromParams = asArray(params.donorIds || params.nodeIds || params.ids)
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter((id) => donorNodeIds.has(id));
      let donorIds = donorIdsFromParams;
      if (!donorIds.length) {
        const modelRef = params.modelId || params.model || params.modelAId || "";
        const modelNode = resolveNode(modelRef, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === modelRef);
        if (modelNode) {
          donorIds = [...donorIdsForModelSplit(modelNode.id, normalizedSplit)];
        }
      }
      if (!donorIds.length) {
        const datasetRef = params.datasetId || params.dataset || params.datasetQuery || params.query || "";
        const datasetNode =
          resolveNode(datasetRef, ["ProcessedData"]) ||
          resolveNode(params.modality, ["ProcessedData"]) ||
          null;
        const modality = params.modality || params.datasetType || datasetRef || "";
        const splitDatasetIds = new Set();
        if (datasetNode?.id) {
          if (datasetSplitTag(datasetNode.id) === normalizedSplit) {
            splitDatasetIds.add(datasetNode.id);
          } else {
            const childIds = EDGES
              .filter((e) => e.label === "DERIVED_FROM" && edgeSrcId(e) === datasetNode.id)
              .map((e) => edgeTgtId(e));
            if (childIds.length) {
              childIds
                .filter((cid) => datasetSplitTag(cid) === normalizedSplit)
                .forEach((cid) => splitDatasetIds.add(cid));
            } else {
              splitDatasetIds.add(datasetNode.id);
            }
          }
        }
        datasetIdsForModalityAndSplit(modality, normalizedSplit).forEach((id) => splitDatasetIds.add(id));
        [...splitDatasetIds].forEach((dsId) => donorIdsForDatasetNode(dsId).forEach((d) => donorIds.push(d)));
        donorIds = [...new Set(donorIds)];
      }
      const donorNodesForCalc = donorIds
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean);
      if (!donorNodesForCalc.length) {
        return { rows: [], summary: { totalDonors: 0, matchedDonors: 0, ratio: 0, targetValue: String(params.targetValue || params.target || "") } };
      }

      const targetRaw = String(params.targetValue || params.target || "").trim();
      const targetNorm = normalizeQ(targetRaw);
      const attrRaw = String(params.attribute || params.attributeKey || "").trim().toLowerCase();
      const askType = String(params.askType || "ratio").toLowerCase();
      const classifyEthnicity = (node) => {
        const d = node?.detail || {};
        const parts = [
          d.Ethnicities,
          d.ethnicity,
          d.Ethnicity,
          d.race,
          d.Race,
          d["Genetic Ancestry (PancDB)"],
        ]
          .map((x) => String(x || ""))
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!parts) return "Unknown";
        if (parts.includes("white") || parts.includes("caucasian")) return "White";
        if (parts.includes("black") || parts.includes("african")) return "Black";
        if (parts.includes("asian")) return "Asian";
        if (parts.includes("hispanic") || parts.includes("latino")) return "Hispanic";
        return "Other";
      };
      const classifyDisease = (node) => diseaseTagFromDonor(node);
      const inferMode = (() => {
        if (attrRaw.includes("ethnic") || attrRaw.includes("race") || attrRaw.includes("ancestry")) return "ethnicity";
        if (attrRaw.includes("diagnosis") || attrRaw.includes("disease") || attrRaw.includes("clinical")) return "disease";
        if (!targetNorm) return "disease";
        if (["t1d", "t1dm", "t2d", "t2dm", "nd", "control", "normal", "aab+"].some((x) => targetNorm.includes(x))) return "disease";
        return "ethnicity";
      })();
      const canonicalTarget = (() => {
        if (inferMode === "disease") {
          if (targetNorm.includes("t1d")) return "T1D";
          if (targetNorm.includes("t2d")) return "T2D";
          if (targetNorm.includes("nd") || targetNorm.includes("control") || targetNorm.includes("normal")) return "ND";
          if (targetNorm.includes("aab")) return "AAb+";
          return targetRaw || "Unknown";
        }
        if (targetNorm.includes("white") || targetNorm.includes("caucasian") || targetNorm.includes("白")) return "White";
        if (targetNorm.includes("black") || targetNorm.includes("african") || targetNorm.includes("黑")) return "Black";
        if (targetNorm.includes("asian") || targetNorm.includes("亚")) return "Asian";
        if (targetNorm.includes("hispanic") || targetNorm.includes("latino")) return "Hispanic";
        return targetRaw || "Unknown";
      })();

      const rows = donorNodesForCalc.map((n) => {
        const category = inferMode === "ethnicity" ? classifyEthnicity(n) : classifyDisease(n);
        return {
          id: n.id,
          label: labelSingleLine(n.label),
          value: category,
          matched: String(category).toLowerCase() === String(canonicalTarget).toLowerCase(),
        };
      });
      const total = rows.length;
      const matched = rows.filter((r) => r.matched).length;
      const composition = {};
      rows.forEach((r) => {
        const key = r.value || "Unknown";
        composition[key] = (composition[key] || 0) + 1;
      });
      return {
        rows,
        summary: {
          mode: inferMode,
          askType: askType === "count" ? "count" : (askType === "distribution" ? "distribution" : "ratio"),
          targetValue: canonicalTarget,
          totalDonors: total,
          matchedDonors: matched,
          ratio: total ? matched / total : 0,
          split: normalizedSplit,
          composition,
        },
      };
    }
    case "reclassification_distribution_impact": {
      const split = normalizeSplit(params.split || "training");
      const scopeType = String(params.scopeType || (params.modelId ? "model" : (params.modality ? "modality" : "model"))).toLowerCase();
      const scopeRef = params.scopeRef || params.modelId || params.modality || params.datasetId || "";

      const parseReclassifications = () => {
        const out = {};
        if (params.reclassifications && typeof params.reclassifications === "object" && !Array.isArray(params.reclassifications)) {
          Object.entries(params.reclassifications).forEach(([k, v]) => {
            const code = normalizeDonorCode(k);
            if (!code) return;
            out[code] = String(v || "").trim();
          });
        }
        if (Array.isArray(params.reclassificationList)) {
          params.reclassificationList.forEach((item) => {
            const code = normalizeDonorCode(item?.donorCode || item?.donor || item?.id || "");
            const stage = String(item?.to || item?.newStage || item?.diagnosis || item?.value || "").trim();
            if (code && stage) out[code] = stage;
          });
        }
        const rangeStart = normalizeDonorCode(params.rangeStart || params.startDonor || "");
        const rangeEnd = normalizeDonorCode(params.rangeEnd || params.endDonor || "");
        const rangeTo = String(params.rangeTo || params.toStage || "").trim();
        if (rangeStart && rangeEnd && rangeTo) {
          const a = Number(rangeStart.split("-")[1]);
          const b = Number(rangeEnd.split("-")[1]);
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          for (let i = lo; i <= hi; i += 1) {
            out[`HPAP-${String(i).padStart(3, "0")}`] = rangeTo;
          }
        }
        return out;
      };

      const reclassifications = parseReclassifications();
      const donorIds = [...donorIdsForScope(scopeType, scopeRef, split)];
      const donors = donorIds
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean);
      if (!donors.length) {
        return {
          rows: [],
          summary: { found: false, scopeType, scopeRef: String(scopeRef || ""), split, reclassificationCount: Object.keys(reclassifications).length },
        };
      }

      const beforeCounts = { T1D: 0, ND: 0, "AAb+": 0, T2D: 0, Unknown: 0 };
      const afterCounts = { T1D: 0, ND: 0, "AAb+": 0, T2D: 0, Unknown: 0 };
      const rows = donors.map((dn) => {
        const code = String(labelSingleLine(dn.label)).toUpperCase();
        const beforeTag = diseaseTagFromDonor(dn);
        const afterTag = diseaseTagFromDonor(dn, reclassifications);
        bumpBucket(beforeCounts, beforeTag);
        bumpBucket(afterCounts, afterTag);
        return {
          id: dn.id,
          donorCode: code,
          beforeDiagnosis: beforeTag,
          afterDiagnosis: afterTag,
          changed: beforeTag !== afterTag,
          overrideApplied: Boolean(reclassifications[code]),
        };
      });
      const inScopeOverrideCount = rows.filter((r) => r.overrideApplied).length;
      const changedCount = rows.filter((r) => r.changed).length;
      const total = donors.length;
      const beforeT1D = beforeCounts.T1D || 0;
      const beforeND = beforeCounts.ND || 0;
      const afterT1D = afterCounts.T1D || 0;
      const afterND = afterCounts.ND || 0;
      const beforeT1DRatio = ratio(beforeT1D, total);
      const beforeNDRatio = ratio(beforeND, total);
      const afterT1DRatio = ratio(afterT1D, total);
      const afterNDRatio = ratio(afterND, total);
      const beforeGap = Math.abs(beforeT1DRatio - beforeNDRatio);
      const afterGap = Math.abs(afterT1DRatio - afterNDRatio);
      const balanceTrend =
        afterGap < beforeGap - 0.05
          ? "more_balanced"
          : afterGap > beforeGap + 0.05
            ? "more_imbalanced"
            : "similar_balance";
      const maxClassRatioAfter = Math.max(
        afterT1DRatio,
        afterNDRatio,
        ratio(afterCounts.T2D || 0, total),
        ratio(afterCounts["AAb+"] || 0, total)
      );
      const riskLevel =
        Math.abs(afterT1DRatio - beforeT1DRatio) >= 0.15 || maxClassRatioAfter >= 0.75
          ? "high"
          : Math.abs(afterT1DRatio - beforeT1DRatio) >= 0.08 || maxClassRatioAfter >= 0.6
            ? "medium"
            : "low";

      // Build impact surface for changed donors: donor -> sample -> dataset -> model -> downstream task.
      const changedDonorIds = new Set(rows.filter((r) => r.changed).map((r) => r.id));
      const changedSampleIds = new Set();
      changedDonorIds.forEach((did) => {
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeSrcId(e) === did)
          .forEach((e) => {
            const sid = edgeTgtId(e);
            const sn = NODES.find((n) => n.id === sid);
            if (sn && String(sn.type) === "RawData") changedSampleIds.add(sid);
          });
      });

      const scopeDatasetIds = new Set();
      if (scopeType === "model") {
        const mNode = resolveNode(scopeRef, ["Model", "FineTunedModel"]) || NODES.find((n) => n.id === scopeRef);
        if (mNode) {
          EDGES
            .filter((e) => edgeTgtId(e) === mNode.id && (e.label === "TRAINED_ON" || e.label === "EVALUATED_ON"))
            .forEach((e) => {
              const useSplit = e.label === "TRAINED_ON" ? "training" : "evaluation";
              if (useSplit !== split) return;
              scopeDatasetIds.add(edgeSrcId(e));
            });
        }
      } else if (scopeType === "modality") {
        datasetIdsForModalityAndSplit(scopeRef, split).forEach((id) => scopeDatasetIds.add(id));
      } else if (scopeType === "dataset") {
        const ds = resolveNode(scopeRef, ["ProcessedData"]) || NODES.find((n) => n.id === scopeRef);
        if (ds) {
          if (datasetSplitTag(ds.id) === split) scopeDatasetIds.add(ds.id);
          EDGES
            .filter((e) => e.label === "DERIVED_FROM" && edgeSrcId(e) === ds.id)
            .map((e) => edgeTgtId(e))
            .filter((id) => datasetSplitTag(id) === split)
            .forEach((id) => scopeDatasetIds.add(id));
        }
      }

      const impactedDatasetIds = new Set();
      changedSampleIds.forEach((sid) => {
        EDGES
          .filter((e) => e.label === "HAD_MEMBER" && edgeTgtId(e) === sid)
          .forEach((e) => {
            const dsId = edgeSrcId(e);
            const dsNode = NODES.find((n) => n.id === dsId);
            if (!dsNode || String(dsNode.type) !== "ProcessedData") return;
            if (scopeDatasetIds.size && !scopeDatasetIds.has(dsId)) return;
            impactedDatasetIds.add(dsId);
          });
      });

      const impactedModelMap = new Map();
      impactedDatasetIds.forEach((dsId) => {
        EDGES
          .filter((e) => edgeSrcId(e) === dsId && (e.label === "TRAINED_ON" || e.label === "EVALUATED_ON"))
          .forEach((e) => {
            const useSplit = e.label === "TRAINED_ON" ? "training" : "evaluation";
            const mId = edgeTgtId(e);
            const mn = NODES.find((n) => n.id === mId);
            if (!mn || !["Model", "FineTunedModel"].includes(String(mn.type))) return;
            if (!impactedModelMap.has(mId)) {
              impactedModelMap.set(mId, {
                modelId: mId,
                label: labelSingleLine(mn.label),
                type: mn.type,
                exposureSplits: new Set(),
              });
            }
            impactedModelMap.get(mId).exposureSplits.add(useSplit);
          });
      });

      // Include downstream fine-tuned models derived from directly impacted models.
      let expandFt = true;
      while (expandFt) {
        expandFt = false;
        EDGES
          .filter((e) => e.label === "FINETUNED_ON")
          .forEach((e) => {
            const ftId = edgeSrcId(e);
            const baseId = edgeTgtId(e);
            const ftn = NODES.find((n) => n.id === ftId);
            if (!ftn || !["Model", "FineTunedModel"].includes(String(ftn.type))) return;
            if (!impactedModelMap.has(baseId) || impactedModelMap.has(ftId)) return;
            impactedModelMap.set(ftId, {
              modelId: ftId,
              label: labelSingleLine(ftn.label),
              type: ftn.type,
              exposureSplits: new Set(["derived"]),
            });
            expandFt = true;
          });
      }

      const impactedTaskMap = new Map();
      [...impactedModelMap.keys()].forEach((mId) => {
        EDGES
          .filter((e) => e.label === "ENABLES" && edgeSrcId(e) === mId)
          .forEach((e) => {
            const tid = edgeTgtId(e);
            const tn = NODES.find((n) => n.id === tid);
            if (!tn || String(tn.type) !== "DownstreamTask") return;
            impactedTaskMap.set(tid, { id: tid, label: labelSingleLine(tn.label) });
          });
      });

      const inferModality = (datasetNode) => {
        const d = datasetNode?.detail || {};
        const fromDetail =
          d.modality || d.Modality || d["Data modality"] || d.DatasetType || d.dataset_type || "";
        if (String(fromDetail || "").trim()) return String(fromDetail).trim();
        const lbl = labelSingleLine(datasetNode?.label || "");
        const m = lbl.match(/^(.*?)\s+Dataset\s+v/i);
        return m ? m[1].trim() : (lbl || "Unknown");
      };
      const impactedDatasets = [...impactedDatasetIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .map((n) => ({
          id: n.id,
          label: labelSingleLine(n.label),
          modality: inferModality(n),
        }));
      const impactedModalities = [...new Set(impactedDatasets.map((d) => d.modality).filter(Boolean))].sort();
      const impactedModels = [...impactedModelMap.values()].map((m) => ({
        modelId: m.modelId,
        label: m.label,
        type: m.type,
        exposureSplits: [...m.exposureSplits],
      }));
      const impactedTasks = [...impactedTaskMap.values()];

      return {
        rows: rows.sort((a, b) => a.donorCode.localeCompare(b.donorCode)),
        summary: {
          found: true,
          scopeType,
          scopeRef: String(scopeRef || ""),
          split,
          donorCount: total,
          requestedReclassificationCount: Object.keys(reclassifications).length,
          inScopeOverrideCount,
          changedCount,
          before: {
            counts: beforeCounts,
            t1dRatio: beforeT1DRatio,
            ndRatio: beforeNDRatio,
            t1dToNd: `${beforeT1D}:${beforeND}`,
          },
          after: {
            counts: afterCounts,
            t1dRatio: afterT1DRatio,
            ndRatio: afterNDRatio,
            t1dToNd: `${afterT1D}:${afterND}`,
          },
          shift: {
            t1dDelta: afterT1D - beforeT1D,
            ndDelta: afterND - beforeND,
            t1dRatioDelta: afterT1DRatio - beforeT1DRatio,
            ndRatioDelta: afterNDRatio - beforeNDRatio,
          },
          balance: {
            beforeGap,
            afterGap,
            trend: balanceTrend,
            riskLevel,
          },
          impactedSampleCount: changedSampleIds.size,
          impactedDatasetCount: impactedDatasets.length,
          impactedDatasets,
          impactedModalities,
          impactedModelCount: impactedModels.length,
          impactedModels,
          impactedTaskCount: impactedTasks.length,
          impactedTasks,
          appliedOverrides: reclassifications,
        },
      };
    }
    case "set_operation": {
      const operator = String(params.operator || "intersect").toLowerCase();
      const leftIds = asArray(params.leftIds).map((x) => String(x || "").trim()).filter(Boolean);
      const rightIds = asArray(params.rightIds).map((x) => String(x || "").trim()).filter(Boolean);
      const L = new Set(leftIds);
      const R = new Set(rightIds);
      let out = [];
      if (operator === "union") out = [...new Set([...leftIds, ...rightIds])];
      else if (operator === "diff") out = leftIds.filter((id) => !R.has(id));
      else out = leftIds.filter((id) => R.has(id)); // intersect default
      const rows = out.map((id) => {
        const node = NODES.find((n) => n.id === id);
        return node ? nodeRow(node) : { id, label: id, type: "Unknown", detail: {} };
      });
      return {
        rows,
        summary: {
          operator,
          leftCount: L.size,
          rightCount: R.size,
          resultCount: rows.length,
        },
      };
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

const buildGraphOntologyContext = () => {
  const nodeById = new Map(NODES.map((n) => [n.id, n]));
  const countBy = (items, keyFn) => {
    const out = new Map();
    items.forEach((x) => {
      const k = String(keyFn(x) || "Unknown");
      out.set(k, (out.get(k) || 0) + 1);
    });
    return out;
  };
  const sortedCountLines = (m, limit = 20) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .slice(0, limit)
      .map(([k, v]) => `${k}:${v}`);

  const nodeTypeCounts = countBy(NODES, (n) => n.type);
  const edgeLabelCounts = countBy(EDGES, (e) => e.label);

  const modelNodes = NODES
    .filter((n) => String(n.type) === "Model" || String(n.type) === "FineTunedModel")
    .map((n) => `${n.id} | ${labelSingleLine(n.label)}`)
    .slice(0, 20);

  const datasetLikeNodes = NODES
    .filter((n) => {
      const t = String(n.type || "");
      const id = String(n.id || "");
      const lbl = labelSingleLine(n.label).toLowerCase();
      const isSampleOrDonor = id.startsWith("sample_") || id.startsWith("donor_");
      if (isSampleOrDonor) return false;
      if (t === "ProcessedData") return true;
      if (t === "RawData" && (id.startsWith("cohort_") || lbl.includes("dataset"))) return true;
      return false;
    })
    .map((n) => `${n.id} | ${labelSingleLine(n.label)} | ${n.type}`)
    .slice(0, 30);

  const pipelineNodes = NODES
    .filter((n) => {
      const t = String(n.type || "");
      return t === "Pipeline" || t === "QCPipeline";
    })
    .map((n) => `${n.id} | ${labelSingleLine(n.label)}`)
    .slice(0, 20);

  const donorIdCandidates = NODES
    .map((n) => String(n.id || ""))
    .filter((id) => /^donor[-_]?hpap[-_]?\d{1,3}$/i.test(id));
  const donorLabelCandidates = NODES
    .map((n) => labelSingleLine(n.label))
    .filter((label) => /\bHPAP[-_\s]?\d{1,3}\b/i.test(label));
  const donorPatternLine =
    donorIdCandidates.length || donorLabelCandidates.length
      ? `id_pattern=donor_hpap_### example=${donorIdCandidates[0] || "n/a"} ; label_pattern=HPAP-### example=${(donorLabelCandidates[0] || "").match(/HPAP[-_\s]?\d{1,3}/i)?.[0] || "n/a"}`
      : "not_detected";

  const typedEdges = EDGES
    .map((e) => {
      const srcId = edgeSrcId(e);
      const tgtId = edgeTgtId(e);
      const srcType = String(nodeById.get(srcId)?.type || "Unknown");
      const tgtType = String(nodeById.get(tgtId)?.type || "Unknown");
      const label = String(e.label || "UNKNOWN");
      return { srcId, tgtId, srcType, tgtType, label };
    });
  const transitionCounts = countBy(typedEdges, (e) => `${e.srcType} -${e.label}-> ${e.tgtType}`);
  const outBySourceId = new Map();
  typedEdges.forEach((e) => {
    if (!outBySourceId.has(e.srcId)) outBySourceId.set(e.srcId, []);
    outBySourceId.get(e.srcId).push(e);
  });
  const chain2Counts = new Map();
  typedEdges.forEach((e1) => {
    const outs = outBySourceId.get(e1.tgtId) || [];
    outs.forEach((e2) => {
      const key = `${e1.srcType} -${e1.label}-> ${e1.tgtType} -${e2.label}-> ${e2.tgtType}`;
      chain2Counts.set(key, (chain2Counts.get(key) || 0) + 1);
    });
  });
  const transitionLines = sortedCountLines(transitionCounts, 8);
  const chain2Lines = sortedCountLines(chain2Counts, 8);

  const pathCandidateChecks = [
    {
      name: "RawData -> Pipeline -> ProcessedData -> Model -> DownstreamTask",
      required: [
        ["RawData", "Pipeline"],
        ["Pipeline", "ProcessedData"],
        ["ProcessedData", "Model"],
        ["Model", "DownstreamTask"],
      ],
    },
    {
      name: "Donor/Sample -> Dataset -> Model",
      required: [
        ["RawData", "ProcessedData"],
        ["ProcessedData", "Model"],
      ],
    },
    {
      name: "Dataset -> DatasetCard",
      required: [["ProcessedData", "DatasetCard"]],
    },
    {
      name: "Model -> ModelCard",
      required: [["Model", "ModelCard"]],
    },
  ];
  const typePairSet = new Set(typedEdges.map((e) => `${e.srcType}->${e.tgtType}`));
  const commonPaths = pathCandidateChecks
    .filter((p) => p.required.every(([a, b]) => typePairSet.has(`${a}->${b}`)))
    .map((p) => p.name);

  return [
    "Graph ontology summary (auto-derived from NODES/EDGES):",
    `Node types (${nodeTypeCounts.size}): ${sortedCountLines(nodeTypeCounts, 20).join(", ") || "none"}`,
    `Edge labels (${edgeLabelCounts.size}): ${sortedCountLines(edgeLabelCounts, 20).join(", ") || "none"}`,
    `Known model nodes (${modelNodes.length}):`,
    modelNodes.length ? modelNodes.map((x) => `- ${x}`).join("\n") : "- none",
    `Known dataset/modality-like nodes (${datasetLikeNodes.length}):`,
    datasetLikeNodes.length ? datasetLikeNodes.map((x) => `- ${x}`).join("\n") : "- none",
    `Known pipeline nodes (${pipelineNodes.length}):`,
    pipelineNodes.length ? pipelineNodes.map((x) => `- ${x}`).join("\n") : "- none",
    `Known donor ID pattern: ${donorPatternLine}`,
    "Common graph paths inferred from edge labels:",
    commonPaths.length ? commonPaths.map((x) => `- ${x}`).join("\n") : "- none matched from predefined path families",
    "Top typed transitions:",
    transitionLines.length ? transitionLines.map((x) => `- ${x}`).join("\n") : "- none",
    "Top 2-hop typed chains:",
    chain2Lines.length ? chain2Lines.map((x) => `- ${x}`).join("\n") : "- none",
  ].join("\n");
};

const GRAPH_ONTOLOGY_CONTEXT = buildGraphOntologyContext();

//  AGENT VIEW 
const GRAPH_CONTEXT = `
You are a governance agent for the MAI-T1D (Multimodal AI for Type 1 Diabetes) project knowledge graph.
Do not rely on embedded full-graph text. Always use queryGraph to retrieve evidence.

Graph structure hints:
- Node type semantics and typical properties:
  - Donor: donor-level metadata (clinical_diagnosis, DiseaseStatus, T1D stage, sex, age, Ethnicities/Genetic Ancestry, modality availability flags).
  - RawData (sample-level): sample metadata (donor code, modality, cell/tissue, assay/run-level fields).
  - ProcessedData (dataset-level): processed cohort/dataset identity, version, path/contact, split variants.
  - QCPipeline: pipeline version, path, owner/contact/email.
  - Model / FineTunedModel: model name/version/status, architecture/base model, fine-tune metadata.
  - DatasetCard / ModelCard: governance documentation metadata and linkage.
  - DownstreamTask: enabled application/task nodes.

- Edge direction semantics (treat these as provenance links):
  - Dataset -> Model: TRAINED_ON / EVALUATED_ON
  - Dataset -> Sample: HAD_MEMBER
  - Donor -> Sample: HAD_MEMBER
  - Pipeline -> Dataset: GENERATED_BY
  - Dataset/Model -> Card: DOCUMENTED_BY
  - ModelCard <-> DatasetCard: LINKED_TO
  - Model -> DownstreamTask: ENABLES
  - Embedding -> Model: EMBEDDED_BY
  - FineTunedModel -> BaseModel/Embedding: FINETUNED_ON
  - ParentDataset -> SplitDataset or SourceDataset -> DerivedAsset: DERIVED_FROM

- Upstream/downstream interpretation:
  - Upstream of model means following TRAINED_ON/EVALUATED_ON backwards to datasets, then HAD_MEMBER to samples, then HAD_MEMBER to donors.
  - Downstream of model means following ENABLES to tasks and related documentation links.

- Model aliases (normalize before querying):
  - "sc FM", "sc-fm", "single-cell FM" => model_scfm
  - "protein FM" => model_protein
  - "spatial FM" => model_spatial
  - "genomic FM" => model_genomic

- For questions like "哪些donor同时出现在A和B的训练集中":
  - Prefer donor_overlap_between_models with splitA/splitB set to training.
  - Return donor list + overlap count + each model donor count.
- For questions asking training donors of one/more models:
  - Prefer training_donors_by_models with explicit modelIds.
  - Donor aggregation is UNIQUE UNION across all training input datasets linked to that model.
- For embedding leakage questions:
  - Prefer embedding_leakage_between_models.
  - Use sourceModelId/targetModelId when direction is explicit; otherwise use modelAId/modelBId.
-For reclassification what-if drift questions:
  - Prefer reclassification_distribution_impact with scopeType=model|modality and split.
  - Provide reclassifications as donorCode -> new diagnosis/stage.

Available intents:
- search_nodes
- get_neighbors
- extract_donors
- training_donors_by_models
- training_donor_overlap_between_models
- set_operation
- donor_overlap_between_models
- node_detail
- provenance_chain
- datasets_for_model
- models_for_dataset
- pipeline_for_dataset
- downstream_tasks
- qc_pipeline_for_model_modality
- qc_pipeline_owner
- embedding_leakage_between_models
- reclassification_distribution_impact

Workflow:
1) Plan multi-step retrieval from graph structure.
2) Prefer atomic intents (search_nodes/get_neighbors/extract_donors/set_operation).
3) Use donor_overlap_between_models only when the question is explicitly two-model donor overlap.
4) Answer only from retrieved evidence.
Answer style requirements:
- Return a direct final answer, not your search process.
- Never write phrases like "let me try/search/look up".
- If query results are empty, clearly say no matching records were found in the current graph.
- Keep answers concise and precise for AI researchers.
`;

const INTENT_ENUM = [
  "search_nodes",
  "list_nodes_by_type",
  "get_neighbors",
  "extract_donors",
  "training_donors_by_models",
  "training_donor_overlap_between_models",
  "donor_attribute_ratio",
  "set_operation",
  "donor_overlap_between_models",
  "node_detail",
  "provenance_chain",
  "datasets_for_model",
  "models_for_dataset",
  "pipeline_for_dataset",
  "downstream_tasks",
  "qc_pipeline_for_model_modality",
  "qc_pipeline_owner",
  "embedding_leakage_between_models",
  "reclassification_distribution_impact",
  "impact_downstream",
];

const AGENT_INTENT_GUIDE = `
Intent selection guide (semantic, not keyword matching):

1) datasets_for_model
Purpose: find datasets linked to a model via TRAINED_ON.
Use when: user asks what data/datasets a model used for training/evaluation context.
Do not use when: user asks for model details, donor overlap, or downstream tasks only.
Required params: modelId (preferred canonical id); optional query.
Examples:
- "What datasets were used to train Genomic FM?"
- "Which data inputs does model_scfm use?"
- "Show training datasets for Spatial FM."
Expected result shape: { rows:[{ id, label, type, trainMeta? }] }.

2) models_for_dataset
Purpose: find models connected to a dataset via TRAINED_ON/EVALUATED_ON.
Use when: user asks which models use a dataset/modality.
Do not use when: user asks for QC pipeline ownership or dataset card metadata only.
Required params: datasetId or query/datasetType.
Examples:
- "Which models use scRNA-seq dataset?"
- "What models were trained or evaluated on proc_scrna_v1?"
- "Who uses this dataset downstream?"
Expected result shape: { rows:[{ id, label, type, usage:[...], via:[...] }] }.

3) provenance_chain
Purpose: traverse lineage neighborhood for an entity.
Use when: user asks end-to-end trace/lineage/provenance chain.
Do not use when: user asks a single-hop fact (owner, single list, one relation only).
Required params: one of nodeId/modelId/datasetId/query.
Examples:
- "Show provenance chain for model_genomic."
- "Trace lineage for proc_snmultiomics_v1."
- "What is the end-to-end chain for this node?"
Expected result shape: { rows:[{ id, label, type, depth?, via? }], summary? }.

4) impact_downstream
Purpose: estimate downstream impact from changing an entity (donor/sample/dataset/model).
Use when: user asks what would be affected/impacted downstream by a change.
Do not use when: user asks only overlap or ratio without impact semantics.
Required params: query or entityId/nodeId/donorCode; optional depth.
Examples:
- "If HPAP-010 changes diagnosis, what is impacted downstream?"
- "What models/tasks are affected if proc_bulk_rna_v1 is revised?"
- "Downstream impact of changing this dataset?"
Expected result shape: { rows:[...impacted nodes...], summary:{ found, impactedSampleCount, impactedDatasetCount, impactedModelCount, impactedTaskCount, ... } }.

5) training_donor_overlap_between_models
Purpose: compute donor overlap between two models' training sets.
Use when: user explicitly compares two models' training donor overlap.
Do not use when: user asks generic donor list for one model or non-donor overlap.
Required params: modelAId, modelBId; optional splitA/splitB (defaults training intent).
Examples:
- "How many donors overlap between Genomic FM and Spatial FM training sets?"
- "Shared training donors for model_genomic vs model_scfm?"
- "Compare training donor intersection between two models."
Expected result shape: { rows:[{ id, label, type }], summary:{ modelAId, modelBId, overlapCount, modelADonorCount, modelBDonorCount, overlapRatioA, overlapRatioB } }.

6) donor_overlap_between_models
Purpose: general donor overlap between two model scopes/splits.
Use when: user asks donor overlap but split may vary or wording is generic.
Do not use when: overlap is not donor-based.
Required params: modelAId, modelBId; optional splitA/splitB.
Examples:
- "Donor overlap between Genomic FM and scFM."
- "Shared donors in evaluation splits of two models."
- "Intersection of donor cohorts between these models."
Expected result shape: { rows:[{ id, label, type }], summary:{ overlapCount, splitA, splitB, ... } }.

7) embedding_leakage_between_models
Purpose: analyze potential embedding reuse leakage between source/target models.
Use when: user asks about cross-model embedding leakage/reuse risk.
Do not use when: user asks ordinary donor overlap without embedding semantics.
Required params: modelAId/modelBId or sourceModelId/targetModelId; optional sourceSplit/targetTrainSplit/targetUseSplit/requireEmbeddingUsage.
Examples:
- "Is there embedding leakage from scFM to Genomic FM?"
- "Cross-model embedding reuse risk between model_scfm and model_genomic?"
- "Which donors could leak via embeddings across two models?"
Expected result shape: { rows:[{ id, label, type }], summary:{ leakageDonorCount, directionCount, directions:[...], ... } }.

8) reclassification_distribution_impact
Purpose: simulate donor diagnosis/stage reclassification impact on distribution balance.
Use when: user asks what-if reclassification effects on ratios/distribution.
Do not use when: user asks only current static ratio without hypothetical change.
Required params: scopeType (model|modality|dataset|donor_set), scopeRef, split; reclassification inputs (rangeStart/rangeEnd/rangeTo or donorReclassifications list).
Examples:
- "If HPAP-010 to HPAP-020 become T1D, how does Genomic FM training distribution change?"
- "What happens to donor balance if these donors are reclassified to ND?"
- "Impact on T1D:ND ratio after donor reclassification in scRNA modality."
Expected result shape: { rows:[{ donorId, donorCode, oldTag, newTag, changed }], summary:{ before, after, shift, donorCount, changedCount, impactedModels?, impactedTasks?, ... } }.

9) donor_attribute_ratio
Purpose: compute donor attribute count/ratio/distribution (diagnosis or ethnicity).
Use when: user asks proportion/count/distribution for donor attributes in a scope.
Do not use when: user asks model-dataset linkage, provenance chain, or node owner.
Required params: either donorIds or modelId (or other scope fields supported by queryGraph); attribute/targetValue; optional askType and split.
Examples:
- "What proportion of T1D donors are in Genomic FM training set?"
- "How many ND donors are in this donor set?"
- "Diagnosis distribution for donors used here."
Expected result shape: { rows:[{ id, label, type, ... }], summary:{ totalDonors, matchedDonors, ratio, composition, mode, askType, split } }.

10) pipeline_for_dataset
Purpose: map dataset to producing pipeline (GENERATED_BY/WAS_GENERATED_BY).
Use when: user asks which pipeline produced a dataset.
Do not use when: user asks who owns a pipeline version family without dataset anchor.
Required params: datasetId or query.
Examples:
- "Which pipeline produced proc_scrna_v1?"
- "What QC pipeline generated this dataset?"
- "Pipeline lineage for scRNA dataset."
Expected result shape: { rows:[{ id, label, detail }] }.

11) qc_pipeline_for_model_modality
Purpose: find QC pipeline(s) in the training lineage for model + modality context.
Use when: user asks model-specific QC lineage by modality.
Do not use when: user only asks model training datasets or generic pipeline inventory.
Required params: modelId; optional modality and split.
Examples:
- "What QC pipeline produced scRNA used by Genomic FM?"
- "QC lineage for model_scfm with snMultiomics."
- "Which QC pipeline is upstream of this model's training data?"
Expected result shape: { rows:[{ datasetId, datasetLabel, pipelineId, pipelineLabel, pipelineDetail }], summary:{ modelId, modality?, trainingLinked } }.

12) qc_pipeline_owner
Purpose: retrieve owner/contact metadata for QC pipeline(s), optionally by version query.
Use when: user asks who is responsible/contact/email for a pipeline.
Do not use when: user asks dataset-model relation without owner/contact request.
Required params: query (pipeline name/version text) and/or pipelineId.
Examples:
- "Who is responsible for scRNA QC pipeline v1?"
- "Contact for qc_bulk_rna pipeline?"
- "Owner and email of this QC workflow."
Expected result shape: { rows:[{ pipelineId, pipelineLabel, version, contact, email }], summary? }.

13) node_detail
Purpose: return detailed properties of a specific node.
Use when: user asks owner/contact/path/version/status or rich metadata of an entity.
Do not use when: user asks relationship traversal across graph.
Required params: nodeId (preferred) or resolvable query.
Examples:
- "Show details for model_genomic."
- "What is the status/version/contact of dc_scrna_v1?"
- "Give full metadata for qc_scatac."
Expected result shape: { rows:[{ id, label, type, detail:{...} }] }.

14) search_nodes
Purpose: broad fuzzy lookup to find candidate entities by id/label/text.
Use when: entity is ambiguous, unknown, or first-step grounding is needed.
Do not use when: intent-specific structured query is already clear.
Required params: query; optional preferredTypes, limit.
Examples:
- "Find nodes related to HPAP-010."
- "Search for Genomic FM entities."
- "Locate scRNA dataset node."
Expected result shape: { rows:[{ id, label, type, score, matchedBy:[...], detailPreview:{...} }] }.
`;

const AGENT_TOOLS = [
  { name:"queryGraph", description:"Execute a structured read-only query against the MAI-T1D provenance graph. Choose intent from semantic fit using user question plus graph context.",
    input_schema:{ type:"object", properties:{
      intent:{
        type:"string",
        enum:INTENT_ENUM,
        description:`Query intent to execute.

Use this intent catalog to pick the best operation:
${AGENT_INTENT_GUIDE}

If multiple intents seem plausible, choose the most specific one that directly matches the user's analytical goal and expected result shape.`
      },
      params:{
        type:"object",
        description:"Intent parameters. Prefer canonical IDs (modelId, datasetId, nodeId, donorCode) when available; otherwise use compact query text. Include split/scope fields when the question implies training/evaluation or what-if scope."
      }
    }, required:["intent","params"] }
  }
];

const SUGGESTIONS = [
  "Which models are downstream of HPAP-002?",
  "Which donors appear in both the Genomic FM and Spatial FM training sets?",
  "Among donors used to train both the Genomic FM and Spatial FM, what is the proportion of T1D patients?",
  "What QC pipeline produced scRNA for Genomic FM",
  "Who is responsible for the scRNA QC pipeline v1?",
];

const normalizeQ = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const qHas = (text = "", term = "") => {
  const t = normalizeQ(text);
  const k = normalizeQ(term);
  if (!t || !k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\b|\\s|_)${escaped}(\\b|\\s|_|$)`, "i").test(t) || t.indexOf(k) >= 0;
};
const qHasAny = (text = "", terms = []) => terms.some((x) => qHas(text, x));
const qHasAll = (text = "", terms = []) => terms.every((x) => qHas(text, x));
const normalizeSearchText = (s = "") =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const levenshteinDistance = (a = "", b = "") => {
  const x = String(a || "");
  const y = String(b || "");
  const m = x.length;
  const n = y.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};
const fuzzyAliasScore = (question = "", alias = "") => {
  const q = normalizeSearchText(question);
  const a = normalizeSearchText(alias);
  if (!q || !a) return 0;
  if (qHas(q, a)) return 1;
  const qTokens = q.split(" ").filter(Boolean);
  const aTokens = a.split(" ").filter(Boolean);
  if (!qTokens.length || !aTokens.length) return 0;
  const lens = [Math.max(1, aTokens.length - 1), aTokens.length, aTokens.length + 1];
  let best = 0;
  for (const winLen of lens) {
    if (winLen > qTokens.length) continue;
    for (let i = 0; i <= qTokens.length - winLen; i += 1) {
      const window = qTokens.slice(i, i + winLen).join(" ");
      const dist = levenshteinDistance(window, a);
      const denom = Math.max(window.length, a.length) || 1;
      const score = 1 - dist / denom;
      if (score > best) best = score;
    }
  }
  return Math.max(0, Math.min(1, best));
};
const MODEL_ALIAS_DICTIONARY = {
  model_genomic: [
    "genomic fm",
    "geonomic fm",
    "genomicfm",
    "geonomicfm",
    "epcot",
    "epcot v2",
    "epcot-v2",
    "genomic foundation model",
  ],
  model_scfm: [
    "single-cell fm",
    "single cell fm",
    "singlecell fm",
    "scfm",
    "sc fm",
    "sc-fm",
    "epiagent",
  ],
  model_spatial: [
    "spatial fm",
    "kronos",
    "spatial foundation model",
  ],
  model_spatial_omics: [
    "spatial omics fm",
    "spatialomics fm",
    "spatial omics foundation model",
  ],
  model_protein: [
    "protein fm",
    "proteinfm",
    "protein foundation model",
  ],
};
const MODEL_FAMILY_RULES = [
  { ids: ["model_scfm"], aliases: ["scfm", "sc fm", "single-cell fm", "single cell fm", "epiagent"] },
  { ids: ["model_genomic"], aliases: ["genomic fm", "geonomic fm", "epcot"] },
  { ids: ["model_spatial"], aliases: ["spatial fm", "kronos"] },
  { ids: ["model_spatial_omics"], aliases: ["spatial omics fm"] },
  { ids: ["model_protein"], aliases: ["protein fm"] },
];
const MODEL_CANDIDATE_THRESHOLD = 0.74;
const extractVersionTag = (text = "") => {
  const m = String(text || "").toLowerCase().match(/\bv\s*([0-9]+(?:\.[0-9]+)*)\b/);
  return m ? `v${m[1]}` : "";
};
const canonicalizeVersionTag = (tag = "") => {
  const t = String(tag || "").toLowerCase().trim();
  if (!t) return "";
  const m = t.match(/^v\s*([0-9]+(?:\.[0-9]+)*)$/);
  if (!m) return t.replace(/\s+/g, "");
  const parts = m[1].split(".").map((x) => String(Number(x)));
  while (parts.length > 1 && parts[parts.length - 1] === "0") parts.pop();
  return `v${parts.join(".")}`;
};
const versionMatches = (requested = "", actual = "") => {
  if (!requested || !actual) return false;
  return canonicalizeVersionTag(requested) === canonicalizeVersionTag(actual);
};
const modelIdsMentionedByFamilyAlias = (text = "") => {
  const q = normalizeSearchText(text);
  if (!q) return [];
  const ids = new Set();
  MODEL_FAMILY_RULES.forEach((rule) => {
    const hit = rule.aliases.some((alias) => qHas(q, normalizeSearchText(alias)) || q.includes(normalizeSearchText(alias)));
    if (hit) rule.ids.forEach((id) => ids.add(id));
  });
  return [...ids];
};
const modelVersionTag = (node) => {
  if (!node) return "";
  const fromDetail = extractVersionTag(node?.detail?.Version || node?.detail?.version || "");
  if (fromDetail) return fromDetail;
  return extractVersionTag(labelSingleLine(node?.label || ""));
};
const resolveModelIdFromText = (raw = "") => {
  const input = String(raw || "").trim();
  if (!input) return "";
  const ref = input.toLowerCase().replace(/\s+/g, "");
  const aliasToModelId = {
    model_proteinfm: "model_protein",
    proteinfm: "model_protein",
    protein_fm: "model_protein",
    model_scfm: "model_scfm",
    scfm: "model_scfm",
    sc_fm: "model_scfm",
    model_genomic: "model_genomic",
    model_genomicfm: "model_genomic",
    model_genomic_fm: "model_genomic",
    genomicfm: "model_genomic",
    geonomicfm: "model_genomic",
    geonomic_fm: "model_genomic",
    model_spatial: "model_spatial",
    spatialfm: "model_spatial",
    model_spatial_omics: "model_spatial_omics",
  };
  const normalizedRef = aliasToModelId[ref] || input;
  const byRef = NODES.find((n) => n.id === normalizedRef && n.type === "Model");
  if (byRef) return byRef.id;
  const modelNodes = NODES.filter((n) => n.type === "Model");
  const exactByLabel = modelNodes.find((n) => normalizeSearchText(labelSingleLine(n.label)) === normalizeSearchText(input));
  if (exactByLabel) return exactByLabel.id;
  const requestedVersion = extractVersionTag(input);
  const requestedFamilies = modelIdsMentionedByFamilyAlias(input);

  const candidates = [];
  for (const node of modelNodes) {
    if (requestedFamilies.length && !requestedFamilies.includes(node.id)) continue;
    const nodeVer = modelVersionTag(node);
    if (requestedVersion && nodeVer && !versionMatches(requestedVersion, nodeVer)) continue;
    if (requestedVersion && !nodeVer) continue;
    const aliases = new Set([
      labelSingleLine(node.label),
      node.id,
      ...(MODEL_ALIAS_DICTIONARY[node.id] || []),
    ]);
    let best = 0;
    let matchedAlias = "";
    for (const alias of aliases) {
      const score = fuzzyAliasScore(input, alias);
      if (score > best) {
        best = score;
        matchedAlias = alias;
      }
    }
    if (best >= MODEL_CANDIDATE_THRESHOLD) {
      candidates.push({
        id: node.id,
        label: labelSingleLine(node.label),
        version: modelVersionTag(node) || "",
        score: best,
        alias: matchedAlias,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.id || "";
};
const linkModelEntities = (question = "", { threshold = MODEL_CANDIDATE_THRESHOLD, maxCandidates = 6 } = {}) => {
  const modelNodes = NODES.filter((n) => n.type === "Model");
  const qLower = String(question || "").toLowerCase();
  const globalRequestedVersion = extractVersionTag(question);
  const requestedFamilies = modelIdsMentionedByFamilyAlias(question);
  const requestedVersionByModel = {};
  for (const rule of MODEL_FAMILY_RULES) {
    let ver = "";
    for (const a of rule.aliases) {
      const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${escaped}\\s*[- ]?v\\s*([0-9]+(?:\\.[0-9]+)*)`, "i");
      const m = qLower.match(re);
      if (m?.[1]) {
        ver = `v${m[1]}`;
        break;
      }
    }
    if (ver) {
      rule.ids.forEach((id) => {
        requestedVersionByModel[id] = ver;
      });
    }
  }
  const ranked = [];
  for (const node of modelNodes) {
    if (requestedFamilies.length && !requestedFamilies.includes(node.id)) continue;
    const requestedVersion = requestedVersionByModel[node.id] || globalRequestedVersion || "";
    const nodeVer = modelVersionTag(node);
    if (requestedVersion && nodeVer && !versionMatches(requestedVersion, nodeVer)) continue;
    if (requestedVersion && !nodeVer) continue;
    const aliases = new Set([
      labelSingleLine(node.label),
      node.id,
      ...(MODEL_ALIAS_DICTIONARY[node.id] || []),
    ]);
    let best = 0;
    let matchedAlias = "";
    for (const alias of aliases) {
      const score = fuzzyAliasScore(question, alias);
      if (score > best) {
        best = score;
        matchedAlias = alias;
      }
    }
    if (best >= threshold) {
      ranked.push({
        id: node.id,
        label: labelSingleLine(node.label),
        version: nodeVer || "",
        score: best,
        alias: matchedAlias,
      });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, maxCandidates);
};
const normalizeDonorCode = (raw = "") => {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) return null;
  const m = text.match(/HPAP[-_\s]?(\d{1,3})/);
  if (!m) return null;
  return `HPAP-${m[1].padStart(3, "0")}`;
};
const extractJsonFromText = (text = "") => {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {}
  }
  return null;
};
const normalizePlannedQueries = (queries) => {
  if (!Array.isArray(queries)) return [];
  return queries
    .slice(0, 3)
    .map((q, idx) => {
      const intent = String(q?.intent || "").trim();
      const params = q?.params && typeof q.params === "object" ? q.params : {};
      if (!INTENT_ENUM.includes(intent)) return null;
      return { id: `plan-${idx + 1}`, name: "queryGraph", input: { intent, params } };
    })
    .filter(Boolean);
};
const AGENT_PLANNER_SYSTEM = `
You are a routing/planning module for MAI-T1D governance queries.
Return JSON only with this schema:
{
  "mode":"single|multi|clarify",
  "confidence": 0.0,
  "queries":[{"intent":"...", "params":{}}],
  "clarify_question":"..."
}
Rules:
- Use only intents from this list: ${INTENT_ENUM.join(", ")}.
- Choose "single" if one query is enough; "multi" for at most 3 sequential queries.
- If user question is ambiguous, return mode "clarify" with one concise clarify_question.
- Never include prose outside JSON.
`;
const LANGGRAPH_MAX_STEPS = 6;
const AGENT_LANGGRAPH_PLANNER_SYSTEM = `
You are the planner node in a LangGraph-style governance agent.
You must decide the NEXT action only (one step at a time).

Return JSON only with schema:
{
  "mode":"tool|answer|clarify",
  "intent":"optional intent string",
  "params":{},
  "answer":"final answer when mode=answer",
  "clarify_question":"question when mode=clarify",
  "confidence":0.0
}

Planning process:
1) Infer the governance task from the user question.
2) Select the best queryGraph intent by matching the task to intent/tool descriptions and expected result shape.
3) Use linked_entities and prior evidence to fill canonical IDs and scope.
4) If the user mentions an entity but exact graph ID is unclear, ambiguous, or unresolved, you MUST choose search_nodes first before a final governance intent.
5) Prefer high-level governance intents over low-level graph traversal when a high-level intent directly fits.

Available intents: ${INTENT_ENUM.join(", ")}

Intent and parameter guide:
${AGENT_INTENT_GUIDE}

Current graph ontology/context (auto-derived):
${GRAPH_ONTOLOGY_CONTEXT}

Decision policy:
- Use previous tool results (evidence) before issuing another query; avoid redundant repeats.
- If entity resolution is uncertain at the current step, run search_nodes first; do not skip directly to a final governance intent.
- Choose high-level intents when they can answer directly (for example datasets_for_model, models_for_dataset, impact_downstream, qc_pipeline_for_model_modality, qc_pipeline_owner, donor_attribute_ratio, reclassification_distribution_impact, embedding_leakage_between_models).
- Use low-level intents (get_neighbors, set_operation, extract_donors) only when high-level intents cannot directly satisfy the task or when decomposition is required.
- For entity-centric metadata questions, retrieve node_detail after entity resolution.
- For model-targeted intents, use canonical modelId when available from linked_entities or prior evidence.
- Use "tool" when another query is needed.
- Use "answer" only when evidence is sufficient to answer faithfully.
- Use "clarify" only when a required constraint/entity cannot be reasonably inferred.
- Never output non-JSON text.
`;
const AGENT_LANGGRAPH_ANSWER_SYSTEM = `
You are the answer node in a LangGraph-style governance agent.
Use only provided tool evidence to answer.
If evidence is insufficient, explicitly say what is missing in the current graph.
Do not describe internal reasoning steps.
Always answer in English.

When evidence includes "reclassification_distribution_impact":
- Prefer an analysis-style answer over rigid template text.
- Clearly explain:
  1) before distribution (counts + ratios),
  2) after distribution (counts + ratios),
  3) concrete deltas (count and percentage-point),
  4) why requested overrides may be larger than actually changed donors.
- Add a balance-focused interpretation (e.g., more balanced vs more imbalanced).
- If evidence includes impacted modalities/models/tasks, include a prioritized adjustment list.
`;
const extractModelMentions = (q) => {
  return linkModelEntities(q).map((x) => x.id);
};
const detectSplitFromQuestion = (q = "") => {
  const s = normalizeQ(q);
  if (qHasAny(s, ["evaluation", "eval", "validation", "test set", "testing", "测试集", "验证集"])) return "evaluation";
  return "training";
};
const OVERLAP_TOKENS = ["overlap", "shared", "intersection", "intersect", "交集", "重合", "同时", "共同"];
const hasOverlapSignal = (q = "") => qHasAny(q, OVERLAP_TOKENS);
const hasMultiModelSignal = (q = "") => extractModelMentions(q).length >= 2;
const NODE_TYPE_ALIASES = [
  { nodeType: "RawData", aliases: ["raw data", "rawdata", "原始数据", "sample", "样本"] },
  { nodeType: "ProcessedData", aliases: ["dataset", "processed data", "处理后数据", "数据集"] },
  { nodeType: "Model", aliases: ["model", "fm", "foundation model", "模型"] },
  { nodeType: "QCPipeline", aliases: ["pipeline", "qc", "流程"] },
  { nodeType: "DatasetCard", aliases: ["dataset card"] },
  { nodeType: "ModelCard", aliases: ["model card"] },
];
const detectNodeTypeFromQuestion = (q = "") => {
  const s = normalizeQ(q);
  for (const item of NODE_TYPE_ALIASES) {
    if (qHasAny(s, item.aliases)) return item.nodeType;
  }
  return "";
};
const parseInventoryRequest = (q = "") => {
  const s = normalizeQ(q);
  const isPipelineQuestion = qHasAny(s, ["pipeline", "qc", "produced", "生成", "流程"]);
  if (isPipelineQuestion) return null;
  const isDonorQuestion = qHasAny(s, ["donor", "donors", "供体", "训练集", "training set", "training donors"]);
  if (isDonorQuestion) return null;
  const asksList = qHasAny(s, ["what", "which", "list", "哪些", "有哪些", "show", "列出"]);
  const nodeType = detectNodeTypeFromQuestion(s);
  const hasModelContext = qHasAny(s, ["model", "fm", "foundation model", "模型", "scfm", "genomic fm", "spatial fm", "protein fm"]);
  // Do not treat model-specific dataset questions as generic inventory listing.
  if (hasModelContext && nodeType === "ProcessedData") return null;
  if (!asksList || !nodeType) return null;
  const donorCode = (String(q).toUpperCase().match(/HPAP[-_\s]?\d{1,3}/)?.[0] || "").replace(/[_\s]/g, "-");
  const query = donorCode || (qHas(s, "hpap") ? "hpap" : "");
  return { nodeType, query };
};

const parseImpactRequest = (q = "") => {
  const s = normalizeQ(q);
  const looksLikeReclassWhatIf =
    qHasAny(s, ["if", "如果", "what if", "假如"]) &&
    qHasAny(s, ["become", "变成", "reclass", "reclassification", "改成"]) &&
    qHasAny(s, ["ratio", "比例", "distribution", "drift", "分布"]);
  if (looksLikeReclassWhatIf) return null;
  const asksImpact = qHasAny(s, ["影响", "impact", "impacted", "downstream", "下游", "变更", "修改", "更新"]);
  if (!asksImpact) return null;
  const donorCode = normalizeDonorCode(q);
  const raw = String(q || "").trim();
  const extractEntitySpan = () => {
    const scoped =
      raw.match(/\b(?:in|of|for|on|after)\s+([A-Za-z0-9_+\-\/().\s]{3,}?\b(?:dataset|data|model|pipeline)\b(?:\s*v?\d+(?:\.\d+)*)?)/i)?.[1] ||
      raw.match(/([A-Za-z0-9_+\-\/().\s]{3,}?\b(?:dataset|model|pipeline)\b(?:\s*v?\d+(?:\.\d+)*)?)/i)?.[1] ||
      "";
    return String(scoped || "").trim();
  };
  const entitySpan = extractEntitySpan();
  return {
    entityQuery: donorCode || entitySpan || raw,
    depth: qHasAny(s, ["all", "全部", "all downstream"]) ? 8 : 6,
  };
};
const parseDonorAttributeTargetFromQuestion = (q = "") => {
  const s = normalizeQ(q);
  const asksRatio = qHasAny(s, ["ratio", "比例", "占比", "percent", "percentage"]);
  const asksCount = qHasAny(s, ["how many", "count", "多少", "几位", "几人", "数量", "number of"]);
  const asksDistribution = qHasAny(s, ["distribution", "distributions", "composition", "breakdown", "分布", "构成", "组成"]);
  const asksDonor = qHasAny(s, ["donor", "donors", "供体"]);
  const asksDatasetLike = qHasAny(s, ["dataset", "data", "modality", "数据集", "数据", "scrna", "single-cell", "single cell", "sc rna"]);
  const asksStats = asksRatio || asksCount || asksDistribution;
  if (!asksStats || !(asksDonor || asksDatasetLike)) return { needsAttributeStats: false, askType: "ratio" };
  const askType = asksDistribution ? "distribution" : (asksCount && !asksRatio ? "count" : "ratio");
  const hasT1D = qHasAny(s, ["t1d", "t1dm"]);
  const hasT2D = qHasAny(s, ["t2d", "t2dm"]);
  const hasND = qHasAny(s, ["nd", "control", "normal"]);
  const hasAAb = qHasAny(s, ["aab", "aab+"]);
  const diseaseSignalCount = [hasT1D, hasT2D, hasND, hasAAb].filter(Boolean).length;
  if (diseaseSignalCount >= 2) {
    return { needsAttributeStats: true, askType: "distribution", mode: "disease", targetValue: "" };
  }
  if (hasT1D) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "T1D" };
  if (hasT2D) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "T2D" };
  if (hasND) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "ND" };
  if (hasAAb) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "AAb+" };
  if (qHasAny(s, ["white", "caucasian", "白人", "白"])) return { needsAttributeStats: true, askType, mode: "ethnicity", targetValue: "White" };
  if (qHasAny(s, ["black", "african", "黑人", "黑"])) return { needsAttributeStats: true, askType, mode: "ethnicity", targetValue: "Black" };
  if (qHasAny(s, ["asian", "亚裔", "亚洲"])) return { needsAttributeStats: true, askType, mode: "ethnicity", targetValue: "Asian" };
  if (qHasAny(s, ["hispanic", "latino", "拉丁"])) return { needsAttributeStats: true, askType, mode: "ethnicity", targetValue: "Hispanic" };
  // If user asks diagnosis distribution without explicit category, default to disease mode.
  if (qHasAny(s, ["diagnosis", "diagnoses", "clinical diagnosis", "临床诊断", "诊断", "disease"])) {
    return { needsAttributeStats: true, askType, mode: "disease", targetValue: "" };
  }
  return { needsAttributeStats: true, askType, mode: "disease", targetValue: "" };
};

const getForcedToolUses = (userMsg) => {
  // Intentionally disabled: no brittle hardcoded keyword->intent mapping.
  // Let planner decide via graph-structure-aware multi-step retrieval.
  void userMsg;
  return [];
};

const hasCjk = (s = "") => /[\u3400-\u9FFF]/.test(String(s || ""));
const formatIntentAnswer = (intent, params, result, context = {}) => {
  const question = String(context?.question || "");
  void question;
  const preferEnglish = true;
  const rows = result?.rows || [];
  if (
    !rows.length &&
    intent !== "shared_donors_three_fms" &&
    intent !== "training_donor_overlap_between_models" &&
    intent !== "donor_overlap_between_models" &&
    intent !== "governance_events_by_period" &&
    intent !== "qc_pipeline_for_model_modality" &&
    intent !== "models_need_reeval_after_donor_qc" &&
    intent !== "qc_pipeline_owner" &&
    intent !== "reclassification_distribution_impact" &&
    intent !== "institution_datasets_used_after_year"
    && intent !== "impact_downstream"
  ) {
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
      return rows
        .map((r) => {
          const detail = r?.detail && typeof r.detail === "object" ? r.detail : {};
          const version = detail.Version || detail.version || "";
          const contact = detail.Contact || detail.Owner || detail.contact || detail.owner || "";
          const email = detail.Email || detail.email || "";
          const datasetLabel = r?.datasetLabel || r?.inputDatasetId || r?.datasetId || "Unknown dataset";
          const pipelineLabel = r?.label || r?.id || "Unknown pipeline";
          return [
            `Dataset: ${datasetLabel}`,
            `Pipeline: ${pipelineLabel}`,
            version
              ? `Version: ${version}`
              : "Version: version is not available in the current demo graph",
            contact ? `Owner/Contact: ${contact}` : "",
            email ? `Email: ${email}` : "",
          ].filter(Boolean).join("\n");
        })
        .join("\n\n");
    case "downstream_tasks":
      return `Found ${rows.length} downstream task(s):\n${rows.map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    case "compliance_status": {
      const hold = rows.filter((r) => String(r.compliance_hold).toLowerCase() === "true");
      return `Models checked: ${rows.length}. Compliance hold: ${hold.length}.`;
    }
    case "provenance_chain":
      return `Provenance chain contains ${rows.length} node(s):\n${rows.slice(0, 20).map((r, i) => `${i + 1}. ${r.label} [${r.type}]`).join("\n")}`;
    case "node_detail":
      return rows
        .map((r) => {
          const detail = r?.detail && typeof r.detail === "object" ? r.detail : {};
          const idLower = String(r?.id || "").toLowerCase();
          const typeLower = String(r?.type || "").toLowerCase();
          const labelUpper = String(r?.label || "").toUpperCase();
          const looksDonor =
            idLower.startsWith("donor_hpap_") ||
            typeLower === "donor" ||
            /\bHPAP[-_\s]?\d{1,3}\b/.test(labelUpper);
          const pickValue = (keys = []) => {
            for (const k of keys) {
              const hit = Object.entries(detail).find(([kk]) => String(kk).toLowerCase() === String(k).toLowerCase());
              if (hit && String(hit[1] ?? "").trim() !== "") return hit[1];
            }
            return "";
          };
          const modalityAvailable = (() => {
            const known = [
              "scRNA", "scATAC", "snMultiomics", "Histology", "CODEX", "IMC", "CITE-seq",
              "Flow Cytometry", "CyTOF", "BCR", "TCR", "Oxygen", "WGS", "Bulk RNA", "Bulk ATAC",
            ];
            const yesLike = (v) => {
              const s = String(v || "").toLowerCase();
              return ["yes", "true", "available", "present", "1", "y"].some((x) => s === x || s.includes(x));
            };
            const out = [];
            Object.entries(detail).forEach(([k, v]) => {
              const key = String(k || "");
              const keyLower = key.toLowerCase();
              if (keyLower.includes("modality") || keyLower.includes("available")) {
                if (yesLike(v)) out.push(key);
                if (!yesLike(v) && String(v || "").trim()) {
                  const text = String(v || "");
                  known.forEach((m) => {
                    if (text.toLowerCase().includes(m.toLowerCase())) out.push(m);
                  });
                }
              } else {
                known.forEach((m) => {
                  if (keyLower.includes(m.toLowerCase()) && yesLike(v)) out.push(m);
                });
              }
            });
            return [...new Set(out)].slice(0, 12);
          })();
          if (looksDonor && preferEnglish) {
            const clinicalDiagnosis = pickValue(["clinical_diagnosis", "clinical diagnosis", "Clinical_Diagnosis", "Clinical Diagnosis"]);
            const diseaseStatus = pickValue(["DiseaseStatus", "disease_status", "disease status"]);
            const t1dStage = pickValue(["T1D stage", "T1D stage__2", "t1d stage", "T1D Stage"]);
            const sex = pickValue(["sex", "Sex", "Gender", "gender"]);
            const age = pickValue(["age", "Age", "Age at enrollment", "Age_at_enrollment"]);
            const ethnicity = pickValue(["Ethnicities", "Ethnicity", "ethnicity", "Race", "race", "Genetic Ancestry (PancDB)", "Genetic Ancestry"]);
            const compact = [
              `Donor metadata: ${r.label} [${r.type}]`,
              clinicalDiagnosis ? `- clinical_diagnosis: ${clinicalDiagnosis}` : "",
              diseaseStatus ? `- DiseaseStatus: ${diseaseStatus}` : "",
              t1dStage ? `- T1D stage: ${t1dStage}` : "",
              sex ? `- sex: ${sex}` : "",
              age ? `- age: ${age}` : "",
              ethnicity ? `- ethnicity/ancestry: ${ethnicity}` : "",
              modalityAvailable.length ? `- available modalities: ${modalityAvailable.join(", ")}` : "",
            ].filter(Boolean);
            if (compact.length > 1) return compact.join("\n");
          }
          const preferredKeys = [
            "Contact", "Owner", "email", "Email", "path", "Path", "Version", "version",
            "Institution", "institution", "Updated", "updated", "Status", "status",
            "clinical_diagnosis", "Ethnicities", "Donor",
          ];
          const normalized = Object.entries(detail).map(([k, v]) => [String(k), v]);
          const picked = [];
          const used = new Set();
          preferredKeys.forEach((k) => {
            const hit = normalized.find(([kk]) => kk.toLowerCase() === k.toLowerCase());
            if (hit && !used.has(hit[0])) {
              picked.push(hit);
              used.add(hit[0]);
            }
          });
          normalized.forEach(([k, v]) => {
            if (!used.has(k)) picked.push([k, v]);
          });
          const detailLines = picked
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
            .slice(0, 20)
            .map(([k, v]) => `  - ${k}: ${String(v)}`);
          return [
            `Node: ${r.label} [${r.type}]`,
            detailLines.length ? "Properties:" : "Properties: (none)",
            ...detailLines,
          ].join("\n");
        })
        .join("\n\n");
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
    case "training_donor_overlap_between_models": {
      const s = result?.summary || {};
      const pctA = ((s.overlapRatioA || 0) * 100).toFixed(1);
      const pctB = ((s.overlapRatioB || 0) * 100).toFixed(1);
      const same = s.sameModel ? " (same model compared to itself)" : "";
      const donorLabels = rows.map((r) => r.label || r.id).filter(Boolean);
      const preview = donorLabels.slice(0, 15).join(", ");
      return [
        `Between ${s.modelALabel} and ${s.modelBLabel}${same}, there are ${s.overlapCount} overlapping donors in ${s.splitA || "training"} / ${s.splitB || "training"} splits.`,
        `${s.modelALabel} has ${s.modelADonorCount} donors and ${s.modelBLabel} has ${s.modelBDonorCount}; overlap ratio is ${pctA}% (relative to model A) and ${pctB}% (relative to model B).`,
        donorLabels.length ? `Example donors: ${preview}${donorLabels.length > 15 ? " ..." : ""}` : "No overlapping donors were found.",
      ].join("\n");
    }
    case "embedding_leakage_between_models": {
      const s = result?.summary || {};
      const dirs = Array.isArray(s.directions) ? s.directions : [];
      if (!dirs.length) {
        return "No valid source/target model pair was found for embedding leakage analysis.";
      }
      return [
        `Potential cross-model embedding leakage donors: ${s.leakageDonorCount ?? rows.length}`,
        `Target embedding usage split: ${s.targetUseSplit || "evaluation"}, source split: ${s.sourceSplit || "training"}, target-train split: ${s.targetTrainSplit || "training"}.`,
        ...dirs.map((d) =>
          `- ${d.sourceModelLabel} -> ${d.targetModelLabel}: embeddings=${d.sourceEmbeddingCount}, usedByTarget=${d.embeddingsUsedByTargetCount}, embeddingDonors=${d.embeddingDonors}, leakageDonors=${d.leakageDonors}`
        ),
        rows.length ? `Donors: ${rows.map((r) => r.label).join(", ")}` : "Donors: none",
      ].join("\n");
    }
    case "donor_overlap_between_models": {
      const s = result?.summary || {};
      if (!s.found && !rows.length) {
        return `No matching model pair was found for overlap query in current graph.`;
      }
      const pctA = ((s.overlapRatioA || 0) * 100).toFixed(1);
      const pctB = ((s.overlapRatioB || 0) * 100).toFixed(1);
      const same = s.sameModel ? " (same model compared to itself)" : "";
      const donorLabels = rows.map((r) => r.label || r.id).filter(Boolean);
      const preview = donorLabels.slice(0, 15).join(", ");
      return [
        `Between ${s.modelALabel} and ${s.modelBLabel}${same}, there are ${s.overlapCount} overlapping donors in ${s.splitA || "training"} / ${s.splitB || "training"} splits.`,
        `${s.modelALabel} has ${s.modelADonorCount} donors and ${s.modelBLabel} has ${s.modelBDonorCount}; overlap ratio is ${pctA}% (relative to model A) and ${pctB}% (relative to model B).`,
        donorLabels.length ? `Example donors: ${preview}${donorLabels.length > 15 ? " ..." : ""}` : "No overlapping donors were found.",
      ].join("\n");
    }
    case "donor_attribute_ratio": {
      const s = result?.summary || {};
      const pct = ((s.ratio || 0) * 100).toFixed(2);
      const comp = s.composition || {};
      const compText = Object.keys(comp).length
        ? Object.entries(comp).map(([k, v]) => `${k}=${v}`).join(", ")
        : "none";
      const askType = String(s.askType || params?.askType || "ratio").toLowerCase();
      if (askType === "distribution") {
        return [
          `In the current donor set (${s.totalDonors ?? rows.length}), the ${s.mode === "ethnicity" ? "ethnicity" : "diagnosis"} distribution is:`,
          compText,
        ].join("\n");
      }
      if (askType === "count") {
        return [
          `In the current donor set (${s.totalDonors ?? rows.length}), the count for ${s.targetValue || "the target attribute"} is ${s.matchedDonors ?? 0}.`,
          `Attribute mode: ${s.mode || "unknown"}, split: ${s.split || "training"}.`,
          `Composition: ${compText}`,
        ].join("\n");
      }
      return [
        `In the current donor set (${s.totalDonors ?? rows.length}), the proportion of ${s.targetValue || "the target attribute"} is ${pct}% (${s.matchedDonors ?? 0}/${s.totalDonors ?? rows.length}).`,
        `Attribute mode: ${s.mode || "unknown"}, split: ${s.split || "training"}.`,
        `Composition: ${compText}`,
      ].join("\n");
    }
    case "disease_composition_for_model_training": {
      const s = result?.summary || {};
      const c = s.composition || {};
      return [
        `${s.modelLabel} training donors: ${s.donorCount ?? rows.length}`,
        `T1D ratio: ${((s.t1dRatio || 0) * 100).toFixed(1)}%`,
        `Counts: T1D=${c.T1D ?? 0}, ND=${c.ND ?? 0}, AAb+=${c["AAb+"] ?? 0}, T2D=${c.T2D ?? 0}, Unknown=${c.Unknown ?? 0}`,
      ].join("\n");
    }
    case "donor_modality_availability": {
      const r = rows[0] || {};
      return `${r.donorCode || "Donor"} ${r.modality || "modality"} availability: ${r.available ? "YES" : "NO"} (raw=${r.rawValue || "n/a"})`;
    }
    case "qc_pipeline_for_model_modality": {
      const s = result?.summary || {};
      if (!rows.length) return `No QC pipeline lineage found for ${s.modelLabel || s.modelId || "model"} with the requested modality.`;
      const head = s.trainingLinked
        ? `QC pipeline(s) in training lineage of ${s.modelLabel || s.modelId}:`
        : `No direct training linkage found for requested model+modality; showing modality-level QC pipeline(s):`;
      return [head, ...rows.map((r) => [
        `${r.datasetLabel}`,
        `-> ${r.pipelineLabel || "pipeline not found"}`,
        r.pipelineDetail?.Version ? `(version ${r.pipelineDetail.Version})` : "",
        r.pipelineDetail?.Contact ? `contact: ${r.pipelineDetail.Contact}` : "",
      ].filter(Boolean).join(" "))].join("\n");
    }
    case "governance_events_by_period": {
      const s = result?.summary || {};
      return [
        `Governance events in ${s.period || "period"}: ${s.count ?? rows.length}`,
        rows.length ? rows.map((r) => `- ${r.label} [${r.type}] updated ${r.updated || "unknown"}`).join("\n") : "No matching update events in current graph.",
      ].join("\n");
    }
    case "models_need_reeval_after_donor_qc": {
      const s = result?.summary || {};
      if (!s.found) return `No donor matched ${s.donorCode || "input donor"} in current graph.`;
      return [
        `Models needing re-eval after ${s.donorCode} re-QC: ${s.impactedModelCount ?? rows.length}`,
        rows.length ? rows.map((r) => `- ${r.label} (${r.type})`).join("\n") : "none",
      ].join("\n");
    }
    case "qc_pipeline_owner": {
      const s = result?.summary || {};
      if (!rows.length) return "No matching QC pipeline owner found in current graph.";
      const head = s.requestedVersion && !s.exactVersionFound
        ? `No exact ${s.requestedVersion} pipeline found; showing closest matches.`
        : "QC pipeline owner(s):";
      return [head, ...rows.map((r) => `- ${r.pipelineLabel} (${r.version}): ${r.contact} <${r.email}>`)].join("\n");
    }
    case "institution_datasets_used_after_year": {
      const s = result?.summary || {};
      return [
        `Datasets used after ${s.afterYear} for institution "${s.institution}": ${s.count ?? rows.length}`,
        rows.length ? rows.map((r) => `- ${r.label} (updated ${r.updated || "unknown"}, institution=${r.institution || "unknown"})`).join("\n") : "none",
      ].join("\n");
    }
    case "cross_model_donor_leakage": {
      const s = result?.summary || {};
      const donors = rows.map((r) => r.label);
      const donorText = donors.length ? donors.join(", ") : "none";
      return [
        `Leakage donors across training sets (Genomic + Single-cell + Spatial): ${s.overlapCount ?? rows.length}`,
        `Leakage ratio vs all donors: ${((s.leakageRatio || 0) * 100).toFixed(1)}% (${s.overlapCount ?? rows.length}/${s.totalDonors ?? "?"})`,
        `Training donor counts -> Genomic: ${s.genomicTrainingDonors ?? "?"}, Single-cell: ${s.scfmTrainingDonors ?? "?"}, Spatial: ${s.spatialTrainingDonors ?? "?"}`,
        `Donor list: ${donorText}`,
      ].join("\n");
    }
    case "cross_modality_embedding_leakage": {
      const s = result?.summary || {};
      const donors = rows.map((r) => r.label);
      return [
        `Cross-modality embedding leakage check (scFM embedding -> Genomic FM evaluation):`,
        `Source embeddings from scFM: ${s.sourceEmbeddingCount ?? 0}`,
        `Explicit embedding->Genomic evaluation edge present: ${s.embeddingUsedForTargetEvaluation ? "yes" : "no"}`,
        `Potential leakage donors (in scFM training and Genomic training, and covered by scFM embeddings): ${s.leakageDonorCount ?? rows.length}`,
        `Leakage ratio within embedding donors: ${((s.leakageRatioInEmbeddingDonors || 0) * 100).toFixed(1)}%`,
        `Donor list: ${donors.length ? donors.join(", ") : "none"}`,
      ].join("\n");
    }
    case "train_eval_distribution_drift": {
      const s = result?.summary || {};
      const bTrain = s.before?.training || {};
      const bEval = s.before?.evaluation || {};
      const aTrain = s.after?.training || {};
      const aEval = s.after?.evaluation || {};
      const sh = s.shift || {};
      return [
        `Training/Evaluation distribution drift simulation for ${s.modelId}:`,
        `Before -> training T1D:ND = ${bTrain.counts?.T1D ?? 0}:${bTrain.counts?.ND ?? 0}, evaluation T1D:ND = ${bEval.counts?.T1D ?? 0}:${bEval.counts?.ND ?? 0}`,
        `After  -> training T1D:ND = ${aTrain.counts?.T1D ?? 0}:${aTrain.counts?.ND ?? 0}, evaluation T1D:ND = ${aEval.counts?.T1D ?? 0}:${aEval.counts?.ND ?? 0}`,
        `Shift  -> training T1D delta: ${sh.trainingT1DDelta ?? 0} (${((sh.trainingT1DRatioDelta || 0) * 100).toFixed(1)} pp), evaluation T1D delta: ${sh.evaluationT1DDelta ?? 0} (${((sh.evaluationT1DRatioDelta || 0) * 100).toFixed(1)} pp)`,
        rows.length ? `Applied reclassifications: ${rows.map((r) => `${r.donorCode}->${r.newStage}`).join(", ")}` : "Applied reclassifications: none",
      ].join("\n");
    }
    case "upstream_metadata_impact": {
      const s = result?.summary || {};
      if (!s.found) return `No donor matched ${s.donorCode} in the current graph.`;
      const tasks = (s.impactedTasks || []).map((t) => t.label);
      const topImpacted = rows.slice(0, 12).map((r) => `${r.modelLabel} [${r.split}]`);
      return [
        `Upstream metadata impact for ${s.donorLabel}: ${s.reclassification?.from} -> ${s.reclassification?.to}`,
        `Impacted samples: ${s.impactedSampleCount}/${s.donorSampleCount} (${((s.impactedSampleRatio || 0) * 100).toFixed(1)}%)`,
        `Impacted models: ${s.impactedModelCount}, impacted downstream tasks: ${s.impactedTaskCount}`,
        `Prediction shift estimate: ${s.predictionShiftEstimate}`,
        `Model exposure: ${topImpacted.length ? topImpacted.join("; ") : "none"}`,
        `Downstream tasks: ${tasks.length ? tasks.join(", ") : "none"}`,
      ].join("\n");
    }
    case "reclassification_distribution_impact": {
      const s = result?.summary || {};
      if (!s.found) {
        return `No donors were found for scope ${s.scopeType || "unknown"} (${s.scopeRef || "n/a"}) with split=${s.split || "training"}.`;
      }
      const beforeCounts = s.before?.counts || {};
      const afterCounts = s.after?.counts || {};
      const beforeComp = `T1D=${beforeCounts.T1D || 0}, ND=${beforeCounts.ND || 0}, T2D=${beforeCounts.T2D || 0}, AAb+=${beforeCounts["AAb+"] || 0}, Unknown=${beforeCounts.Unknown || 0}`;
      const afterComp = `T1D=${afterCounts.T1D || 0}, ND=${afterCounts.ND || 0}, T2D=${afterCounts.T2D || 0}, AAb+=${afterCounts["AAb+"] || 0}, Unknown=${afterCounts.Unknown || 0}`;
      const outsideScopeOverrides = Math.max(0, (s.requestedReclassificationCount || 0) - (s.inScopeOverrideCount || 0));
      const modalities = (s.impactedModalities || []).slice(0, 20).join(", ") || "none";
      const models = (s.impactedModels || []).map((x) => x.label || x).slice(0, 20).join(", ") || "none";
      const tasks = (s.impactedTasks || []).map((x) => x.label || x).slice(0, 20).join(", ") || "none";
      return [
        `Donor reclassification impact analysis (${s.scopeType}: ${s.scopeRef}, split=${s.split}):`,
        `Scope donors: ${s.donorCount}; requested overrides: ${s.requestedReclassificationCount || 0}; matched in scope: ${s.inScopeOverrideCount || 0}; diagnosis changed: ${s.changedCount || 0}.`,
        outsideScopeOverrides > 0
          ? `Note: ${outsideScopeOverrides} requested donor(s) were outside this scope or split, so they did not affect this calculation.`
          : `All requested donor overrides were within scope.`,
        `Balance trend: ${s.balance?.trend || "unknown"} (risk=${s.balance?.riskLevel || "unknown"}).`,
        `Before ratio (T1D:ND) = ${s.before?.t1dToNd || "0:0"} (T1D ${(100 * (s.before?.t1dRatio || 0)).toFixed(1)}%, ND ${(100 * (s.before?.ndRatio || 0)).toFixed(1)}%).`,
        `Before composition: ${beforeComp}.`,
        `After ratio  (T1D:ND) = ${s.after?.t1dToNd || "0:0"} (T1D ${(100 * (s.after?.t1dRatio || 0)).toFixed(1)}%, ND ${(100 * (s.after?.ndRatio || 0)).toFixed(1)}%).`,
        `After composition: ${afterComp}.`,
        `Shift summary: T1D delta ${s.shift?.t1dDelta || 0} (${(100 * (s.shift?.t1dRatioDelta || 0)).toFixed(1)} pp), ND delta ${s.shift?.ndDelta || 0} (${(100 * (s.shift?.ndRatioDelta || 0)).toFixed(1)} pp).`,
        `Potential adjustment targets -> modalities: ${modalities}; models: ${models}; downstream tasks: ${tasks}.`,
      ].join("\n");
    }
    case "shared_validation_datasets_across_fms": {
      const s = result?.summary || {};
      return [
        `Shared datasets between Genomic FM evaluation inputs and Single-cell FM embedding sources: ${s.overlapCount ?? rows.length}`,
        `Genomic evaluation datasets: ${s.genomicEvaluationDatasetCount ?? "?"}, scFM embedding-source datasets: ${s.scfmEmbeddingSourceDatasetCount ?? "?"}`,
        `Overlap list: ${rows.length ? rows.map((r) => r.label).join(", ") : "none"}`,
      ].join("\n");
    }
    case "disease_composition_bias_three_fms": {
      const s = result?.summary || {};
      const c = s.composition || {};
      return [
        `Disease composition bias among donors shared by 3 FM training sets:`,
        `Shared donors: ${s.sharedDonorCount ?? rows.length}`,
        `T1D ratio: ${((s.t1dRatio || 0) * 100).toFixed(1)}% (T1D=${c.T1D ?? 0}, ND=${c.ND ?? 0}, AAb+=${c["AAb+"] ?? 0}, T2D=${c.T2D ?? 0}, Unknown=${c.Unknown ?? 0})`,
      ].join("\n");
    }
    case "search_nodes":
      return `Found ${rows.length} matching node(s):\n${rows.map((r, i) => `${i + 1}. ${r.label} [${r.type}]`).join("\n")}`;
    case "list_nodes_by_type": {
      const s = result?.summary || {};
      const lines = rows.slice(0, 40).map((r, i) => `${i + 1}. ${r.label}${r.donor ? ` (donor=${r.donor})` : ""}`);
      return [
        `Found ${s.totalMatched ?? rows.length} node(s) of type ${s.nodeType || "unknown"}${s.query ? ` matching "${s.query}"` : ""}.`,
        lines.length ? lines.join("\n") : "No matching nodes.",
      ].join("\n");
    }
    case "impact_downstream": {
      const s = result?.summary || {};
      if (!s.found) return `No matching entity was found for "${s.entity || params?.query || ""}" in current graph.`;
      const modelPreview = (s.impactedModels || []).slice(0, 12).join(", ");
      const taskPreview = (s.impactedTasks || []).slice(0, 12).join(", ");
      const modalityPreview = (s.impactedModalities || []).slice(0, 20).join(", ");
      const sampleCount = s.sampleCount ?? s.impactedSampleCount ?? 0;
      const datasetCount = s.datasetCount ?? s.impactedDatasetCount ?? 0;
      const modelCount = s.modelCount ?? s.impactedModelCount ?? 0;
      const taskCount = s.taskCount ?? s.impactedTaskCount ?? 0;
      return [
        `Downstream impact overview for changes to ${s.startLabel}:`,
        `Impacted samples: ${sampleCount}, datasets: ${datasetCount}, models: ${modelCount}, downstream tasks: ${taskCount}.`,
        `Impacted data modalities: ${modalityPreview || "none"}`,
        `Impacted models: ${modelPreview || "none"}`,
        `Impacted tasks: ${taskPreview || "none"}`,
      ].join("\n");
    }
    case "get_neighbors":
      return `Found ${rows.length} neighbor edge(s):\n${rows.slice(0, 50).map((r, i) => `${i + 1}. ${r.fromLabel} -${r.edgeLabel}-> ${r.toLabel}`).join("\n")}`;
    case "extract_donors": {
      const s = result?.summary || {};
      const donorLabels = rows.map((r) => r.label || r.id).filter(Boolean);
      const preview = donorLabels.slice(0, 15).join(", ");
      const sourceSummary = Array.isArray(s.sources)
        ? s.sources.map((x) => `${x.sourceLabel}(${x.donorCount})`).join("; ")
        : "";
      if ((s.combine || "").toLowerCase() === "intersection" && (s.sourceCount || 0) > 1) {
        return [
          `There are ${s.donorCount ?? rows.length} shared donors across ${s.sourceCount} sources in split=${s.split || "training"}.`,
          sourceSummary ? `Source donor counts: ${sourceSummary}` : "",
          donorLabels.length ? `Example donors: ${preview}${donorLabels.length > 15 ? " ..." : ""}` : "No shared donors were found.",
        ].filter(Boolean).join("\n");
      }
      const hdr = `Extracted ${s.donorCount ?? rows.length} donors (split=${s.split || "training"}, combine=${s.combine || "union"}, sources=${s.sourceCount || 0}).`;
      return `${hdr}\n${rows.slice(0, 200).map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    }
    case "set_operation": {
      const s = result?.summary || {};
      return `Set operation (${s.operator || "intersect"}) result: ${s.resultCount ?? rows.length} item(s).\n${rows.slice(0, 200).map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    }
    default:
      return null;
  }
};


export {
  queryGraph,
  buildGraphOntologyContext,
  GRAPH_ONTOLOGY_CONTEXT,
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
};

