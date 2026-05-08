# Test Suite Punch List

Items deferred from the v1.54.3 cache-fix release that need follow-up. These
were uncovered while auditing `npm run test-full` and `npm run audit-errors`
before release. None block the v1.54.3 fix; all should be addressed before
they accumulate further.

---

## 1. `op_qlog` / `op_qexp` saturation precision bug

**Surfaced by:** `pnut-ts-resolver.test.ts` against `dumpTables.spin2`. After
filtering header lines, exactly **one** assertion mismatches the GOLD:

```
[039] 0xFFFFFFFF, 0x00000000, op_qlog = 0x00000000   ← PNut-TS
[039] 0xFFFFFFFF, 0x00000000, op_qlog = 0xFFFFFFFF   ← PNut (GOLD)
```

**Root cause:** `spinResolver.ts:11319-11328`. For input `$FFFFFFFF`,
`Math.log2(0xFFFFFFFF) ≈ 32.0`, `× 2^27 = 0x100000000`, BigInt-truncated, then
masked to 32 bits → `0x00000000`. PNut clamps the saturated case to
`0xFFFFFFFF`. The author left a warning comment acknowledging the precision
gap (`+/- 2 bits`) and that it might cause regression failures.

**Symmetric concern:** `op_qexp` at `spinResolver.ts:11332-11339` carries the
same warning (`+/- 3 bits`) but no regression failure has been observed for
it yet — could be that the resolver fixture doesn't exercise the saturation
boundary. Worth reviewing both together.

**User-visible impact:** any compile-time constant expression using
`QLOG($FFFFFFFF)` (or values whose `log2 × 2^27` exceeds `2^32`) silently
produces the wrong constant. Probability: low (most constants don't sit on
the saturation boundary), but the failure mode is silent corruption.

**Suggested fix:** clamp the result to `0xFFFFFFFF` instead of letting it
overflow-then-mask. Verify against the same set of inputs PNut's CORDIC
QLOG/QEXP handles. Add explicit edge-case test entries to the resolver
regression suite (current suite catches it almost by accident).

---

## 2. Stale preprocessor GOLDs

**Surfaced by:** `pnut-ts-preproc.test.ts` — three failures: `condCode`,
`condCodeElse`, `include`. GOLDs date from January 2024.

**Root cause — two intertwined issues:**

1. **Format change.** The preprocessor's output format intentionally changed
   to *retain* preprocessor-directive lines as comments (e.g. `' #define
   CLOCK_200MHZ` shows on the source-line where the directive lived) instead
   of dropping them entirely. This makes downstream error reporting more
   useful. The Jan 2024 GOLDs reflect the old "directive lines stripped"
   format.

2. **CON-only fixture sources fail compile.** `condCode.spin2`,
   `condCodeElse.spin2`, and `include.spin2` are CON-only test files (no
   `PUB` or `DAT`) — legal as imported objects but not as top-level. The
   compiler now correctly errors with `No PUB method or DAT block found`.
   The `.pre` report has already been emitted by the time that error fires,
   so the report itself is fine — but the spurious error in the test output
   muddies diagnosis.

**Suggested fix:** decide whether to (a) regenerate `.pre.GOLD` files from
current output and treat going forward as us-vs-us snapshots that we own
end-to-end, or (b) follow the same logic as the deleted `--regression
tables` apparatus and drop preprocessor-vs-GOLD comparison entirely (the
preprocessor is exercised through every `*.spin2` compile in the regular
regression suite — its correctness is implicitly tested). Option (a) keeps
a focused regression for the preprocessor specifically; option (b) reduces
maintenance burden.

If keeping (a): also add a `PUB main()` stub to each fixture so the spurious
"No PUB method or DAT block" error stops appearing in the test output.

---

## 3. Pre-existing `audit-errors` duplicates (8)

`npm run audit-errors` reports 8 duplicate-message issues that pre-date
v1.54.3 (confirmed by stashing changes and re-running on `main`). All cluster
around STRUCT support added in v1.54.0:

- `"Expected an existing STRUCT name"` — needs 2 unique codes
- `"Expected a structure member name"` — needs 2 unique codes
- `"Structure does not contain this name"` — needs 3 unique codes
- `"Indexed structures cannot exceed $FFFF bytes in size"` — inconsistent codes
- `"Structure index must be from 0 to $FFFF"` — needs 2 unique codes
- `"Structure exceeds hub range of $FFFFF"` — inconsistent codes
- `"Bit number exceeds BYTE/WORD/LONG boundary"` — needs 2 unique codes
- `"OBJ data exceeds ${this.obj_limit / 1024}k limit"` — needs 2 unique codes
  (this one is in `compiler.ts`, not STRUCT-related)

**Convention** (per `DOCs/RELEASE-PROCESS.md`): error codes are `(mGGI)`
where `GG` is a group ID and `I` is the instance within the group. Multiple
locations sharing one message text get one group with sequential instance
suffixes. Suggested next step: assign group codes per the convention and
re-run `npm run audit-errors` until clean.

**Why deferred:** mechanical fix that's tangential to the cache work.
Ideally addressed as a single dedicated commit so the changelog entry reads
cleanly.

---

## 4. Dead flash/RAM download infrastructure (partial cleanup remaining)

v1.54.3 removed the user-facing `--flash` / `--ram` / `--both` / `--plug` /
`--dvcnodes` CLI options (none ever went live), the dead branches that
referenced them, the `writeFlash` / `writeRAM` fields from `CompileOptions`,
and simplified `Spin2Parser.ComposeRam()` to drop its now-permanently-false
parameters. The following internal helpers became dead code as a result and
should be deleted in a follow-up pass:

- `Spin2Parser.P2InsertFlashLoader()` — only callable from the now-removed
  `programFlash` branch
- `Spin2Parser.LoadHardware()` — only callable from the now-removed
  `ramDownload` branch
- The `flashLoader` external resource it embeds (under `src/ext/`)

The flash *image file* path (`-F, --flashfile`, `P2MakeFlashFile`,
`writeFlashImageFile`) is still active and supported — that produces a
`.flash` image for an external programmer, which is the use case we kept.

**Why deferred:** removing the helpers ripples into `externalFiles.ts` and
the `src/ext/` resource bundling — small but touches surface area beyond the
CLI cleanup that motivated this release.

---

## Cross-cutting note: regression tests against "us-vs-us" GOLDs

Three of the items above (`#1 op_qlog`, `#2 preproc GOLDs`, the deleted
`--regression tables` apparatus, the deleted `pnut-ts-element` test) all
share one structural problem: regression suites that compare PNut-TS output
against PNut-TS-generated snapshots from a prior date. These rot whenever
the format intentionally evolves and there's no mechanism to refresh them.

The deletions in v1.54.3 (`--regression tables`, `pnut-ts-element`) accept
that some of these snapshot comparisons aren't worth maintaining because
the underlying data (bytecode tables, elementizer output format) is
*designed* to evolve. Items that survived (resolver, preprocessor) capture
behaviors that *shouldn't* change — math operations and preprocessor
semantics — so a stable GOLD makes sense provided we own the regenerate
flow.

A general principle worth adopting: any GOLD that PNut (Pascal) cannot
produce must come with a documented "how to refresh this" recipe in the
test file's header, or it doesn't belong in the suite.
