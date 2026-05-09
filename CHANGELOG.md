# Change Log

All notable changes to the "Pnut - A reimplementation in TypeScript" are documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for reminders on how to structure this file. Also, note that our version numbering adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Known compatibility issues w/PNut

There is one issue which we are unable to address in this implementation:

1. **Floating point constants**: The mantissa (bits 22:0) can be +/- 1 ls-bit different in value (_this is a math library limitation_)

## [FutureVersions]

Work to appear in upcoming releases:

- Work on getting essential coverage completed (all code generation, less exception testing)
- Fix any bugs reported by users
- Add User Reqeuested enhancements
- Keep up with PNut changes soon after they are released.

## [Unreleased]

## [1.54.6] 2026-05-09

### Fixed

- **Object cache correctness — replay subtree `#pragma exportdef` contributions on cache hit**: v1.54.5 added `defSymbols` to the cache key, fixing one half of the propagated-symbol problem (cache *lookup* discriminating on context). It missed the other half (cache *hit* preserving the side effects the skipped subtree would have produced). When a depth-1 child cache-hits, its descendant preprocesses are skipped, so any `#pragma exportdef` those descendants would have pushed onto `context.preProcessorOptions.defSymbols` never lands. A subsequent depth-1 sibling then preprocesses against a stale `defSymbols` and produces a binary structurally different from the cold-compile output. Symptom in the SD FAT32 driver suite was `Invalid object image found for file: isp_rt_utilities.spin2` on 9 of 24 harnesses (the `SD_INCLUDE_ALL` ones running after the harnesses that populated the cache). The fix snapshots `defSymbols.length` at cache-key time, slices `defSymbols[snapshot..end]` after the child's full subtree compile to capture the subtree's exportdef contribution (transitively, including grandchildren that themselves cache-hit during this compile), stores that slice in the `.dbg` sidecar's new `subtreeExports` field, and replays each symbol onto `context.preProcessorOptions.defSymbols` on cache hit before subsequent siblings preprocess. `CACHE_FORMAT_VERSION` bumped to 6 (v5 entries silently invalidated by the key change). The `.dbg` sidecar is now load-bearing on every v1.54.6+ cache hit (not just `--debug` ones), since `subtreeExports` may need replay regardless of debug mode.

### Added

- **Comprehensive byte-equivalence regression test** (`src/tests/CACHE-tests/objectCache.test.ts`): a `test.each` over a curated set of 9 fixtures covering simple parent/child, multi-sibling, override parameters, debug+cache, heterogeneous parents, exportdef key-isolation (X vs Y), and the v1.54.6 subtree-exportdef-replay scenario. For each fixture: produces a fresh-uncached reference binary, then verifies BOTH a cold-cache build AND a warm-cache build produce a byte-identical binary. Any future compiler change that the cache fails to track correctly fails this test on the introducing PR. New fixtures `expdef_subtree_*.spin2` reproduce the v1.54.5 → v1.54.6 bug as a 2-byte CON-value difference (verified pre-fix).
- **Object cache correctness analysis document** (`DOCs/roadmaps/Object-Cache-Correctness-Analysis.md`): living analysis of the cache contract, the complete shared-state catalog (correctness vs map-fidelity vs not-applicable), the cache shape evaluation, and the precise boundary between what's correct-by-construction (test-level: incorrect code can't merge) versus what would require eliminating shared mutable state (type-level: incorrect code won't compile). Documents why v1.54.2 → v1.54.6 each found a different concrete instance of the same abstract bug, and the mitigations planned to prevent the next one.

## [1.54.5] 2026-05-08

### Fixed

- **Object cache correctness with `#pragma exportdef` (fourth attempt)**: v1.54.4's cache key (`preprocessedLines + overrides + compilerVersion + enableDebug + cacheFormatVersion`) silently collided when two parents propagated different symbol sets via `#pragma exportdef`, *as long as the immediate child's own source had no `#ifdef` on those symbols*. The child's `preprocessedLines` was identical across both contexts, so the key matched — but the child's compiled binary embeds GRANDCHILD bytes (via `compile_obj_blocks`), and grandchildren whose source DID `#ifdef` on the propagated symbols compiled to different bytes. Result: the cache returned one parent's child-binary into the other parent's compile, with silently wrong embedded grandchildren. Symptom in the SD FAT32 driver test suite was `Invalid object image found for file: isp_stack_check.spin2` — the parent's compile correctly detected that the cached child's embedded grandchild didn't match what it expected at OBJ-link time. The fix folds `context.preProcessorOptions.defSymbols` (sorted, deduped, uppercased) into `computeKey()`. This captures both CLI `-D` flags AND any symbols an ancestor propagated via `#pragma exportdef`, so contexts that produce different grandchild content always get separate cache entries. `CACHE_FORMAT_VERSION` bumped to 5; v4 entries silently invalidated by the key change.

### Added

- New regression test `warm cache distinguishes parents with different propagated #pragma exportdef symbols`: cold-builds `expdef_parentX` (which `#pragma exportdef SYM_X`), then warm-builds `expdef_parentY` (which `#pragma exportdef SYM_Y`) and asserts the resulting `.bin` matches a fresh uncached parentY build. The shared child has neither symbol in its source; the grandchild has `#ifdef SYM_X / #elseifdef SYM_Y / #else / #endif` on a CON value, so the embedded grandchild byte differs by symbol — exactly the SD test-suite shape that v1.54.4 missed. Plus unit coverage for `defSymbols` key sensitivity (different symbol sets, order-/case-/dedup-stability, empty-set baseline).

## [1.54.4] 2026-05-08

### Fixed

- **Object cache correctness with `--debug` (third attempt — real real fix)**: v1.54.3's `.dbg` sidecar replayed each cached child's records into the shared `DebugData` table on cache hit, but assumed `injectRecord`'s dedup walk would assign the same indices it had during the original compile. That assumption only holds when the same set of earlier siblings precedes the child in the same order — i.e. when the same parent is recompiled. As soon as a *different* parent compiled the cached child after a sibling that contributed a different number of records, the records replayed at new indices but the `brkCode` bytes baked into the cached `.bin` still pointed at the parentA-era indices. At runtime the `debug()` calls inside the shared child read the wrong format strings (whichever records happened to land at the cached indices), producing the same garbled output v1.54.3 was meant to fix. Symptoms reproduced in the SD FAT32 driver test suite once 4+ test harnesses ran with a warm cache. Two new mechanisms close the gap: (1) every `brkCode` write site (Spin `bc_debug` triple, PASM BRK long) is now captured at emission time as a `BrkSite { offset, kind, origIndex }`; (2) on cache hit the replayed records' new indices are recorded in an `origIndex → newIndex` remap, then each `BrkSite` is patched in the cached binary so its `brkCode` field references the correct DebugData entry. The Spin object checksum is recomputed after patching so the loader still accepts the image. `.dbg` payload now carries `records: [{origIndex, bytes}]` plus `brkSites: [{offset, kind, origIndex}]`. `CACHE_FORMAT_VERSION` bumped to 4 (v3 entries silently invalidated by key change). The cached `records` list now also includes records the child originally dedup'd against siblings — captured by `getRecordBytes(origIndex)` for every unique origIndex any `BrkSite` references — so a cache hit succeeds even when the same content is now contributed by a different sibling (or no sibling at all).

## [1.54.3] 2026-05-08

### Fixed

- **Object cache correctness with `--debug` (real fix)**: cached child binaries have `brkCode` bytes baked in by every `debug()` call; those `brkCode`s are indices into a single `DebugData` table that the compiler rebuilds from scratch every run. v1.54.2 fixed the cache *key* so debug and non-debug binaries no longer aliased, but it did not save the records themselves — on cache hit, the table was filled with whatever the new compile produced and the cached child's `brkCode`s pointed at unrelated records. This manifested as garbled `debug()` output once two or more sibling tests hit the cache: format strings printing the wrong values, loop counters appearing under the wrong label, etc. Each cache entry now ships a `.dbg` sidecar that captures the records the child contributed during its original compile; on cache hit those records are replayed through the same dedup walk as `debug_enter_record`, so the indices line up and the resulting top-level `.bin` (debug data table included) is byte-identical to a fresh compile. A missing `.dbg` on a `--debug` cache hit now raises an explicit error rather than silently producing a broken binary. `CACHE_FORMAT_VERSION` is bumped to 3, invalidating all v1.54.2 entries.

### Deferred (see DOCs/roadmaps/Test-Suite-Punch-List.md)

- `op_qlog($FFFFFFFF)` saturation precision bug (resolver regression catches this; one assertion).
- Stale preprocessor GOLDs (Jan 2024 format predates a deliberate preprocessor output change).
- 8 pre-existing `npm run audit-errors` duplicate-code issues, mostly clustered around v1.54.0 STRUCT support.
- Dead flash-loader internal helpers (`P2InsertFlashLoader`, `LoadHardware`) left in place after the CLI cleanup; deletion ripples into `src/ext/` resource bundling.

## [1.54.2] 2026-05-06

### Fixed

- **Object cache correctness with `--debug`**: the `enableDebug` compile option is now part of the cache key. Previously, mixing debug and non-debug builds against the same `.pnut-cache/` could return a stripped binary into a debug build (or vice versa), producing executables that did not run. Caches written by earlier versions are invalidated automatically by a `CACHE_FORMAT_VERSION` bump baked into the key.

### Added

- **Map file fidelity for cached children**: each cache entry now ships a `.sym` sidecar that holds the child's user symbols. When `--map` is requested, cache hits restore those symbols into the map generator so cached children appear with their methods, DAT, and VAR layout intact. The sidecar is only read when a map is being written, so the no-map common path pays no extra I/O.
- `CACHE_FORMAT_VERSION` constant in `objectCache.ts`. Bumped any time the on-disk layout, sidecar shape, or set of compile-option key inputs changes; bumping silently invalidates older caches.

## [1.54.1] 2026-05-05

### Fixed

- `--cache-clear` now runs at CLI parse time instead of inside the compiler constructor, so it takes effect even when no source file is given (e.g., `pnut-ts --cache-clear` or `pnut-ts --cache-clear --cache-dir <dir>`). Previously the clear was silently skipped whenever compilation did not start.
- `--cache-clear` now reports the cleared directory: `Cleared object cache: <abs-path>`.

## [1.54.0] 2026-04-23

### Added

- **Language**: Support for `{Spin2_v54}` language version directive (accepted unconditionally; not a gate — matches PNut v54 behavior)
- **Language**: Named bitfields on STRUCT `BYTE`/`WORD`/`LONG` members, e.g. `STRUCT s(LONG flags.ready[0].count[15..8])` with use-site syntax `v.flags.ready := 1` (PNut v54 parity)
- **Language**: Nameless single `BYTE`/`WORD`/`LONG` STRUCT member, e.g. `STRUCT t(LONG.ready[0])` allowing direct bitfield access as `v.ready := 1`

## [1.53.4] 2026-04-03

### Added

- **CLI**: New `--cache-dir <dir>` option to specify a custom object cache directory. By default the cache is placed in `.pnut-cache` relative to the current working directory; `--cache-dir` allows all compilations across different source directories to share a single cache folder, maximizing cache hits in multi-suite test environments

## [1.53.3] 2026-04-03

### Added

- **New Feature**: Persistent object cache (`--cache`, `--cache-clear`) avoids recompiling identical child objects across runs. Uses content-addressed SHA-256 keys covering preprocessed source, parameter overrides, and compiler version. Especially useful for large projects and test suites with shared child objects
- **Diagnostics**: Listing files now show DEBUG capacity usage when compiling with `-d`: record count (of 255 max) and data bytes (of 15872 max) with usage percentages, giving visibility into proximity to debug statement limits

## [1.53.2] 2026-03-20

### Fixed

- **BUGFIX**: Removed spurious .obj file (53 bytes) generated on compilation errors even without `-O` flag
- **BUGFIX**: Compiler now exits with non-zero return code on all error paths. Previously, compilation errors, missing files, and bad options could exit with code 0, misleading CI/CD pipelines and scripts

## [1.53.1] 2026-03-19

### Fixed

- **BUGFIX**: Fixed `-I` with absolute paths (e.g., `-I /home/user/projects/library`) failed to locate .spin2 files. Was internally constructing a bad path.

## [1.53.0] 2026-03-11

### Added

- **Language**: `OFFSETOF(struct.member)` compile-time function — returns byte offset of a member within a structure definition (PNut v53 parity)
- **Language**: Support for `{Spin2_v53}` language version directive
- **CLI**: Allow filename without `.spin2` extension — resolves to `.spin2` if file exists in current directory

### Fixed

- **Language**: CASE block colon parsing now validates colon token (3 locations changed from get_element to get_colon)
- **BUGFIX**: Fixed `{Spin2_v##}` version tag not being detected when preceded by blank lines after header comments. Files with comment blocks followed by a blank line before the version tag would silently default to v41, causing keywords like `STRUCT` and `SIZEOF` to go unrecognized
- **BUGFIX**: Fixed off-by-one error in inline `{...}` comment handling within the elementizer. Non-doc comments embedded mid-line (e.g., `long {old_value}$FF0000`) would eat the first character after the closing `}`, producing cryptic "Undefined symbol" errors
- **Diagnostics**: When a version-gated keyword is used without the required language version, the compiler now reports `"STRUCT" requires {Spin2_v45} or later` instead of the misleading `Expected "=" "[" "," or end of line`
- Compatible with PNut_v53.exe

## [1.52.2] 2026-02-26

### Performance

- Compilation is 62.7% faster vs v1.52.1 baseline (639s -> 239s on full benchmark suite)
- Add inline logging guards to eliminate template literal evaluation in disabled log paths (-56.5%)
- Move regex patterns to static readonly class fields (-0.8%)
- Replace O(NxM) preprocessor symbol replacement with single-pass cached regex (-0.7%)
- Skip redundant CON block passes when all symbols resolve on first pass (-4.0%)

## [1.52.1] 2026-02-14

- Add language version support through `{Spin2_v52}`
- Compatible with PNut versions through PNut_v52a.exe (PNut_v44.exe is not supported)

**Version Numbering**: The 1.52.x series aligns with PNut v52:
- 1.52.0 represents the base v52 language specification
- 1.52.1 corresponds to PNut_v52a.exe compatibility

## [1.51.7] 2025-12-26

### Added

- **New Feature**: Added `-m` / `--map` command-line option to generate memory map files (`.map`). The map file provides a detailed narrative of the compiled object structure, memory allocation, and multi-object relationships.

### Fixed

- **Error Codes**: All duplicate compiler error messages now have unique error codes for easier troubleshooting and support
- **Compatibility**: Symbol names exceeding 30 characters now generate an error, matching the original PNut compiler behavior
- **BUGFIX**: Fixed `-I` include path handling - paths relative to current working directory now work correctly (previously only paths relative to source file worked)
- **BUGFIX**: Missing `#include` files now properly stop compilation with a standard-format error message instead of silently continuing
- **BUGFIX**: Fixed `$` (DAT origin) operator not working in DAT data declarations like `long value[$1F0 - $]`. The operator now works anywhere in DAT blocks, not just in PASM instruction operands. _(Thank you @kaio for reporting this!)_

## [1.51.6] 2025-09-30

### Fixed

- **BUGFIX**: Fixed incorrect line number reporting for syntax errors detected during initial parsing phase (elementizer). Errors such as empty debug strings, unterminated strings, and malformed tokens were incorrectly reported as occurring on line 1 instead of their actual line number.
- **FEATURE/BUGFIX**: Re-enabled and fixed early object deduplication optimization that was previously disabled due to crashes. The compiler now correctly detects and reuses duplicate child objects during compilation, providing 20-50% memory savings for projects with repeated objects. Includes proper logical-to-physical index mapping to maintain object references, enhanced memory statistics tracking, and separate reporting of early deduplication vs distiller optimization savings.

### Internal

- **REFACTOR**: Extracted Object Distiller from SpinResolver into standalone ObjectDistiller class (`src/classes/objectDistiller.ts`). The five-phase deduplication algorithm (build, scrub, eliminate, rebuild, reconnect) is now encapsulated in a dedicated class with improved code organization and maintainability. No functional changes - binary output remains identical.

## [1.51.5] 2025-07-11

- **BUGFIX**: Repair code generation for send(...) statements
- **BUGFIX**: Object instance numbers in listing file are now shown in hex vs. decimal - PNut v51a compat.
- **BUGFIX**: Fixed character encoding within strings (was generating bad values)
- **BUGFIX**: Repair Empty VAR handling
- **BUGFIX**: Increased object size limitations (smaller size not needed for this compiler)

## [1.51.4] 2025-05-30

- **BUGFIX**: Issue ([#10](https://github.com/ironsheep/PNut-TS/issues/10)) Old OBJ limit still in place, one more time! _(First attempt was incomplete fix.)_

## [1.51.3] 2025-05-27

- **New Feature**: Allow OBJ and DAT files to be found via -I {include} directories ([#9](https://github.com/ironsheep/PNut-TS/issues/9)) _Requested by github user @AustinMathuw_
- **BUGFIX**: Issue ([#10](https://github.com/ironsheep/PNut-TS/issues/10)) Old OBJ limit still in place, please update

_(Thank you @wummi for reporting the old limit issue!)_

## [1.51.2] 2025-05-19

- **BUGFIX**: Issue ([#8](https://github.com/ironsheep/PNut-TS/issues/8)) Repaired preprocessor to allow whitespace preceding preprocesor '#' directives
- **BUGFIX**: Issue ([#8](https://github.com/ironsheep/PNut-TS/issues/8)) Repaired compilation of negated variable expression

_(Thank you @wummi for reporting these!)_

## [1.51.1] 2025-05-05

- BUGFIX: Issue ([#7](https://github.com/ironsheep/PNut-TS/issues/7)) compile failure for post increment/decrement (Thank you Macca for reporting this!)

## [1.51.0] 2025-05-01

- Add language version support through `{Spin2_v51}`.
- Add command-line `-F` option which, when specified, causes the .flash file to be written (PNut -ci equiv.)
- Preprocessor intermediate files now end with `__pre.spin2` (vs. '-pre.spin2')
- Preprocessor: #define is no longer affected by command-line -U options
- Added `#pragma exportdef SYMBOL` which makes SYMBOL present as if added with `-DSYMBOL` on the command line but affects all files compiled after the file containing the #pragma (_place in top-most file for best results_)
- {Spin2_v44} is no longer supported due to changes in data structures beginning in v45
- Compatible with PNut versions through PNut_v51a.exe (except for PNut_v44.exe, which is no longer supported)
- **Performance fix**: [Issue #2](https://github.com/ironsheep/PNut-TS/issues/2) Compiling FILEs in DAT section needs attention - is slow

## [1.43.3] 2024-12-14

- Allow empty VAR ([#6](https://github.com/ironsheep/PNut-TS/issues/6))
- Repair command-line -0 option parsing ([#4](https://github.com/ironsheep/PNut-TS/issues/4))
- Adds new --altbin (-a) option to force output binary to have .binary suffix
- Compatible with PNut_v43.exe

## [1.43.2] 2024-09-22

- Repair command-line option parsing (on Windows/Linux)
- BUGFIX fixed elementizer issues caused by preprocessor changes
- Compatible with PNut_v43.exe

### known issues v1.43.2

- Compiler occasionally produces duplicate error messages

## [1.43.1] 2024-09-17

- Finish implementation of PreProcessor (Oops!)
- Clean up output under error conditions
- Compatible with PNut_v43.exe

### known issues v1.43.1

- Compiler occasionally produces duplicate error messages

## [1.43.0] 2024-09-11

- Initial Release for Testing
- Compatible with PNut_v43.exe

## [0.43.1] 2024-08-30

- Fix linux x86 packaging along with install docs

## [0.43.0] 2024-08-29

- Preparation of initial release for testing

## [0.0.0] 2024-01-02

- Initial repo created
