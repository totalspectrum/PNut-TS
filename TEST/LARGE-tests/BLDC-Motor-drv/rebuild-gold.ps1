<#
.SYNOPSIS
    Regenerate GOLDs for LARGE-tests/BLDC-Motor-drv using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LARGE-tests/pnut-ts-large.test.ts (BLDC-Motor-drv subset)
      - Glob:    *.spin2 in this subdir
      - Default: -c (no debug — legacy compBLDC.bat used -c uniformly)

    NOTE: First-time Windows regen for this subdir as a rebuild-gold convention
    (the old compBLDC.bat used a literal "demo_" prefix that matched nothing).
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
