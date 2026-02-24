# PNut-TS Performance Optimization Sprint Metaplan

## Context

PNut-TS has a comprehensive [Performance Analysis and Optimization Roadmap](../../../../../../workspaces/PNut-TS/DOCs/roadmaps/Performance-Analysis-and-Optimization-Roadmap.md) with 20 evidence-based findings organized into 3 phases (15 actionable optimizations) ranked by risk and impact. A benchmark harness (`npm run perf`) compiles 291 files across 17 categories and a comparison tool (`npm run perf-compare`) measures deltas. An initial baseline exists at `TEST/PERF-results/benchmark-2026-02-24_20-55-23.json` (total: ~639,776ms).

This plan defines the **repeatable iteration algorithm** for walking through each optimization, validating it, measuring it, and committing it. We will execute the first two optimizations (#4 and #2) to prove the algorithm works.

---

## Two-Axis Priority Table

Each optimization rated on two 1-10 scales. **Priority Score** = Gain × (11 - Risk) / 10.
Sorted by implementation order (highest-impact-first).

| Order | Opt# | Finding | Fix | Files | Risk (1-10) | Gain (1-10) | Priority Score |
|-------|------|---------|-----|-------|-------------|-------------|----------------|
| 1 | 1 | Template literal logging | Inline guard at 540 call sites | spinResolver.ts, spinElementizer.ts, spin2Parser.ts, compiler.ts | 2 | 8 | 7.2 |
| 2 | 2 | Regex recompilation | Move to static class fields | spinElementizer.ts | 1 | 4 | 4.0 |
| 3 | 3 | Preprocessor regex O(N×M) | Single-pass cached regex | symbolTable.ts, spinDocument.ts | 5 | 7 | 4.2 |
| 4 | 6 | Column calculation rescan | Cache per-line column state | spinElementizer.ts | 3 | 5 | 4.0 |
| 5 | 7 | Substring allocation | Index-based line tracking | spinElementizer.ts (many methods) | 6 | 7 | 3.5 |
| 6 | 15 | Buffer growth strategy | Exponential doubling | objectImage.ts | 2 | 3 | 2.7 |
| 7 | 18 | Case conversion per lookup | Normalize once at boundary | symbolTable.ts | 2 | 3 | 2.7 |
| 8 | 8 | SpinElement creation | Object reuse / pooling | spinResolver.ts, SpinElement class | 6 | 5 | 2.5 |
| 9 | 5 | BigInt in hot paths | Number for 32-bit ops | spinResolver.ts (248 sites) | 8 | 8 | 2.4 |
| 10 | 9 | Distiller O(n²) | Hash-based deduplication | objectDistiller.ts | 5 | 4 | 2.4 |
| 11 | 12 | Debug record linear search | Hash-based Map lookup | spinResolver.ts, debugData.ts | 4 | 3 | 2.1 |
| 12 | 4 | moveObjectUp byte-by-byte | Replace with copyWithin() | spin2Parser.ts | 1 | 2 | 2.0 |
| 13 | 10 | 4× CON passes | Track unresolved, skip passes | spinResolver.ts | 7 | 5 | 2.0 |
| 14 | 17 | rebuildOptimizedImage loop | Bulk set() copy | objectDistiller.ts | 2 | 2 | 1.8 |
| 15 | 14 | Hex dump string concat | Array + .join() | spin2Parser.ts | 1 | 1 | 1.0 |

---

## The Sprint Iteration Algorithm

Every optimization follows this exact sequence. No steps skipped or reordered.

### Phase A: Preparation (before touching code)

```
A1. Verify clean working tree:     git status  (must be clean)
A2. Create feature branch:         git checkout -b perf/NN-short-description
A3. Run pre-optimization benchmark: npm run build && npm run perf
    Then rename:                    mv TEST/PERF-results/benchmark-*.json
                                       TEST/PERF-results/benchmark-NN-before.json
A4. Run full regression suite:      npm run test-full  (must be all-green)
A5. Record baseline totalTimeMs from the JSON
```

### Phase B: Implementation

```
B1. Make the code change (minimal diff, only files in the table)
B2. Build:                          npm run build  (zero errors)
B3. Run targeted regression tests for the files changed
B4. Run full regression suite:      npm run test-full  (all-green required)
```

If any test fails → go to Phase D (Diagnose and Fix).

### Phase C: Measurement and Commit

```
C1. Run post-optimization benchmark: npm run perf
    Rename to:                        TEST/PERF-results/benchmark-NN-after.json
C2. Compare results:                  npm run perf-compare \
                                        TEST/PERF-results/benchmark-NN-before.json \
                                        TEST/PERF-results/benchmark-NN-after.json
C3. Accept/reject decision:
    - Accept if: overall time decreased or flat, no category regressed >5%, all tests green
    - Reject if: significant performance regression with no improvement path → Phase E
C4. Commit:
      git add <specific files>
      git commit -m "Perf #NN: Description

      What was changed and why.
      Benchmark: BEFORE -> AFTER total (DELTA, PERCENT%).

      Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
C5. Update Performance-Optimization-Ledger.md
C6. Merge to main:                   git checkout main && git merge perf/NN-description
C7. Delete branch:                   git branch -d perf/NN-description
```

### Phase D: Diagnose and Fix (when tests fail)

Test failures during a performance optimization almost always mean a small implementation
mistake, NOT a fundamentally broken approach. These are targeted, mechanical changes — they
deserve investigation, not immediate abandonment.

```
D1. Identify which tests failed and examine the output diff:
    - For .lst mismatches: diff the generated .lst against the .GOLD file
    - For .obj/.bin mismatches: check if it's a float-tolerance issue or real divergence
    - For compilation errors: read the error message — likely an API mismatch
D2. Root-cause the failure:
    - Did the optimization change execution order? (e.g., copyWithin direction)
    - Did it miss an edge case? (e.g., zero-length copy, empty input)
    - Did it change a side effect? (e.g., ensureCapacity was doing something needed)
D3. Fix the implementation and return to B2 (Build):
    - Make the minimal correction
    - Rebuild and rerun the failing tests
    - Then proceed through B3 → B4 → C1 as normal
D4. If after reasonable investigation the fix proves too complex or risky:
    - Document what was learned (root cause, edge case discovered)
    - Proceed to Phase E (Shelve) — but this should be rare
```

### Phase E: Shelve (only after Phase D fails to resolve)

Used only when an optimization has been investigated, attempted to fix, and determined
to be too risky or complex for this sprint. The approach isn't abandoned forever — it's
deferred with documented learnings.

```
E1. Discard uncommitted changes:     git checkout -- .
E2. Verify clean state:              npm run build && npm run test-full
E3. Record in ledger:
    - What was attempted
    - What failed and why
    - What was learned (edge cases, dependencies discovered)
    - Conditions under which to revisit (e.g., "revisit after #7 refactors elementizer")
E4. Return to main:                  git checkout main
E5. Delete branch:                   git branch -D perf/NN-description
E6. Proceed to next optimization
```

### Phase Checkpoint (after completing all items in a phase)

```
P1. Run benchmark on main:           npm run perf
    Save as:                          TEST/PERF-results/benchmark-phaseN-complete.json
P2. Compare against original:        npm run perf-compare \
                                        TEST/PERF-results/benchmark-00-original-baseline.json \
                                        TEST/PERF-results/benchmark-phaseN-complete.json
P3. Update ledger with phase cumulative summary
```

---

## Benchmark File Naming Convention

| File | Purpose |
|------|---------|
| `benchmark-00-original-baseline.json` | Copy of initial baseline (never modified) |
| `benchmark-NN-before.json` | Pre-optimization measurement for finding #NN |
| `benchmark-NN-after.json` | Post-optimization measurement for finding #NN |
| `benchmark-NN-shelved-before.json` | Preserved if optimization was shelved |
| `benchmark-phase1-complete.json` | Phase checkpoint after all Phase 1 items |
| `benchmark-phase2-complete.json` | Phase checkpoint after all Phase 2 items |
| `benchmark-phase3-complete.json` | Phase checkpoint after all Phase 3 items |

---

## Cumulative Tracking: Performance Optimization Ledger

Create `DOCs/roadmaps/Performance-Optimization-Ledger.md`:

```markdown
# Performance Optimization Ledger

Baseline: benchmark-00-original-baseline.json
- Total time: 639,775.6 ms | Date: 2026-02-24 | Version: 1.52.1

## Phase 1: Quick Wins
| Opt# | Description | Before (ms) | After (ms) | Delta (ms) | Delta % | Status |
|------|-------------|-------------|------------|------------|---------|--------|
| 4 | copyWithin moveObjectUp | ... | ... | ... | ...% | pending |
| 2 | Static regex fields | ... | ... | ... | ...% | pending |
| ... | ... | ... | ... | ... | ...% | pending |

Phase 1 cumulative vs baseline: ??? ms saved (???%)

## Shelved Optimizations (deferred, not abandoned)
| Opt# | Description | Root Cause | Revisit When |
```

---

## Git Branch & Commit Conventions

- **Branch naming**: `perf/NN-kebab-description` (e.g., `perf/04-copywithin-move`)
- **Short-lived branches**: one optimization per branch, merged to main immediately
- **Commit message line 1**: `Perf #NN: Imperative description` (under 72 chars)
- **Commit message body**: What changed, why, and benchmark delta
- **Each optimization is independently bisectable on main**

---

## Implementation: First Two Optimizations (Proving the Algorithm)

### Optimization #1: Template Literal Logging Guards (Score 7.2 — highest priority)

**Files**: `src/classes/spinResolver.ts` (413 calls + 34 outline), `src/classes/spinElementizer.ts` (51), `src/classes/spin2Parser.ts` (40), `src/classes/compiler.ts` (2) — **~540 call sites total**

**The problem** (spinResolver.ts:11533-11537):
```typescript
private logMessage(message: string): void {
  if (this.isLogging) {           // Guard is INSIDE the function
    this.context.logger.logMessage(message);
  }
}
```
Every call site builds the template literal string BEFORE `logMessage()` is called:
```typescript
this.logMessage(`* resolvExp() LOOP currElement=[${this.currElement.toString()}]`);
```
Even when `isLogging` is false (production), JavaScript evaluates `.toString()`, interpolates, allocates the string, passes it, and discards it. ~540 sites × per-expression/element = thousands of wasted strings per compile.

**The fix — inline guard at each call site**:
```typescript
// Before:
this.logMessage(`* resolvExp() LOOP currElement=[${this.currElement.toString()}]`);

// After:
if (this.isLogging) this.logMessage(`* resolvExp() LOOP currElement=[${this.currElement.toString()}]`);
```

For `logMessageOutline` calls (34 sites):
```typescript
if (this.isLoggingOutline) this.logMessageOutline(`...`);
```

**Why inline guard over lazy-eval arrow functions**: The inline guard is simpler, has zero overhead when logging is off (no closure allocation, no function call), and is a straightforward find-and-replace. The arrow function approach (`() => \`...\``) would also work but adds a closure allocation per call even when logging is off.

**Approach**: Use find-and-replace within each file. Pattern:
- Find: `this.logMessage(`  →  Replace with: `if (this.isLogging) this.logMessage(`
- Find: `this.logMessageOutline(`  →  Replace with: `if (this.isLoggingOutline) this.logMessageOutline(`
- Verify no double-guarding (a few call sites may already have an outer `if (this.isLogging)`)

**Targeted tests**: `npm run test-spin && npm run test-con && npm run test-lrg` (resolver-heavy), then `npm run test-full`

---

### Optimization #2: Regex → static class fields (Score 4.0 — second priority)

**File**: `src/classes/spinElementizer.ts` — 12+ regex patterns in methods

**Change**: Add `private static readonly` fields near top of class, replace local regex variables with class field references.

Example — `isDigit()` (line 740):
```typescript
// Before: const digitRegEx = /^\d$/; return digitRegEx.test(line);
// After:
private static readonly RE_DIGIT = /^\d$/;
// ... in method:
return SpinElementizer.RE_DIGIT.test(line);
```

Apply same pattern to all 12+ regex patterns: `RE_SYMBOL_START`, `RE_HEX_START`, `RE_BIN_START`, `RE_QUART_START`, `RE_SYMBOL_NAME`, `RE_QUATERNARY`, `RE_BINARY`, `RE_HEX`, `RE_FLOAT1`, `RE_FLOAT2`, `RE_FLOAT3`, `RE_DECIMAL`, `RE_WHITESPACE`.

**Safety**: None use the `g` flag, so no `lastIndex` statefulness concerns.

**Targeted tests**: `npm test` (standard suite covers all tokenization paths)

---

## Verification Strategy

For EVERY optimization, the non-negotiable constraint is:

1. `npm run build` — compiles cleanly
2. `npm run test-full` — all regression tests pass (byte-identical .obj, .bin, .lst vs GOLD files)
3. `npm run perf` — benchmark completes without errors
4. `npm run perf-compare` — no category regresses >5%

---

## What We Do Now

1. **Add** the Two-Axis Prioritization table to the existing roadmap doc (`DOCs/roadmaps/Performance-Analysis-and-Optimization-Roadmap.md`)
2. **Create** `benchmark-00-original-baseline.json` (copy existing baseline)
3. **Create** `DOCs/roadmaps/Performance-Optimization-Ledger.md` (tracking table with all 15 items)
4. **Execute Optimization #1** (logging guards — score 7.2) following the full algorithm
5. **Execute Optimization #2** (regex static fields — score 4.0) following the full algorithm
6. **Evaluate**: Does the algorithm work smoothly? Adjust if needed before continuing through the remaining 13 optimizations.
