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

### Fixed

- **BUGFIX**: Fixed `{Spin2_v##}` version tag not being detected when preceded by blank lines after header comments. Files with comment blocks followed by a blank line before the version tag would silently default to v41, causing keywords like `STRUCT` and `SIZEOF` to go unrecognized
- **BUGFIX**: Fixed off-by-one error in inline `{...}` comment handling within the elementizer. Non-doc comments embedded mid-line (e.g., `long {old_value}$FF0000`) would eat the first character after the closing `}`, producing cryptic "Undefined symbol" errors
- **Diagnostics**: When a version-gated keyword is used without the required language version, the compiler now reports `"STRUCT" requires {Spin2_v45} or later` instead of the misleading `Expected "=" "[" "," or end of line`

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
