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
    return (
      pool.find((n) => labelSingleLine(n.label).toLowerCase().includes(q)) ||
      pool.find((n) => normalizeEntityKey(n.id).includes(qNorm) || normalizeEntityKey(labelSingleLine(n.label)).includes(qNorm)) ||
      null
    );
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
  const donorIdsForDatasetNode = (datasetNodeId) => {
    const donorIds = new Set();
    sampleIdsForDatasetNode(datasetNodeId).forEach((sampleId) => {
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
    "sc rna": ["proc_scrna_v1"],
    "single-cell rna": ["proc_scrna_v1"],
    "wgs": [],
  };
  const resolveModalityDatasetIds = (raw) => {
    const q = String(raw || "").toLowerCase();
    for (const key of Object.keys(modalityToDatasetIds)) {
      if (qHas(q, key)) return modalityToDatasetIds[key];
    }
    return [];
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
      const pipelines = NODES.filter((n) => n.type === "Pipeline");
      const matches = pipelines.filter((p) => {
        const lbl = labelSingleLine(p.label).toLowerCase();
        if (isScrna && !qHas(lbl, "scrna")) return false;
        if (requestedVersion && String(p.detail?.Version || "").toLowerCase() !== requestedVersion.toLowerCase()) return false;
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
          impactedModelCount: allImpactedModelIds.size,
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
      const query = String(params.query || params.q || params.text || "").trim().toLowerCase();
      const queryNorm = normalizeEntityKey(query);
      const typeHints = asArray(
        params.typeHints || params.types || params.node_types || params.node_type || params.type
      ).map((t) => String(t || "").toLowerCase());
      const limit = Math.max(1, Math.min(Number(params.limit || 20), 100));
      if (!query) return { rows: [] };
      const score = (node) => {
        const id = String(node.id || "").toLowerCase();
        const label = labelSingleLine(node.label).toLowerCase();
        const idNorm = normalizeEntityKey(id);
        const labelNorm = normalizeEntityKey(label);
        if (id === query || label === query) return 100;
        if (idNorm === queryNorm || labelNorm === queryNorm) return 95;
        if (id.startsWith(query) || label.startsWith(query)) return 80;
        if (idNorm.startsWith(queryNorm) || labelNorm.startsWith(queryNorm)) return 75;
        if (id.includes(query) || label.includes(query)) return 60;
        if (idNorm.includes(queryNorm) || labelNorm.includes(queryNorm)) return 55;
        return 0;
      };
      const rows = NODES
        .filter((n) => !typeHints.length || typeHints.includes(String(n.type || "").toLowerCase()))
        .map((n) => ({ node: n, s: score(n) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || String(a.node.id).localeCompare(String(b.node.id)))
        .slice(0, limit)
        .map((x) => ({ ...nodeRow(x.node), score: x.s }));
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
          donorIdsForDatasetNode(nodeId).forEach((d) => out.add(d));
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
          if (String(otherNode.type) === "ProcessedData") donorIdsForDatasetNode(otherId).forEach((d) => out.add(d));
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

Available intents:
- search_nodes
- get_neighbors
- extract_donors
- set_operation
- donor_overlap_between_models
- node_detail
- provenance_chain
- datasets_for_model
- models_for_dataset
- pipeline_for_dataset
- downstream_tasks

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
  "donor_attribute_ratio",
  "set_operation",
  "donor_overlap_between_models",
  "node_detail",
  "provenance_chain",
  "datasets_for_model",
  "models_for_dataset",
  "pipeline_for_dataset",
  "downstream_tasks",
  "impact_downstream",
];

const AGENT_TOOLS = [
  { name:"queryGraph", description:"Execute a structured read-only query against the MAI-T1D provenance graph",
    input_schema:{ type:"object", properties:{
      intent:{ type:"string", enum:INTENT_ENUM, description:"Query intent to execute" },
      params:{ type:"object", description:"Intent parameters. Prefer explicit IDs when available; otherwise pass natural-language query text." }
    }, required:["intent","params"] }
  }
];

const SUGGESTIONS = [
  "What datasets trained model scFM-v1?",
  "Which models are downstream of scRNA v1.2?",
  "Is HPAP-088 WGS data available for use?",
  "What QC pipeline produced scRNA for scFM-v1?",
  "What governance events occurred in 2025-Q2?",
  "Which models need re-eval after HPAP-016 re-QC?",
  "Who is responsible for QC pipeline scRNA-v4?",
  "Which Vanderbilt datasets were used post-2024?",
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
const MODEL_CANDIDATE_THRESHOLD = 0.74;
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

  const candidates = [];
  for (const node of modelNodes) {
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
  const ranked = [];
  for (const node of modelNodes) {
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

Rules:
- Allowed intents: ${INTENT_ENUM.join(", ")}
- Prefer atomic retrieval intents first: search_nodes, get_neighbors, extract_donors, set_operation.
- Use linked_entities as a high-priority grounding hint for canonical IDs when provided.
- For donor-attribute statistics questions (e.g., T1D/ND/White count or ratio), use donor_attribute_ratio after obtaining donor set evidence.
- For inventory/list questions ("what raw data/datasets/models exist"), prefer list_nodes_by_type first, then drill down.
- For change-impact questions ("X changed, what downstream models/data are impacted"), use impact_downstream first.
- Use domain intents only when they directly and fully match the question.
- If question compares multiple entities (overlap/intersection/shared/simultaneously), do NOT use single-entity intents.
- If question asks donors shared by all FMs, use extract_donors with {scope:"all_models", split:"training|evaluation", combine:"intersection"}.
- Normalize aliases first (e.g., "sc FM" => model_scfm).
- For two-model donor-overlap questions, prefer donor_overlap_between_models with explicit model IDs and split.
- Use "tool" when more evidence is needed.
- Use "answer" only when existing evidence is sufficient.
- Use "clarify" only if required entity/constraint is missing.
- Never output non-JSON text.
`;
const AGENT_LANGGRAPH_ANSWER_SYSTEM = `
You are the answer node in a LangGraph-style governance agent.
Use only provided tool evidence to answer.
If evidence is insufficient, explicitly say what is missing in the current graph.
Do not describe internal reasoning steps.
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
  const asksList = qHasAny(s, ["what", "which", "list", "哪些", "有哪些", "show", "列出"]);
  const nodeType = detectNodeTypeFromQuestion(s);
  if (!asksList || !nodeType) return null;
  const donorCode = (String(q).toUpperCase().match(/HPAP[-_\s]?\d{1,3}/)?.[0] || "").replace(/[_\s]/g, "-");
  const query = donorCode || (qHas(s, "hpap") ? "hpap" : "");
  return { nodeType, query };
};
const parseImpactRequest = (q = "") => {
  const s = normalizeQ(q);
  const asksImpact = qHasAny(s, ["影响", "impact", "impacted", "downstream", "下游", "变更", "修改", "更新"]);
  if (!asksImpact) return null;
  const donorCode = normalizeDonorCode(q);
  return {
    entityQuery: donorCode || String(q || "").trim(),
    depth: qHasAny(s, ["all", "全部", "all downstream"]) ? 8 : 6,
  };
};
const parseDonorAttributeTargetFromQuestion = (q = "") => {
  const s = normalizeQ(q);
  const asksRatio = qHasAny(s, ["ratio", "比例", "占比", "percent", "percentage"]);
  const asksCount = qHasAny(s, ["how many", "count", "多少", "几位", "几人", "数量", "number of"]);
  const asksDistribution = qHasAny(s, ["distribution", "distributions", "composition", "breakdown", "分布", "构成", "组成"]);
  const asksDonor = qHasAny(s, ["donor", "donors", "供体"]);
  const asksStats = asksRatio || asksCount || asksDistribution;
  if (!asksStats || !asksDonor) return { needsAttributeStats: false, askType: "ratio" };
  const askType = asksDistribution ? "distribution" : (asksCount && !asksRatio ? "count" : "ratio");
  if (qHasAny(s, ["t1d", "t1dm"])) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "T1D" };
  if (qHasAny(s, ["t2d", "t2dm"])) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "T2D" };
  if (qHasAny(s, ["nd", "control", "normal"])) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "ND" };
  if (qHasAny(s, ["aab", "aab+"])) return { needsAttributeStats: true, askType, mode: "disease", targetValue: "AAb+" };
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

const formatIntentAnswer = (intent, params, result) => {
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
    case "training_donor_overlap_between_models": {
      const s = result?.summary || {};
      const pctA = ((s.overlapRatioA || 0) * 100).toFixed(1);
      const pctB = ((s.overlapRatioB || 0) * 100).toFixed(1);
      const same = s.sameModel ? " (same model compared to itself)" : "";
      const donorLabels = rows.map((r) => r.label || r.id).filter(Boolean);
      const preview = donorLabels.slice(0, 15).join(", ");
      return [
        `在 ${s.modelALabel} 和 ${s.modelBLabel}${same} 的 ${s.splitA || "training"} / ${s.splitB || "training"} 数据中，共有 ${s.overlapCount} 位 donor 重叠。`,
        `${s.modelALabel} 总 donor 数 ${s.modelADonorCount}，${s.modelBLabel} 总 donor 数 ${s.modelBDonorCount}。重叠占比为 ${pctA}%（相对模型A）和 ${pctB}%（相对模型B）。`,
        donorLabels.length ? `示例 donor：${preview}${donorLabels.length > 15 ? " ..." : ""}` : "当前没有重叠 donor。",
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
        `在 ${s.modelALabel} 和 ${s.modelBLabel}${same} 的 ${s.splitA || "training"} / ${s.splitB || "training"} 数据中，共有 ${s.overlapCount} 位 donor 重叠。`,
        `${s.modelALabel} 总 donor 数 ${s.modelADonorCount}，${s.modelBLabel} 总 donor 数 ${s.modelBDonorCount}。重叠占比为 ${pctA}%（相对模型A）和 ${pctB}%（相对模型B）。`,
        donorLabels.length ? `示例 donor：${preview}${donorLabels.length > 15 ? " ..." : ""}` : "当前没有重叠 donor。",
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
          `在当前 donor 集合（${s.totalDonors ?? rows.length} 位）中，${s.mode === "ethnicity" ? "人群" : "diagnosis"}分布如下：`,
          compText,
        ].join("\n");
      }
      if (askType === "count") {
        return [
          `在当前 donor 集合（${s.totalDonors ?? rows.length} 位）中，${s.targetValue || "目标属性"} 的数量是 ${s.matchedDonors ?? 0}。`,
          `属性维度：${s.mode || "unknown"}，split：${s.split || "training"}。`,
          `组成：${compText}`,
        ].join("\n");
      }
      return [
        `在当前 donor 集合（${s.totalDonors ?? rows.length} 位）中，${s.targetValue || "目标属性"} 的比例为 ${pct}% (${s.matchedDonors ?? 0}/${s.totalDonors ?? rows.length})。`,
        `属性维度：${s.mode || "unknown"}，split：${s.split || "training"}。`,
        `组成：${compText}`,
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
      return [
        `${s.startLabel} 变更的下游影响概览：`,
        `受影响样本 ${s.sampleCount ?? 0}，数据集 ${s.datasetCount ?? 0}，模型 ${s.modelCount ?? 0}，下游任务 ${s.taskCount ?? 0}。`,
        `受影响模型：${modelPreview || "none"}`,
        `受影响任务：${taskPreview || "none"}`,
      ].join("\n");
    }
    case "get_neighbors":
      return `Found ${rows.length} neighbor edge(s):\n${rows.slice(0, 50).map((r, i) => `${i + 1}. ${r.fromLabel} -${r.edgeLabel}-> ${r.toLabel}`).join("\n")}`;
    case "extract_donors": {
      const s = result?.summary || {};
      const donorLabels = rows.map((r) => r.label || r.id).filter(Boolean);
      const preview = donorLabels.slice(0, 15).join(", ");
      const sourceSummary = Array.isArray(s.sources)
        ? s.sources.map((x) => `${x.sourceLabel}(${x.donorCount})`).join("；")
        : "";
      if ((s.combine || "").toLowerCase() === "intersection" && (s.sourceCount || 0) > 1) {
        return [
          `这 ${s.sourceCount} 个来源在 ${s.split || "training"} 数据中的共同 donor 有 ${s.donorCount ?? rows.length} 位。`,
          sourceSummary ? `来源 donor 规模：${sourceSummary}` : "",
          donorLabels.length ? `示例 donor：${preview}${donorLabels.length > 15 ? " ..." : ""}` : "当前没有共同 donor。",
        ].filter(Boolean).join("\n");
      }
      const hdr = `提取到 ${s.donorCount ?? rows.length} 位 donor（split=${s.split || "training"}，combine=${s.combine || "union"}，sources=${s.sourceCount || 0}）。`;
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

