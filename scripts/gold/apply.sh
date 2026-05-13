#!/usr/bin/env bash
#
# apply.sh — Take a Windows-produced regold output tarball and lay the new
# .GOLD files back into TEST/, with a diff summary before committing.
#
# Usage:
#   ./scripts/gold/apply.sh regold-output-v55.tar.gz
#       Stages the bundle into a temp dir, prints a per-suite diff summary,
#       prompts for confirmation, then copies into TEST/.
#
#   ./scripts/gold/apply.sh regold-output-v55.tar.gz --yes
#       Skip the confirmation prompt.
#
#   ./scripts/gold/apply.sh regold-output-v55.tar.gz --dry-run
#       Show the diff summary only; don't copy anything.

set -euo pipefail

# ---- Parse args -------------------------------------------------------------

INPUT=""
YES=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes)     YES=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help)
            sed -n '/^#/p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        -*) echo "Unknown arg: $1" >&2; exit 1 ;;
        *)  if [[ -z "$INPUT" ]]; then INPUT="$1"; else echo "Multiple inputs not supported" >&2; exit 1; fi; shift ;;
    esac
done

if [[ -z "$INPUT" ]]; then
    echo "Usage: $0 <regold-output.tar.gz> [--yes] [--dry-run]" >&2
    exit 1
fi

if [[ ! -f "$INPUT" ]]; then
    echo "ERROR: Input not found: $INPUT" >&2
    exit 1
fi

# ---- Locate repo root -------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# ---- Stage the bundle -------------------------------------------------------

STAGING="$(mktemp -d -t regold-apply.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

tar -xzf "$INPUT" -C "$STAGING"

# Locate the TEST/ inside the staging dir (handles bundles with or without a
# top-level wrapper directory)
NEW_TEST=""
if [[ -d "$STAGING/TEST" ]]; then
    NEW_TEST="$STAGING/TEST"
else
    # Look for first subdir containing TEST/
    for d in "$STAGING"/*/; do
        if [[ -d "$d/TEST" ]]; then
            NEW_TEST="$d/TEST"
            break
        fi
    done
fi

if [[ -z "$NEW_TEST" ]]; then
    echo "ERROR: No TEST/ directory found inside $INPUT" >&2
    exit 1
fi

# ---- Compare and summarize --------------------------------------------------

mapfile -t NEW_GOLDS < <(find "$NEW_TEST" -name '*.GOLD' | sort)

UNCHANGED=0
CHANGED=0
NEW=0
MISSING_COUNT=0
declare -a CHANGED_FILES=()
declare -a NEW_FILES=()

for new in "${NEW_GOLDS[@]}"; do
    rel="${new#$NEW_TEST/}"
    existing="TEST/$rel"
    if [[ -f "$existing" ]]; then
        if cmp -s "$new" "$existing"; then
            UNCHANGED=$((UNCHANGED + 1))
        else
            CHANGED=$((CHANGED + 1))
            CHANGED_FILES+=("$rel")
        fi
    else
        NEW=$((NEW + 1))
        NEW_FILES+=("$rel")
    fi
done

# Detect missing GOLDs (existed before, not produced this run)
mapfile -t EXISTING_GOLDS < <(find TEST -name '*.GOLD' \
    -not -path '*-rebuild-v*' \
    | sort)
declare -a MISSING_FILES=()
for old in "${EXISTING_GOLDS[@]}"; do
    rel="${old#TEST/}"
    if [[ ! -f "$NEW_TEST/$rel" ]]; then
        # Only count as "missing from regen" if the suite was in scope (had a rebuild-gold.ps1)
        suite_dir="TEST/$(echo "$rel" | cut -d/ -f1)"
        # For LARGE-tests/<sub>/...  use the subdir
        if [[ "$rel" == LARGE-tests/* ]]; then
            suite_dir="TEST/LARGE-tests/$(echo "$rel" | cut -d/ -f2)"
        fi
        if [[ -f "$suite_dir/rebuild-gold.ps1" ]]; then
            MISSING_COUNT=$((MISSING_COUNT + 1))
            MISSING_FILES+=("$rel")
        fi
    fi
done

# ---- Report -----------------------------------------------------------------

echo ""
echo "=========================================="
echo "Regold apply summary"
echo "=========================================="
echo "Source bundle:     $INPUT"
echo "GOLDs unchanged:   $UNCHANGED"
echo "GOLDs changed:     $CHANGED"
echo "GOLDs new:         $NEW"
echo "GOLDs missing:     $MISSING_COUNT  (existed before; regen did not produce)"
echo ""

if [[ $CHANGED -gt 0 && $CHANGED -le 50 ]]; then
    echo "Changed GOLDs:"
    for f in "${CHANGED_FILES[@]}"; do echo "  ~ $f"; done
    echo ""
elif [[ $CHANGED -gt 50 ]]; then
    echo "Changed GOLDs (first 50 of $CHANGED):"
    for f in "${CHANGED_FILES[@]:0:50}"; do echo "  ~ $f"; done
    echo "  ... ($((CHANGED - 50)) more)"
    echo ""
fi

if [[ $NEW -gt 0 ]]; then
    echo "New GOLDs (first-time regen for these files):"
    for f in "${NEW_FILES[@]:0:20}"; do echo "  + $f"; done
    [[ $NEW -gt 20 ]] && echo "  ... ($((NEW - 20)) more)"
    echo ""
fi

if [[ $MISSING_COUNT -gt 0 ]]; then
    echo "WARNING: GOLDs that existed but were NOT regenerated (compile failure on Windows?):"
    for f in "${MISSING_FILES[@]:0:20}"; do echo "  - $f"; done
    [[ $MISSING_COUNT -gt 20 ]] && echo "  ... ($((MISSING_COUNT - 20)) more)"
    echo ""
fi

# ---- Apply or stop ----------------------------------------------------------

if [[ $DRY_RUN -eq 1 ]]; then
    echo "Dry run — no files copied."
    echo "Staging dir (kept for inspection): $STAGING"
    trap - EXIT
    exit 0
fi

if [[ $YES -eq 0 ]]; then
    echo "Proceed and copy $((UNCHANGED + CHANGED + NEW)) GOLDs into TEST/? [y/N] "
    read -r CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
        echo "Aborted. Staging dir kept for inspection: $STAGING"
        trap - EXIT
        exit 0
    fi
fi

# Copy each GOLD into place (preserving directory structure)
for new in "${NEW_GOLDS[@]}"; do
    rel="${new#$NEW_TEST/}"
    target="TEST/$rel"
    mkdir -p "$(dirname "$target")"
    cp "$new" "$target"
done

echo ""
echo "Copied $((UNCHANGED + CHANGED + NEW)) GOLDs into TEST/."
echo ""
echo "Run 'git status' and 'git diff --stat' to review."
git status -- TEST/ | head -30
