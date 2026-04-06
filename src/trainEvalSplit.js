const toId = (v) => (typeof v === "object" ? v?.id : v);

const parseDonorNumber = (donor) => {
  const m = String(donor ?? "").toUpperCase().match(/HPAP-(\d+)/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

const donorFromNode = (node) => {
  const detailDonor = String(node?.detail?.Donor ?? "").trim();
  if (detailDonor) return detailDonor.toUpperCase();
  const labelDonor = String(node?.label ?? "").match(/HPAP-\d+/i)?.[0];
  return String(labelDonor ?? "").toUpperCase();
};

const sortSampleIdsByDonor = (sampleIds, nodeById) => {
  return [...sampleIds].sort((a, b) => {
    const donorA = donorFromNode(nodeById.get(a));
    const donorB = donorFromNode(nodeById.get(b));
    const numA = parseDonorNumber(donorA);
    const numB = parseDonorNumber(donorB);
    if (numA !== numB) return numA - numB;
    const donorCmp = donorA.localeCompare(donorB);
    if (donorCmp !== 0) return donorCmp;
    return String(a).localeCompare(String(b));
  });
};

const splitBy8020 = (sortedIds) => {
  if (sortedIds.length === 0) return { trainingIds: [], evaluationIds: [] };
  const trainCount = Math.floor(sortedIds.length * 0.8);
  const safeTrainCount = trainCount === 0 ? 1 : trainCount;
  return {
    trainingIds: sortedIds.slice(0, safeTrainCount),
    evaluationIds: sortedIds.slice(safeTrainCount),
  };
};

export const buildTrainEvalAssignments = ({ nodes, edges }) => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const cohortToQc = new Map(
    edges.filter((e) => e.label === "USED").map((e) => [toId(e.source), toId(e.target)])
  );
  const qcToDataset = new Map(
    edges
      .filter((e) => e.label === "GENERATED_BY" || e.label === "WAS_GENERATED_BY")
      .map((e) => [toId(e.source), toId(e.target)])
  );

  const datasetToCohort = new Map();
  for (const [cohortId, qcId] of cohortToQc.entries()) {
    const datasetId = qcToDataset.get(qcId);
    if (datasetId) datasetToCohort.set(datasetId, cohortId);
  }

  const assignments = {};
  for (const [datasetId, cohortId] of datasetToCohort.entries()) {
    const sampleIds = edges
      .filter((e) => e.label === "HAD_MEMBER" && toId(e.source) === cohortId)
      .map((e) => toId(e.target))
      .filter((id) => nodeById.has(id));

    const sortedIds = sortSampleIdsByDonor(sampleIds, nodeById);
    const { trainingIds, evaluationIds } = splitBy8020(sortedIds);
    assignments[datasetId] = {
      cohortId,
      sampleIds: sortedIds,
      trainingIds,
      evaluationIds,
      splitRatio: "80/20",
    };
  }

  return assignments;
};

