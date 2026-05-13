<#
.SYNOPSIS
    Regenerate GOLDs for LANG-FEAT-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LANG-FEAT-tests/pnut-ts-langfeat.test.ts
      - Glob:    *.spin2 (filters out *__pre.spin2 — handled by lib)
      - Default: -c (no debug — test header explicitly notes "no -d flag")
      - No per-file overrides
      - Test groups files by prefix (field_*, struct_*) but applies same flag to all
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
