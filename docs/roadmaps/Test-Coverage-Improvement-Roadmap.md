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
- **Status:** ✅ **COMPLETED in v1.51.7**
- **Risk:** Code compiles in PNut-TS but fails in original PNut
- **Fix:** Added 30-char limit validation with exception reporting
- **Test file:** `TEST/CON-tests/symbol_length_test.spin2`
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
- **Status:** ✅ **COMPLETED in v1.51.7**
- **Previous:** 56.14% statements, 13.33% functions
- **Fix:** Added distiller-focused tests to improve coverage
- **Effort:** 4-6 hours
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

#### 6. PASM2 Instruction Encoding Coverage (NEW)

**Key Insight:** Instruction mnemonic coverage ≠ encoding coverage. Each PASM instruction can have multiple operand forms, and each form produces a different binary encoding. Testing one form per instruction leaves other encodings untested.

**Encoding Dimensions:**

| Dimension | Variants | Example |
|-----------|----------|---------|
| Operand Type | Register vs Immediate | `MOV D,S` vs `MOV D,#imm` |
| Flag Effects | None, WC, WZ, WCZ | `ADD D,S` vs `ADD D,S WCZ` |
| Address Mode | Direct, PTRx, ++/-- | `RDLONG D,S` vs `RDLONG D,PTRA++` |
| Operand Count | 0, 1, 2 operands | `NOP` vs `NOT D` vs `ADD D,S` |
| Branch/Call | Relative, Absolute | `JMP #addr` vs `JMP D` |

**Example: MOV Instruction Encodings**

```
MOV D, S        ; Register-to-register (D field, S field, no immediate)
MOV D, #imm     ; Immediate-to-register (I bit set, S field = 9-bit immediate)
MOV D, S WC     ; With carry effect (C bit set)
MOV D, S WZ     ; With zero effect (Z bit set)
MOV D, S WCZ    ; With both effects (C and Z bits set)
```

Each of these is a different encoding even though they're all "MOV". The compiler must correctly:
1. Select the right opcode format
2. Set the I (immediate) bit correctly
3. Encode the S field as register or immediate
4. Set WC/WZ/WCZ effect bits
5. Handle special cases (PTRx addressing, modifiers)

**Coverage Gap Analysis:**

| Encoding Type | Estimated Forms | Likely Tested | Gap |
|---------------|-----------------|---------------|-----|
| Register-Register | ~300 | ~50 | 250 |
| Register-Immediate | ~250 | ~30 | 220 |
| With WC only | ~200 | ~10 | 190 |
| With WZ only | ~200 | ~10 | 190 |
| With WCZ | ~200 | ~5 | 195 |
| PTRx addressing | ~40 | ~5 | 35 |
| Branch variants | ~30 | ~10 | 20 |

**Testing Strategy:**

1. **Systematic Encoding Test Files**: Create test files organized by encoding dimension
   - `pasm_encoding_immediate.spin2` - All #immediate forms
   - `pasm_encoding_wc.spin2` - WC effect variants
   - `pasm_encoding_wz.spin2` - WZ effect variants
   - `pasm_encoding_wcz.spin2` - WCZ effect variants
   - `pasm_encoding_ptr.spin2` - PTRx addressing modes
   - `pasm_encoding_branch.spin2` - Jump/call variants

2. **Golden File Validation**: Each test generates `.lst.GOLD` with expected encodings

3. **Binary Comparison**: Compare `.obj.GOLD` to verify actual byte encodings match

**Priority Encodings to Test:**

| Priority | Encoding Type | Reason |
|----------|---------------|--------|
| CRITICAL | Immediate forms (#) | Different bit layout than register forms |
| CRITICAL | WC/WZ/WCZ combinations | Flag bits affect execution |
| HIGH | PTRx with ++/-- | Complex address calculation |
| HIGH | Conditional execution (IF_*) | Condition encoding in instruction |
| MEDIUM | AUGS/AUGD prefixes | 32-bit immediate handling |
| MEDIUM | REP/REPS loops | Special encoding requirements |

**Effort Estimate:** 30-40 hours for systematic encoding coverage
**Impact:** Would catch encoding bugs that mnemonic-only testing misses

---

#### 7. Spin2 Structure & Pointer Feature Coverage (NEW)

**Key Insight:** Structures in Spin2 have multiple usage contexts and variant forms. Each context may exercise different code paths in the compiler.

**Structure Usage Contexts:**

| Context | Description | Example |
|---------|-------------|---------|
| CON declaration | Define structure type | `MYSTRUCT: LONG x, WORD y, BYTE z` |
| DAT initialization | Initialize structure data | `mydata MYSTRUCT (1, 2, 3)` |
| VAR usage | Variable of structure type | `MYSTRUCT instance` |
| Parameter passing | Structures as parameters | `PUB foo(s MYSTRUCT)` |
| Return values | Structures as return type | Complex scenarios |

**Variant Forms to Test:**

| Feature | Variants | Risk if Untested |
|---------|----------|------------------|
| **Basic structures** | Simple, nested, with padding | Layout/alignment bugs |
| **Arrays in structures** | BYTE[], WORD[], LONG[] members | Offset calculation errors |
| **Arrays of structures** | `MYSTRUCT[10]` | Stride calculation bugs |
| **Pointer types** | `@structure`, `^LONG`, pointer arithmetic | Address computation errors |
| **SIZEOF operator** | `SIZEOF(MYSTRUCT)`, `SIZEOF(array)` | Size calculation bugs |
| **FIELD operation** | Field access, nested fields | Offset/mask errors |
| **Structure alignment** | ALIGNW, ALIGNL within structures | Padding bugs |

**Testing Strategy:**

1. **Context-based test files:**
   - `struct_con_declaration.spin2` - All declaration variants
   - `struct_dat_init.spin2` - Initialization forms
   - `struct_var_usage.spin2` - Variable declarations
   - `struct_arrays.spin2` - Arrays within and of structures
   - `struct_pointers.spin2` - Pointer operations on structures
   - `struct_sizeof.spin2` - Size calculations
   - `struct_field.spin2` - FIELD operator usage

2. **Validation approach:**
   - Compare `.obj.GOLD` for byte-accurate layout
   - Compare `.lst.GOLD` for correct offsets in listings
   - Runtime tests where practical

**Priority:**

| Priority | Feature | Reason |
|----------|---------|--------|
| CRITICAL | Basic structure layout | Foundation for all struct usage |
| CRITICAL | SIZEOF operator | Used in memory allocation |
| HIGH | Arrays of structures | Complex stride calculations |
| HIGH | Pointer operations | Address arithmetic correctness |
| MEDIUM | Nested structures | Layout complexity |
| MEDIUM | FIELD operator | Bit-field operations |

**Effort Estimate:** 25-35 hours for comprehensive structure coverage
**Impact:** Ensures complex data structures compile correctly

---

#### 8. Compiler Built-in Constants Coverage (NEW)

**Key Insight:** PNut-TS defines many built-in constants (Streamer, SmartPin, execution modes, etc.). Each constant's value must exactly match the original PNut compiler.

**Constant Categories:**

| Category | Examples | Count (est.) |
|----------|----------|--------------|
| **Streamer constants** | X_PINS, X_WRITE, X_RFBYTE, etc. | ~50+ |
| **SmartPin constants** | P_HIGH_1K, P_DAC_990R_3V, etc. | ~100+ |
| **Execution modes** | COGEXEC, HUBEXEC, COGEXEC_NEW, etc. | ~10 |
| **Clock modes** | CLK_*, RCFAST, RCSLOW, etc. | ~20+ |
| **Event constants** | EVENT_*, WAIT_*, etc. | ~15 |
| **Register constants** | PR0-PR7, DIRA, DIRB, etc. | ~30+ |
| **Debug constants** | DEBUG_*, DISPLAY_* | ~20+ |
| **MODCZ operators** | _CLR, _NC_AND_NZ, _SET, _Z, _C, etc. | ~16 |

**Testing Strategy:**

1. **Constant validation test files:**
   - `const_streamer.spin2` - All streamer constants
   - `const_smartpin.spin2` - All SmartPin mode constants
   - `const_clock.spin2` - Clock configuration constants
   - `const_events.spin2` - Event/wait constants
   - `const_registers.spin2` - Special register constants
   - `const_debug.spin2` - Debug display constants
   - `const_exec.spin2` - Execution mode constants
   - `const_modcz.spin2` - MODCZ operator constants (_CLR, _SET, _Z, _C, etc.)

2. **Validation approach:**
   - Test file assigns each constant to a DAT location
   - `.obj.GOLD` contains expected byte values
   - Binary comparison catches any value mismatches

3. **Example test pattern:**
   ```spin2
   DAT
   ' Streamer constants validation
   x_pins_val      LONG    X_PINS
   x_write_val     LONG    X_WRITE
   x_rfbyte_val    LONG    X_RFBYTE
   ' ... etc
   ```

**Priority:**

| Priority | Constant Category | Reason |
|----------|-------------------|--------|
| CRITICAL | SmartPin modes | Hardware configuration |
| CRITICAL | Streamer constants | DMA/video operations |
| HIGH | Clock modes | System timing |
| HIGH | Execution modes | COG launch behavior |
| MEDIUM | Event constants | Interrupt handling |
| MEDIUM | Debug constants | Debug display |

**Effort Estimate:** 15-20 hours for systematic constant coverage
**Impact:** Guarantees constant values match reference implementation

---

#### 9. Language Feature Release Audit (NEW)

**Key Insight:** The Spin2 language has evolved through multiple compiler releases. Each release adds new features that should have comprehensive test coverage. Auditing the Spin2 language reference (v51a) identifies when features were released and their current test coverage status.

**Purpose:**
- Establish feature-to-release mapping for documentation
- Identify gaps where features were added but not fully tested
- Create a practice of adding comprehensive tests with each new feature

**Approach:**

1. **Extract feature release history from Spin2_Language_v51a.pdf**
   - Document which version added each feature
   - Note syntax variants and edge cases for each

2. **Map to existing test coverage**
   - Cross-reference features with existing test files
   - Identify coverage gaps per feature

3. **Prioritize by release recency**
   - Newer features are more likely to have gaps
   - Older features have had more time for organic test coverage

**Feature Categories to Audit:**

| Category | Examples | Release Pattern |
|----------|----------|-----------------|
| Operators | REV, ZEROX, SIGNX, ENCOD, DECOD | Various releases |
| Statements | CASE_FAST, DEBUG, SEND | Feature additions |
| Built-ins | GETREGS/SETREGS, POLXY/XYPOL | Math extensions |
| Preprocessor | #include, #define, #ifdef | Preprocessor evolution |
| Object system | OBJ arrays, method pointers | Object enhancements |
| Debug features | DEBUG(), DEBUG_* modes | Debug evolution |

**Deliverables:**

1. **Feature Release Matrix** - Table mapping features to compiler versions
2. **Coverage Gap Report** - Features with incomplete test coverage
3. **Test Backlog** - Prioritized list of tests to add per feature

**Effort Estimate:** 10-15 hours for audit, then ongoing as features are added
**Impact:** Ensures systematic test coverage for language evolution

---

#### 10. compiler.ts Branch Coverage
- **Current:** 60.71% branch coverage (87.2% statements)
- **Risk:** Edge cases in compilation flow untested
- **Specific gaps:** Multi-pass compilation paths, error recovery
- **Effort:** 6-8 hours

#### 11. Memory Alignment Tests (ALIGNW, ALIGNL)
- **Current:** ~3 scattered references in tests
- **Missing:** Dedicated alignment test suite
- **Risk:** Subtle memory layout bugs
- **Effort:** 4-6 hours

#### 12. spin2Parser.ts Branch Coverage
- **Current:** 76.08% branch coverage
- **Risk:** Parser decision points undertested
- **Note:** This is where `P2List()` listing generation lives
- **Effort:** 4-6 hours

---

### MEDIUM Priority (During Normal Development)

#### 13. Pointer Operations
- **Documentation exists:** `Pointer-Usage-Guide.md`
- **Current:** Indirect coverage only
- **Missing:** Dedicated pointer test suite
- **Effort:** 6-10 hours

#### 14. Flash/Loader Integration
- **Current:** 4 loader tests, 0 dedicated flash tests
- **Missing:** Multi-object flash deployment scenarios
- **Effort:** 4-6 hours

#### 15. Advanced Operators (FIELD, BYTEFIT, WORDFIT)
- **Current:** FIELD in coverage_001.spin2 only
- **Documentation exists:** Usage guides present
- **Note:** FIELD also addressed in section 7 (Structure Coverage)
- **Effort:** 4-6 hours

#### 16. Complex Inline PASM
- **Documentation exists:** `Inline-PASM-Usage-Guide.md`
- **Current:** 6 files with inline PASM
- **Missing:** Complex Spin/PASM mixing scenarios
- **Effort:** 6-8 hours

---

### LOW Priority (Nice to Have)

#### 17. DITTO Directive
- **Documentation exists:** `DITTO-Usage-Guide.md`
- **Current:** 0 dedicated tests
- **Effort:** 2-3 hours

#### 18. WC/WZ/WCZ Effect Coverage
- **Note:** Now addressed in section 6 (Encoding Coverage)
- **Status:** Folded into systematic encoding tests
- **See:** Section 6 for WC/WZ/WCZ testing strategy

#### 19. RES/FIT/END Directive Edge Cases
- **Current:** Used throughout but no edge case tests
- **Missing:** Boundary condition tests
- **Effort:** 4-6 hours

---

## Part 4: Quick Wins (High Impact, Low Effort)

| Item | Effort | Impact | Files Affected | Status |
|------|--------|--------|----------------|--------|
| Fix symbol length validation | 2-4 hrs | Compatibility | `spinElementizer.ts` | ✅ Done (v1.51.7) |
| Enable HOLD exception tests | 4-8 hrs | Error handling | Multiple | Pending |
| Add distiller tests | 4-6 hrs | Object dedup | `distillerList.ts` | ✅ Done (v1.51.7) |
| Add compiler branch tests | 6-8 hrs | Edge cases | `compiler.ts` | Pending |

**Total Quick Wins Effort:** 16-26 hours (6-10 hrs remaining)
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

### Phase 2: Instruction & Encoding Coverage (50-70 hours)

| Task | Effort | Coverage Target |
|------|--------|-----------------|
| **Encoding Coverage (NEW)** | | |
| Immediate (#) form tests | 8-10 hrs | All #immediate encodings |
| WC/WZ/WCZ effect tests | 6-8 hrs | Flag effect variants |
| PTRx addressing tests | 4-6 hrs | Pointer mode encodings |
| Conditional (IF_*) tests | 4-6 hrs | Condition field encodings |
| AUGS/AUGD prefix tests | 4-6 hrs | 32-bit immediate handling |
| **Mnemonic Coverage** | | |
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

**Total Strategic Effort:** 85-120 hours
**Expected Final Coverage:** 92-95%
**Note:** Phase 2 expanded to include systematic encoding coverage

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
- [x] Symbol name length validation implemented and tested ✅ (v1.51.7)
- [x] `distillerList.ts` coverage improved ✅ (v1.51.7)
- [ ] `compiler.ts` branch coverage > 75%
- [ ] At least 50% of PASM2 instructions have dedicated tests
- [ ] **NEW:** Immediate (#) encoding forms tested for major instruction families
- [ ] **NEW:** WC/WZ/WCZ effect combinations tested systematically
- [ ] **NEW:** PTRx addressing modes have dedicated test coverage
- [ ] **NEW:** Encoding test files organized by dimension (immediate, effects, addressing)

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
