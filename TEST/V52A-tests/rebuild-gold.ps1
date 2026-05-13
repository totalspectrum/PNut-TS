<#
.SYNOPSIS
    Regenerate GOLDs for V52A-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/V52A-tests/pnut-ts-v52a.test.ts
      - Glob:    *.spin2 (filters out *__pre.spin2)
      - Rule:    files containing "debug" (case-insensitive substring) -> -cd
                 all others -> -c

    NOTE on drift: the legacy V52A-rebuild-v52/rebuild-gold.ps1 used -cd for
    every file. The .test.ts substring rule (which the user has designated as
    the source of truth) excludes 14 of 17 files from debug. If the existing
    GOLDs were generated with -cd everywhere, regenerating under this rule
    will produce different output for those 14 files. That diff is expected
    and corrects the prior drift.
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
            "*debug*" = "-cd"
            "*DEBUG*" = "-cd"
            "*Debug*" = "-cd"
        }
}
finally {
    Pop-Location
}
