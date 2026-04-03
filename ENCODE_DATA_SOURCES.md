# ENCODE Real Data Sources

Fetched via ENCODE Portal REST API (encodeproject.org) on 2026-04-03.  
License: **CC0** (public domain) — no restrictions on use.

---

## Experiments

### TF ChIP-seq — ENCSR785RQR
- **Target:** JUND transcription factor
- **Biosample:** K562 (human chronic myelogenous leukemia cell line), CRISPR deletion of CEBPB
- **Lab:** Michael Snyder, Stanford University
- **Released:** 2025-09-27
- **Replicates:** 1 biological
- **Files:** 2
- **URL:** https://www.encodeproject.org/experiments/ENCSR785RQR/

### TF ChIP-seq (alt) — ENCSR054ZMK
- **Target:** NR2F2 transcription factor
- **Biosample:** HepG2 (human hepatocellular carcinoma), shRNA targeting FOXA3
- **Lab:** Michael Snyder, Stanford University
- **URL:** https://www.encodeproject.org/experiments/ENCSR054ZMK/

### ATAC-seq — ENCSR844TIU
- **Biosample:** Regulatory T cell — *Mus musculus* C57BL/6NJ (primary cell)
- **Lab:** Tim Reddy, Duke University
- **Released:** 2025-09-30
- **Replicates:** 2 biological × 2 technical
- **Files:** 10 (fastq, BAM, bigWig, narrowPeak)
- **Sequencer:** Illumina NextSeq 500
- **Assembly:** mm10
- **URL:** https://www.encodeproject.org/experiments/ENCSR844TIU/

### total RNA-seq — ENCSR863GGC
- **Biosample:** T-helper 9 cell — *Homo sapiens* female adult (25 years, primary cell)
- **Lab:** John Stamatoyannopoulos, University of Washington
- **Released:** 2026-01-26
- **Replicates:** 1 biological
- **Files:** 3 (fastq × 2, quantification × 1)
- **Assembly:** GRCh38
- **URL:** https://www.encodeproject.org/experiments/ENCSR863GGC/

---

## Pipelines

### ATAC-seq Pipeline — ENCPL867PDN
- **Name:** GGR ATAC-seq pipeline VERSION TR.1
- **Lab:** Tim Reddy, Duke University
- **Status:** Released
- **Software:**
  - Mapping & filtering: Bowtie 1.2.3, Picard 2.14, Trimmomatic 0.32, BEDTools 2.26.0
  - Peak calling: MACS 2.1.1.20160309
  - Quantification: BEDTools 2.26.0, bedGraphToBigWig 4
  - Format conversion: bedToBigBed 2.7
- **URL:** https://www.encodeproject.org/pipelines/ENCPL867PDN/

### RNA-seq Pipeline — ENCPL280OHK
- **Name:** Altius Total RNA-seq Pipeline
- **Version:** 1
- **Assembly:** GRCh38
- **URL:** https://www.encodeproject.org/pipelines/ENCPL280OHK/

### ChIP-seq Pipeline — ENCPL436CSM
- **Name:** CRG ChIP-seq
- **Software:** GEM-Tools, Picard, MACS, Zerone, bedToBigBed
- **URL:** https://www.encodeproject.org/pipelines/ENCPL436CSM/

---

## Reference Model: Enformer

- **Full name:** Enformer (Sequence-to-Function Foundation Model)
- **Architecture:** Transformer + Perceiver (attention pooling)
- **Parameters:** ~250M
- **Input:** 196 kb genomic sequence (human or mouse)
- **Output:** 5,313 human + 1,643 mouse genomic tracks
- **Training data:** ENCODE + Roadmap Epigenomics (ChIP-seq, ATAC-seq, RNA-seq, DNase-seq)
- **Publication:** Avsec et al., *Nature Methods* 2021 — doi:[10.1038/s41592-021-01252-x](https://doi.org/10.1038/s41592-021-01252-x)
- **GitHub:** https://github.com/deepmind/deepmind-research/tree/master/enformer
- **HuggingFace:** https://huggingface.co/EleutherAI/enformer-official-rough
- **License:** Apache 2.0
- **Performance:** Gene expression Pearson r = 0.854 (vs. Basenji2 r = 0.836 at publication)

---

## ENCODE Consortium Reference

> ENCODE Project Consortium et al. "Expanded encyclopaedias of DNA elements in the human and mouse genomes." *Nature* 583, 699–710 (2020).  
> doi: [10.1038/s41586-020-2493-4](https://doi.org/10.1038/s41586-020-2493-4)

---

## How to verify these sources are real

1. Open each **URL** above and confirm the accession exists and the object is **Released**.
2. Run the repo verifier script (requires internet access to `encodeproject.org`):

```powershell
powershell -ExecutionPolicy Bypass -File .\verify_encode_sources.ps1
```

Optional (slower): also verify the **released file count** per experiment:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify_encode_sources.ps1 -CheckReleasedFileCount
```

Tip: use `-ForceRefresh` to ignore any cached JSON in `verification/encode`.
