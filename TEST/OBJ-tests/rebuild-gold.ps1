<#
.SYNOPSIS
    Regenerate GOLDs for OBJ-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/OBJ-tests/pnut-ts-obj.test.ts
      - Glob:    *.spin2
      - Default: -c (no debug)
      - No per-file overrides

.EXAMPLE
    .\rebuild-gold.ps1                 # uses PNut_v55.exe (standard install)

.EXAMPLE
    .\rebuild-gold.ps1 -PNutVersion 52 # round-trip check against v52 GOLDs
#>
param(
    [int]$PNutVersion = 55,
    [string]$PNutInstallRoot = "C:\Program Files (x86)\Parallax Inc",
    [string]$PNutBinary = ""
)

. (Join-Path $PSScriptRoot "..\..\scripts\gold\rebuild-gold-lib.ps1")

Push-Location $PSScriptRoot
try {
    Invoke-RebuildGold `
        -PNutVersion $PNutVersion `
        -PNutInstallRoot $PNutInstallRoot `
        -PNutBinary $PNutBinary `
        -DefaultFlag "-c"
}
finally {
    Pop-Location
}
