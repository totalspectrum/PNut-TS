<#
.SYNOPSIS
    Regenerate GOLDs for LARGE-tests/PnlLtMeas using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LARGE-tests/pnut-ts-large.test.ts (PnlLtMeas subset)
      - Glob:    *.spin2 in this subdir
      - Default: -c (matches legacy LARGE-PnlLtMeas-rebuild-v52)
#>
param(
    [int]$PNutVersion = 55,
    [string]$PNutInstallRoot = "C:\Program Files (x86)\Parallax Inc",
    [string]$PNutBinary = ""
)

. (Join-Path $PSScriptRoot "..\..\..\scripts\gold\rebuild-gold-lib.ps1")

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
