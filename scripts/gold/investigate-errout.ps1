<#
.SYNOPSIS
    One-shot investigation: capture Windows PNut Error.txt format for known error cases.

.DESCRIPTION
    Compiles 8 test source files on Windows PNut and reports, per file:
      - exit code
      - Error.txt contents (verbatim)
      - whether .lst/.obj/.bin were produced

    Purpose: determine whether Windows PNut's Error.txt format is normalizable to
    pnut-ts's gcc-style "path:line:error:message" so we know whether EXCEPT-tests
    can become a Windows-regen target or must stay pnut-ts-driven.

    Does NOT modify any GOLD files or commit anything. Read-only investigation.

.PARAMETER PNutVersion
    PNut version to use. Default 55.

.PARAMETER PNutInstallRoot
    Parent directory of the per-version PNut install dirs.
    Default "C:\Program Files (x86)\Parallax Inc".

.PARAMETER PNutBinary
    Optional explicit path to a PNut .exe; overrides version-based resolution.

.PARAMETER RepoRoot
    Path to the PNut-TS repo root (so the script can find TEST/EXCEPT-tests/ etc.).
    Default: the script's grandparent directory (assumes script lives at
    <repo>/scripts/gold/investigate-errout.ps1).

.EXAMPLE
    cd C:\path\to\PNut-TS
    .\scripts\gold\investigate-errout.ps1

.EXAMPLE
    .\investigate-errout.ps1 -PNutVersion 52 -RepoRoot D:\PNut-TS
#>

param(
    [int]$PNutVersion = 55,
    [string]$PNutInstallRoot = "C:\Program Files (x86)\Parallax Inc",
    [string]$PNutBinary = "",
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

# ---- Resolve PNut binary ----------------------------------------------------

if (-not $PNutBinary) {
    $standardPath = Join-Path $PNutInstallRoot "PNut_v${PNutVersion}\PNut_v${PNutVersion}.exe"
    if (Test-Path $standardPath) {
        $PNutBinary = $standardPath
    } elseif (Get-Command "PNut_v${PNutVersion}" -ErrorAction SilentlyContinue) {
        $PNutBinary = "PNut_v${PNutVersion}"
    } else {
        Write-Error "PNut v${PNutVersion} not found.`n  Looked for: $standardPath`n  Also tried PATH: PNut_v${PNutVersion}"
        exit 1
    }
}

if ($PNutBinary -match "[\\/]" -and -not (Test-Path $PNutBinary)) {
    Write-Error "PNut binary not found at: $PNutBinary"
    exit 1
}

Write-Output "Using compiler: $PNutBinary"
Write-Output "Repo root:      $RepoRoot"
Write-Output ""

# ---- Cases to investigate ---------------------------------------------------

$cases = @(
    @{ Dir="TEST\EXCEPT-tests"; File="debug_empty_str.spin2";          Flag="-cd"; Expected="fail"; Note="empty string in debug()" },
    @{ Dir="TEST\EXCEPT-tests"; File="exception_test_000.spin2";       Flag="-c";  Expected="fail"; Note="expected expression term" },
    @{ Dir="TEST\EXCEPT-tests"; File="exception_test_006.spin2";       Flag="-c";  Expected="fail"; Note="hub address exceeds limit" },
    @{ Dir="TEST\EXCEPT-tests"; File="exception_test_008.spin2";       Flag="-c";  Expected="fail"; Note="expected constant or unary op" },
    @{ Dir="TEST\EXCEPT-tests"; File="exception_test_009.spin2";       Flag="-c";  Expected="fail"; Note="expected constant or unary op" },
    @{ Dir="TEST\EXCEPT-tests"; File="exception_test_010.spin2";       Flag="-c";  Expected="fail"; Note="no PUB or DAT" },
    @{ Dir="TEST\EXCEPT-tests"; File="symbol_length_test_30max.spin2"; Flag="-c";  Expected="fail"; Note="symbol > 30 chars" },
    @{ Dir="TEST\CON-tests";    File="symbol_length_test.spin2";       Flag="-c";  Expected="pass"; Note="symbols all <= 30 chars (sanity check)" }
)

# ---- Run each case ----------------------------------------------------------

$report = @()

foreach ($case in $cases) {
    $absDir = Join-Path $RepoRoot $case.Dir
    if (-not (Test-Path $absDir)) {
        Write-Warning "Skipping (directory not found): $absDir"
        continue
    }

    Push-Location $absDir
    try {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($case.File)

        # Clean previous outputs so we're measuring this run
        Remove-Item -Force -ErrorAction SilentlyContinue Error.txt, "$base.lst", "$base.obj", "$base.bin"

        # Compile
        & $PNutBinary $case.Flag $case.File > $null 2>&1
        $exitCode = $LASTEXITCODE

        # Capture Error.txt verbatim (no trim — we want to see exact format including newlines)
        $errorContent = if (Test-Path Error.txt) {
            Get-Content Error.txt -Raw
        } else {
            $null
        }

        $report += [PSCustomObject]@{
            File          = $case.File
            Dir           = $case.Dir
            Flag          = $case.Flag
            Expected      = $case.Expected
            Note          = $case.Note
            ExitCode      = $exitCode
            ErrorTxt      = $errorContent
            ProducedLst   = (Test-Path "$base.lst")
            ProducedObj   = (Test-Path "$base.obj")
            ProducedBin   = (Test-Path "$base.bin")
        }
    }
    finally {
        Pop-Location
    }
}

# ---- Human-readable per-file output -----------------------------------------

Write-Output "=========================================="
Write-Output "PER-FILE RESULTS"
Write-Output "=========================================="

foreach ($r in $report) {
    Write-Output ""
    Write-Output "--- $($r.File)  (expected: $($r.Expected) - $($r.Note)) ---"
    Write-Output "  Flag:       $($r.Flag)"
    Write-Output "  ExitCode:   $($r.ExitCode)"
    Write-Output "  Produced:   lst=$($r.ProducedLst)  obj=$($r.ProducedObj)  bin=$($r.ProducedBin)"
    if ($null -ne $r.ErrorTxt) {
        Write-Output "  Error.txt content (verbatim, between markers):"
        Write-Output "  >>>>>>>>>>>>>>>>>>>>"
        # Indent each line of the error content
        ($r.ErrorTxt -split "`r?`n") | ForEach-Object { Write-Output "  | $_" }
        Write-Output "  <<<<<<<<<<<<<<<<<<<<"
    } else {
        Write-Output "  Error.txt:  (file not produced)"
    }
}

# ---- JSON summary (machine-readable, for sharing) ---------------------------

Write-Output ""
Write-Output "=========================================="
Write-Output "JSON SUMMARY (paste this back to share)"
Write-Output "=========================================="
$report | ConvertTo-Json -Depth 4
