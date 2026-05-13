<#
.SYNOPSIS
    Regenerate GOLDs for COV-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/COV-tests/pnut-ts-cov.test.ts
      - Glob:    *.spin2 (filters out *__pre.spin2)
      - Rule:    files matching {debug_,isp_,coverage_debug_}* -> -cd
                 all others -> -c

    Per-file extra (from existing v52 .ps1 — files that use debug() but don't
    match the prefix pattern):
      - coverage_clock_003.spin2  -> -cd

    NOTE: coverage_003_v44.spin2 in the .test.ts gets pnut-ts flag -44 (force
    compile-as-v44). Windows PNut from a single binary cannot produce v44-bytecode
    output. It still gets -cd here (it uses debug()) — its v55 GOLD will encode
    v55 bytecode, NOT v44, and the pnut-ts test for it will need to be revisited
    if it currently expects v44 output.
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
        -PerFilePatternFlag @{
            "debug_*"          = "-cd"
            "isp_*"            = "-cd"
            "coverage_debug_*" = "-cd"
        } `
        -PerFileFlag @{
            "coverage_clock_003.spin2" = "-cd"
        }
}
finally {
    Pop-Location
}
