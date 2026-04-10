import React, { useEffect, useRef, useState } from "react";
import { NODES, EDGES } from "./graphData";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
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
  const donorNodes = NODES.filter((n) => n.id.startsWith("donor_hpap_"));
  const donorNodeIds = new Set(donorNodes.map((n) => n.id));
  const donorCodeToNode = new Map(
    donorNodes.map((n) => [String(labelSingleLine(n.label)).toUpperCase(), n])
  );
  const diseaseTagFromDonor = (donorNode, overrides = {}) => {
    const donorCode = String(labelSingleLine(donorNode?.label || "")).toUpperCase();
    const overrideValue = overrides[donorCode];
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
      return "Control";
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
      if (q.includes(key)) return modalityToDatasetIds[key];
    }
    return [];
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
      return {
        rows: overlap.map((id) => ({
          id,
          label: labelSingleLine(NODES.find((n) => n.id === id)?.label || id),
        })),
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
          sameModel: a === b,
        },
      };
    }
    case "donor_overlap_between_models": {
      const aRef = params.modelAId || params.modelA || params.modelAName || "model_genomic";
      const bRef = params.modelBId || params.modelB || params.modelBName || "model_scfm";
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
      return {
        rows: overlap.map((id) => ({
          id,
          label: labelSingleLine(NODES.find((n) => n.id === id)?.label || id),
        })),
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
          sameModel: aNode.id === bNode.id,
        },
      };
    }
    case "disease_composition_for_model_training": {
      const modelId = params.modelId || "model_scfm";
      const modelNode = NODES.find((n) => n.id === modelId);
      const donors = [...donorIdsForModelTraining(modelId)];
      const counts = { T1D: 0, "AAb+": 0, T2D: 0, Control: 0, Unknown: 0 };
      const rows = donors
        .map((id) => {
          const node = NODES.find((n) => n.id === id);
          const diseaseTag = diseaseTagFromDonor(node);
          counts[diseaseTag] += 1;
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
          controlRatio: ratio(counts.Control, donors.length),
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
      const isScrna = q.includes("scrna") || q.includes("sc rna");
      const pipelines = NODES.filter((n) => n.type === "Pipeline");
      const matches = pipelines.filter((p) => {
        const lbl = labelSingleLine(p.label).toLowerCase();
        if (isScrna && !lbl.includes("scrna")) return false;
        if (requestedVersion && String(p.detail?.Version || "").toLowerCase() !== requestedVersion.toLowerCase()) return false;
        return isScrna || q.includes(lbl);
      });
      const best = matches.length ? matches : (isScrna ? pipelines.filter((p) => labelSingleLine(p.label).toLowerCase().includes("scrna")) : []);
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
        const counts = { T1D: 0, "AAb+": 0, T2D: 0, Control: 0, Unknown: 0 };
        [...donorIdSet].forEach((id) => {
          const donorNode = NODES.find((n) => n.id === id);
          counts[diseaseTagFromDonor(donorNode, overrides)] += 1;
        });
        const total = [...donorIdSet].length;
        return {
          total,
          counts,
          t1dRatio: ratio(counts.T1D, total),
          controlRatio: ratio(counts.Control, total),
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
      const counts = { T1D: 0, "AAb+": 0, T2D: 0, Control: 0, Unknown: 0 };
      shared.forEach((id) => {
        counts[diseaseTagFromDonor(NODES.find((n) => n.id === id))] += 1;
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
          controlRatio: ratio(counts.Control, shared.length),
        },
      };
    }
    case "search_nodes": {
      const query = String(params.query || "").trim().toLowerCase();
      const typeHints = asArray(params.typeHints || params.types).map((t) => String(t || "").toLowerCase());
      const limit = Math.max(1, Math.min(Number(params.limit || 20), 100));
      if (!query) return { rows: [] };
      const score = (node) => {
        const id = String(node.id || "").toLowerCase();
        const label = labelSingleLine(node.label).toLowerCase();
        if (id === query || label === query) return 100;
        if (id.startsWith(query) || label.startsWith(query)) return 80;
        if (id.includes(query) || label.includes(query)) return 60;
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
      const nodeIds = asArray(params.nodeIds || params.nodeId).map((x) => String(x || "").trim()).filter(Boolean);
      const split = String(params.split || "training").toLowerCase();
      if (!nodeIds.length) return { rows: [] };
      const donorIds = new Set();
      nodeIds.forEach((nodeId) => {
        if (donorNodeIds.has(nodeId)) {
          donorIds.add(nodeId);
          return;
        }
        const node = NODES.find((n) => n.id === nodeId);
        if (!node) return;
        if (String(node.type) === "Model" || String(node.type) === "FineTunedModel") {
          donorIdsForModelSplit(nodeId, split === "evaluation" ? "evaluation" : "training").forEach((d) => donorIds.add(d));
          return;
        }
        if (String(node.type) === "ProcessedData") {
          donorIdsForDatasetNode(nodeId).forEach((d) => donorIds.add(d));
          return;
        }
        if (String(node.type) === "RawData") {
          const donorId = donorIdFromSampleId(nodeId);
          if (donorId) donorIds.add(donorId);
          return;
        }
        // Generic fallback: look for adjacent dataset/model nodes and resolve donors from those.
        EDGES.filter((e) => edgeSrcId(e) === nodeId || edgeTgtId(e) === nodeId).forEach((e) => {
          const otherId = edgeSrcId(e) === nodeId ? edgeTgtId(e) : edgeSrcId(e);
          const otherNode = NODES.find((n) => n.id === otherId);
          if (!otherNode) return;
          if (String(otherNode.type) === "ProcessedData") donorIdsForDatasetNode(otherId).forEach((d) => donorIds.add(d));
          if (String(otherNode.type) === "Model" || String(otherNode.type) === "FineTunedModel") {
            donorIdsForModelSplit(otherId, split === "evaluation" ? "evaluation" : "training").forEach((d) => donorIds.add(d));
          }
        });
      });
      const rows = [...donorIds]
        .map((id) => NODES.find((n) => n.id === id))
        .filter(Boolean)
        .sort((a, b) => labelSingleLine(a.label).localeCompare(labelSingleLine(b.label)))
        .map((n) => ({
          id: n.id,
          label: labelSingleLine(n.label),
          diseaseTag: diseaseTagFromDonor(n),
        }));
      return { rows, summary: { donorCount: rows.length } };
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
- training_donor_overlap_between_models
- donor_overlap_between_models
- disease_composition_for_model_training
- donor_modality_availability
- qc_pipeline_for_model_modality
- governance_events_by_period
- models_need_reeval_after_donor_qc
- qc_pipeline_owner
- institution_datasets_used_after_year
- cross_model_donor_leakage
- cross_modality_embedding_leakage
- train_eval_distribution_drift
- upstream_metadata_impact
- shared_validation_datasets_across_fms
- disease_composition_bias_three_fms
- search_nodes
- get_neighbors
- extract_donors
- set_operation
Workflow:
1) Prefer atomic graph retrieval intents first (search_nodes/get_neighbors/extract_donors/set_operation).
2) Use domain-specific intents only when atomic retrieval is clearly insufficient.
3) Call queryGraph.
4) Answer only from tool results.
Answer style requirements:
- Return a direct final answer, not your search process.
- Never write phrases like "let me try/search/look up".
- If query results are empty, clearly say no matching records were found in the current graph.
- Keep answers concise and precise for AI researchers.
`;

const INTENT_ENUM = [
  "datasets_for_model",
  "models_for_dataset",
  "compliance_status",
  "pipeline_for_dataset",
  "downstream_tasks",
  "provenance_chain",
  "card_links",
  "node_detail",
  "shared_donors_three_fms",
  "training_donors_by_models",
  "training_donor_overlap_between_models",
  "donor_overlap_between_models",
  "disease_composition_for_model_training",
  "donor_modality_availability",
  "qc_pipeline_for_model_modality",
  "governance_events_by_period",
  "models_need_reeval_after_donor_qc",
  "qc_pipeline_owner",
  "institution_datasets_used_after_year",
  "cross_model_donor_leakage",
  "cross_modality_embedding_leakage",
  "train_eval_distribution_drift",
  "upstream_metadata_impact",
  "shared_validation_datasets_across_fms",
  "disease_composition_bias_three_fms",
  "search_nodes",
  "get_neighbors",
  "extract_donors",
  "set_operation",
];

const AGENT_TOOLS = [
  { name:"queryGraph", description:"Execute a structured query against the MAI-T1D provenance graph",
    input_schema:{ type:"object", properties:{
      intent:{ type:"string", enum:INTENT_ENUM, description:"The query pattern to execute" },
      params:{ type:"object", description:"Parameters for the query. For card_links, prefer {mcId:'mc_genomic'} or {modelId:'model_genomic'}. {nodeId:'model_genomic'} is also accepted." }
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
const normalizeDonorCode = (raw = "") => {
  const text = String(raw || "").trim().toUpperCase();
  if (!text) return null;
  const m = text.match(/HPAP[-_\s]?(\d{1,3})/);
  if (!m) return null;
  return `HPAP-${m[1].padStart(3, "0")}`;
};
const extractDonorCodeFromQuery = (q = "") => {
  const raw = String(q || "");
  const patterns = [
    /HPAP[-_\s]?(\d{1,3})/i,
    /DONOR[-_\s]?HPAP[-_\s]?(\d{1,3})/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) return `HPAP-${String(m[1]).padStart(3, "0")}`;
  }
  return null;
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
- Use domain intents only when they directly and fully match the question.
- If question compares multiple entities (overlap/intersection/shared/simultaneously), do NOT use single-entity intents.
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
  const mentionRegex = /(genomic fm|single-cell fm|single cell fm|scfm|spatial fm|spatial omics fm|protein fm)/g;
  const out = [];
  let m;
  while ((m = mentionRegex.exec(q)) !== null) {
    const t = m[1];
    if (t === "genomic fm") out.push("model_genomic");
    else if (t === "spatial fm") out.push("model_spatial");
    else if (t === "spatial omics fm") out.push("model_spatial_omics");
    else if (t === "protein fm") out.push("model_protein");
    else out.push("model_scfm");
  }
  return out;
};
const extractSplitFromQuery = (q = "") => {
  if (
    q.includes("evaluation") ||
    q.includes("eval") ||
    q.includes("validation") ||
    q.includes("test set") ||
    q.includes("testing") ||
    q.includes("测试集") ||
    q.includes("验证集")
  ) return "evaluation";
  if (q.includes("training") || q.includes("train set") || q.includes("训练集")) return "training";
  return "training";
};
const OVERLAP_TOKENS = ["overlap", "shared", "intersection", "intersect", "交集", "重合", "同时", "共同"];
const hasOverlapSignal = (q = "") => OVERLAP_TOKENS.some((t) => q.includes(t));
const hasMultiModelSignal = (q = "") => extractModelMentions(q).length >= 2;
const isCompositeDonorQuestion = (q = "") =>
  q.includes("donor") &&
  (hasOverlapSignal(q) || hasMultiModelSignal(q) || q.includes("vs") || q.includes("和"));

const getForcedToolUses = (userMsg) => {
  const q = normalizeQ(userMsg);
  if (!q) return [];
  const compositeDonorQ = isCompositeDonorQuestion(q);

  if (q.includes("dataset cards") && q.includes("genomic fm") && q.includes("model card")) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "card_links", params: { modelId: "model_genomic" } } }];
  }
  if (
    (q.includes("provenance chain") || q.includes("lineage chain") || q.includes("谱系链") || q.includes("溯源链")) &&
    q.includes("genomic fm")
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "provenance_chain", params: { nodeId: "model_genomic" } } }];
  }
  if (q.includes("what datasets trained") && (q.includes("scfm-v1") || q.includes("scfm v1") || q.includes("single-cell fm v1") || q.includes("single cell fm v1"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "datasets_for_model", params: { modelId: "model_scfm" } } }];
  }
  if (q.includes("downstream of scrna") || (q.includes("which models") && q.includes("scrna"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "models_for_dataset", params: { datasetType: "scRNA-seq" } } }];
  }
  if ((q.includes("hpap-") || q.includes("hpap ")) && q.includes("wgs") && (q.includes("available") || q.includes("可用") || q.includes("available for use"))) {
    const donorCode = extractDonorCodeFromQuery(userMsg) || extractDonorCodeFromQuery(q) || "";
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "donor_modality_availability", params: { donorCode, modality: "WGS" } } }];
  }
  if (q.includes("what qc pipeline produced scrna") && (q.includes("scfm-v1") || q.includes("scfm v1") || q.includes("single-cell fm"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "qc_pipeline_for_model_modality", params: { modelId: "model_scfm", modality: "scRNA-seq" } } }];
  }
  if (q.includes("governance events") && (q.includes("2025-q2") || q.includes("2025 q2"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "governance_events_by_period", params: { period: "2025-Q2" } } }];
  }
  if (q.includes("need re-eval") && (q.includes("hpap-") || q.includes("hpap "))) {
    const donorCode = extractDonorCodeFromQuery(userMsg) || extractDonorCodeFromQuery(q) || "";
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "models_need_reeval_after_donor_qc", params: { donorCode } } }];
  }
  if ((q.includes("who is responsible") || q.includes("负责人")) && q.includes("qc pipeline") && (q.includes("scrna-v4") || q.includes("scrna v4") || q.includes("scrna"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "qc_pipeline_owner", params: { query: userMsg } } }];
  }
  if (q.includes("vanderbilt") && q.includes("datasets") && (q.includes("post-2024") || q.includes("after 2024"))) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "institution_datasets_used_after_year", params: { institution: "Vanderbilt", year: 2024 } } }];
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
    q.includes("t1d") &&
    (q.includes("比例") || q.includes("ratio") || q.includes("占比")) &&
    (q.includes("single-cell fm") || q.includes("single cell fm") || q.includes("scfm"))
  ) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "disease_composition_for_model_training", params: { modelId: "model_scfm" } },
    }];
  }
  if (
    q.includes("donor") &&
    q.includes("t1d") &&
    (q.includes("比例") || q.includes("ratio") || q.includes("占比")) &&
    q.includes("genomic fm")
  ) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "disease_composition_for_model_training", params: { modelId: "model_genomic" } },
    }];
  }
  if (
    q.includes("donor") &&
    q.includes("t1d") &&
    (q.includes("比例") || q.includes("ratio") || q.includes("占比")) &&
    q.includes("spatial fm")
  ) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "disease_composition_for_model_training", params: { modelId: "model_spatial" } },
    }];
  }
  if (
    q.includes("哪些donor") &&
    (q.includes("三个fm") || (q.includes("genomic fm") && q.includes("spatial fm") && (q.includes("single-cell fm") || q.includes("single cell fm") || q.includes("scfm")))) &&
    (q.includes("training") || q.includes("训练"))
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "cross_model_donor_leakage", params: {} } }];
  }
  if (
    (
      q.includes("embedding leakage") ||
      q.includes("embedding 泄露") ||
      q.includes("embedding泄露") ||
      q.includes("data leakage") ||
      q.includes("training data交叉") ||
      q.includes("training data 交叉") ||
      q.includes("training交叉") ||
      q.includes("训练 data 交叉") ||
      q.includes("数据交叉") ||
      q.includes("leakage")
    ) &&
    (q.includes("embedding")) &&
    (q.includes("genomic fm")) &&
    (q.includes("scfm") || q.includes("single-cell fm") || q.includes("single cell fm"))
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "cross_modality_embedding_leakage", params: {} } }];
  }
  if (
    (
      q.includes("distribution drift") ||
      q.includes("分布漂移") ||
      q.includes("drift") ||
      q.includes("reclassification") ||
      q.includes("reclassify")
    ) &&
    (q.includes("training") || q.includes("validation") || q.includes("evaluation") || q.includes("80/20") || q.includes("分配"))
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "train_eval_distribution_drift", params: {} } }];
  }
  if (
    (q.includes("metadata") || q.includes("reclassify") || q.includes("reclassification") || q.includes("上游")) &&
    (q.includes("impact") || q.includes("影响"))
  ) {
    const donorCode = extractDonorCodeFromQuery(userMsg) || extractDonorCodeFromQuery(q);
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "upstream_metadata_impact", params: { donorCode: donorCode || "HPAP-002" } },
    }];
  }
  if (
    (q.includes("shared validation") || q.includes("公共数据集") || q.includes("共用") || q.includes("overlap")) &&
    q.includes("genomic fm") &&
    (q.includes("single-cell") || q.includes("single cell") || q.includes("scfm") || q.includes("embedding"))
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "shared_validation_datasets_across_fms", params: {} } }];
  }
  if (
    q.includes("t1d") &&
    (q.includes("比例") || q.includes("ratio") || q.includes("bias") || q.includes("composition")) &&
    q.includes("三个fm")
  ) {
    return [{ id: "forced-1", name: "queryGraph", input: { intent: "disease_composition_bias_three_fms", params: {} } }];
  }
  if (
    q.includes("donor") &&
    hasOverlapSignal(q)
  ) {
    const mentions = extractModelMentions(q);
    if (mentions.length >= 2) {
      const a = mentions[0];
      const b = mentions[1];
      const split = extractSplitFromQuery(q);
      return [{
        id: "forced-1",
        name: "queryGraph",
        input: { intent: "donor_overlap_between_models", params: { modelAId: a, modelBId: b, splitA: split, splitB: split } },
      }];
    }
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
  if (!compositeDonorQ && q.includes("donor") && (q.includes("single-cell fm") || q.includes("single cell fm") || q.includes("scfm"))) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "training_donors_by_models", params: { modelIds: ["model_scfm"] } },
    }];
  }
  if (!compositeDonorQ && q.includes("donor") && q.includes("genomic fm")) {
    return [{
      id: "forced-1",
      name: "queryGraph",
      input: { intent: "training_donors_by_models", params: { modelIds: ["model_genomic"] } },
    }];
  }
  if (!compositeDonorQ && q.includes("donor") && q.includes("spatial fm")) {
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
      return [
        `${s.modelALabel} vs ${s.modelBLabel}${same}`,
        `Split: ${s.splitA || "training"} (A) vs ${s.splitB || "training"} (B)`,
        `Overlap donors: ${s.overlapCount}`,
        `${s.modelALabel}: ${s.modelADonorCount} donors`,
        `${s.modelBLabel}: ${s.modelBDonorCount} donors`,
        `Overlap ratio: ${pctA}% of model A, ${pctB}% of model B`,
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
      return [
        `${s.modelALabel} vs ${s.modelBLabel}${same}`,
        `Split: ${s.splitA || "training"} (A) vs ${s.splitB || "training"} (B)`,
        `Overlap donors: ${s.overlapCount}`,
        `${s.modelALabel}: ${s.modelADonorCount} donors`,
        `${s.modelBLabel}: ${s.modelBDonorCount} donors`,
        `Overlap ratio: ${pctA}% of model A, ${pctB}% of model B`,
      ].join("\n");
    }
    case "disease_composition_for_model_training": {
      const s = result?.summary || {};
      const c = s.composition || {};
      return [
        `${s.modelLabel} training donors: ${s.donorCount ?? rows.length}`,
        `T1D ratio: ${((s.t1dRatio || 0) * 100).toFixed(1)}%`,
        `Counts: T1D=${c.T1D ?? 0}, Control=${c.Control ?? 0}, AAb+=${c["AAb+"] ?? 0}, T2D=${c.T2D ?? 0}, Unknown=${c.Unknown ?? 0}`,
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
        `Before -> training T1D:Control = ${bTrain.counts?.T1D ?? 0}:${bTrain.counts?.Control ?? 0}, evaluation T1D:Control = ${bEval.counts?.T1D ?? 0}:${bEval.counts?.Control ?? 0}`,
        `After  -> training T1D:Control = ${aTrain.counts?.T1D ?? 0}:${aTrain.counts?.Control ?? 0}, evaluation T1D:Control = ${aEval.counts?.T1D ?? 0}:${aEval.counts?.Control ?? 0}`,
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
        `T1D ratio: ${((s.t1dRatio || 0) * 100).toFixed(1)}% (T1D=${c.T1D ?? 0}, Control=${c.Control ?? 0}, AAb+=${c["AAb+"] ?? 0}, T2D=${c.T2D ?? 0}, Unknown=${c.Unknown ?? 0})`,
      ].join("\n");
    }
    case "search_nodes":
      return `Found ${rows.length} matching node(s):\n${rows.map((r, i) => `${i + 1}. ${r.label} [${r.type}]`).join("\n")}`;
    case "get_neighbors":
      return `Found ${rows.length} neighbor edge(s):\n${rows.slice(0, 50).map((r, i) => `${i + 1}. ${r.fromLabel} -${r.edgeLabel}-> ${r.toLabel}`).join("\n")}`;
    case "extract_donors": {
      const s = result?.summary || {};
      return `Extracted ${s.donorCount ?? rows.length} donor(s):\n${rows.slice(0, 200).map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
    }
    case "set_operation": {
      const s = result?.summary || {};
      return `Set operation (${s.operator || "intersect"}) result: ${s.resultCount ?? rows.length} item(s).\n${rows.slice(0, 200).map((r, i) => `${i + 1}. ${r.label}`).join("\n")}`;
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
  const normalizeToolUse = (intent, params, idx=1) => {
    const safeIntent = String(intent || "").trim();
    if (!INTENT_ENUM.includes(safeIntent)) return null;
    return {
      id: `graph-${idx}-${Date.now()}`,
      name: "queryGraph",
      input: {
        intent: safeIntent,
        params: params && typeof params === "object" ? params : {},
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
      addTrace({ kind:"step", icon:"🧠", label:"LangGraph - route", detail:"Initializing graph state..." });

      const LGState = Annotation.Root({
        question: Annotation({ default: () => "" }),
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
        if (forced.length) {
          addTrace({ kind:"intent", icon:"🧭", label:"LangGraph route", detail:`Forced route with ${forced.length} tool step(s).` });
        }
        return { forcedQueue: forced, forceOnly: forced.length > 0 };
      };

      const planNode = async (state) => {
        if (state.done) return {};
        if (state.noProgressCount >= 1) {
          addTrace({ kind:"info", icon:"🛑", label:"LangGraph stop", detail:"Stopping due to repeated no-progress tool calls." });
          return { done: true };
        }
        if (state.step >= LANGGRAPH_MAX_STEPS) {
          addTrace({ kind:"info", icon:"⏱️", label:"LangGraph planner", detail:"Reached max steps, moving to answer node." });
          return { done: true };
        }
        if (state.forceOnly && (!state.forcedQueue || state.forcedQueue.length === 0) && state.traceQueries.length > 0) {
          addTrace({ kind:"info", icon:"✅", label:"LangGraph fast-exit", detail:"Forced route satisfied; skipping extra planner rounds." });
          return { done: true };
        }

        if (state.forcedQueue?.length) {
          const [next, ...rest] = state.forcedQueue;
          return { nextToolUse: next, forcedQueue: rest };
        }

        const qNorm = normalizeQ(state.question);
        if (qNorm.includes("donor") && hasOverlapSignal(qNorm) && hasMultiModelSignal(qNorm)) {
          const alreadyHasOverlapEvidence = state.traceQueries.some(
            (q) => q.intent === "training_donor_overlap_between_models" || q.intent === "donor_overlap_between_models" || q.intent === "set_operation"
          );
          if (!alreadyHasOverlapEvidence) {
            const mentions = extractModelMentions(qNorm);
            const split = extractSplitFromQuery(qNorm);
            return {
              nextToolUse: normalizeToolUse("donor_overlap_between_models", {
                modelAId: mentions[0],
                modelBId: mentions[1],
                splitA: split,
                splitB: split,
              }, state.step + 1),
            };
          }
        }

        addTrace({ kind:"step", icon:"🗺️", label:`LangGraph plan step ${state.step + 1}`, detail:"Selecting next tool action..." });
        const evidence = state.traceQueries.map((q) => summarizeResultForPlanner(q.intent, q.result));
        const plannerMsg = {
          role: "user",
          content: JSON.stringify({
            question: state.question,
            step: state.step + 1,
            maxSteps: LANGGRAPH_MAX_STEPS,
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
          addTrace({ kind:"intent", icon:"🧭", label:"LangGraph planner: clarify", detail:`confidence=${confidence.toFixed(2)}` });
          return { done: true, finalAnswer: String(planJson.clarify_question || "Could you clarify your target model/dataset/donor?") };
        }
        if (mode === "answer") {
          addTrace({ kind:"intent", icon:"🧭", label:"LangGraph planner: answer", detail:`confidence=${confidence.toFixed(2)}` });
          return { done: true, finalAnswer: String(planJson.answer || "") };
        }

        const nextTool = normalizeToolUse(planJson.intent, planJson.params, state.step + 1);
        if (nextTool) {
          const sig = `${nextTool.input.intent}:${JSON.stringify(nextTool.input.params || {})}`;
          if (sig === state.lastActionSignature) {
            addTrace({ kind:"info", icon:"🛑", label:"LangGraph dedup", detail:"Planner proposed the same query again; ending iterative loop." });
            return { done: true };
          }
          addTrace({ kind:"intent", icon:"🎯", label:`Intent: ${nextTool.input.intent}`, detail:`params: ${JSON.stringify(nextTool.input.params||{})}` });
          return { nextToolUse: nextTool };
        }

        addTrace({ kind:"info", icon:"↩️", label:"LangGraph planner fallback", detail:"Planner output invalid; using tool-call fallback." });
        const fallbackData = await callAnthropic({
          system: GRAPH_CONTEXT,
          tools: AGENT_TOOLS,
          messages: state.history.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: 900,
        });
        const fallbackTool = (fallbackData.content || []).find((b) => b.type === "tool_use");
        if (fallbackTool?.input?.intent) {
          const fallbackNext = normalizeToolUse(fallbackTool.input.intent, fallbackTool.input.params, state.step + 1);
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
        addTrace({ kind:"step", icon:"🔎", label:"LangGraph - act", detail:`Executing ${tu.input.intent}` });
        const { intent, params } = tu.input;
        const result = queryGraph(intent, params || {});
        const nRows = result.rows?.length ?? 0;
        const actionSignature = `${intent}:${JSON.stringify(params || {})}`;
        const repeatedSameAction = actionSignature === state.lastActionSignature;
        const noProgressCount = repeatedSameAction && nRows === 0 ? (state.noProgressCount || 0) + 1 : 0;
        addTrace({ kind:"result", icon: nRows>0?"OK":"INFO", label:`${intent}`, detail:`${nRows} row${nRows!==1?"s":""} returned`, rows: result.rows?.slice(0,3) });
        if (repeatedSameAction && nRows === 0) {
          addTrace({ kind:"info", icon:"🛑", label:"LangGraph no-progress", detail:"Repeated empty result for the same query; stopping to avoid loop." });
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
        const hasOverlapNeed = q.includes("donor") && hasOverlapSignal(q) && hasMultiModelSignal(q);
        const last = traceQueries[traceQueries.length - 1];
        if (!last) return { ok: false, reason: "No query result yet." };
        const rows = Array.isArray(last.result?.rows) ? last.result.rows : [];

        if (hasOverlapNeed) {
          const overlapHit = traceQueries.some((x) =>
            x.intent === "training_donor_overlap_between_models" || x.intent === "donor_overlap_between_models"
          );
          if (!overlapHit) {
            return { ok: false, reason: "Question asks overlap across models, but overlap query has not been executed yet." };
          }
          return { ok: true, reason: "Overlap query evidence is present." };
        }

        if (q.includes("provenance chain") || q.includes("lineage chain") || q.includes("溯源链")) {
          const chainHit = traceQueries.some((x) => x.intent === "provenance_chain" && (x.result?.rows?.length || 0) > 0);
          return chainHit
            ? { ok: true, reason: "Provenance chain evidence found." }
            : { ok: false, reason: "Provenance chain question requires non-empty provenance_chain result." };
        }

        if (q.includes("training set") && q.includes("donor")) {
          const donorHit = traceQueries.some((x) => x.intent === "training_donors_by_models" && (x.result?.rows?.length || 0) > 0);
          return donorHit
            ? { ok: true, reason: "Training donor evidence found." }
            : { ok: false, reason: "Training-set donor question requires donor extraction evidence." };
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
          icon: verdict.ok ? "✅" : "🧪",
          label: "LangGraph - verify",
          detail: verdict.reason,
        });
        if (verdict.ok) return { done: true, verified: true };
        return { verified: false };
      };

      const answerNode = async (state) => {
        setPhase("answering");
        if (state.finalAnswer) return { finalAnswer: state.finalAnswer };
        if (state.traceQueries.length === 1) {
          const only = state.traceQueries[0];
          const templated = formatIntentAnswer(only.intent, only.params, only.result);
          if (templated) return { finalAnswer: templated };
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
        return { finalAnswer: answerText || "No answer generated." };
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
      addTrace({ kind:"done", icon:"✅", label:"Done", detail:`LangGraph run completed in ${finalState.step ?? 0} step(s)` });
      setMessages(m=>[...m, { role:"assistant", content:answer, trace:finalState.traceQueries || [] }]);
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
          {INTENT_ENUM.map(intent=>(
            <div key={intent} style={{ fontSize:p?11:9, fontFamily:"monospace", color:"#7c3aed", padding:"2px 0", lineHeight:1.7 }}>{intent}</div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default AgentView;

