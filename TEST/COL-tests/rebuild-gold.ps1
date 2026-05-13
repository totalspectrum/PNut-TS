<#
.SYNOPSIS
    Regenerate GOLDs for COL-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/COL-tests/pnut-ts-col.test.ts
      - Glob:    *.spin2
      - Default: -cd (compile + debug)
      - No per-file overrides
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
        -DefaultFlag "-cd"
}
finally {
    Pop-Location
}
