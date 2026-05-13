<#
.SYNOPSIS
    Regenerate GOLDs for LARGE-tests/iOTgw using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LARGE-tests/pnut-ts-large.test.ts (iOTgw subset)
      - Glob:    *.spin2 in this subdir
      - Default: -c
      - Pattern: demo_p2gw* -> -cd (per .test.ts debug-files prefix list)

    NOTE: First-time Windows regen for this subdir as a rebuild-gold convention
    (the old compIotGW.bat used a literal "demo_" prefix that matched nothing).
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
        -DefaultFlag "-c" `
        -PerFilePatternFlag @{
            "demo_p2gw*" = "-cd"
        }
}
finally {
    Pop-Location
}
