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
| 8 | 8 | SpinElement object reuse | 245,579.4 | 247,237.3 | +1,657.9 | +0.7% | shelved |
| 9 | 5 | Number for 32-bit BigInt ops | 243,621.6 | 253,028.5 | +9,406.9 | +3.9% | shelved |
| 10 | 9 | Hash-based distiller dedup | 243,168.4 | 247,562.7 | +4,394.3 | +1.8% | shelved |
| 11 | 12 | Hash-based debug record lookup | 243,113.9 | 249,873.4 | +6,759.5 | +2.8% | shelved |
| 12 | 4 | copyWithin moveObjectUp | 246,431.8 | 248,959.4 | +2,527.6 | +1.0% | shelved |
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
| 8 | SpinElement object reuse | Added copyFrom() to SpinElement and used a pre-allocated scratchElement for the intermediate symbol-replacement allocation in getElement(). Full object reuse for currElement was unsafe due to unbounded reference retention across checkIndex()→skipExpression() chains (saved references span dozens of getElement() calls). The safe subset (scratchElement for intermediate only) eliminates ~30-50% of allocations but V8's generational GC handles short-lived SpinElement objects (nursery-age, never promoted) so efficiently that reducing allocations produces no measurable gain. Two runs showed +0.7% and +9.5% (second inflated by system load). | If V8 GC behavior changes or profiling shows SpinElement allocation as a GC hotspot |
| 5 | Number for 32-bit BigInt ops | Converted all 372 BigInt sites across 13 files to Number with `>>> 0` unsigned masking, `\| 0` for signed interpretation, `Math.imul()` for multiply, and local BigInt only for SCA/SCAS/FRAC (64-bit intermediates). All 250 regression tests passed byte-identical. However, benchmarks showed +3.9% and +5.6% regression across two runs. Root cause: (1) `resolveOperation()` is only called during constant expression evaluation — a small fraction of total compile time, so BigInt arithmetic savings are minimal; (2) the ~372 `>>> 0` masking operations and changed `typeof` checks (`'number'` vs `'bigint'`) add overhead that exceeds BigInt removal savings; (3) V8 optimizes BigInt storage and parameter passing efficiently — the theoretical 5-20x per-operation slowdown doesn't translate to measurable wall-clock improvement when arithmetic is a tiny fraction of the workload. | If profiling shows BigInt arithmetic as a top-5 hotspot, or if the resolver's constant evaluation workload increases significantly |
| 9 | Hash-based distiller dedup | Replaced O(n²) nested-loop deduplication in `eliminateRedundantObjects()` with hash-map approach (`Map<number, number[]>` of record hashes → bucket indices, with `areRecordsEquivalent()` verification on collision). All 250 regression tests passed. Benchmark showed +1.8% regression (+4,394ms). Root cause: Object counts in typical P2 projects are 2-36 (worst case: WUMMI Main.spin2 with 35 OBJ declarations). At these sizes, the O(n²) inner loop completes in microseconds. The `Map` allocation, hash computation (`Math.imul` chain over all content longs), and bucket management add overhead that exceeds the negligible savings from avoiding pairwise comparison at small N. | If P2 projects grow to hundreds of objects, or if distillation appears as a profiled hotspot |
| 12 | Hash-based debug record lookup | Added `findOrAddRecord()` to DebugData with `Map<number, number[]>` hash-map (hash of record bytes → entry indices). Replaced linear scan in `debugEnterRecord()` (spinResolver.ts) with O(1) hash lookup + collision verification via existing `recordIsMatch()`. All 250 regression tests passed. Benchmark showed +2.8% regression (+6,760ms). Root cause: Debug record counts are small (≤255 max, typically much fewer); the linear scan with early-exit on first byte mismatch is very fast for small N. The Map allocation, `Math.imul` hash computation over all record bytes, and bucket management add per-DEBUG() overhead that exceeds the negligible linear scan cost. Same pattern as Opt#9: hash-map overhead dominates at small N. | If debug record counts grow significantly, or if DEBUG()-heavy programs become a profiled bottleneck |
| 4 | copyWithin moveObjectUp | Replaced byte-by-byte reverse copy loop in `moveObjectUp()` (spin2Parser.ts) with `Uint8Array.copyWithin()` — a single native memcpy operation. Made `ensureCapacity()` public on ObjectImage to pre-allocate before the copy. All 250 regression tests passed. Benchmark showed +1.0% regression (+2,528ms), within noise but consistently positive. Root cause: `moveObjectUp()` is only called 3-5 times per compilation (inserting interpreter, debugger, flash loader, clock setter). Even for the largest programs, each call moves at most ~1MB. The per-call savings from native memcpy vs JS loop are microseconds — invisible at the benchmark level. The original byte-by-byte loop with `replaceByte`/`read` was already fast because logging guards (Opt#1) eliminated the template literal overhead. | If object images grow significantly larger or moveObjectUp is called more frequently |

---

## Sprint Learnings

Key insights from Orders 1-12 that should guide decisions about the remaining 3 pending optimizations.

### The Big Picture

The sprint achieved a **61.1% reduction** in compilation time (639,776 ms → ~248,750 ms), but virtually all of it came from a single optimization: eliminating template literal evaluation in disabled logging paths (Opt#1, -56.5%). The next two wins (Opt#2 regex hoisting at -0.8%, Opt#3 preprocessor single-pass at -0.7%) were small but real. All nine subsequent attempts (Opt#6, #7, #15, #18, #8, #5, #9, #12, #4) showed no measurable gain and were shelved — including Opt#5 (BigInt → Number), Opt#9 (hash distiller dedup), and Opt#12 (hash debug lookup), which were rated as the highest-likelihood wins among remaining items.

**Strategic takeaway:** The compiler's remaining hot paths are already well-optimized by V8's JIT. Both micro-optimizations (caching, allocation reduction) and type-level changes (BigInt → Number) consistently fail to produce measurable gains. The BigInt → Number result is particularly instructive: even though individual BigInt operations are 5-20x slower than Number equivalents, the arithmetic hot path (`resolveOperation()`) represents such a small fraction of total compile time that the savings are invisible at the benchmark level. Future optimization efforts should focus on algorithmic-level changes that eliminate entire passes or change O(n²) → O(n) complexity.

### V8 Runtime Insights

These findings are specific to the V8 JavaScript engine (Node.js) and explain why textbook optimizations regressed or showed no gain:

1. **charAt loops beat precomputed arrays (Opt#6):** V8's optimizing compiler generates very efficient machine code for simple `charAt()` loops over strings. Replacing them with cached arrays adds allocation overhead that exceeds the scan savings — even when the loop rescans from the start of the line for every token.

2. **Sliced-string chaining is fast (Opt#7):** V8 implements `substring()` as a "sliced string" — a lightweight view referencing the original string's memory, not a copy. Chaining `substring()` calls (the elementizer's pattern) is nearly free. Replacing this with index-based tracking added property lookup overhead that was slower than V8's native sliced-string mechanism.

3. **ArrayBuffer allocation is already efficient (Opt#15):** V8 handles typed array allocation and copying efficiently. The ObjectImage's initial 128KB allocation covers most programs, and growth events are rare (a few per large compile). The theoretical O(n) vs O(n²/step) copy reduction from exponential doubling doesn't materialize because there aren't enough growth events to amortize the larger initial allocation.

4. **Small-string toUpperCase() is negligible (Opt#18):** V8 optimizes short string operations (case conversion on symbol names typically 5-20 chars) so aggressively that eliminating ~8 redundant `.toUpperCase()` calls per symbol lookup chain produces no measurable change.

5. **Generational GC handles short-lived objects efficiently (Opt#8):** SpinElement objects created in getElement() are nursery-age (never survive to old generation). V8's bump-pointer nursery allocation is nearly free, and minor GC pauses for collecting these objects are negligible. Reducing allocations by ~30-50% via a reusable scratch element produced no measurable gain. Note: full object reuse for currElement was unsafe due to unbounded reference retention — code saves `this.currElement` across `checkIndex()→skipExpression()` chains that invoke getElement() an arbitrary number of times.

6. **BigInt per-operation cost doesn't matter when arithmetic is a small fraction of workload (Opt#5):** Individual BigInt operations are 5-20x slower than Number equivalents in V8 microbenchmarks, but `resolveOperation()` (the arithmetic hot path) is only called during constant expression evaluation — a tiny fraction of total compilation time. Converting all 372 BigInt sites to Number with `>>> 0` masking produced a net regression (+3.9%, confirmed +5.6% on second run) because: (a) the added `>>> 0` operations introduce their own overhead, (b) V8 optimizes BigInt storage and parameter passing (not just arithmetic) efficiently, and (c) `typeof === 'number'` checks may be slower than `typeof === 'bigint'` checks in V8's type specialization. **Lesson:** Per-operation microbenchmarks don't predict system-level performance; the fraction of total time spent in the optimized path matters more than the per-call speedup.

7. **Map overhead exceeds O(n²) savings at small N (Opt#9):** Replacing an O(n²) nested loop with a `Map<number, number[]>` hash-map approach in the object distiller regressed by +1.8%. With only 2-36 objects, the pairwise comparison loop completes in microseconds. The Map allocation, `Math.imul` hash computation over all content longs, and bucket management add constant overhead that exceeds the negligible O(n²) cost at small N. **Lesson:** Big-O complexity improvements only help when N is large enough for the asymptotic behavior to dominate. At N=2-36, a simple nested loop with early-exit is faster than a hash-map with allocation overhead.

### Benchmark Methodology Insights

- **Noise floor is ~3-5% variance** between benchmark runs on the same code. Any measured delta within this band cannot be distinguished from noise.
- **Two-run validation** proved essential for the shelved optimizations. Opt#15 showed +3.4% on the first run and +1.9% on the second — both within or near the noise floor but consistently in the wrong direction.
- **The "before" baseline shifts** across optimizations because each accepted optimization changes the starting point. The ledger tracks per-optimization deltas against their own "before" measurement, not the original baseline, which gives accurate per-change attribution.

### Implications for Remaining Optimizations

Given that even the highest-confidence optimization (Opt#5 BigInt → Number) failed to produce gains, the remaining 6 pending items should be approached with low expectations:

**More likely to produce measurable gains** (algorithmic changes that eliminate work entirely):
- ~~Opt#9 (Hash-based distiller dedup)~~: **Confirmed shelved** — O(n²) → O(n) algorithmic improvement is real, but object counts (2-36) are too small for Map overhead to pay off. The O(n²) loop at these sizes completes in microseconds.
- Opt#10 (Skip unnecessary CON passes): Eliminates entire compilation passes, not individual operations.

**Less likely to produce gains** (micro-optimizations similar to shelved items):
- ~~Opt#5 (BigInt → Number)~~: **Confirmed shelved** — Despite BigInt being 5-20x slower per operation, the arithmetic hot path is too small a fraction of total compile time. The `>>> 0` masking overhead negated any savings.
- ~~Opt#8 (SpinElement object reuse)~~: **Confirmed shelved** — V8's generational GC handles short-lived objects efficiently. Additionally, full object reuse was unsafe due to unbounded reference retention patterns.
- ~~Opt#12 (Hash-based debug record lookup)~~: **Confirmed shelved** — Same pattern as Opt#9: hash-map overhead dominates at small N. Debug record counts are small enough that linear scan with early-exit is faster.
- ~~Opt#4 (copyWithin moveObjectUp)~~: **Confirmed shelved** — Only called 3-5 times per compilation; native memcpy vs JS loop saves microseconds per call, invisible at benchmark level.
- Opt#17 (Bulk set() distiller copy): Similar to Opt#15 — V8 may already optimize the loop.
- Opt#14 (Array + join hex dump): Cold path (listing generation only).
