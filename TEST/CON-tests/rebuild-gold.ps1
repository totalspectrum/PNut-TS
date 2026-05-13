<#
.SYNOPSIS
    Regenerate GOLDs for CON-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/CON-tests/pnut-ts-con.test.ts
      - Glob:    *.spin2
      - Default: -c (no debug)
      - No per-file overrides

    NOTE: CON-tests/symbol_length_test.errout.GOLD is an orphan artifact
    (no test reads it; pnut-ts produces no matching content). Not regenerated
    here. Safe to delete separately as cleanup.
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
