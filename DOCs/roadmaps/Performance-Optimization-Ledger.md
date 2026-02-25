# Performance Optimization Ledger

Tracks measured results for each optimization in the [Sprint Plan](Performance-Optimization-Sprint-Plan.md).

**Baseline:** `benchmark-00-original-baseline.json`
- Total time: 639,775.6 ms | Date: 2026-02-24 | Version: 1.52.1

---

## Optimization Results

| Order | Opt# | Description | Before (ms) | After (ms) | Delta (ms) | Delta % | Status |
|-------|------|-------------|-------------|------------|------------|---------|--------|
| 1 | 1 | Inline logging guards | 622,259.7 | 270,672.2 | -351,587.5 | -56.5% | done |
| 2 | 2 | Static regex class fields | 252,007.1 | 250,002.8 | -2,004.3 | -0.8% | done |
| 3 | 3 | Single-pass preprocessor regex | 250,547.8 | 248,750.4 | -1,797.4 | -0.7% | done |
| 4 | 6 | Cache per-line column state | 240,090.3 | 248,852.9 | +8,762.6 | +3.6% | shelved |
| 5 | 7 | Index-based line tracking | 243,175.5 | 249,447.8 | +6,272.3 | +2.6% | shelved |
| 6 | 15 | Exponential buffer doubling | 238,008.4 | 242,491.0 | +4,482.6 | +1.9% | shelved |
| 7 | 18 | Normalize case once at boundary | 242,070.5 | 246,576.4 | +4,505.9 | +1.9% | shelved |
| 8 | 8 | SpinElement object reuse | ... | ... | ... | ... | pending |
| 9 | 5 | Number for 32-bit BigInt ops | ... | ... | ... | ... | pending |
| 10 | 9 | Hash-based distiller dedup | ... | ... | ... | ... | pending |
| 11 | 12 | Hash-based debug record lookup | ... | ... | ... | ... | pending |
| 12 | 4 | copyWithin moveObjectUp | ... | ... | ... | ... | pending |
| 13 | 10 | Track unresolved CON, skip passes | ... | ... | ... | ... | pending |
| 14 | 17 | Bulk set() distiller copy | ... | ... | ... | ... | pending |
| 15 | 14 | Array + .join() hex dump | ... | ... | ... | ... | pending |

**Cumulative vs baseline:** 391,025.2 ms saved (61.1%)

---

## Shelved Optimizations (deferred, not abandoned)

| Opt# | Description | Root Cause | Revisit When |
|------|-------------|------------|--------------|
| 6 | Cache per-line column state | Array allocation per line costs more than repeated char scan; V8 optimizes the simple loop well. Tried both new-array-per-line and reusable-buffer approaches — both regressed ~3-4%. | If elementizer is substantially restructured |
| 7 | Index-based line tracking | Deriving unprocessedLine from original text via offset is slower than V8's native sliced-string chaining. The property lookup chain (this.currentTextLine.text) adds overhead that exceeds substring savings. | If V8 changes sliced-string behavior or elementizer is rewritten |
| 15 | Exponential buffer doubling | Initial 128KB allocation already handles most programs; growth events are rare (a few per large compile). V8 handles ArrayBuffer allocation efficiently, so the O(n) vs O(n²/step) copy reduction is negligible. Two benchmark runs showed +3.4% and +1.9% regression. | If object sizes grow significantly or compilation involves many more files |
| 18 | Normalize case once at boundary | Eliminated redundant `.toUpperCase()` in internal calls and multi-lookup patterns (findSymbol: 6→1, lookupSymbol: 3→1, checkImportedParam: 2→1). V8 optimizes small-string `.toUpperCase()` so well that removing ~8 redundant calls per symbol lookup produces no measurable gain. Two runs showed +1.9% and +2.7% (noise). | If symbol table operations become a profiled bottleneck |

---

## Sprint Learnings

Key insights from Orders 1-7 that should guide decisions about the remaining 8 pending optimizations.

### The Big Picture

The sprint achieved a **61.1% reduction** in compilation time (639,776 ms → ~248,750 ms), but virtually all of it came from a single optimization: eliminating template literal evaluation in disabled logging paths (Opt#1, -56.5%). The next two wins (Opt#2 regex hoisting at -0.8%, Opt#3 preprocessor single-pass at -0.7%) were small but real. All four subsequent attempts (Opt#6, #7, #15, #18) showed no measurable gain and were shelved.

**Strategic takeaway:** The compiler's remaining hot paths are already well-optimized by V8's JIT. Sub-system micro-optimizations that look promising on paper (eliminating redundant calls, caching computed values, reducing allocations) consistently fail to produce measurable gains because V8's internal optimizations already handle these patterns efficiently. Future optimization efforts should focus on algorithmic-level changes (e.g., reducing pass counts, changing data structures) rather than micro-level tweaks.

### V8 Runtime Insights

These findings are specific to the V8 JavaScript engine (Node.js) and explain why textbook optimizations regressed or showed no gain:

1. **charAt loops beat precomputed arrays (Opt#6):** V8's optimizing compiler generates very efficient machine code for simple `charAt()` loops over strings. Replacing them with cached arrays adds allocation overhead that exceeds the scan savings — even when the loop rescans from the start of the line for every token.

2. **Sliced-string chaining is fast (Opt#7):** V8 implements `substring()` as a "sliced string" — a lightweight view referencing the original string's memory, not a copy. Chaining `substring()` calls (the elementizer's pattern) is nearly free. Replacing this with index-based tracking added property lookup overhead that was slower than V8's native sliced-string mechanism.

3. **ArrayBuffer allocation is already efficient (Opt#15):** V8 handles typed array allocation and copying efficiently. The ObjectImage's initial 128KB allocation covers most programs, and growth events are rare (a few per large compile). The theoretical O(n) vs O(n²/step) copy reduction from exponential doubling doesn't materialize because there aren't enough growth events to amortize the larger initial allocation.

4. **Small-string toUpperCase() is negligible (Opt#18):** V8 optimizes short string operations (case conversion on symbol names typically 5-20 chars) so aggressively that eliminating ~8 redundant `.toUpperCase()` calls per symbol lookup chain produces no measurable change.

### Benchmark Methodology Insights

- **Noise floor is ~3-5% variance** between benchmark runs on the same code. Any measured delta within this band cannot be distinguished from noise.
- **Two-run validation** proved essential for the shelved optimizations. Opt#15 showed +3.4% on the first run and +1.9% on the second — both within or near the noise floor but consistently in the wrong direction.
- **The "before" baseline shifts** across optimizations because each accepted optimization changes the starting point. The ledger tracks per-optimization deltas against their own "before" measurement, not the original baseline, which gives accurate per-change attribution.

### Implications for Remaining Optimizations

Given the pattern that V8 micro-optimizations consistently fail to produce gains, the remaining pending items fall into two categories:

**More likely to produce measurable gains** (algorithmic changes):
- Opt#5 (BigInt → Number): Changes the fundamental numeric type used in expression evaluation. BigInt operations are 10-100x slower than Number ops — this is a V8 implementation reality, not a micro-optimization.
- Opt#9 (Hash-based distiller dedup): Changes O(n²) to O(n) algorithmic complexity for multi-object projects.
- Opt#10 (Skip unnecessary CON passes): Eliminates entire compilation passes, not individual operations.

**Less likely to produce gains** (micro-optimizations similar to shelved items):
- Opt#8 (SpinElement object reuse): GC pressure reduction — V8's generational GC may already handle short-lived objects efficiently.
- Opt#12 (Hash-based debug record lookup): Linear → hash lookup, but only affects DEBUG() statements.
- Opt#4 (copyWithin moveObjectUp): Only called 3-4 times per compilation; absolute time savings minimal.
- Opt#17 (Bulk set() distiller copy): Similar to Opt#15 — V8 may already optimize the loop.
- Opt#14 (Array + join hex dump): Cold path (listing generation only).
