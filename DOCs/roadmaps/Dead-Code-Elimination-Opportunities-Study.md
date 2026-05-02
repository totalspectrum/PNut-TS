# Dead Code Elimination: Opportunities Study

> **Note on bytecode references:** `bc_*` identifier **names** are stable across compiler releases (they're identifiers in source code, kept consistent for human readability and debugger UX) and are cited freely throughout this document. Numeric **opcode values** (e.g., `$0A`, `$08`) are NOT stable — the interpreter re-sorts and optimizes the value-to-name mapping release to release — so this document does not cite specific numeric values. To find the current numeric value for any named bytecode, consult the shipped interpreter source (`src/ext/Spin2_interpreter.spin2`).

## Guiding Premises

This study exists to serve two foundational goals:

1. **Hub RAM is the binding constraint.** The P2 has 512 KB of hub RAM and that is all the program memory there is. Every byte saved in the compiled binary is a byte available for application logic, data, or features. DCE is not a polish — it is a primary lever for fitting larger or more capable applications onto the chip.

2. **"Pay only for what you use" enables rich library objects.** A library author should be free to write a comprehensive, well-factored object — 30 PUBs, generous helper PRIs, optional debug paths, large lookup tables — without imposing the full cost on every consumer. If a consumer calls only 3 of the 30 PUBs, the binary should reflect that. Without DCE, library authors face a perverse incentive to keep libraries small and feature-poor; with DCE, they are free to ship a single rich object that downstream code subsets naturally.

These two premises together set the prioritization throughout this study: **opportunities are ranked first by hub-RAM impact on real applications using shared library objects, second by everything else.** OPP-3 / OPP-1 / OPP-2 are the high-priority tier specifically because they directly serve premise (2) — they are what makes "rich libraries with no usage penalty" actually true.

OPP-4 (partial child object inclusion) is the ultimate expression of premise (2): it gives consumers per-method selection within a shared object, completing the "subset what you use" model. It is deferred only because of complexity, not because the value is in doubt.

Premise (1) also informs the strategic choice between full removal and the stub fallback (Appendix C): stub-mode captures ~97% of the bytes for ~55% of the effort, which is the right MVP shape when every byte saved buys runway for the application.

---

## Executive Summary

The PNut/PNut-TS compiler currently performs **no dead code elimination (DCE)** at any level. The only optimization that exists is **duplicate child object deduplication** via the Object Distiller, which finds byte-identical compiled child objects and keeps a single copy.

Every PUB method, every PRI method, every DAT byte, every VAR declaration, and every CON symbol is compiled and included in the output binary regardless of whether it is actually used. For projects that use library objects (where only a fraction of methods are called), this represents a significant opportunity for binary size reduction.

This study identifies **10 distinct DCE opportunities** across 4 categories, analyzes their feasibility against P2 interpreter constraints, estimates their impact, and discusses applicability to both PNut-TS and the original PNut compiler.

**Key Constraint**: The P2 Spin2 interpreter uses **direct indexed method dispatch** — `pbase + (methodIndex × 4)` — which means methods cannot simply be removed from the method table without rewriting all bytecode references. Any method-level DCE requires a coordinated index renumbering pass.

---

## Table of Contents

1. [Current State: What the Compiler Includes](#1-current-state)
2. [P2 Interpreter Constraints](#2-interpreter-constraints)
3. [Opportunity Catalog](#3-opportunity-catalog)
   - [OPP-1: Unused PRI Method Elimination (Intra-Object)](#opp-1)
   - [OPP-2: Unused PUB Method Elimination (Cross-Object)](#opp-2)
   - [OPP-3: Unused Child Object Elimination](#opp-3)
   - [OPP-4: Partial Child Object Inclusion](#opp-4)
   - [OPP-5: Unused CON Symbol Removal from Object Files](#opp-5)
   - [OPP-6: Unused VAR Space Reclamation](#opp-6)
   - [OPP-7: Unused DAT Label/Data Elimination](#opp-7)
   - [OPP-8: Intra-Method Dead Code Elimination](#opp-8)
   - [OPP-9: String Literal Deduplication](#opp-9)
   - [OPP-10: Constant Folding & Expression Optimization](#opp-10)
4. [Impact Assessment Matrix](#4-impact-assessment)
5. [Feasibility for Original PNut vs PNut-TS](#5-pnut-vs-pnut-ts)
6. [Recommended Approach](#6-recommended-approach)
7. [Risk Analysis](#7-risk-analysis)

---

## 1. Current State: What the Compiler Includes {#1-current-state}

### Object Binary Layout

Each compiled Spin2 object has this structure in the binary:

```
Offset 0x00:  LONG  varsize           (total VAR memory needed at runtime)
Offset 0x04:  LONG  pgmsize           (program section size)
Offset 0x08:  [Sub-Object Table]      LONG pairs: (obj_offset, var_offset) — bit 31 = 0
              [Method Table]          LONGs: (params<<24 | results<<20 | offset) — bit 31 = 1
              LONG  objsize           (end marker, bit 31 = 0)
              [DAT data]              Raw bytes
              [PUB bytecode]          Compiled method bodies
              [PRI bytecode]          Compiled method bodies
              [Child object binaries] LONG-aligned, recursive
pgmsize:      BYTE  checksum
              [PUB symbol entries]    Name + param/result counts
              [CON symbol entries]    Name + type + value
```

### What Is Always Included (Regardless of Usage)

| Section | What's Included | Where It Lives |
|---------|----------------|----------------|
| **PUB methods** | ALL declared PUBs — bytecode + method table entry | Code section |
| **PRI methods** | ALL declared PRIs — bytecode + method table entry | Code section |
| **DAT data** | ALL declared DAT bytes, words, longs, and PASM | Code section |
| **VAR space** | Size for ALL declared variables | Header (varsize) + runtime RAM |
| **CON symbols** | ALL PUB + CON symbols from child objects | Symbol table (after pgmsize) |
| **Child objects** | ENTIRE compiled child — all its methods, DAT, etc. | Embedded after parent code |

### What IS Currently Optimized

Only one optimization exists: **Object Distiller** (duplicate child object deduplication).

- When two child objects compile to byte-identical binaries, one copy is kept
- Both parents' sub-object table entries point to the single copy
- Achieves 10-40% size reduction on projects with many instances of the same object
- Implemented in `src/classes/objectDistiller.ts` (5-phase algorithm)

---

## 2. P2 Interpreter Constraints {#2-interpreter-constraints}

Understanding interpreter constraints is critical because they define what DCE is structurally possible.

### Method Dispatch Is Index-Based

From `Spin2_interpreter.spin2` (lines 1557-1559):
```asm
calloffh    shl   v,#2          ' get sub offset (index × 4)
            add   v,pbase       ' add to program base
            rdlong v,v          ' read method entry from table
```

The interpreter multiplies the method index by 4 and reads directly from the method table. **There is no indirection layer, no hash table, no name lookup.** Method indices are baked into compiled bytecode as immediate values.

### Bytecode Call Instructions

(Names are stable across releases; numeric opcode values are not cited — see top-of-document note.)

| Bytecode | Encoding | What It References |
|----------|----------|-------------------|
| `bc_call_sub` | method_index as rfvar | Direct index into current object's method table |
| `bc_call_obj_sub` | obj_index + method_index | Index into child object's method table |
| `bc_call_obji_sub` | obj_index + method_index | Same, for indexed object arrays |
| `bc_call_ptr` | runtime value | Indirect — method pointer stored in variable |
| `bc_mptr_sub` | method_index | Creates method pointer (`@@method` syntax) |
| `bc_mptr_obj_sub` | obj + method_index | Creates pointer to child method |

### Hard Constraints for DCE

1. **Method indices must be contiguous** — the interpreter does simple arithmetic, no gap handling
2. **PUB methods must precede PRI methods** — `vbase_init[31:20]` encodes the first PUB index; the interpreter uses this to enforce public/private visibility
3. **`bc_call_ptr` creates dynamic dispatch** — method pointers stored in variables (`@@method` syntax) cannot be statically resolved in all cases
4. **Sub-object indices are also positional** — child objects are referenced by their position in the sub-object table
5. **All references must be rewritten** if any method or object is renumbered

### What This Means for DCE

**Method removal IS possible** but requires:
- Building a complete call graph (including method pointers)
- Renumbering all remaining methods
- Rewriting all `bc_call_sub`, `bc_mptr_sub`, etc. instructions with new indices
- Recalculating the PUB/PRI boundary index
- This is effectively a **link-time optimization pass** after initial compilation

---

## 3. Opportunity Catalog {#3-opportunity-catalog}

### OPP-1: Unused PRI Method Elimination (Intra-Object) {#opp-1}

**Category**: Method-level DCE
**Impact**: Medium-High
**Complexity**: Medium
**Applies to**: PNut-TS ✅ | Original PNut ✅ (harder)

#### Description

PRI (private) methods are only callable from within the same object. If a PRI method is never referenced by any PUB or other PRI method in the same object, it is dead code and its bytecode can be eliminated.

#### Current Behavior

In `spinResolver.ts` at `compilePubPriBlocks()` (line 3499+), ALL PRI methods are compiled unconditionally:
```
For each PRI block found:
  → Emit method table entry (4 bytes)
  → Compile full method body (variable bytes)
  → No usage check performed
```

#### How to Implement

1. **Pass 1** (existing): Collect all PRI method symbols with their indices
2. **New Analysis Pass**: Walk all PUB and PRI method bytecodes looking for `bc_call_sub` instructions. Build a call graph. Mark each PRI method as "referenced" or "unreferenced"
3. **Optimization**: Skip compilation of unreferenced PRI methods
4. **Index Renumbering**: Rewrite all `bc_call_sub` rfvar operands to use new contiguous indices
5. **Boundary Update**: Recalculate PUB/PRI split index

#### Complication: Method Pointers

If code uses `@@priMethod` (creating a method pointer via `bc_mptr_sub`), the method cannot be eliminated because it may be called dynamically via `bc_call_ptr`. The analysis must conservatively keep any method whose address is taken.

#### Estimated Savings

For a typical library object with 20 PRI methods where the consumer only exercises 60% of the API: **~40% of PRI bytecode could be eliminated** (~hundreds to low thousands of bytes per object).

#### PNut-TS Implementation Path

Add a `referencedMethods: Set<number>` to the compilation context. After Pass 2, scan all emitted bytecodes for call/mptr instructions. Filter the method table before `compile_final()`.

#### Original PNut Implementation Path

Would require adding a post-compilation scan in the x86 assembly code (`p2com.obj`), or a new Pascal unit that walks the compiled bytecode buffer. The packed-record architecture in `GlobalUnit.pas` makes this feasible but laborious.

---

### OPP-2: Unused PUB Method Elimination (Cross-Object) {#opp-2}

**Category**: Method-level DCE (cross-object / whole-program)
**Impact**: High
**Complexity**: High
**Applies to**: PNut-TS ✅ | Original PNut ⚠️ (very difficult)

#### Description

When a parent object declares `OBJ child : "some_library"`, it may only call 3 of the library's 20 PUB methods. The remaining 17 PUB methods (and any PRI methods they exclusively support) are dead code from the perspective of the final binary.

#### Current Behavior

In `compiler.ts` at `compileRecursively()` (line 258+), each child object is compiled independently and completely. The parent has no mechanism to communicate "I only need methods X, Y, Z" to the child's compilation.

In `spinResolver.ts` at `compile_obj_symbols()` (line 4625+), ALL PUB methods from the child's symbol table are imported into the parent's symbol table. No filtering occurs.

#### How to Implement

**Approach A: Whole-Program Call Graph (Recommended)**

1. **Phase 1**: Compile all objects normally (current behavior)
2. **Phase 2**: Build a whole-program call graph starting from the top-level object's PUB methods
3. **Phase 3**: Mark all reachable methods (PUB and PRI) via transitive closure
4. **Phase 4**: Rebuild each object, excluding unreachable methods and renumbering indices
5. **Phase 5**: Re-link the object tree with new indices

**Approach B: Demand-Driven Compilation**

1. Compile the top-level object first
2. Track which child PUB methods are actually called (from `bc_call_obj_sub` instructions)
3. Pass this "needed methods" set to child compilation
4. Child compiles only needed PUBs + their PRI dependencies
5. Recurse for grandchildren

Approach A is more robust (handles circular dependencies, method pointers across objects). Approach B is simpler but fragile.

#### Complication: Method Pointer Escape

If a parent does `ptr := @@child.method`, the method pointer could be passed to any code. Conservative analysis must treat ALL methods of an object as reachable if any method pointer into that object escapes.

#### Estimated Savings

For library-heavy projects (e.g., using `jm_fullduplexserial`, `jm_nstr`, graphics libraries), this is the **highest-impact opportunity**. A library with 30 PUB methods where only 5 are called wastes ~83% of that object's code space. For a project with 10 such libraries, savings could be **tens of kilobytes** — significant on a 512KB hub RAM chip.

#### PNut-TS Implementation Path

Requires a new `CallGraphAnalyzer` class that:
- Walks compiled bytecodes across all objects
- Builds a directed graph of method→method calls
- Computes reachability from the top-level entry point
- Feeds results back to a re-linking pass

This is a post-compilation optimization pass, similar to a linker's `--gc-sections`.

#### Original PNut Implementation Path

Extremely difficult. The original PNut compiles objects independently with no infrastructure for cross-object analysis. Would require significant architectural changes to `p2com.obj` (x86 assembly). More practical as a separate post-processing tool that reads .obj files, analyzes, and rewrites them.

---

### OPP-3: Unused Child Object Elimination {#opp-3}

**Category**: Object-level DCE
**Impact**: Medium
**Complexity**: Low
**Applies to**: PNut-TS ✅ | Original PNut ✅

#### Description

If an OBJ is declared but no method on it is ever called (and no method pointer into it is taken), the entire child object can be excluded from the binary.

#### Current Behavior

All declared OBJ children are compiled and included. Even if the programmer declares `OBJ debug : "debug_util"` and never calls any method on `debug`, the full compiled `debug_util` object is embedded.

#### How to Implement

1. After compilation, check if any `bc_call_obj_sub` or `bc_mptr_obj_sub` instruction references each child object index
2. If a child object index has zero references, exclude it from the binary
3. Renumber remaining child object indices
4. Rewrite all `bc_call_obj_sub`/`bc_mptr_obj_sub` operands

#### Estimated Savings

Low-to-medium. Completely unused OBJ declarations are uncommon in well-maintained code, but they occur during development and in conditionally-used modules.

#### Implementation Path (Both Compilers)

Relatively straightforward scan of emitted bytecodes for object-referencing instructions. Can be done as a post-compilation pass in either compiler.

---

### OPP-4: Partial Child Object Inclusion (Advanced) {#opp-4}

**Category**: Object-level DCE (fine-grained)
**Impact**: Very High
**Complexity**: Very High
**Applies to**: PNut-TS ✅ | Original PNut ❌ (impractical)

#### Description

This is the logical extension of OPP-2: instead of including the full compiled child object, include only the methods (and their DAT/VAR dependencies) that are actually called. This requires restructuring how child objects are embedded.

#### Why This Is Hard

The P2 object format embeds child objects as **complete, self-contained binaries** with their own method table, DAT section, and VAR size header. The interpreter expects this structure. Creating a "partial object" means:

- The child's method table must be rebuilt with only needed entries
- The child's DAT section must be pruned to only data referenced by included methods
- The child's VAR size must be recalculated
- The child's internal `bc_call_sub` references must be renumbered
- The parent's `bc_call_obj_sub` method indices must be remapped

#### Estimated Savings

This is where the **largest savings** would come from. In a typical P2 application:
- Standard I/O library: ~8KB, user needs 2 methods → save ~6KB
- Display driver: ~12KB, user needs 4 methods → save ~8KB
- Sensor library: ~6KB, user needs 1 method → save ~5KB

Across a project with several libraries: **potential 20-40KB savings on a 512KB chip**.

#### Implementation Path

PNut-TS only. Would require:
1. Full call graph analysis (OPP-2)
2. Per-object method dependency analysis (which PRI methods does each PUB need?)
3. DAT reference analysis (which DAT labels does each method reference?)
4. Object reconstruction with only needed components
5. Complete re-linking

This is essentially building a **linker with garbage collection** — similar to `ld --gc-sections` in the GCC toolchain.

---

### OPP-5: Unused CON Symbol Removal from Object Files {#opp-5}

**Category**: Symbol table optimization
**Impact**: Low
**Complexity**: Low
**Applies to**: PNut-TS ✅ | Original PNut ✅

#### Description

The symbol table appended after `pgmsize` in each object file contains entries for every PUB method and every CON constant. Unused CON constants still occupy space in this table.

#### Current Behavior

In `spinResolver.ts` at `compile_final()` (line 5377+), the entire `pubConList` is copied byte-for-byte into the object image:
```typescript
for (let index = 0; index < this.pubConList.length; index++) {
    const byte = this.pubConList.readNext();
    this.objImage.appendByte(byte);
}
```

All CON symbols are recorded via `recordCONSymbolValue()` (line 5440+) regardless of usage.

#### How to Implement

1. Track which CON symbols are actually referenced during compilation (in `getConstant()` and symbol lookups)
2. Only write referenced CON symbols to the pubConList
3. Note: CON symbols from child objects that are re-exported to grandparents must be preserved

#### Estimated Savings

Low. Each CON symbol entry is ~5-20 bytes (1 byte type + 4 bytes value + name length). A library with 50 unused CON constants saves ~500-1000 bytes.

**Important**: CON values are **inlined at point of use** during compilation — they don't occupy space in the executable code section. This optimization only affects the symbol table portion of object files, which is stripped from the final .bin image anyway. **This only saves space in .obj files used for inter-object compilation, not in the final binary.**

#### Caveat

This optimization affects .obj file size (used during compilation) but **NOT final .bin size**. The symbol table is only present in intermediate .obj files for use by parent objects during compilation. The final binary strips it. Therefore, this opportunity has minimal practical impact on deployed code size.

---

### OPP-6: Unused VAR Space Reclamation {#opp-6}

**Category**: Runtime memory optimization
**Impact**: Medium (RAM, not flash)
**Complexity**: Medium
**Applies to**: PNut-TS ✅ | Original PNut ✅

#### Description

VAR declarations reserve runtime hub RAM for each object instance. If variables are declared but never read or written, their space is wasted at runtime.

#### Current Behavior

In `spinResolver.ts` at `compile_var_blocks()` (line 602+):
```typescript
this.varPtr = 4;  // offset 4 (first 4 bytes = object pointer)
// For each VAR declaration:
this.varPtr += instanceCount * variableSize;
```

The final `varPtr` value becomes `varsize` in the object header. ALL declared variables contribute to this size.

#### How to Implement

1. Track which VAR symbols are referenced in PUB/PRI method bodies and DAT PASM code
2. Only allocate space for referenced variables
3. Renumber variable offsets
4. Rewrite all `bc_setup_*_vbase` bytecodes with new offsets

#### Estimated Savings

Saves **runtime hub RAM**, not binary/flash size. The VAR size is stored as a single LONG in the binary — the actual variable data is allocated at runtime. For objects with many unused variables: **tens to hundreds of bytes of runtime RAM per object instance**.

#### Complication

VAR variables can be accessed via `@variable` (address-of) and pointer arithmetic, making static analysis harder. If code takes the address of a variable, all subsequent variables at higher offsets could potentially be accessed through pointer math.

---

### OPP-7: Unused DAT Label/Data Elimination {#opp-7}

**Category**: Data-level DCE
**Impact**: Medium-High
**Complexity**: Very High
**Applies to**: PNut-TS ⚠️ | Original PNut ❌

#### Description

DAT sections can contain:
- PASM2 routines (inline assembly for COG execution)
- Lookup tables (BYTE/WORD/LONG arrays)
- String constants
- FILE-included binary data
- Hub-exec code (ORGH sections)

If a DAT label/routine is never referenced by any Spin2 method or other PASM code, its data could be excluded.

#### Why This Is Very Hard

1. **PASM is not structured** — assembly routines are identified by labels, but control flow is via JMP/CALL/DJNZ/etc. with computed targets, making static analysis unreliable
2. **ORG/ORGH/ORGF create address-dependent layouts** — removing data between ORG directives shifts all subsequent addresses, breaking absolute references
3. **COG memory is positional** — PASM code in ORG (COG mode) is loaded at fixed COG addresses. Removing code changes what's at each address
4. **Pointer arithmetic** — PASM code commonly uses computed addresses (`ADD addr, #offset`), making it impossible to statically determine all data references

#### What IS Feasible

A limited version: detect **entire DAT blocks** (between labels at the same ORG level) that are never referenced from Spin2 code. This is safe only for hub-mode data (ORGH) that is accessed exclusively via Spin2 `pbase` references.

#### Estimated Savings

Potentially high for projects with large lookup tables or FILE-included data that's conditionally used. FILE inclusions can be kilobytes each.

#### Implementation Path

PNut-TS only (requires AST-level analysis). Conservative approach:
1. Identify top-level DAT labels
2. Scan Spin2 bytecodes for `bc_setup_*_pbase` references to each label
3. Only eliminate labels with zero Spin2 references AND no PASM cross-references
4. Very conservative — likely catches only obvious cases like unused FILE includes

---

### OPP-8: Intra-Method Dead Code Elimination {#opp-8}

**Category**: Bytecode optimization
**Impact**: Low
**Complexity**: High
**Applies to**: PNut-TS ✅ | Original PNut ❌

#### Description

Within a method body, some bytecode sequences may be unreachable:
- Code after an unconditional `ABORT`
- Code after an unconditional `RETURN`
- Dead branches in `IF`/`CASE` when conditions are compile-time constants
- Unused local variables (their initialization bytecodes)

#### Current Behavior

The compiler emits bytecodes linearly without any reachability analysis. Dead code within methods is included as-is.

#### How to Implement

1. Build a control flow graph (CFG) for each method
2. Perform reachability analysis from the method entry point
3. Eliminate unreachable basic blocks
4. This is standard compiler optimization (well-studied)

#### Estimated Savings

Low. Most Spin2 programmers don't write significant amounts of unreachable code within methods. Savings would be a few bytes per method at most. The complexity-to-benefit ratio is poor.

---

### OPP-9: String Literal Deduplication {#opp-9}

**Category**: Data optimization
**Impact**: Low-Medium
**Complexity**: Low
**Applies to**: PNut-TS ✅ | Original PNut ✅

#### Description

String literals in Spin2 code (used in `DEBUG()`, `STRING()`, method calls) are currently emitted inline at each point of use. If the same string appears multiple times, it occupies space multiple times.

#### Current Behavior

Each `@@string` or `STRING()` occurrence emits the string bytes directly into the bytecodes via `bc_string` followed by length and character bytes (see `ct_at_emit_string()` in spinResolver.ts line 7844+).

#### How to Implement

1. Collect all string literals during compilation
2. Build a string pool with deduplication
3. Replace duplicate occurrences with references to the first occurrence
4. This requires a new bytecode or addressing mode for string pool references, which may not be feasible without interpreter changes

#### Alternative: Compile-Time Warning

Instead of automated deduplication (which may require interpreter changes), the compiler could **warn** about duplicate strings, letting the programmer consolidate them into DAT constants.

#### Estimated Savings

Depends on code style. Debug-heavy code with repeated format strings could save hundreds of bytes. Typical programs: minimal savings.

#### Interpreter Constraint

The current `bc_string` encoding expects the string bytes to follow immediately in the bytecode stream. A string pool reference would require a new bytecode (`bc_string_ref` (hypothetical string-pool-reference bytecode)) that the interpreter does not currently support. **This opportunity may require interpreter modifications.**

---

### OPP-10: Constant Folding & Expression Optimization {#opp-10}

**Category**: Bytecode optimization
**Impact**: Low
**Complexity**: Medium
**Applies to**: PNut-TS ✅ | Original PNut ⚠️

#### Description

While CON constants are already folded at compile time, runtime expressions involving constants could be further optimized:
- `x := 2 * 4` could emit `PUSH 8` instead of `PUSH 2; PUSH 4; MULTIPLY`
- `x := y + 0` could emit just the load of `y`
- Boolean simplification: `IF TRUE` could eliminate the conditional

#### Current Behavior

The compiler performs constant folding in CON expressions (evaluated at compile time) but does NOT optimize runtime expressions that happen to involve only constants.

#### Estimated Savings

Minimal — a few bytes per expression. Well-written code rarely has constant-only runtime expressions.

---

## 4. Impact Assessment Matrix {#4-impact-assessment}

| # | Opportunity | Binary Size Impact | Runtime RAM Impact | Complexity | Risk | Priority |
|---|-------------|-------------------|-------------------|-----------|------|----------|
| **OPP-1** | Unused PRI elimination | Medium | None | Medium | Low | **High** |
| **OPP-2** | Unused PUB elimination (cross-obj) | **High** | None | High | Medium | **High** |
| **OPP-3** | Unused child object elimination | Medium | Low | Low | Low | **High** |
| **OPP-4** | Partial child object inclusion | **Very High** | Medium | Very High | High | Medium |
| **OPP-5** | Unused CON symbol removal | Negligible* | None | Low | Low | Low |
| **OPP-6** | Unused VAR space reclamation | None | Medium | Medium | Medium | Medium |
| **OPP-7** | Unused DAT elimination | Medium-High | None | Very High | High | Low |
| **OPP-8** | Intra-method dead code | Low | None | High | Low | Low |
| **OPP-9** | String deduplication | Low-Medium | None | Low-Medium | Medium† | Low |
| **OPP-10** | Constant folding | Low | None | Medium | Low | Low |

\* Only affects .obj files, not final .bin
† Requires interpreter changes

### Priority Tiers

**Tier 1 — High value, practical to implement:**
- OPP-3 (unused child objects) — Low complexity, immediate wins
- OPP-1 (unused PRI methods) — Medium complexity, good returns
- OPP-2 (unused PUB methods) — High complexity but highest impact

**Tier 2 — Worthwhile but harder:**
- OPP-6 (unused VAR reclamation) — Runtime RAM savings
- OPP-4 (partial objects) — Maximum savings but very complex

**Tier 3 — Diminishing returns:**
- OPP-7 through OPP-10 — Low impact relative to complexity

---

## 5. Feasibility: Original PNut vs PNut-TS {#5-pnut-vs-pnut-ts}

### PNut-TS Advantages for DCE

| Advantage | Why It Matters |
|-----------|---------------|
| **TypeScript is high-level** | Data structures (Sets, Maps, graphs) are trivial to build for call graph analysis |
| **AST is accessible** | Symbol table and bytecodes can be introspected programmatically |
| **Multi-pass architecture** | Easy to add new analysis passes between existing phases |
| **Object model** | Can add `isReferenced` flags to symbol entries, build `CallGraph` classes |
| **Testing infrastructure** | 250+ regression tests validate that optimizations don't break correctness |
| **Source is maintainable** | 12K-line resolver is large but navigable; changes are tractable |

### Original PNut: Modification Is Not Viable

The original PNut has a **locked-down, custom Windows-only build pipeline** that makes direct modification impractical for DCE:

| Constraint | Details |
|-----------|---------|
| **Core compiler is x86 ASM** | `p2com.obj` is hand-written x86 assembly — adding analysis passes means writing more assembly |
| **Packed record architecture** | `TP2` in `GlobalUnit.pas` is a packed record; adding fields requires careful memory layout |
| **No intermediate representation** | Bytecodes are emitted directly, no IR to analyze |
| **Single-pass oriented** | Adding post-compilation analysis requires buffering and re-scanning |
| **Windows-only custom toolchain** | Requires Delphi 6, SmallBASIC for binary-to-define-byte translation, and custom `crank.bat` orchestration — tools not readily available or reproducible outside the original build environment |
| **Limited test infrastructure** | Testing relies on manual comparison; harder to validate optimizations |

**Conclusion**: Modifying PNut itself for DCE is a non-starter. The build toolchain is specialized, the core is x86 assembly, and the effort-to-benefit ratio is prohibitive.

### Recommended Strategy: PNut-TS as the Universal Post-Processor

PNut-TS already ships as a **standalone Windows executable** (`pnut_ts.exe`) via `pkg`, alongside macOS and Linux binaries. Both PNut and PNut-TS produce the **identical P2 binary format**. This means PNut-TS can serve as a post-processing optimizer for binaries produced by either compiler.

**Implementation**: Add a `--dce` flag to the existing `pnut_ts` CLI:

```bash
# PNut-TS users: integrated compilation + optimization
pnut_ts --dce -b myprogram.spin2

# Original PNut users: compile with PNut, then optimize with PNut-TS
PNut.exe myprogram.spin2              → myprogram.bin
pnut_ts.exe --dce myprogram.bin -o myprogram_opt.bin
```

**Why this works:**

| Factor | Benefit |
|--------|---------|
| **No new tool to build** | DCE is a new mode in the existing `pnut_ts` executable |
| **Works with original PNut output** | Both compilers produce the identical P2 binary format |
| **Already ships on Windows** | `pnut_ts.exe` is already distributed; users just add a flag |
| **Reuses existing code** | ObjectDistiller's 5-phase algorithm is the architectural template |
| **Cross-platform for free** | Ships on all 6 platforms (Win/Mac/Linux × x64/ARM64) |
| **No PNut modification needed** | Original PNut source, build chain, and workflow are untouched |
| **Chip's workflow unchanged** | PNut compilation works as before; DCE is an optional extra step |

**The post-processing approach is especially powerful** because it operates on the compiled binary — it doesn't need source code access, symbol tables, or any information beyond what's in the .bin file itself. The P2 object format is fully self-describing: the method table, sub-object table, and bytecodes can all be parsed from the binary.

#### File-Naming Convention for Post-Processor Mode

Forcing users to invent output filenames creates friction on every invocation. The post-processor must default to a sensible auto-derived name so the common case is zero-thought.

**Default behavior (no `-o` specified):**

```
pnut_ts --dce myprogram.bin            → myprogram_dce.bin
pnut_ts --dce path/to/foo.bin          → path/to/foo_dce.bin
```

The tool writes alongside the input with `_dce` inserted before the extension. The `.bin` extension is preserved so downstream loaders, flashers, IDE file pickers (`*.bin` filters), and OBEX uploaders see it as an ordinary binary.

**Rationale for `_dce` (not `.dce.bin`, `-opt.bin`, or similar):**

- Unambiguous — names exactly what was done to the file.
- Single extension `.bin` keeps it transparent to all existing tooling.
- Sorts adjacent to the original in directory listings, making before/after comparison visual.

**Explicit override still available:**

```
pnut_ts --dce myprogram.bin -o slim.bin     → slim.bin
```

**Auto-derived report file:**

The bytes-saved / methods-eliminated / child-objects-removed report (per §6 *Reporting*) is also auto-named alongside the binary, so users don't have to manage that either:

```
myprogram.bin
  → myprogram_dce.bin       (the optimized binary)
  → myprogram_dce.report    (text report of what was eliminated)
```

`--no-report` suppresses the report file when only the binary is wanted.

**Edge-case rules:**

| Case | Behavior |
|------|----------|
| Input already named `*_dce.bin` | Append unconditionally → `myprogram_dce_dce.bin`. Idempotent and honest about what happened; user can rename if desired. Avoids overwrite-by-coincidence. |
| Output file already exists | Refuse with error, unless `--force` / `-f` is passed. Standard Unix CLI hygiene; protects against iterative-testing data loss. |
| Input has no `.bin` extension | Append `_dce.bin` (e.g., `myprogram` → `myprogram_dce.bin`). User didn't follow convention; tool still produces a properly-named output. |
| Stdout mode (future) | Reserve `-o -` for binary-on-stdout for future pipe support. Not built in v1. |

**Integrated mode (compile-from-source) naming:**

When DCE is invoked alongside compilation (`pnut_ts --dce -b myprogram.spin2`), the existing `-b` output naming applies — DCE is internal to the compile pipeline and produces the standard `myprogram.bin`. The `_dce` suffix is **post-processor-mode only**, where it serves to distinguish optimized output from the original input file living in the same directory.

---

## 6. Recommended Approach {#6-recommended-approach}

### Phase 1: Foundation — Call Graph Infrastructure

**Effort**: 20-30 hours | **Prerequisite for**: OPP-1, OPP-2, OPP-3, OPP-4

Build a `CallGraphAnalyzer` class that:
1. Walks compiled bytecodes in `ObjectImage`
2. Decodes `bc_call_sub`, `bc_call_obj_sub`, `bc_mptr_sub`, `bc_mptr_obj_sub` instructions
3. Builds a directed graph of (caller_object, caller_method) → (callee_object, callee_method) edges
4. Handles method pointers conservatively (mark as "address taken")
5. Computes reachability from the top-level entry point

This is a **one-time investment** that enables all method-level DCE opportunities.

### Phase 2: Low-Hanging Fruit

**OPP-3**: Unused child object elimination (~10 hours)
- Scan the call graph for child objects with zero incoming edges
- Remove them from the sub-object table
- Renumber remaining child indices

**OPP-1**: Unused PRI method elimination (~25 hours)
- Within each object, identify PRI methods with zero callers
- Remove their bytecodes and method table entries
- Renumber method indices within the object
- Rewrite internal `bc_call_sub` operands

### Phase 3: Cross-Object DCE

**OPP-2**: Unused PUB method elimination (~40-60 hours)
- Use the whole-program call graph to identify unreachable PUB methods
- Recompile affected child objects with methods excluded
- This is the highest-impact optimization but requires careful handling of:
  - Method pointer escape analysis
  - Re-linking the object tree
  - Regression testing across all test suites

### Phase 4: Advanced (Optional)

**OPP-6**: Unused VAR reclamation (~20 hours)
- Scan bytecodes for `vbase` references
- Compact VAR space
- Rewrite variable offsets

**OPP-4**: Partial object inclusion (~60-80 hours)
- Full implementation of per-method dependency analysis
- Object reconstruction
- This is a major architectural effort

### Opt-In Model

All DCE should be behind a **CLI flag** (e.g., `--optimize` or `--dce`):
- Default behavior: identical output to current compiler (maintains regression compatibility)
- Opt-in: applies DCE passes
- This preserves backward compatibility and allows gradual adoption

### Reporting

When DCE is enabled, the compiler should report savings:
```
Dead Code Elimination Report:
  Removed 3 unused PRI methods from "jm_fullduplexserial" (saved 847 bytes)
  Removed 12 unused PUB methods across 4 child objects (saved 4,291 bytes)
  Removed 1 unused child object "debug_util" (saved 2,103 bytes)
  Total savings: 7,241 bytes (14.1% of original binary)
```

---

## 7. Risk Analysis {#7-risk-analysis}

### Correctness Risks

| Risk | Mitigation |
|------|-----------|
| **Method pointer aliasing** | Conservative analysis: if ANY method's address is taken (`@@`), keep all methods in that object. Can be refined later. |
| **Dynamic dispatch** | `bc_call_ptr` calls cannot be statically resolved. Any method reachable via pointer must be preserved. |
| **Index renumbering errors** | Comprehensive regression testing. Add a verification pass that validates all bytecode references post-renumbering. |
| **Object format violations** | Validate output against the P2 interpreter's expectations. Test on hardware. |
| **Conditional compilation** | `#ifdef` can create different call graphs. DCE must be applied per-compilation-configuration. |

### Compatibility Risks

| Risk | Mitigation |
|------|-----------|
| **Output differs from PNut** | DCE behind opt-in flag. Default output remains identical. |
| **GOLD file regression tests** | DCE'd output won't match GOLD files. Need separate DCE test suite. |
| **Debug info breakage** | Debug data references method indices. Must be updated in sync. Skip DCE when `-d` (debug) flag is set. |

### Performance Risks

| Risk | Mitigation |
|------|-----------|
| **Compilation time increase** | Call graph analysis is O(methods × instructions). For typical programs (hundreds of methods), this adds milliseconds. |
| **Memory usage** | Call graph storage is minimal — a few KB for the adjacency list. |

### Strategic Risk

The P2 interpreter's index-based dispatch means **any method-level DCE inherently requires bytecode rewriting**. This is a fundamental architectural constraint that cannot be avoided. The question is whether to:

- **Rewrite bytecodes** (complex but maximizes savings)
- **Replace dead methods with stubs** (simpler — replace bytecode with minimal RETURN, keep table entries, save most of the bytecode bytes without renumbering)

The **stub approach** is a pragmatic middle ground: keep the method table intact (no renumbering needed) but replace dead method bodies with a single `RETURN` instruction (1-2 bytes). This sacrifices 4 bytes per dead method (the table entry) but avoids all renumbering complexity.

---

## Appendix A: Key Source File References

| File | Lines | Relevance |
|------|-------|-----------|
| `src/classes/spinResolver.ts` | 3283-3293 | Method table entry creation |
| `src/classes/spinResolver.ts` | 3499-3676 | PUB/PRI block compilation (all blocks, no filtering) |
| `src/classes/spinResolver.ts` | 5364-5412 | `compile_final()` — binary assembly |
| `src/classes/spinResolver.ts` | 7992-8008 | `bc_call_obj_sub` / `bc_call_sub` emission |
| `src/classes/spinResolver.ts` | 7811-7819 | `bc_mptr_obj_sub` / `bc_mptr_sub` emission |
| `src/classes/objectDistiller.ts` | 71-250 | Object deduplication algorithm |
| `src/classes/compiler.ts` | 258-421 | Recursive compilation + child dedup |
| `src/classes/objectImage.ts` | — | Binary image accumulator |
| `src/classes/childObjectsImage.ts` | — | Child object storage |
| `src/classes/symbolTable.ts` | 17-22 | `iSymbol` interface (no "used" flag) |
| `src/ext/Spin2_interpreter.spin2` | 1557-1559 | Method dispatch: `pbase + index×4` |
| `DOCs/internals/SPIN2-BIN-Format.md` | — | Complete binary format specification |
| `REF-V52A/GlobalUnit.pas` | — | Original PNut data structures |

## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **pbase** | Program base address — start of the method table in hub memory |
| **vbase** | Variable base address — start of VAR memory for an object instance |
| **dbase** | Data/stack base address — start of local stack for method execution |
| **pgmsize** | Program size — byte count of the executable code section |
| **varsize** | Variable size — byte count of runtime VAR memory needed |
| **pubConList** | Symbol table containing PUB method signatures and CON values |
| **rfvar** | Run-length encoded variable-length integer used in bytecodes |
| **Object Distiller** | Existing deduplication pass that finds identical child objects |
| **Hub RAM** | 512KB shared memory on the P2 chip (the primary size constraint) |
| **COG** | One of 8 processor cores on P2, each with 512 longs of local memory |

---

## Appendix C: Addendum — Full-Removal Clarification & Additional Opportunities

*Added 2026-04-27 in response to review questions.*

### C.1 Full removal vs stub approach — what the study actually recommends

**The study recommends full removal** (renumber methods, rewrite all bytecode references). This is the explicit path in §6 Phase 2 and Phase 3. Full removal reclaims:

- The method bytecode body (variable size, often 50–500 bytes per method)
- The 4-byte method table entry
- All `bc_mptr_*` and `bc_call_*` operand savings from rfvar compaction (smaller indices → fewer rfvar bytes at every call site)

The **stub approach** appears only in §7 *Strategic Risk* as a fallback. It is **not** the primary recommendation. It exists in the document so a future implementer who hits a renumbering blocker has a documented escape valve.

**When the stub fallback would be chosen:**
- A single-pass implementation without complete bytecode-rewriting infrastructure
- A first-iteration / proof-of-concept release where index renumbering is deferred
- Cases where method pointer escape analysis cannot be made tight enough to safely renumber

### C.2 Cost comparison — full removal vs stub

| Aspect | Full Removal (recommended) | Stub Approach (fallback) |
|--------|---------------------------|--------------------------|
| **Bytes saved per dead method** | full bytecode body + 4-byte table entry + rfvar shrinkage | full bytecode body minus 1–2 byte stub; **table entry kept** (4 bytes lost) |
| **Implementation effort (OPP-1 alone)** | ~25 hours | ~10–12 hours |
| **Implementation effort (OPP-2 alone)** | ~40–60 hours | ~18–25 hours |
| **Implementation effort (Phase 1 foundation)** | ~20–30 hours either way | same |
| **Effort, OPP-1+2+3 total, full** | **~85–115 hours** | ~50–65 hours |
| **Code requiring change** | call-graph builder + bytecode rewriter + index remapper + PUB/PRI boundary recompute + obj-symbol-table reissue | call-graph builder + per-method body-replacement only |
| **Risk** | Index-rewrite bugs (mitigated by verification pass + GOLD-style diff tests) | Very low — table layout untouched |
| **Savings ratio (typical library object)** | ~95–98% of dead method's footprint | ~90% of body; ~0% of table-entry footprint |
| **Numeric example** (20-method library, 12 dead, avg body 200B) | ~12 × 204B = **2,448 B saved** | ~12 × 200B + 12 × 1B stub = **2,388 B saved** (60 B less) |

**Conclusion:** the stub approach captures ~97% of the savings for ~55% of the effort. For a first DCE release, stub-mode is a defensible MVP that ships value quickly. Full removal is the right end state, and the foundation work (Phase 1 call graph) is identical for both paths — meaning **starting with stubs does not waste any work** on the way to full removal.

**Recommended sequencing:**
1. **Phase 1** — call graph foundation (unchanged from §6).
2. **Phase 2a** — OPP-3 full removal (child object DCE — index space is much smaller, renumbering is straightforward, lowest risk first).
3. **Phase 2b** — OPP-1 stub mode (PRI methods, ship for early validation).
4. **Phase 2c** — OPP-1 full removal (graduate from stub once index rewriter is proven).
5. **Phase 3** — OPP-2 full removal (cross-object PUB DCE, with confidence from Phase 2c).

### C.3 Open questions on the existing study

These are unresolved decisions an implementer would need to settle:

1. **Method-pointer escape policy granularity.** §7 recommends "if any method's address is taken in an object, keep all methods in that object." Is **per-object** the right granularity, or should we attempt per-method-pointer-target tracking (track which specific methods get `@@`'d and only keep those)? The latter recovers significant savings in libraries that legitimately use one or two callbacks but have many other unused methods. Per-object is correct-by-default and simple; per-method is achievable with linear scan of `bc_mptr_sub` / `bc_mptr_obj_sub` operands.

2. **Debug build interaction.** §7 says "Skip DCE when `-d` (debug) flag is set." Is that the right call, or should debug builds use stub-mode (preserve debuggability of all methods while still saving body bytes)? Skipping DCE entirely means debug binaries fit a different memory budget than release — which can mask debug-only OOM bugs.

3. **`COGSPIN` / `TASKSPIN` entry points.** Methods used only as the second argument to `COGSPIN` or `TASKSPIN` are still "called" but not via `bc_call_sub`. The call-graph walker must understand these as entry-point producers. Confirmed reachable from `compile_parameters_mptr` paths, but the walker code must be explicit about them.

4. **Top-level entry point identification.** §6 says "starting from the top-level object's PUB methods" — does that mean *all* top-level PUBs are roots, or only the canonical `Main`/`Start`? P2 convention is that any PUB on the top object can be a launcher. Recommended: **treat all PUBs of the top object as roots.** Worth stating explicitly.

5. **Conditional compilation interaction.** §7 mentions "DCE must be applied per-compilation-configuration" but does not specify behavior when `#ifdef` cuts a method's body to empty. Should empty-after-preprocessing methods be eliminated? Probably yes — they're indistinguishable from never-declared. Worth a one-line policy decision.

6. **Symbol table preservation for downstream tooling.** Some toolchains (debuggers, listing comparison tools) expect the full method table. Does DCE need a "symbol-preserving mode" that does stub-mode-only when targeting tools that read `.lst` or symbol exports?

7. **Verification pass correctness.** §7 mentions "a verification pass that validates all bytecode references post-renumbering." This isn't specified. Recommended: re-run the call-graph walker after renumbering and assert (a) every `bc_call_*` references a valid method index, (b) every method has at least one referrer or is a root, (c) PUB/PRI boundary is consistent with method ordering.

### C.4 Additional DCE opportunities not in the original catalog

These were missed in the first pass:

#### OPP-11: Identical Method Body Deduplication
**Category:** Method-level dedup (sibling to ObjectDistiller)
**Impact:** Low–Medium
**Complexity:** Low–Medium

Two methods with byte-identical compiled bytecode bodies (after renumbering normalization) can share a single body — both method table entries point to the same offset.

This commonly arises with auto-generated stubs, simple getter/setter methods, and code patterns like:
```spin2
PUB getX() : v
  v := x
PUB getY() : v
  v := y
```
After the VAR offsets are baked in, the bytecodes differ — but for genuinely identical bodies (same constants, same calls), this is a win.

**Estimated savings:** Low in hand-written code, can be moderate in auto-generated code. Requires a hash-and-compare pass over compiled method bodies after Phase 1.

#### OPP-12: Method Tail Merging
**Category:** Bytecode-level dedup
**Impact:** Low
**Complexity:** Medium-High

When two methods end with identical bytecode tails ≥ N bytes (e.g., common cleanup epilogue, identical return-path), one method can `JMP` into the tail of the other. Saves N–jmp_size bytes per merge. Requires control-flow analysis and CFG-aware bytecode rewriting.

**Estimated savings:** Low. Spin2 method epilogues are typically already compact. Probably not worth the complexity.

#### OPP-13: DAT Block Deduplication
**Category:** Data-level dedup (sibling to ObjectDistiller)
**Impact:** Low–Medium
**Complexity:** Medium

If two DAT blocks at compatible alignments contain byte-identical data (same lookup table, same string literal, same FILE include), one copy can be kept and references redirected. Particularly powerful for FILE-included assets repeated across child objects.

**Estimated savings:** Project-dependent — could be substantial for graphics/sound asset libraries that repeat assets, negligible for typical code.

#### OPP-14: Unused TASK Declaration Pruning
**Category:** Object-level
**Impact:** Low
**Complexity:** Low

`TASK` slot reservations consume runtime overhead (task table entry) and possibly stack space. If `TASKSPIN` is never invoked for a slot, the reservation is dead. Static analysis: scan for `TASKSPIN` operands; any task slot index never referenced is dead.

#### OPP-15: Skip Locals-Clear for Empty Local Frames
**Category:** Bytecode/runtime micro-optimization
**Impact:** Negligible per call, cumulative over hot paths
**Complexity:** Very Low

The method prologue runs `rfvar local-long-count` then a `djnf`/`setq`/`wrlong` clear loop. When local-long-count is 0, the rfvar still executes and the djnf falls through. Emitting a different prologue variant (no rfvar, no clear) for zero-locals methods saves 1 rfvar byte per such method **and** ~3 PASM cycles per call. Many simple methods have no locals — this could be widely applicable.

This is a **runtime change** (interpreter must support a "no locals" variant), so it's lower priority. Listing here for completeness.

#### OPP-16: Strip Unreferenced Symbol-Export Entries
**Category:** Object-file metadata
**Impact:** Negligible on `.bin`; matters for `.obj` size
**Complexity:** Low

Same caveat as OPP-5 — affects only intermediate `.obj` files, not the deployed binary. PUB symbols and CON exports that are referenced by zero parents can be omitted from the export table. Cleanup-grade only.

#### OPP-17: Empty/Trivial Method Inlining
**Category:** Bytecode-level
**Impact:** Low–Medium
**Complexity:** High

Methods consisting of a single bytecode (e.g., `return constant`, `return var`) could be inlined at every call site, eliminating the call-overhead bytes plus the method body and table entry entirely. This is classical inlining and crosses into "compiler optimization" rather than pure DCE.

**Estimated savings:** Tens of bytes per inlined trivial method × call sites. Classical PUB getters benefit most.

**Complexity reason:** Requires bytecode pattern matching, ensuring no method-pointer escape, deciding on a size threshold, and avoiding regressions in `.lst` debugger UX.

#### Summary of additional opportunities

| # | Opportunity | Impact | Complexity | Priority |
|---|-------------|--------|-----------|----------|
| OPP-11 | Identical method body dedup | Low-Medium | Low-Medium | Tier 2 |
| OPP-12 | Method tail merging | Low | Medium-High | Tier 3 |
| OPP-13 | DAT block dedup | Low-Medium | Medium | Tier 2 |
| OPP-14 | Unused TASK pruning | Low | Low | Tier 3 |
| OPP-15 | Skip locals-clear (zero locals) | Negligible/cumulative | Very Low (interpreter change) | Tier 3 |
| OPP-16 | Strip unreferenced exports | Negligible (.bin) | Low | Tier 3 |
| OPP-17 | Trivial method inlining | Low-Medium | High | Tier 3 |

None of these change the priority order: OPP-3 / OPP-1 / OPP-2 remain the three high-value wins.

---

## Appendix D: Doability deep-dive — RFVAR cascades and per-OPP feasibility

*Added 2026-05-01 in response to Chip's review question: "are techniques really doable? It really would be good to do it on the binary, since you then have the final picture, but I'm not sure if it would be possible, given lots of offsets changing that were put into RFVAR values."*

This appendix takes Chip's concern seriously and walks each opportunity against the realities of variable-length encoding (RFVAR) and the binary post-processor approach.

### D.1 The RFVAR cascade problem

The P2 binary uses **RFVAR/RFVARS** (variable-length encoded integers) extensively:

| Encoded value | RFVAR bytes |
|---------------|-------------|
| 0..127 | 1 |
| 128..16,383 | 2 |
| 16,384..2,097,151 | 3 |
| 2,097,152..268,435,455 | 4 |

Every one of these is an RFVAR in the bytecode stream:

- `bc_call_sub` operand (method index)
- `bc_call_obj_sub` operands (obj index + method value)
- `bc_jmp` / `bc_jz` / `bc_jnz` / `bc_tjz` / `bc_djnz` operands (branch offsets — RFVARS, signed)
- `bc_pop_rfvar` operand (pop count)
- `bc_get_addr` operand (address offsets)
- `bc_string` operand (string length)
- DAT label addresses encoded into method bodies
- Pubcon list method indices

**The cascade:** changing a value's magnitude can change its encoded length. A method index dropping from 130 to 100 goes from 2-byte rfvar to 1-byte rfvar — saving 1 byte at that call site. **But that 1-byte shift moves all subsequent bytecode addresses in the same method by -1**, which can move other branch targets, which can change other rfvars, which can shift further. Most cases converge in 2-3 fix-point iterations, but the iteration *must happen* — you cannot just rewrite values in place and expect a valid binary.

This is a well-known compiler/assembler problem (x86 short-vs-long jump encoding faces the same thing); the solution is iterate-to-fix-point. **It is doable, but it's harder than rewriting fixed-width fields.**

### D.2 What the binary post-processor must do

To DCE a binary file (Chip's preferred "final picture" approach), the tool must:

1. **Disassemble each method body** to identify which bytes are bytecodes vs which are RFVAR/RFVARS operand bytes vs which are inline data (string literals, etc.). This requires walking each bytecode and knowing how many operand bytes it consumes — essentially a partial interpreter.

2. **Build a typed map** of every RFVAR-encoded value in the binary: at byte offset X, there is an RFVAR of type "method index" / "branch offset" / "obj index" / "pop count" / "string length" / etc.

3. **Identify which RFVARs reference what:** branch offsets reference labels within the same method body; method indices reference method-table entries; obj indices reference sub-object-table entries; etc.

4. **Apply the DCE transformation** (remove dead methods, renumber indices, shrink bodies to stubs, etc.).

5. **Re-encode all affected RFVARs**, knowing their new values.

6. **Iterate to fix-point:** if any RFVAR changed length, re-measure all dependent offsets and re-encode. Repeat until stable. Bound the iteration count (3-5 passes should suffice for any realistic case; an infinite loop indicates a bug).

7. **Recompute method-table offsets, sub-object-table offsets, pgmsize, and the binary checksum.**

8. **Validate** the output by re-walking it and asserting every RFVAR target is reachable.

**Verdict:** doable. Not trivial. The complexity is comparable to writing a proper P2 bytecode disassembler — which we'd need anyway for `.lst` reporting. The fix-point iteration is standard engineering, well within reach.

### D.3 Source-level vs binary-level — practical tradeoffs

Reframing the source-level vs binary-level decision in light of the cascade complexity:

**Source-level DCE (inside PNut-TS resolver):**
- *Pro:* All offsets are computed by the existing resolver after we mark methods dead — the standard emission path handles RFVAR encoding correctly the first time. No fix-point needed.
- *Pro:* AST is available — easy to identify "address taken" methods (method-pointer escape).
- *Pro:* Symbol table is fully populated — easy to map indices to names for reporting.
- *Con:* Doesn't help users compiling with original PNut.exe.

**Binary-level DCE (post-processor on .bin):**
- *Pro:* Works on output from either compiler. Chip's "final picture" goal is met.
- *Pro:* Sees the *actual* compiled product — catches anything the source-level analysis might miss (e.g., compiler-generated calls, distilled-object effects).
- *Con:* Must build the disassembler, the typed RFVAR map, and the fix-point re-encoder. Significant up-front engineering.
- *Con:* Method-pointer escape analysis is harder without the AST — we have to decode `bc_mptr_sub` instructions and trust the call graph. Bytecode-encoded method pointers stored in variables and passed around can be tracked, but it's a graph-traversal problem on disassembled output.

**Recommended approach (revised from §5):** **build both, in stages.**

1. **First**, do source-level DCE in PNut-TS resolver (much simpler — no cascade, no disassembler). This proves out the call-graph algorithm, the renumbering logic, the reporting, and the regression-testing infrastructure.
2. **Once that's stable**, build the binary post-processor by reusing the core call-graph and renumbering logic but driving it from a binary disassembler instead of from the resolver's AST. The hard parts (call-graph correctness, method-pointer escape, renumbering rules) are debugged once at source level; the post-processor is then a "different front-end, same engine" exercise.
3. **Both modes share the same regression test suite** (Appendix E).

This avoids the trap of trying to build the harder version first and getting stuck on disassembler bugs while the actual DCE algorithm is unproven.

### D.4 Per-OPP doability assessment

Walking each high-priority opportunity against RFVAR cascades and other implementation challenges:

#### OPP-3 (Unused child object elimination) — **Doable, low complexity**

- Sub-object table is a fixed-format region; remove entries cleanly.
- Renumber surviving obj indices (1-byte rfvars in 99% of cases — most objects have far fewer than 128 children, so no length changes).
- Rewrite `bc_call_obj_sub`/`bc_call_obji_sub`/`bc_mptr_obj_sub` first-rfvar in callers — same length, no cascade.
- Method-internal bytecode offsets unchanged.
- **Cascade risk:** essentially zero (obj indices stay 1-byte).
- **Verdict:** Easiest of the high-priority OPPs. Do this first.

#### OPP-1 stub mode (PRI bodies → single RET) — **Doable, low-medium complexity**

- Method-table entries unchanged (offsets/params/results stay).
- Each dead method's bytecode body collapses from N bytes to 1 byte (`bc_return_results`).
- Subsequent method bodies shift earlier in the binary — method-table offsets must be recomputed accordingly.
- Branch targets *within* the stubbed method don't matter (it's now one byte).
- Branch targets *between* methods don't exist (PRIs are only called via `bc_call_sub`, which uses method index, not byte offset).
- **Cascade risk:** branch offsets within OTHER methods are method-relative, so they don't shift. Method-table offsets shift but they're fixed-width 20-bit fields, not RFVARs.
- **Verdict:** Surprisingly clean. No RFVAR cascade because the affected fields aren't RFVARs.

#### OPP-1 full removal (PRI methods removed entirely) — **Doable, medium complexity**

- Method-table entries removed; subsequent methods renumber.
- Every `bc_call_sub rfvar(idx)` must update if its target's index changed.
- Every `bc_mptr_sub rfvar(idx)` likewise.
- **Cascade risk:** real but bounded. If 10 methods are removed and surviving indices drop from 50 to 40, both still 1-byte rfvar — no cascade. But if a high-numbered method (say index 200, 2-byte rfvar) drops to 150 (still 2-byte) or 120 (now 1-byte), some call sites get 1 byte shorter. Subsequent bytecodes shift, branch-offset rfvars within the same method recompute — fix-point iterate.
- **Verdict:** Doable with fix-point iteration. Most realistic objects have <128 methods so the rfvar lengths are stable; cascade is a corner case but must be handled.

#### OPP-2 (Cross-object PUB elimination) — **Doable, medium-high complexity**

- All of OPP-1's concerns plus:
- `bc_call_obj_sub` and `bc_mptr_obj_sub` carry **two** rfvars (obj index + method value). Either or both can change length. The method-value field encodes both the method index AND packed params/results in some encodings — need to be careful what changed.
- Distillation interaction: if removing methods makes two formerly-distinct child objects byte-identical, we should re-distill. But re-distillation might change the obj indices we just finalized. Interleaved fix-point.
- **Cascade risk:** all of OPP-1's, multiplied by (number of child objects).
- **Verdict:** The hard one. Plan it explicitly with multi-pass fix-point: (DCE pass) → (re-distill) → (renumber) → (fix-point rfvars) → repeat until stable.

#### OPP-4 (Partial child object inclusion) — **Marginal doability**

- Effectively rebuilds each pruned child object from scratch with new method ordering, new VAR layout, new DAT layout.
- Internal RFVAR cascades within each rebuilt child + cross-object cascades from parent calls into rebuilt children.
- **Verdict:** Doable in principle, but it's "build a P2 linker." Defer until OPP-1/-2 are stable.

#### OPP-7 (Unused DAT data elimination) — **Hard, conditional doability**

- DAT addresses encoded in bytecodes (via `bc_get_addr` + rfvar) shift if DAT data is removed. Cascade.
- PASM cross-references inside DAT (computed addresses, ALTI, ORG-relative) cannot be statically tracked. **This is the binding constraint, not RFVAR.** A `add ptra,#offset` in DAT references some address that the bytecode walker can't know about.
- **Verdict:** Conservative-only — eliminate hub-mode (ORGH) DAT blocks that are *not referenced from any bytecode* AND have *no incoming PASM cross-references from the same DAT region*. The latter requires PASM disassembly, which is a separate effort. Most realistic implementation: only eliminate FILE-included blocks that are clearly leaf data (e.g., a font that no bytecode `@font_table` references). Modest savings.

#### OPP-6 (Unused VAR reclamation) — **Doable, but limited by `@var` aliasing**

- VAR offsets encoded in `bc_setup_var_*` and `bc_get_addr` rfvars. Same cascade rules as method indices.
- The real constraint is *aliasing*: any code that takes `@var_X` and does pointer arithmetic could reach `var_Y` at a higher offset. Static analysis must conservatively keep variables whose addresses are taken.
- **Verdict:** Doable but with conservative aliasing rules. Lower payoff than method elimination.

#### OPP-13 (DAT block dedup) — **Doable, low-medium complexity**

- Operates on whole DAT regions identified by labels. If two regions are byte-identical, redirect references from one to the other.
- All references via `bc_get_addr` + rfvar; updating rfvars to point to the canonical copy can change rfvar length → cascade.
- **Verdict:** Same cascade discipline as OPP-1 full removal. The pattern is well-understood.

### D.5 Correction to §5 — universal post-processor

Section 5 framed PNut-TS as "the universal post-processor" for both compilers' output. The cascade analysis above modifies that:

- **For PNut-TS users**: source-level DCE in the resolver is the right answer (no cascade complexity).
- **For PNut.exe users**: binary post-processor IS the only option, and it's doable but materially harder. This should be Phase 2, not Phase 1.

**Revised recommendation:** ship source-level DCE in PNut-TS first (`pnut_ts --dce -b prog.spin2`). Once correctness is proven across the regression suite, build the binary post-processor (`pnut_ts --dce prog.bin`) as a second feature, sharing the call-graph and renumbering engine but driven from a disassembler.

The auto-naming convention (§5 sub-section) still applies to the post-processor mode unchanged.

### D.6 Implementation skeleton for the disassembler/re-encoder

Sketch of what the binary post-processor needs internally:

```typescript
class P2BinaryDce {
  // Phase 1: Parse the binary into a typed model
  parseBinary(bin: Buffer): P2BinaryModel {
    // Extract: header, sub-object table, method table, DAT, method bodies,
    //          child objects (recursive), checksum, pubcon list.
    // Record byte ranges and types for every RFVAR-encoded operand.
  }

  // Phase 2: Build the call graph
  buildCallGraph(model: P2BinaryModel): CallGraph {
    // Walk each method's bytecode, identify bc_call_sub / bc_call_obj_sub /
    // bc_mptr_sub / bc_mptr_obj_sub references. Record (caller, callee) edges.
    // Conservatively mark "address-taken" methods from bc_mptr_* sites.
  }

  // Phase 3: Compute reachability from roots
  computeLive(graph: CallGraph, roots: Method[]): Set<Method> {
    // Roots = all PUBs of top-level object + any address-taken methods.
    // BFS/DFS to mark reachable methods. Anything not marked is dead.
  }

  // Phase 4: Apply DCE (remove dead methods, renumber survivors, etc.)
  applyDce(model: P2BinaryModel, live: Set<Method>): P2BinaryModel {
    // Remove dead method-table entries. Renumber. Update method bodies that
    // remain. Mark all RFVARs that reference renumbered indices as "dirty."
  }

  // Phase 5: Fix-point re-encode
  reencodeUntilStable(model: P2BinaryModel): P2BinaryModel {
    // For each "dirty" RFVAR, re-encode at its new value. If the encoded
    // length changes, mark all subsequent offsets in the same method body
    // as dirty. Repeat. Bound iteration count (panic if >5 passes).
  }

  // Phase 6: Recompute structural offsets and checksum
  finalize(model: P2BinaryModel): Buffer {
    // Re-emit method table with new offsets. Re-emit sub-object table.
    // Recompute pgmsize, varsize, checksum. Emit binary.
  }

  // Phase 7: Validate (cheap; runs as part of every DCE invocation)
  validate(bin: Buffer): void {
    // Re-parse the output and assert every RFVAR target is reachable.
    // Assert method-table offsets point to valid bytecode.
    // Assert checksum matches.
  }
}
```

The fix-point loop in Phase 5 is the load-bearing piece. If it fails to converge, that's a real bug; the bound (5 passes) acts as a safety net.

---

## Appendix E: Regression testing strategy for DCE

*Added 2026-05-01 in response to Chip's review question.*

The §7 risk analysis mentioned "DCE'd output won't match GOLD files. Need separate DCE test suite" but didn't develop the strategy. This appendix does.

### E.1 The fundamental contract

> **A program with DCE applied must produce identical output and behavior compared to the same program compiled without DCE.**

This is the property we're guarding. Everything else (size savings, GOLD file changes, performance metrics) is secondary to correctness.

### E.2 Test categories

#### Category 1 — Differential testing: every regression test runs in both modes

Existing 250 regression tests (TEST/*.spin2) become 500 effective tests:

```
For each test source T:
  1. Compile T without DCE → T_orig.bin, T_orig.lst
  2. Compile T with DCE   → T_dce.bin, T_dce.lst
  3. Run binary verifier on T_dce.bin (Phase 7 of §D.6)
  4. If T has a deterministic-output GOLD:
       Run T_orig and T_dce on hardware/sim, compare outputs byte-for-byte
  5. Report: methods eliminated, child objects eliminated, bytes saved
```

For correctness: outputs must match. For size telemetry: savings should match expectations (some tests have known-eliminable code; others have none).

#### Category 2 — Identity tests: "no dead code → identical output"

A subset of the regression corpus has no dead code (every method called, every child object used). For these:

```
T_orig.bin must equal T_dce.bin byte-for-byte
(or: differ only in the OBJ pubcon list portion, which is harmless)
```

This is a strong correctness check: if DCE is identity-on-no-dead-code, it's much less likely to have subtle correctness bugs.

#### Category 3 — DCE-targeted tests: known-eliminable code

A NEW set of test sources, deliberately constructed with dead code:

| Test name | Dead code introduced | Expected savings |
|-----------|---------------------|-------------------|
| `dce_unused_pri_simple.spin2` | 3 PRI methods, never called | 3 PRIs removed, ~N bytes |
| `dce_unused_pub_lib.spin2` | Library object with 20 PUBs, parent uses 3 | 17 PUBs removed |
| `dce_unused_obj.spin2` | OBJ declaration, never called on | 1 child object removed |
| `dce_method_ptr_keeper.spin2` | PRI never directly called BUT `@@pri_method` taken | PRI must be retained (test conservative analysis) |
| `dce_no_dead_code.spin2` | Tight program, every method used | Identity: T_orig == T_dce |
| `dce_cascade_trigger.spin2` | Programs designed to trigger RFVAR length changes (e.g., remove method that drops index 130 → 100) | Verify fix-point iteration converges and binary is valid |
| `dce_rfvar_boundary.spin2` | Method body sized exactly at RFVAR-length boundaries (127/128, 16383/16384 bytes) | Verify cascade handling at boundaries |
| `dce_send_recv.spin2` | Methods used as SEND/RECV pointer destinations | Must be retained |
| `dce_cogspin_taskspin.spin2` | Methods used as COGSPIN/TASKSPIN entry points | Must be retained |
| `dce_distill_interaction.spin2` | Two child objects that become identical after DCE | Verify re-distillation |

Each test has an explicit expected outcome (bytes saved, methods eliminated). Test fails if the actual outcome differs.

#### Category 4 — Binary post-processor tests

For the post-processor mode, the test corpus must include binaries from **both** PNut-TS and original PNut.exe:

```
For each test in DCE-targeted set:
  - Compile with PNut-TS (no DCE) → T_pnuts.bin
  - Compile with PNut.exe (no DCE) → T_pnut.bin (Windows-only step; cached)
  - Run pnut_ts --dce on each → T_pnuts_dce.bin, T_pnut_dce.bin
  - Verify: both DCE'd binaries are correctness-equivalent to their originals
  - Verify: both DCE'd binaries report the same number of eliminations
  - Verify: outputs on hardware/sim are unchanged from originals
```

The PNut.exe-produced cases are the "we got the binary from a Windows user" scenario. They're validated in the same way as PNut-TS-produced binaries — proves the post-processor is compiler-neutral.

#### Category 5 — Property-based / random testing

Generate random Spin2 programs (within constraints: valid syntax, varying numbers of PUBs/PRIs, varying call graphs, occasional method-pointer use). For each generated program:

```
1. Compile twice (with/without DCE)
2. Run both on simulator
3. Compare outputs
4. If outputs differ → save the program as a regression test
```

Random testing surfaces edge cases human tests miss. A small generator (~500 lines) producing 10,000 random programs is far more thorough than any hand-crafted test suite.

#### Category 6 — Verifier tests (cheap, run on every binary)

The Phase 7 binary verifier (§D.6) runs on every DCE'd output in CI:

- All RFVAR targets are reachable
- Method-table offsets point to valid bytecodes
- Sub-object table is consistent
- Checksum matches
- pgmsize and varsize are coherent
- No bytecode references a stale (pre-renumbering) index
- For DCE'd binaries: every retained method is reachable from a root

A failure in any of these is a hard fail — DCE has produced an invalid binary. This catches the "renumbering bug" risk class explicitly.

### E.3 Hardware-vs-simulator execution

Hardware execution is the gold standard for correctness validation, but slow and expensive in CI. A practical tiered approach:

**Tier 1 (every PR, every CI run):** Static checks only — verifier (Category 6), GOLD file comparison for non-DCE compilation, identity-test for "no dead code" cases. Fast (seconds), catches most regression bugs.

**Tier 2 (nightly):** Simulator execution. Run T_orig and T_dce in the P2 simulator, compare outputs/timing. Catches behavioral differences. ~minutes-to-hour for the full corpus.

**Tier 3 (release-candidate):** Hardware execution on a real P2 fixture. Same comparison. Catches anything the simulator misses (timing, smart-pin behavior). ~hours, manual or automated rig.

The DCE feature should be considered "ready for stable release" only after Tier 3 passes on the entire DCE-targeted corpus.

### E.4 Telemetry as a test surface

When `pnut_ts --dce` is invoked, it produces a `.report` file (per §5 file-naming convention). The report content is itself a test target:

```
For each DCE-targeted test with known-expected savings:
  Run --dce, parse the .report
  Assert: report.methods_eliminated == expected_count
  Assert: report.child_objects_eliminated == expected_count
  Assert: report.bytes_saved is within ±5% of expected
```

This catches the "DCE correctness is fine but the *reporting* drifted" failure mode, which would otherwise be silent.

### E.5 GOLD file strategy

GOLD files are sacred for non-DCE compilation. For DCE:

- **Non-DCE compilation must continue to produce byte-identical output** — DCE is opt-in, default is unchanged. GOLD files for non-DCE testing are unaffected.
- **For DCE-targeted tests, generate `.dce.GOLD` files** for each (.lst, .obj, .bin). These are the authoritative DCE output for that test, generated from the verified-correct DCE implementation. Updated only when the implementation changes intentionally.
- **GOLD file generation for DCE outputs is Linux/cross-platform** (PNut-TS-only) — there is no Windows-PNut equivalent for DCE'd output, since PNut.exe doesn't do DCE. This is the one departure from the existing GOLD file convention (where GOLDs are generated only on Windows from PNut_shell).

### E.6 Regression testing checklist

Before DCE can ship as stable:

- [ ] All 250 existing regression tests pass with `--dce` flag.
- [ ] Identity property holds: no-dead-code tests produce byte-identical output with/without DCE.
- [ ] DCE-targeted test suite (Category 3) all pass with expected savings.
- [ ] Binary post-processor (Category 4) handles PNut.exe-produced binaries correctly.
- [ ] Random testing (Category 5) for at least 10,000 generated programs without correctness failures.
- [ ] Verifier (Category 6) passes on every DCE'd output.
- [ ] Hardware execution (Tier 3) on full DCE-targeted corpus passes.
- [ ] Method-pointer escape tests (taking `@@method`, SEND/RECV, COGSPIN, TASKSPIN) all retain the right methods.
- [ ] RFVAR cascade tests pass: programs that trigger length-boundary changes converge in fix-point and produce valid binaries.
- [ ] Distillation interaction tests pass: programs where DCE makes child objects mergeable get re-distilled correctly.

### E.7 Continuous regression after ship

Once DCE ships, every reported bug becomes a new test in the corpus. The corpus grows; coverage strengthens. This is how every robust optimizer evolves — the test suite is the institutional memory of bugs that have been fixed.

---

*Document created: 2026-04-09*
*Addendum added: 2026-04-27*
*Doability deep-dive and regression testing added: 2026-05-01*
*Based on analysis of PNut-TS codebase at commit b31ef59 and PNut v52a reference source*
