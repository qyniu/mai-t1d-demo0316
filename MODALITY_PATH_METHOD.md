# Data Modality Path Method (Demo2)

Last updated: 2026-04-03
Source: `NC_HPAP Data Inventory.xlsx` (`Chenxi` sheet, first two columns)

## 1. Path generation method for each data modality

This project currently uses one unified KG path pattern for each modality:

`Donor -> Sample -> Cohort(Modality) -> QC Pipeline -> Processed Dataset -> Foundation Model`

In edge labels:

`Donor -[HAD_MEMBER]-> Sample`
`Cohort(Modality) -[HAD_MEMBER]-> Sample`
`Cohort(Modality) -[USED]-> QC Pipeline`
`QC Pipeline -[WAS_GENERATED_BY]-> Processed Dataset`
`Processed Dataset -[TRAINED_ON]-> Foundation Model`

## 2. Node ID / label generation rules

### 2.1 Donor node
- ID: `donor_<hpap_id_lower>`  
  Example: `donor_hpap_001`
- Label: `HPAP-001`

### 2.2 Sample node
- ID template:  
  `sample_<hpap_id_lower>_<modality_slug>_<cell_type_slug>_<index4>`
- Label template:  
  `<Donor> <Data Modality>\n<CellTypeDisplay>`

Normalization used:
- `<modality_slug>`: lowercase + `_`, e.g. `bulk_atac`, `bulk_rna`
- `<cell_type_slug>`:
  - non-empty cell type -> lowercase slug (e.g. `alpha`, `beta`)
  - empty/unknown -> `unknown_cell`
- `<CellTypeDisplay>`:
  - non-empty cell type -> original cell type
  - empty/unknown -> `Pancreas` (display label)
- `<index4>`: zero-padded serial number (`0001`, `0002`, ...)

### 2.3 Cohort node per modality
- ID template: `cohort_<modality_slug>_seq` (for seq modalities in current graph)
- Label template: `HPAP cohort\n<Data Modality>`

### 2.4 QC pipeline node per modality
- ID template: `qc_<modality_slug>`
- Label template: `<Modality short name> QC\nPipeline <version>`

### 2.5 Processed dataset node per modality
- ID template: `proc_<modality_slug>_v<major>`
- Label template: `<Data Modality> Dataset\nv<version>`

## 3. Modality -> model mapping from Chenxi sheet

Rule applied:
- Read only first 2 columns (`Data Modality`, `Model`)
- Skip rows where `Model` is `TBD` (as requested)
- Skip blank/invalid rows

Kept rows:

| Data Modality | Model (from Chenxi) | Demo2 model node (current/planned) |
|---|---|---|
| Bulk ATAC-seq | Geonomic FM | `model_genomic` |
| Bulk RNA-seq | Geonomic FM | `model_genomic` |
| CITE-seq Protein | Protein FM | Planned |
| Flow Cytometry | Protein FM | Planned |
| snMultiomics | Sing-cell FM | `model_scfm` (family) |
| scATAC-seq | Sing-cell FM | `model_scfm` (family) |
| scRNA-seq | Sing-cell FM | `model_scfm` |
| IMC | Spatial FM | Planned |
| Histology | Spatial FM | Planned |
| CyTOF | Spatial FM | Planned |
| CODEX | Spatial FM | Planned |

Notes:
- `Geonomic FM` / `Sing-cell FM` are kept exactly as written in source sheet.
- Rows with `TBD` were intentionally excluded.

## 4. Rows intentionally skipped

Skipped due to `TBD` model:
- `BCR-seq`, `TCR-seq`, `Perifusion`, `Calcium Imaging`, `Patch-seq`, `Oxygen Consumption`, `TEAseq`

Skipped due to blank/non-standard model cell:
- `WGS`, `CosMx`, `TEDDY:` related helper rows, and trailing `validation` row

## 5. Where each field comes from (for auto-generation)

This section is the data dictionary for script generation.

### 5.1 Workbook-level source roles

| Source sheet | Purpose in generator |
|---|---|
| `Chenxi` | Global `Data Modality -> Model` routing (use col A/B only; skip `TBD`) |
| `Sheet3` | Donor-level availability matrix (which donor has which modality) + donor metadata |
| `Data Track` | QC/pipeline/storage/contact/email for modality-level chain nodes |
| `<Modality sheet>` (e.g. `Bulk RNA-seq`) | Concrete sample records; all columns copied into sample node `detail` |

### 5.2 Column mapping used by generator

#### A) `Chenxi` (first 2 columns only)
- `A: Data Modality` -> modality key
- `B: Model` -> model family/routing target
- Filter: drop rows where `Model == TBD` or empty

#### B) `Sheet3` (donor availability and donor attributes)
- `A: donor_ID` -> donor node ID/label source
- Modality flag columns (binary in current file):  
  `W:scRNA-seq`, `X:scATAC-seq`, `Y:snMultiomics`, `Z:CITE-seq Protein`, `AA:TEA-seq`, `AB:BCR-seq`, `AC:TCR-seq`, `AD:Bulk RNA-seq`, `AE:Bulk ATAC-seq`, `AF:WGS`, `AG:Calcium Imaging`, `AH:Flow Cytometry`, `AI:Oxygen Consumption`, `AJ:Perifusion`, `AK:CODEX`, `AL:IMC`, `AM:Histology`
- Rule: donor is eligible for modality if flag in corresponding column is truthy (`1`, `true`, `yes`, etc.)
- All donor columns are copied into donor node `detail` in donor import stage

#### C) `Data Track` (modality-level chain metadata)
- `A: Data Modality` -> join key (normalize spaces/case)
- `C: Pipeline` -> QC pipeline node detail (`Pipeline`)
- `D: After QC Data` -> processed dataset node detail (`AfterQCData`)
- `E: Metadata` -> processed dataset/QC supporting detail
- `G: Storage Location (primary)` -> canonical `Path`
- `H: Responsible Person` -> `Contact`
- `I: Email` -> `Email`
- `J: Data Status` -> optional status note

#### D) Each modality sheet (sample rows)
- First non-empty row is treated as header
- Every subsequent non-empty row is one sample node candidate
- Required join columns:
  - `Donor` (or equivalent donor column)
  - `Data Modality` (should match sheet/modality key)
- All non-empty columns in the row are copied to sample node `detail`

### 5.3 Known modality sheets and headers (current workbook)

Use this as canonical parsing schema per modality sheet:

- `Bulk ATAC-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `File`, `Source`, `Contact`
- `Bulk RNA-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `Run`, `File`, `Source`, `Contact`
- `CITE-seq Protein`: `Donor`, `Data Modality`, `Tissue`, `Region`, `Source`, `Contact`
- `Flow Cytometry`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `File`, `Source`, `Contact`
- `snMultiomics`: `Donor`, `Data Modality`, `Tissue`, `Region`, `Contact`
- `scATAC-seq`: `Donor`, `Data Modality`, `Tissue`, `Source`, `Contact`
- `scRNA-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `Source`, `Contact`
- `IMC`: `Donor`, `Data Modality`, `Tissue`, `Source`, `Contact`
- `BCR-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `Sample`, `Technical replicate`, `File`, `Source`, `Contact`
- `TCR-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `File`, `Source`, `Contact`
- `Perifusion`: `Donor`, `Data Modality`, `Tissue`, `Region`, `File`, `Source`, `Contact`
- `Histology`: `Donor`, `Data Modality`, `Tissue`, `svs_total`, `svs_ffpe`, `svs_oct_flash_frozen`, `svs_oct_lightly_fixed`, `svs_other`, `ndpi_total`, `ndpi_ffpe`, `ndpi_oct_flash_frozen`, `ndpi_oct_lightly_fixed`, `ndpi_other`, `locations`, `Contact`
- `CyTOF`: `Donor`, `Data Modality`, `Tissue`, `Markers`, `File`, `Contact`
- `CODEX`: `Donor`, `Data Modality`, `Tissue`, `Region`, `File`, `Contact`
- `Calcium Imaging`: `Donor`, `Data Modality`, `Tissue`, `Region`, `Run`, `File`, `Source`, `Contact`
- `Patch-seq`: `Donor`, `Data Modality`, `Cell_Type`, `Tissue`, `plate`, `well`, `File`, `Source`, `Contact`
- `Oxygen Consumption`: `Donor`, `Data Modality`, `Tissue`, `File`, `Source`, `Contact`
- `pseudo bulk RNA+ATAC`: currently no structured header/data row in this workbook (treat as unsupported until populated)

## 6. Auto-generation algorithm (script contract)

Target: auto-generate `<modality>Nodes.js` and integrate into `graphData.js`.

### Step 1. Build modality config map
- Load `Chenxi(A,B)` -> `modality_to_model`
- Exclude `TBD` and empty model rows

### Step 2. Build donor eligibility map
- Load `Sheet3`
- For each donor row, read corresponding modality flag column
- `eligible_donors[modality] = {HPAP-xxx...}`

### Step 3. Read sample rows from modality sheet
- For each kept modality:
  - Open same-named sheet (or configured alias)
  - Parse header row
  - For each non-empty row:
    - Get `donor = row["Donor"]`
    - If donor not in `eligible_donors[modality]`, optionally keep but mark `eligibility_mismatch=true`
    - Build sample node with full `detail=row_non_empty_columns`

### Step 4. Derive label pieces
- `CellTypeDisplay` priority:
  1. `Cell_Type` if exists and non-empty
  2. else `Tissue` if exists and non-empty
  3. else `"Pancreas"`
- Apply unknown normalization:
  - if `Cell_Type` is empty / `unknown` / `na` / `n/a` -> display `"Pancreas"`

### Step 5. Create nodes and edges
- Create:
  - sample nodes
  - one cohort node per modality
  - one QC node per modality
  - one processed dataset node per modality
- Create edges:
  - donor -> sample (`HAD_MEMBER`)
  - cohort -> sample (`HAD_MEMBER`)
  - cohort -> qc (`USED`)
  - qc -> processed (`WAS_GENERATED_BY`)
  - processed -> model (`TRAINED_ON`) if model exists and not `TBD`

### Step 6. Fill QC/dataset details from `Data Track`
- Join on normalized modality name
- Map fields:
  - `Pipeline` <- col C
  - `AfterQCData` <- col D
  - `Metadata` <- col E
  - `Path` <- col G
  - `Contact` <- col H
  - `Email` <- col I
  - `Status` <- col J

### Step 7. Output contract
- For each modality, generated module exports:
  - `<MODALITY>_NODES`
  - `<MODALITY>_HAD_MEMBER_EDGES`
  - `<MODALITY>_COHORT_NODE`
  - `<MODALITY>_COHORT_MEMBER_EDGES`
  - optionally `<MODALITY>_PIPELINE_NODE`, `<MODALITY>_PROCESSED_NODE`, `<MODALITY>_CHAIN_EDGES`

## 7. Validation checks required by generator

- Every sample node must have a donor ID and modality name
- No duplicate sample IDs
- `HAD_MEMBER` edges must not point to missing nodes
- `Processed -> Model` edge only when model is non-empty and non-`TBD`
- Keep line-break labels as real newline (`\n`), not escaped literal (`\\n`)
