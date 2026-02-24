# Performance Optimization Ledger

Tracks measured results for each optimization in the [Sprint Plan](Performance-Optimization-Sprint-Plan.md).

**Baseline:** `benchmark-00-original-baseline.json`
- Total time: 639,775.6 ms | Date: 2026-02-24 | Version: 1.52.1

---

## Optimization Results

| Order | Opt# | Description | Before (ms) | After (ms) | Delta (ms) | Delta % | Status |
|-------|------|-------------|-------------|------------|------------|---------|--------|
| 1 | 1 | Inline logging guards | ... | ... | ... | ... | pending |
| 2 | 2 | Static regex class fields | ... | ... | ... | ... | pending |
| 3 | 3 | Single-pass preprocessor regex | ... | ... | ... | ... | pending |
| 4 | 6 | Cache per-line column state | ... | ... | ... | ... | pending |
| 5 | 7 | Index-based line tracking | ... | ... | ... | ... | pending |
| 6 | 15 | Exponential buffer doubling | ... | ... | ... | ... | pending |
| 7 | 18 | Normalize case once at boundary | ... | ... | ... | ... | pending |
| 8 | 8 | SpinElement object reuse | ... | ... | ... | ... | pending |
| 9 | 5 | Number for 32-bit BigInt ops | ... | ... | ... | ... | pending |
| 10 | 9 | Hash-based distiller dedup | ... | ... | ... | ... | pending |
| 11 | 12 | Hash-based debug record lookup | ... | ... | ... | ... | pending |
| 12 | 4 | copyWithin moveObjectUp | ... | ... | ... | ... | pending |
| 13 | 10 | Track unresolved CON, skip passes | ... | ... | ... | ... | pending |
| 14 | 17 | Bulk set() distiller copy | ... | ... | ... | ... | pending |
| 15 | 14 | Array + .join() hex dump | ... | ... | ... | ... | pending |

**Cumulative vs baseline:** ... ms saved (... %)

---

## Shelved Optimizations (deferred, not abandoned)

| Opt# | Description | Root Cause | Revisit When |
|------|-------------|------------|--------------|
| | | | |
