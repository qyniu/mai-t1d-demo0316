# ENCODE PoC Evidence (Metadata + Agent Latency)

Date: 2026-04-03
Deployed site (Vercel): <paste your URL here>

This folder contains screenshots that demonstrate:
1) The selected ENCODE experiments exist on the ENCODE Portal and are **released** (metadata evidence).
2) The deployed Governance Agent can answer a fixed provenance question for each accession.
3) The Anthropic-backed API request latency (Network timing) for each question.

## Datasets (2)

### ENCSR054ZMK
- Portal URL: https://www.encodeproject.org/experiments/ENCSR054ZMK/
- Fixed agent question: `Show the provenance chain for ENCSR054ZMK.`
- Observed agent latency (Network `messages` duration): ~3.8 s (≈3800 ms)
- Evidence screenshots:
  - `ENCODE_ENCSR054ZMK_1_experiment_page.png.png` (portal page / released status)
  - `ENCODE_ENCSR054ZMK_3_agent_answer.png.png` (agent question + answer)
  - `ENCODE_ENCSR054ZMK_2_network_duration.png.png` (Network timing for `/api/anthropic/messages`)

### ENCSR844TIU
- Portal URL: https://www.encodeproject.org/experiments/ENCSR844TIU/
- Fixed agent question: `Show the provenance chain for ENCSR844TIU.`
- Observed agent latency (Network `messages` duration): ~3.2 s (≈3200 ms)
- Evidence screenshots:
  - `ENCODE_ENCSR844TIU_1_experiment_page.png.png` (portal page / released status)
  - `ENCODE_ENCSR844TIU_3_agent_answer.png.png` (agent question + answer)
  - `ENCODE_ENCSR844TIU_2_network_duration.png.png` (Network timing for `/api/anthropic/messages`)

## Notes

- The Portal screenshots are “page UI” evidence; the Network screenshots are the deployed-site latency evidence.
- Raw sequencing files were not downloaded; this evidence package is metadata-based and sufficient for the ENCODE PoC verification requirement.
