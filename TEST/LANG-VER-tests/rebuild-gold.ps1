<#
.SYNOPSIS
    Regenerate GOLDs for LANG-VER-tests using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LANG-VER-tests/pnut-ts-langVer.test.ts
      - Glob:    *.spin2 (filters out *__pre.spin2)
      - Rule:    most files use -cd (the .test.ts default)
                 EXCEPT the noDebugFiles list -> -c

    Per-file overrides (the noDebugFiles list from the .test.ts):
      - spin_builtin_math_v51.spin2 -> -c
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
        -DefaultFlag "-cd" `
        -PerFileFlag @{
            "spin_builtin_math_v51.spin2" = "-c"
        }
}
finally {
    Pop-Location
}
