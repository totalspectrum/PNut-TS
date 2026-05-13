<#
.SYNOPSIS
    Regenerate GOLDs for EXT-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/EXT-tests/pnut-ts-ext.test.ts
      - Glob:    *.spin2 (filters out *v44* — pnut-ts-only)
      - Default: -c (no debug)
      - Produces: lst, obj only (interpreter sources do not produce a .bin)
      - No per-file overrides

    NOTE: EXT-tests includes Spin2_interpreter.spin2 and Spin2_debugger.spin2 —
    re-compiling these under v55 verifies the v55 interpreter source itself
    round-trips through the v55 compiler. High-value canary for ABI releases.
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
        -DefaultFlag "-c" `
        -Produces @("lst", "obj")
}
finally {
    Pop-Location
}
