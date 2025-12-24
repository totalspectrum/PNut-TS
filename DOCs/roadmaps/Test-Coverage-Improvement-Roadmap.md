# Test Coverage Improvement Roadmap

## Executive Summary

This roadmap identifies opportunities to improve PNut-TS compiler test coverage based on analysis of both test file coverage (what language features are tested) and code coverage (what compiler code is executed during tests).

**Current Overall Coverage (v1.51.x):**
- Statements: **88.1%** (22,261/25,267)
- Branches: **84.06%** (3,212/3,821)
- Functions: **86.8%** (750/864)

**Key Finding:** While overall coverage is good, there are specific gaps in both test file coverage and code coverage that represent risk areas.

---

## Part 1: Code Coverage Analysis (from Jest/Istanbul)

### Coverage by Class (Sorted by Risk)

#### Critical Gaps (< 70% coverage)

| File | Statements | Branches | Functions | Risk Assessment |
|------|------------|----------|-----------|-----------------|
| `regression.ts` | 18.38% | 90% | 44.44% | Low risk - test infrastructure only |
| `distillerList.ts` | **56.14%** | 100% | **13.33%** | **HIGH RISK** - object deduplication |

#### Moderate Gaps (70-80% coverage)

| File | Statements | Branches | Functions | Risk Assessment |
|------|------------|----------|-----------|-----------------|
| `debugData.ts` | 76.15% | 88% | 62.5% | Medium - debug output generation |

#### Branch Coverage Concerns (statements ok, branches low)

| File | Statements | Branches | Functions | Concern |
|------|------------|----------|-----------|---------|
| `compiler.ts` | 87.2% | **60.71%** | 83.33% | Edge cases in compilation flow |
| `blockStack.ts` | 88.23% | **70.37%** | 90.47% | Stack edge cases |
| `spin2Parser.ts` | 83.85% | **76.08%** | 88.46% | Parser branch conditions |
| `objectStructures.ts` | 82.87% | **77.5%** | 78.12% | Structure handling paths |
| `spinFiles.ts` | 86.51% | **78.84%** | 78.94% | File handling edge cases |

#### Well-Covered Classes (> 85%)

| File | Statements | Notes |
|------|------------|-------|
| `types.ts` | **100%** | Perfect coverage |
| `parseUtils.ts` | 95.57% | Core parsing utilities |
| `objectSymbols.ts` | 95.38% | Symbol management |
| `symbolTable.ts` | 95.12% | Symbol table |
| `externalFiles.ts` | 94.61% | External file handling |
| `numberStack.ts` | 94.44% | Numeric operations |
| `spinResolver.ts` | **90.59%** | **Core compiler - well tested!** |
| `spinElement.ts` | 90.72% | Element handling |
| `spinElementizer.ts` | 89.29% | Tokenization |

---

## Part 2: Test File Coverage Analysis

### Test Infrastructure Summary

| Metric | Value |
|--------|-------|
| Total .spin2 test files | 307 |
| Total .GOLD reference files | 827 |
| Test categories | 18 |
| PASM2 instructions in database | 359 |

### Test Category Status

| Category | Files | Status | Notes |
|----------|-------|--------|-------|
| DBG-tests | 27 | Comprehensive | Debug features well tested |
| OBJ-tests | 27 | Comprehensive | Object hierarchy well tested |
| COV-tests | 24 | Good | Coverage-specific tests |
| LANG-VER-tests | 13 | Partial | Language version features |
| PREPROC-tests | 10 | Good | Preprocessor directives |
| DAT-PASM-tests | 9 | Basic only | ~17% instruction coverage |
| CON-tests | 9 | Good | Constants and expressions |
| SPIN-tests | 6 | Basic | Core Spin features |
| EXCEPT-tests | 6 active | **11 on HOLD** | Error handling gaps |
| EXT-tests | 5 | Limited | External file tests |
| LOADER-tests | 4 | Minimal | Loader integration |
| **VAR-tests** | **2** | **CRITICAL GAP** | Variable declarations |
| LARGE-tests | exists | Not systematically run | Timeout issues |
| ALLCODE-tests | 0 | Empty | Infrastructure only |

---

## Part 3: Prioritized Improvement Opportunities

### CRITICAL Priority (Immediate Action)

#### 1. Symbol Name Length Validation
- **Status:** Documented in TECHNICAL-DEBT.md
- **Risk:** Code compiles in PNut-TS but fails in original PNut
- **Fix:** Add 30-char limit in `spinElementizer.ts`
- **Test file exists:** `TEST/CON-tests/symbol_length_test.spin2`
- **Effort:** 2-4 hours
- **Code impact:** `spinElementizer.ts` (currently 89.29% coverage)

#### 2. VAR Section Tests
- **Current:** Only 2 test files
- **Risk:** Variable declarations used in EVERY Spin2 program
- **Missing coverage:**
  - BYTE/WORD/LONG arrays
  - Multi-dimensional arrays
  - Structures in VAR section
  - Variable memory alignment
- **Effort:** 8-12 hours to add 15-20 test files
- **Code impact:** Would improve `spinResolver.ts` branch coverage

#### 3. Exception Tests on HOLD
- **Status:** 11 tests disabled in `EXCEPT-tests/HOLD/`
  - `exception_test_001` through `007`
  - `debug_exception_test_004`, `005`
  - Tests with child objects (`002`, `003`)
- **Risk:** Error handling paths untested
- **Effort:** 4-8 hours to review and enable
- **Code impact:** Would improve branch coverage in multiple files

#### 4. distillerList.ts Coverage
- **Current:** 56.14% statements, **13.33% functions**
- **Risk:** Object deduplication logic undertested
- **Root cause:** Only 2/15 functions called during tests
- **Effort:** 4-6 hours to add distiller-focused tests
- **Impact:** Critical for multi-object compilation correctness

---

### HIGH Priority (Before Major Changes)

#### 5. PASM2 Instruction Coverage
- **Current:** ~60 instructions tested (~17% of 359)
- **Untested instruction families:**
  - ALT* family (12 variants): ALTI, ALTD, ALTR, ALTS, ALTB, ALTGN, ALTGB, ALTGW, ALTSN, ALTSB, ALTSW
  - Counter operations: ADDCT1, ADDCT2, ADDCT3
  - Pattern operations: BMASK, BLNPIX, ADDPIX
  - Specialized: AKPIN, ALLOWI, BRK, POLLWAIT variants
- **Effort:** 20-30 hours for systematic coverage
- **Approach:** Create test files organized by instruction category

#### 6. compiler.ts Branch Coverage
- **Current:** 60.71% branch coverage (87.2% statements)
- **Risk:** Edge cases in compilation flow untested
- **Specific gaps:** Multi-pass compilation paths, error recovery
- **Effort:** 6-8 hours

#### 7. Memory Alignment Tests (ALIGNW, ALIGNL)
- **Current:** ~3 scattered references in tests
- **Missing:** Dedicated alignment test suite
- **Risk:** Subtle memory layout bugs
- **Effort:** 4-6 hours

#### 8. spin2Parser.ts Branch Coverage
- **Current:** 76.08% branch coverage
- **Risk:** Parser decision points undertested
- **Note:** This is where `P2List()` listing generation lives
- **Effort:** 4-6 hours

---

### MEDIUM Priority (During Normal Development)

#### 9. Pointer Operations
- **Documentation exists:** `Pointer-Usage-Guide.md`
- **Current:** Indirect coverage only
- **Missing:** Dedicated pointer test suite
- **Effort:** 6-10 hours

#### 10. Flash/Loader Integration
- **Current:** 4 loader tests, 0 dedicated flash tests
- **Missing:** Multi-object flash deployment scenarios
- **Effort:** 4-6 hours

#### 11. Advanced Operators (FIELD, BYTEFIT, WORDFIT)
- **Current:** FIELD in coverage_001.spin2 only
- **Documentation exists:** Usage guides present
- **Effort:** 4-6 hours

#### 12. Complex Inline PASM
- **Documentation exists:** `Inline-PASM-Usage-Guide.md`
- **Current:** 6 files with inline PASM
- **Missing:** Complex Spin/PASM mixing scenarios
- **Effort:** 6-8 hours

---

### LOW Priority (Nice to Have)

#### 13. DITTO Directive
- **Documentation exists:** `DITTO-Usage-Guide.md`
- **Current:** 0 dedicated tests
- **Effort:** 2-3 hours

#### 14. WC/WZ/WCZ Effect Coverage
- **Likely covered:** In instruction tests (not verified)
- **Missing:** Systematic per-instruction validation
- **Effort:** 8-12 hours

#### 15. RES/FIT/END Directive Edge Cases
- **Current:** Used throughout but no edge case tests
- **Missing:** Boundary condition tests
- **Effort:** 4-6 hours

---

## Part 4: Quick Wins (High Impact, Low Effort)

| Item | Effort | Impact | Files Affected |
|------|--------|--------|----------------|
| Fix symbol length validation | 2-4 hrs | Compatibility | `spinElementizer.ts` |
| Enable HOLD exception tests | 4-8 hrs | Error handling | Multiple |
| Add distiller tests | 4-6 hrs | Object dedup | `distillerList.ts` |
| Add compiler branch tests | 6-8 hrs | Edge cases | `compiler.ts` |

**Total Quick Wins Effort:** 16-26 hours
**Expected Coverage Improvement:** +3-5% overall

---

## Part 5: Strategic Test Expansion

### Phase 1: Foundation (20-30 hours)

| Task | Effort | Coverage Target |
|------|--------|-----------------|
| Symbol length validation | 2-4 hrs | Compatibility |
| VAR-tests expansion | 8-12 hrs | Variable handling |
| Enable exception tests | 4-8 hrs | Error paths |
| Distiller tests | 4-6 hrs | Object dedup |

### Phase 2: Instruction Coverage (20-30 hours)

| Task | Effort | Coverage Target |
|------|--------|-----------------|
| ALT* family tests | 6-8 hrs | 12 instructions |
| Counter operation tests | 4-6 hrs | ADDCT1-3 |
| Pattern operation tests | 4-6 hrs | BMASK, BLNPIX, etc. |
| Specialized instruction tests | 6-10 hrs | Remaining gaps |

### Phase 3: Edge Cases (15-20 hours)

| Task | Effort | Coverage Target |
|------|--------|-----------------|
| Compiler branch coverage | 6-8 hrs | `compiler.ts` → 80%+ |
| Parser branch coverage | 4-6 hrs | `spin2Parser.ts` → 85%+ |
| Memory alignment tests | 4-6 hrs | ALIGNW/ALIGNL |

**Total Strategic Effort:** 55-80 hours
**Expected Final Coverage:** 92-95%

---

## Part 6: Coverage Metrics Goals

### Current State

| Metric | Current | Goal |
|--------|---------|------|
| Overall Statements | 88.1% | 92%+ |
| Overall Branches | 84.06% | 88%+ |
| Overall Functions | 86.8% | 90%+ |
| `spinResolver.ts` | 90.59% | Maintain |
| `distillerList.ts` | 56.14% | 80%+ |
| `compiler.ts` branches | 60.71% | 80%+ |
| Test files | 307 | 380+ |

### Success Criteria

- [ ] All HOLD exception tests reviewed and either enabled or documented as intentional
- [ ] VAR-tests expanded to 15+ files
- [ ] Symbol name length validation implemented and tested
- [ ] `distillerList.ts` coverage > 75%
- [ ] `compiler.ts` branch coverage > 75%
- [ ] At least 50% of PASM2 instructions have dedicated tests

---

## Appendix: Test File Inventory

### Files in EXCEPT-tests/HOLD/ (Disabled)

```
debug_exception_test_004.spin2
debug_exception_test_005.spin2
exception_test_001.spin2
exception_test_002.spin2 (with child)
exception_test_003.spin2 (with child)
exception_test_007.spin2
```

### VAR-tests (Current - Only 2 Files)

```
var_test.spin2
var_empty_test.spin2
```

### Coverage Test Files (COV-tests - 24 files)

```
coverage_001.spin2 - coverage_004.spin2
coverage_clock_001.spin2 - coverage_clock_014.spin2
coverage_pasmonly_001.spin2
debug_test_002_c1.spin2
... (and more)
```

---

## References

- Coverage reports: `jest-coverage/lcov-report/index.html`
- Coverage methodology: `Coverage.md`
- Test runner: `npm run coverage` (after `npm run cov-setup`)
- PASM2 instruction database: `DOCs/language-specification/databases/PASM2-Instruction-Database.json`
- Technical debt: `TECHNICAL-DEBT.md`
