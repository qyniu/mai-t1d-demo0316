# Agent Evaluation Plan (Aligned to Manuscript S1/S2/S8/S9)

## 1. Objective
Evaluate the current frontend governance agent for:
- EQ1 governance competency coverage (CQ1-CQ8)
- EQ5 agent queryability (natural-language to tool-intent execution)
- Partial EQ6 capability evidence (whether Q2/AQ1-AQ2 style questions are directly answerable in this demo)

## 2. Test Environment
- App URL: `http://127.0.0.1:5173`
- Mode: Governance Agent tab (frontend-only)
- Data source: local `graphData` and `queryGraph` implementation
- Execution: headless browser automation (`playwright-core`)

## 3. Evaluation Set
### 3.1 Core competency questions (CQ1-CQ8)
1. What data produced model X? (`datasets_for_model`)
2. Which models are affected by data change X? (`impact_downstream`)
3. QC pipeline version for dataset Y? (`pipeline_for_dataset`)
4. Disease stage distribution for model training donors? (`donor_attribute_ratio`)
5. Shared donors between FM-A and FM-B? (`training_donor_overlap_between_models` / `donor_overlap_between_models`)
6. Cross-FM train/val leakage-like overlap? (`donor_overlap_between_models` / leakage intents)
7. Full provenance chain for sample/entity? (`provenance_chain`)
8. Planned configs referencing deprecated data? (expected to test staleness readiness; currently likely degraded by graph coverage)

### 3.2 API-pattern analogs (AQ1-AQ4)
- AQ1 compliance check -> `compliance_status`
- AQ2 impact scope -> `impact_downstream` / `reclassification_distribution_impact`
- AQ3 provenance reconstruction -> `provenance_chain`
- AQ4 change log -> `governance_events_by_period` (if graph coverage exists)

## 4. Metrics
For each test question:
- Final selected intent
- Intent correctness (expected family)
- Answer-shape correctness (contains required evidence fields)
- Practical answerability verdict:
  - PASS: intent + answer shape both acceptable
  - PARTIAL: answer text usable but intent tracking/routing unstable
  - FAIL: wrong or insufficient answer

Aggregate metrics:
- Pass rate = PASS / total
- Coverage rate = (PASS + PARTIAL) / total
- Failure taxonomy by root cause

## 5. Pass/Fail Criteria
- PASS: correct intent family + non-empty evidence + answer addresses user ask directly
- PARTIAL: user-facing answer mostly right, but routing/trace/final intent is unstable
- FAIL: question not answered, wrong object focus, or unsupported capability

## 6. Root-Cause Taxonomy
- R1: intent trace instability (final intent missing)
- R2: search_nodes early stop / unresolved follow-up
- R3: focus mismatch (models vs datasets vs tasks)
- R4: graph coverage gap (entity/config not present)
- R5: unsupported query class in current demo graph

## 7. Execution Procedure
1. Start app and open Governance Agent.
2. Clear chat before each question.
3. Submit question and wait for completion marker.
4. Capture intent trace and final answer text.
5. Score against expected intent family and answer-shape rules.
6. Write markdown report with per-question verdict and summary counts.

## 8. Outputs
- `reports/paper-eval-report.md` (automated run output)
- Final reviewer summary (manual synthesis) including:
  - what is currently reliable,
  - what is partially reliable,
  - what needs refactor or graph expansion.
