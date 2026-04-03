<#
.SYNOPSIS
  Verifies that the ENCODE accessions referenced in encode_real_metadata.json exist on the ENCODE Portal
  and that a small set of key metadata fields match.

.DESCRIPTION
  This script provides a reproducible check that the accessions in this repo are real ENCODE objects
  (experiments/pipelines) by fetching JSON from encodeproject.org.

  It writes raw JSON responses to a local cache directory so you can archive evidence of what you
  saw on a given date.

.PARAMETER MetadataPath
  Path to encode_real_metadata.json (default: ./encode_real_metadata.json)

.PARAMETER OutDir
  Directory to store cached JSON and verification output (default: ./verification/encode)

.PARAMETER CheckReleasedFileCount
  If set, additionally queries the ENCODE search endpoint to count *released* files per experiment
  and compares to the "files" count in encode_real_metadata.json. This is slower and requires
  additional network calls.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\\verify_encode_sources.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\\verify_encode_sources.ps1 -CheckReleasedFileCount
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$MetadataPath = "encode_real_metadata.json",

  [Parameter(Mandatory = $false)]
  [string]$OutDir = "verification/encode",

  [Parameter(Mandatory = $false)]
  [switch]$CheckReleasedFileCount,

  [Parameter(Mandatory = $false)]
  [switch]$ForceRefresh
)

$ErrorActionPreference = "Stop"

# ENCODE Portal requires modern TLS. Some Windows/PowerShell environments default to older protocols.
try {
  [Net.ServicePointManager]::SecurityProtocol =
    [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
} catch {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

function Normalize-ForContains([string]$value) {
  if ($null -eq $value) { return "" }
  $value = $value.ToLowerInvariant()
  $value = ($value -replace "[^a-z0-9]+", " ").Trim()
  return ($value -replace "\\s+", " ")
}

function Assert-ContainsLoose([string]$label, [string]$expected, [string]$actual) {
  $expectedN = Normalize-ForContains $expected
  $actualN = Normalize-ForContains $actual
  if ([string]::IsNullOrWhiteSpace($expectedN)) { return $true }
  if ($actualN.Contains($expectedN)) { return $true }
  Write-Host "  FAIL ${label}: expected contains '$expected' but got '$actual'" -ForegroundColor Red
  return $false
}

function Assert-Equals([string]$label, [string]$expected, [object]$actual) {
  $actualS = if ($null -eq $actual) { "" } else { [string]$actual }
  if ($expected -eq $actualS) { return $true }
  Write-Host "  FAIL ${label}: expected '$expected' but got '$actualS'" -ForegroundColor Red
  return $false
}

function Get-EncodeJson([string]$url, [string]$outPath) {
  if (-not $ForceRefresh -and (Test-Path -LiteralPath $outPath)) {
    return (Get-Content -Raw -LiteralPath $outPath | ConvertFrom-Json)
  }

  $headers = @{
    "Accept"     = "application/json"
    "User-Agent" = "demo3-ENCODE-verifier/1.0"
  }
  try {
    $obj = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    $null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outPath)
    $obj | ConvertTo-Json -Depth 50 | Out-File -FilePath $outPath -Encoding utf8
    return $obj
  } catch {
    if (Test-Path -LiteralPath $outPath) {
      Write-Host "  WARN network fetch failed; using cached JSON: $outPath" -ForegroundColor DarkYellow
      return (Get-Content -Raw -LiteralPath $outPath | ConvertFrom-Json)
    }
    $msg = $_.Exception.Message
    throw "Failed to fetch ENCODE JSON from '$url'. Network/TLS/proxy issue? Details: $msg"
  }
}

function Get-ExperimentReleasedFileCount([string]$accession, [string]$outPath) {
  $datasetPath = "/experiments/$accession/"
  $url = "https://www.encodeproject.org/search/?type=File&dataset=$datasetPath&status=released&limit=all&format=json"
  $search = Get-EncodeJson -url $url -outPath $outPath
  if ($null -eq $search.'@graph') { return 0 }
  return @($search.'@graph').Count
}

if (!(Test-Path -LiteralPath $MetadataPath)) {
  throw "Metadata file not found: $MetadataPath"
}

$metadata = Get-Content -Raw -LiteralPath $MetadataPath | ConvertFrom-Json

$null = New-Item -ItemType Directory -Force -Path $OutDir
$resultsPath = Join-Path $OutDir "verification_results.json"

$results = [System.Collections.Generic.List[object]]::new()

Write-Host "ENCODE verification started" -ForegroundColor Cyan
Write-Host "  Metadata: $MetadataPath"
Write-Host "  Output:   $OutDir"
Write-Host "  Date:     $([DateTimeOffset]::Now.ToString('u'))"
Write-Host ""

function Verify-Experiment([pscustomobject]$exp) {
  $accession = $exp.accession
  Write-Host "Experiment $accession" -ForegroundColor Yellow

  $url = "https://www.encodeproject.org/experiments/$accession/?format=json"
  $cachePath = Join-Path $OutDir "$accession.experiment.json"
  $remote = Get-EncodeJson -url $url -outPath $cachePath

  $ok = $true
  $ok = (Assert-ContainsLoose "@id" "/experiments/$accession/" $remote.'@id') -and $ok
  $ok = (Assert-Equals "status" "released" $remote.status) -and $ok

  if ($null -ne $exp.assay) {
    $ok = (Assert-Equals "assay_title" $exp.assay $remote.assay_title) -and $ok
  }

  if ($null -ne $exp.date_released) {
    $ok = (Assert-Equals "date_released" $exp.date_released $remote.date_released) -and $ok
  }

  if ($null -ne $exp.lab) {
    $ok = (Assert-ContainsLoose "lab.title" $exp.lab $remote.lab.title) -and $ok
  }

  if ($null -ne $exp.target) {
    $targetLabel =
      if ($remote.target -is [System.Array] -and $remote.target.Length -gt 0) { $remote.target[0].label }
      elseif ($null -ne $remote.target.label) { $remote.target.label }
      else { "" }
    $ok = (Assert-Equals "target.label" $exp.target $targetLabel) -and $ok
  }

  if ($CheckReleasedFileCount -and $null -ne $exp.files) {
    $fileSearchPath = Join-Path $OutDir "$accession.released_files.search.json"
    $releasedCount = Get-ExperimentReleasedFileCount -accession $accession -outPath $fileSearchPath
    $ok = (Assert-Equals "released file count" ([string]$exp.files) $releasedCount) -and $ok
  }

  if ($ok) {
    Write-Host "  PASS" -ForegroundColor Green
  } else {
    Write-Host "  FAIL" -ForegroundColor Red
  }

  $results.Add([pscustomobject]@{
    kind      = "experiment"
    accession = $accession
    ok        = $ok
    url       = $url
    cached    = $cachePath
  }) | Out-Null

  Write-Host ""
}

function Verify-Pipeline([pscustomobject]$pipe) {
  $accession = $pipe.accession
  Write-Host "Pipeline $accession" -ForegroundColor Yellow

  $url = "https://www.encodeproject.org/pipelines/$accession/?format=json"
  $cachePath = Join-Path $OutDir "$accession.pipeline.json"
  $remote = Get-EncodeJson -url $url -outPath $cachePath

  $ok = $true
  $ok = (Assert-ContainsLoose "@id" "/pipelines/$accession/" $remote.'@id') -and $ok
  $ok = (Assert-Equals "status" "released" $remote.status) -and $ok

  if ($null -ne $pipe.name) {
    $ok = (Assert-ContainsLoose "title" $pipe.name $remote.title) -and $ok
  }

  if ($ok) {
    Write-Host "  PASS" -ForegroundColor Green
  } else {
    Write-Host "  FAIL" -ForegroundColor Red
  }

  $results.Add([pscustomobject]@{
    kind      = "pipeline"
    accession = $accession
    ok        = $ok
    url       = $url
    cached    = $cachePath
  }) | Out-Null

  Write-Host ""
}

foreach ($key in $metadata.experiments.PSObject.Properties.Name) {
  Verify-Experiment -exp $metadata.experiments.$key
}

foreach ($key in $metadata.pipelines.PSObject.Properties.Name) {
  Verify-Pipeline -pipe $metadata.pipelines.$key
}

$results | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultsPath -Encoding utf8

$failCount = @($results | Where-Object { -not $_.ok }).Count
if ($failCount -eq 0) {
  Write-Host "All checks passed." -ForegroundColor Green
  exit 0
}

Write-Host "$failCount check(s) failed. See cached JSON in: $OutDir" -ForegroundColor Red
exit 1
