<#
.SYNOPSIS
    Shared engine for all per-suite rebuild-gold.ps1 scripts.

.DESCRIPTION
    Each per-suite rebuild-gold.ps1 is a thin wrapper that dot-sources this file
    and calls Invoke-RebuildGold with its suite-specific data.

    Behaviors handled here so per-suite scripts stay tiny:
      - PNut binary path resolution (auto-find at standard install location)
      - Cleanup of prior outputs and GOLDs
      - File-loop with per-file/per-pattern flag overrides
      - Error.txt parsing and reporting
      - Output-extension rename to .GOLD (lst, obj, bin, flash, ...)
      - Skip list for files we deliberately omit from Windows regen

    Does NOT capture errout GOLDs from Error.txt. Errout GOLDs are pnut-ts-derived
    by convention and live in EXCEPT-tests; that workflow is separate.

.NOTES
    Compatible with Windows PowerShell 5.1 (default on Windows). No PS7-only
    cmdlets, no module dependencies, no JSON parsing.
#>

function Invoke-RebuildGold {
    param(
        # Compiler selection
        [int]$PNutVersion = 55,
        [string]$PNutInstallRoot = "C:\Program Files (x86)\Parallax Inc",
        [string]$PNutBinary = "",

        # Per-suite rules
        [string]$DefaultFlag = "-c",
        [string[]]$Produces = @("lst", "obj", "bin"),
        [hashtable]$PerFileFlag = @{},
        [hashtable]$PerFilePatternFlag = @{},
        [string[]]$Skip = @()
    )

    # ---- Resolve PNut binary -----------------------------------------------

    if (-not $PNutBinary) {
        $standardPath = Join-Path $PNutInstallRoot "PNut_v${PNutVersion}\PNut_v${PNutVersion}.exe"
        if (Test-Path $standardPath) {
            $PNutBinary = $standardPath
        } elseif (Get-Command "PNut_v${PNutVersion}" -ErrorAction SilentlyContinue) {
            $PNutBinary = "PNut_v${PNutVersion}"
        } else {
            Write-Error "PNut v${PNutVersion} not found.`n  Looked at: $standardPath`n  Also tried PATH: PNut_v${PNutVersion}"
            return
        }
    }

    if ($PNutBinary -match "[\\/]" -and -not (Test-Path $PNutBinary)) {
        Write-Error "PNut binary not found at: $PNutBinary"
        return
    }

    Write-Output ""
    Write-Output "=== Suite: $($PWD.Path) ==="
    Write-Output "    Compiler:     $PNutBinary"
    Write-Output "    Default flag: $DefaultFlag"
    Write-Output "    Produces:     $($Produces -join ', ')"
    if ($PerFileFlag.Count -gt 0) {
        Write-Output "    Per-file overrides: $($PerFileFlag.Count) file(s)"
    }
    if ($PerFilePatternFlag.Count -gt 0) {
        Write-Output "    Per-pattern overrides: $($PerFilePatternFlag.Count) pattern(s)"
    }
    if ($Skip.Count -gt 0) {
        Write-Output "    Skip:         $($Skip -join ', ')"
    }

    # ---- Cleanup prior outputs and prior GOLDs -----------------------------
    # We clean the GOLDs we're about to regenerate so a partial run leaves a
    # half-state visible (missing GOLDs) rather than mixing old + new.

    $cleanupGlobs = @("*__pre.spin2", "*-pre.spin2", "Error.txt")
    foreach ($ext in $Produces) {
        $cleanupGlobs += "*.$ext"
        $cleanupGlobs += "*.$ext.GOLD"
    }
    Remove-Item -Force -ErrorAction SilentlyContinue $cleanupGlobs

    # ---- Process each .spin2 -----------------------------------------------

    $stats = @{ ok = 0; failed = 0; skipped = 0 }

    Get-ChildItem -Filter *.spin2 | Sort-Object Name | ForEach-Object {
        $fileName = $_.Name
        $baseName = $_.BaseName

        # Skip preprocessor outputs (defensive — cleanup already removed them)
        if ($fileName -like "*__pre.spin2" -or $fileName -like "*-pre.spin2") {
            return
        }

        # Skip explicitly listed files
        if ($Skip -contains $fileName) {
            Write-Output "  $fileName -> SKIPPED (explicit)"
            $stats.skipped++
            return
        }

        # Resolve flag for this file (exact-match first, then pattern)
        $flag = $DefaultFlag
        $flagSource = "default"
        if ($PerFileFlag.ContainsKey($fileName)) {
            $flag = $PerFileFlag[$fileName]
            $flagSource = "per-file"
        } else {
            foreach ($pattern in $PerFilePatternFlag.Keys) {
                if ($fileName -like $pattern) {
                    $flag = $PerFilePatternFlag[$pattern]
                    $flagSource = "pattern '$pattern'"
                    break
                }
            }
        }

        # Compile
        & $PNutBinary $flag $fileName > $null 2>&1

        # Parse Error.txt
        $compileOk = $true
        $errorMessage = ""
        if (Test-Path Error.txt) {
            $content = (Get-Content Error.txt -Raw).Trim()
            if ($content -ne "okay" -and $content -ne "") {
                $compileOk = $false
                $errorMessage = $content
            }
        }

        if (-not $compileOk) {
            Write-Output "  $fileName ($flag) -> ERROR: $errorMessage"
            $stats.failed++
            return
        }

        # Brief sleep — Windows PNut sometimes holds output handles briefly.
        # 300ms matches the long-standing legacy convention.
        Start-Sleep -Milliseconds 300

        # Rename produced outputs to .GOLD
        $renamedExts = @()
        foreach ($ext in $Produces) {
            $src = "$baseName.$ext"
            if (Test-Path $src) {
                Rename-Item $src "$src.GOLD" -Force
                $renamedExts += $ext
            }
        }

        if ($renamedExts.Count -gt 0) {
            Write-Output "  $fileName ($flag) -> .$($renamedExts -join '.GOLD .').GOLD"
            $stats.ok++
        } else {
            Write-Output "  $fileName ($flag) -> compiled but produced none of: $($Produces -join ',')"
            $stats.failed++
        }
    }

    Write-Output "    Summary: ok=$($stats.ok) failed=$($stats.failed) skipped=$($stats.skipped)"
    return $stats
}
