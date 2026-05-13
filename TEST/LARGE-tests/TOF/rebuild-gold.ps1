<#
.SYNOPSIS
    Regenerate GOLDs for LARGE-tests/TOF using Windows PNut.

.DESCRIPTION
    Sourced from: src/tests/LARGE-tests/pnut-ts-large.test.ts (TOF subset)
      - Glob:    *.spin2 in this subdir
      - Default: -c
      - Pattern: demo_180* -> -cd (per .test.ts debug-files prefix list)

    NOTE: First-time Windows regen for this subdir as a rebuild-gold convention.
    The legacy comp180.bat used a literal "demo_" prefix that didn't match
    "demo_180degrFOV.spin2" — so existing v52 demo_180 GOLDs were probably
    generated some other way. Worth verifying first regen output.

    NOTE: Two TOF GOLD files are explicitly gitignored
    (.gitignore:232-237 lists isp_180degrFOV_TOFsensorSmall.* and isp_hdmi_debug.*).
    Reason for the exclusion is unclear — flag if these GOLDs reappear after regen.
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
            "demo_180*" = "-cd"
        }
}
finally {
    Pop-Location
}
