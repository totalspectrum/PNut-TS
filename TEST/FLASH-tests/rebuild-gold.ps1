<#
.SYNOPSIS
    Regenerate GOLDs for FLASH-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/FLASH-tests/pnut-ts-flash.test.ts
      - Glob:    *.spin2
      - Default: -ci (compile + flash image)
      - Produces: lst, obj, bin, flash
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
        -DefaultFlag "-ci" `
        -Produces @("lst", "obj", "bin", "flash")
}
finally {
    Pop-Location
}
