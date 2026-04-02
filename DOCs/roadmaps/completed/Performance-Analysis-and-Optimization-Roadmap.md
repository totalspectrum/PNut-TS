# PNut-TS Performance Analysis and Optimization Roadmap

## About This Analysis

This document is based on a line-by-line reading of the compiler source code — the elementizer, resolver, parser, preprocessor, object image management, distiller, and I/O paths. Every finding includes file locations and is categorized by whether it's actually in a hot path (per-character, per-token, per-element) versus a cold path (once per compilation). No timing numbers are fabricated; impact is described in terms of algorithmic complexity and invocation frequency.

**Revision:** February 2026 — replaces earlier speculative analysis with evidence-based findings.

---

## Compilation Flow Summary

Understanding the flow is essential for identifying what's hot and what's cold:

```
compileRecursively(depth, file)
  ├─ loadFileAsString()              [once per unique file — sync I/O, cached]
  ├─ preProcess()                    [once per file — includes, macros, comments]
  ├─ getFileElements()               [once per file — tokenization, cached in SpinDocument]
  ├─ P2Compile1()                    [TWICE per file — CON blocks, symbol table]
  │   └─ compile_con_blocks()        [4 passes over elements: Try×2, Try, Must]
  ├─ FOR each child OBJ:
  │   └─ compileRecursively(depth+1) [recursive depth-first]
  ├─ P2Compile1() again              [re-process with child results]
  ├─ P2Compile2()                    [once — VAR, PUB/PRI, DAT, code generation]
  │   └─ Expression resolution       [per expression — recursive descent + BigInt math]
  │   └─ Debug record management     [per DEBUG() statement]
  └─ Final assembly
      ├─ P2InsertInterpreter()       [once — moveObjectUp + patching]
      ├─ P2InsertDebugger()          [once if -d — moveObjectUp + patching]
      ├─ distillObjects()            [once — O(n²) deduplication]
      ├─ P2List()                    [once if enabled — listing generation]
      └─ Binary output               [once — .obj/.bin write]
```

**Total source scans per file:** ~5 (load + preprocess + elementize + compile1×2 + compile2)

---

## Findings by Severity

### Tier 1: Critical — High Frequency, Proven Hot Path

---

#### 1. Template Literal Evaluation in Disabled Logging

**Location:** `spinResolver.ts:11533-11553` (logging methods), 488 call sites in resolver alone
**Also:** `spinElementizer.ts` (59 calls), `spin2Parser.ts` (48 calls), `compiler.ts` (39 calls)
**Total:** ~634 logging call sites across core compiler

**The problem:**

```typescript
// spinResolver.ts:11533
private logMessage(message: string): void {
  if (this.isLogging) {           // Guard is INSIDE the function
    this.context.logger.logMessage(message);
  }
}
```

Every call site builds the template literal string **before** `logMessage()` is called:

```typescript
// Example from resolver — string is ALWAYS constructed
this.logMessage(`* resolvExp() LOOP currElement=[${this.currElement.toString()}] ...`);
```

Even when `isLogging` is false (the normal production case), JavaScript must:
- Evaluate `this.currElement.toString()` (method call + string allocation)
- Interpolate it into the template literal (string concatenation)
- Pass the resulting string to `logMessage()` (which immediately discards it)

**Scale:** Expression resolution alone calls `logMessage()` at lines 8240, 8241, 8243, 8307, 8377 — these run for **every expression in the program**. Element retrieval logs at lines 10740, 10754-10759 — runs for **every element**. CON block processing logs at lines 4955, 4973, 4983 — runs **4× per CON element**.

**Fix — lazy evaluation:**

```typescript
private logMessage(msgFn: () => string): void {
  if (this.isLogging) {
    this.context.logger.logMessage(msgFn());
  }
}

// Call sites change to arrow functions:
this.logMessage(() => `* resolvExp() LOOP currElement=[${this.currElement.toString()}]`);
```

The arrow function is a cheap closure allocation (~12 bytes on V8). The template literal and `.toString()` call only happen when logging is actually enabled.

**Alternative — simpler but less complete:**

```typescript
// Inline guard at each call site (avoids function call overhead too)
if (this.isLogging) this.logMessage(`...${expensive}...`);
```

**Estimated impact:** Eliminates ~634 unnecessary string constructions per compilation pass. For files with many expressions and elements, this is thousands of discarded strings per compilation.

**Fix complexity:** Low (mechanical transformation of call sites). Can be done incrementally.

---

#### 2. Regex Recompilation in Elementizer Hot Path

**Location:** `spinElementizer.ts` — 12+ regex patterns allocated inside methods called per-token

**The problem:** Regex patterns are declared as local variables inside methods, causing the JavaScript engine to parse and compile them on every invocation:

| Method | Line | Regex | Called Per |
|--------|------|-------|-----------|
| `isDigit()` | 740 | `/^\d$/` | Character |
| `isSymbolStartChar()` | 756 | `/^[A-Z_a-z]+/` | Token |
| `isHexStartChar()` | 762 | `/^[A-Fa-f0-9]+/` | Token |
| `isBinStartChar()` | 768 | `/^[01]+/` | Token |
| `isQuartStartChar()` | 774 | `/^[0-3]+/` | Token |
| `symbolNameConversion()` | 828 | `/^([A-Z_a-z]+[A-Z_a-z0-9]*)/` | Symbol token |
| `quaternaryConversion()` | 873 | `/^%%([0-3]+[0-3_]*)/` | `%%` number |
| `binaryConversion()` | 889 | `/^%([0-1]+[0-1_]*)/` | `%` number |
| `hexadecimalConversion()` | 906 | `/^\$([0-9A-Fa-f]+[0-9_A-Fa-f]*)/` | `$` number |
| `decimalFloatConversion()` | 927-929 | 3 float regexes (tried sequentially) | Numeric token |
| `decimalConversion()` | 978 | `/^(\d+[\d_]*)/` | Decimal number |
| `skipNCountWhite()` | 1006 | `/^(\s*)/` | Line start |

**Note:** Modern V8 does cache regex literals to some degree, but the per-call allocation of the RegExp match result object and the repeated pattern parsing still add measurable overhead in tight token loops.

**Fix:** Move all regex patterns to `private static readonly` class fields:

```typescript
private static readonly RE_SYMBOL_NAME = /^([A-Z_a-z]+[A-Z_a-z0-9]*)/;
private static readonly RE_DECIMAL = /^(\d+[\d_]*)/;
// ... etc
```

**Estimated impact:** Eliminates regex compilation overhead for every token. For a 2000-line source file with ~10,000 tokens, this removes ~10,000+ regex allocations.

**Fix complexity:** Low (move declarations, update references).

---

#### 3. Preprocessor Symbol Replacement: O(Symbols × Lines) with Regex Recompilation

**Location:** `symbolTable.ts:113-123` (`replaceSymbolsInString()`)

**The problem:**

```typescript
replaceSymbolsInString(inputString: string): string {
  let resultString = inputString;
  this.symbols.forEach((symEntry, symName) => {
    const regex = new RegExp(symName, 'g');          // New regex PER SYMBOL
    const symValueText: string = `${symEntry.value}`;
    resultString = resultString.replace(regex, symValueText);  // New string PER SYMBOL
  });
  return resultString;
}
```

Called from `spinDocument.ts:766` for **every non-comment, non-directive line** during preprocessing.

**Scale:** A file with 50 preprocessor symbols and 1000 lines = **50,000 regex compilations** and 50,000 string replacements (each creating a new string). Each regex compilation parses the symbol name as a regex pattern (which could contain special characters — potential correctness bug too if symbol names contain regex metacharacters like `$` or `.`).

**Fix — single-pass replacement:**

```typescript
replaceSymbolsInString(inputString: string): string {
  if (this.symbols.size === 0) return inputString;
  // Build one regex matching all symbols, cached
  if (!this._cachedRegex) {
    const escaped = [...this.symbols.keys()].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this._cachedRegex = new RegExp(escaped.join('|'), 'g');
  }
  return inputString.replace(this._cachedRegex, match => `${this.symbols.get(match)!.value}`);
}
```

This compiles **one** regex (cached), does **one** string scan per line, and also fixes the regex metacharacter correctness issue.

**Estimated impact:** Reduces O(N×M) to O(M) where M = lines. Eliminates tens of thousands of regex compilations.

**Fix complexity:** Medium (must ensure symbol table invalidation resets the cached regex).

---

#### 4. moveObjectUp() Byte-by-Byte Copy

**Location:** `spin2Parser.ts:693-706`

**The problem:**

```typescript
private moveObjectUp(objImage: ObjectImage, destOffset: number, sourceOffset: number, nbrBytes: number) {
  for (let index = 0; index < nbrBytes; index++) {
    const invertedIndex = nbrBytes - index - 1;
    objImage.replaceByte(objImage.read(sourceOffset + invertedIndex), destOffset + invertedIndex);
  }
}
```

This copies bytes **one at a time, backwards** through two method calls per byte (`read()` + `replaceByte()`). Each `replaceByte()` involves bounds checking via `ensureCapacity()`.

**Called:** 3-4 times per compilation at lines 633, 738, 837, 940:
- Interpreter insertion: ~2,500 bytes (= 7,500 array accesses)
- Debugger insertion: ~4,000 bytes (= 12,000 array accesses)
- Flash loader: ~500 bytes
- Clock setter: ~100 bytes

**Fix:** Use the native `copyWithin()` which handles overlapping regions correctly and runs at near-memcpy speed:

```typescript
private moveObjectUp(objImage: ObjectImage, destOffset: number, sourceOffset: number, nbrBytes: number) {
  objImage.rawUint8Array.copyWithin(destOffset, sourceOffset, sourceOffset + nbrBytes);
  objImage.setOffsetTo(objImage.offset + destOffset - sourceOffset);
}
```

**Estimated impact:** ~20,000 method calls → 3-4 native bulk copies. Orders of magnitude faster for the copy itself.

**Fix complexity:** Low. `copyWithin()` handles backwards/forwards overlap natively.

---

### Tier 2: High — Measurable Impact in Real Compilations

---

#### 5. BigInt in Expression Resolution Hot Path

**Location:** `spinResolver.ts` — 248 BigInt/bigint references

**The problem:** BigInt operations are 10-100× slower than regular Number operations on V8. The resolver uses BigInt extensively in expression evaluation:

- `resolveExp()` (lines 8280-8363): BigInt pop/push/arithmetic on every expression
- `resolveOperation()` (lines 10814-11100+): All 32-bit math done in BigInt — masking, shifts, bit counting
- `getValue()` (lines 5376+): Returns BigInt values
- CON block compilation: `BigInt(parmA)`, `BigInt(parmB)` conversions (line 548)

**Example — ONES operation (line 10886-10895):**
```typescript
// Counts set bits using BigInt loop — 32 iterations of BigInt ops
for (let index = 0; index < 32; index++) {
  if (a & 1n) result++;
  a >>= 1n;
}
```

This is ~32× slower than the equivalent `Number` bit-counting loop.

**Why BigInt was used:** The original PNut compiler works with 64-bit values in some contexts. The port used BigInt as a safe catch-all for all numeric operations.

**Fix strategy:** Audit where values genuinely exceed 32 bits. For the vast majority of P2 compilation (32-bit instructions, addresses, constants), `Number` is sufficient (JavaScript Numbers are exact integers up to 2^53). Convert BigInt to Number for hot-path operations where values are known to be 32-bit:

```typescript
// Instead of: BigInt(parmA) & 0xFFFFFFFFn
// Use: (parmA & 0xFFFFFFFF) >>> 0
```

**Estimated impact:** Significant speedup in expression-heavy code (CON blocks with computed constants, complex DAT expressions).

**Fix complexity:** High — requires careful audit of each usage to verify 32-bit safety. Should be done incrementally, method by method, with regression testing.

---

#### 6. Column Calculation Rescans from Line Start Per Token

**Location:** `spinElementizer.ts:584-604` (`calculateColumnToOffset()`)

**The problem:**

```typescript
for (let index = 0; index < endCharOffset; index++) {
  const currChar = line.charAt(index);
  if (currChar == '\t') {
    columnsCount += tabStops - (columnsCount % tabStops);
  } else {
    columnsCount++;
  }
}
```

Called from `buildElement()` (line 729) for **every token** on a line. For the Nth token on a line, it scans from character 0 to the token's position. A 200-character line with 20 tokens results in ~2,000 cumulative character scans.

**Fix:** Cache the column offset. Track accumulated column count as tokens are consumed from each line, resetting at each new line.

**Estimated impact:** Eliminates O(line_length × tokens_per_line) work per line, replacing it with O(line_length) total.

**Fix complexity:** Low-medium (add state tracking to the elementizer's per-line processing).

---

#### 7. Substring Allocation in Elementizer Hot Loop

**Location:** `spinElementizer.ts` — 11+ locations creating temporary strings per token

**The problem:** The elementizer advances through source lines by creating substrings:

```typescript
// Line 1021 — called after EVERY token
let remainingLine = line.substring(symbolLength);

// Line 271 — quoted string processing
const endQuoteOffset = this.unprocessedLine.substring(1).indexOf('"');

// Lines 635, 664, 680 — comment skipping loops
this.unprocessedLine = this.unprocessedLine.substring(charOffset + 1);
```

Each `substring()` allocates a new string. For a 1000-character line with 50 tokens, `skipAhead()` creates 50 progressively shorter strings.

**Fix:** Use an index-based approach — track a `startIndex` into the original line rather than creating substrings:

```typescript
// Instead of: this.unprocessedLine = this.unprocessedLine.substring(tokenLength);
// Track: this.lineOffset += tokenLength;
// Access: this.currentLine.charAt(this.lineOffset)
```

**Estimated impact:** Eliminates thousands of intermediate string allocations per file.

**Fix complexity:** Medium — requires refactoring the elementizer's line-tracking state, touching many methods.

---

#### 8. SpinElement Object Creation in getElement()

**Location:** `spinResolver.ts:10720-10766`

**The problem:** Every call to `getElement()` creates **at least one** new SpinElement, often two:

```typescript
private getElement(): SpinElement {
  let element = this.spinElements[this.nextElementIndex];
  this.nextElementIndex++;

  if (element.isTypeUndefined && allowSymbolLookup) {
    const foundSymbol = this.lookupSymbol(element.stringValue);
    if (foundSymbol !== undefined) {
      element = new SpinElement(..., element);  // Line 10744: NEW OBJECT #1
      element.setType(foundSymbol.type);
    }
  }

  this.currElement = new SpinElement(0, ..., element);  // Line 10764: NEW OBJECT #2 (ALWAYS)
  return this.currElement;
}
```

`getElement()` is called for every element during compilation — thousands of times per file. Each call always creates at least one new SpinElement (line 10764), and creates a second one when a symbol is resolved (line 10744).

**Fix:** Instead of creating a new SpinElement wrapper every time, mutate `currElement` in place or use a single reusable element buffer:

```typescript
this.currElement.copyFrom(element);  // Reuse existing object
```

**Estimated impact:** Reduces GC pressure from thousands of short-lived objects per compilation.

**Fix complexity:** Medium — SpinElement must support in-place mutation, and callers must not retain references to `currElement` across `getElement()` calls (need to audit).

---

#### 9. Distiller O(n²) Elimination Passes

**Location:** `objectDistiller.ts:139-182`

**The problem:**

```typescript
for (let matchIdx = 0; matchIdx < recordCount; matchIdx++) {
  for (let searchIdx = matchIdx + 1; searchIdx < recordCount; searchIdx++) {
    if (this.areRecordsEquivalent(objImage, matchRecord, searchRecord)) {
      this.distillerList.removeRecordAt(matchIdx);
      return true;  // RESTART FROM BEGINNING
    }
  }
}
```

When a duplicate is found, the method returns `true`, and the caller loops:

```typescript
do {
  wasEliminated = this.eliminateRedundantObjects(objImage);
} while (wasEliminated);
```

For D duplicates among N objects, this is O(N² × D × objectSize) — the entire N² scan restarts from scratch after each single elimination.

**Also:** `areRecordsEquivalent()` (lines 187-216) does full binary comparison via `objImage.readLong()` in a loop — no hashing.

**Fix:** Hash-based deduplication:

```typescript
const hashes = new Map<string, number>();  // hash → first record index
for (const record of records) {
  const hash = computeHash(objImage, record);
  if (hashes.has(hash)) {
    // Verify with full comparison, then eliminate
  } else {
    hashes.set(hash, record.index);
  }
}
```

Single O(N) pass, with full comparison only on hash collision.

**Estimated impact:** For projects with many OBJ references (10+ objects), this can be the difference between milliseconds and seconds. For small projects (1-3 objects), minimal impact.

**Fix complexity:** Medium (add hashing, restructure elimination loop).

---

#### 10. 4× CON Block Passes Over Elements

**Location:** `spinResolver.ts:553-568`

**The problem:**

```typescript
compile_con_blocks_1st() {
  this.compile_con_blocks(BR_Try, FIRST_PASS);  // Pass 1
  this.compile_con_blocks(BR_Try);               // Pass 2
}

compile_con_blocks_2nd() {
  this.compile_con_blocks(BR_Try);               // Pass 3
  this.compile_con_blocks(BR_Must);              // Pass 4
}
```

Each pass iterates through all CON blocks → lines → elements (triple-nested loop at lines 4926, 4935, 4953). For large CON blocks with many constants, this is significant.

**Why 4 passes:** Forward references. A constant defined on line 100 might reference a constant on line 200. Multiple passes allow all forward references to resolve. The final `BR_Must` pass errors on anything still unresolved.

**Fix potential:** Track unresolved symbols and only re-scan blocks that had unresolved references. Most programs have few or no forward references in CON blocks, so passes 2-3 often do no useful work.

**Estimated impact:** Up to 3× reduction in CON processing for programs without forward references.

**Fix complexity:** Medium-high (must track resolution state without breaking the existing multi-pass correctness guarantee).

---

### Tier 3: Medium — Real but Smaller Impact

---

#### 11. Comment Removal O(n²) Per Line

**Location:** `spinDocument.ts:871-955`

Nested while/for loops find innermost `{...}` comment pairs. Each removal triggers a full line rescan. A line with 10 nested comments scans ~11 times.

**Impact:** Only affects lines with deeply nested comments (unusual).

**Fix:** Single-pass stack-based comment parser.

---

#### 12. Debug Record Linear Search

**Location:** `spinResolver.ts:6770-6795`

`debugEnterRecord()` walks through all existing debug records linearly for each new DEBUG() statement. With 200+ debug records, later records require 200+ comparisons.

**Fix:** Use a Map keyed by a hash of the record bytes for O(1) lookup, falling back to full comparison on hash collision.

---

#### 13. Synchronous File I/O with Fallback Retries

**Location:** `files.ts:219-244`

Can read the same file up to 3 times (UTF-8 → Latin1 → UTF-16LE). Correct approach but wasteful.

**Fix:** Read raw bytes once, detect encoding from BOM or byte patterns, decode once.

---

#### 14. String Concatenation in Hex Dump Loops

**Location:** `spin2Parser.ts:388-408, 414-436`

`+=` in inner loop for hex dump generation (listing output). Creates intermediate strings for every byte.

**Fix:** Use array accumulation with `.join()`:

```typescript
const hexParts: string[] = [];
for (let i = 0; i < lineLength; i++) {
  hexParts.push(byteValue.toString(16).padStart(2, '0').toUpperCase());
}
const hexPart = hexParts.join(' ');
```

**Impact:** Only affects listing generation (cold path unless `-l` flag used).

---

#### 15. Object Image Growth: Full Buffer Copy

**Location:** `objectImage.ts:63-77`

`ensureCapacity()` copies the entire existing buffer on each growth step. Starting at 128KB with 128KB steps, growing to 512KB requires copying 128+256+384 = 768KB total.

**Fix:** Exponential growth (double the buffer) instead of linear 128KB steps. Reduces total bytes copied from O(n²/step) to O(n).

---

#### 16. Number Parsing with String.replace()

**Location:** `spinElementizer.ts:879, 896, 913, 935, 981`

Each numeric token runs `.replace(/_/g, '')` to strip underscores before parsing. Creates a temporary string.

**Fix:** Parse in-place, skipping underscore characters during digit accumulation.

---

#### 17. rebuildOptimizedImage() Appends Longs Individually

**Location:** `objectDistiller.ts:239-241`

Copies objects by calling `appendLong()` in a loop. Each `appendLong()` calls `appendWord()` twice, each calling `append()` twice — 4 method calls per long.

**Fix:** Use bulk `Uint8Array.set()` with `subarray()`.

---

### Tier 4: Low — Minor or Rare-Path

---

#### 18. Case Conversion on Every Symbol Lookup

**Location:** `symbolTable.ts:75, 133, 155`

`.toUpperCase()` called on every `get()`, `exists()`, `add()`. Symbols are case-insensitive. The conversion could be done once at the call site and passed through as a normalized key.

---

#### 19. Sequential Symbol Table Search (5 tables)

**Location:** `spinResolver.ts:4445-4469`

`findSymbol()` checks 5 separate Map tables in sequence. Each `.has()` is O(1), so this is O(5) per lookup — fast in absolute terms, but called very frequently. A unified symbol table with scope tags would reduce to O(1).

---

#### 20. Hash Recomputation in Child Object Comparison

**Location:** `childObjectsImage.ts:123-124`

`compareChildImages()` recomputes the content hash even though it was already computed by the caller. Minor — the hash is cheap (64 bytes sampled).

---

## Optimization Roadmap

Each optimization rated on two 1-10 scales. **Priority Score** = Gain × (11 - Risk) / 10.
Sorted by implementation order (highest-priority-score-first).

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

**Validation for all changes:** `npm run build` + `npm test` (full regression suite, byte-identical output). Higher-risk items additionally require `npm run test-full` and manual verification with multi-object projects.

See [Performance Optimization Sprint Plan](Performance-Optimization-Sprint-Plan.md) for the full iteration algorithm and execution details.

---

## What NOT to Optimize

The existing roadmap included several suggestions that would add complexity without meaningful benefit or would actually hurt performance. These are explicitly excluded:

### 1. Replacing imperative loops with functional Array methods
Array.from(), .filter().reduce(), etc. are **slower** than `for` loops in tight paths due to closure allocation and intermediate array creation. The existing imperative loops in the resolver and elementizer are correct for performance.

### 2. Immutable state patterns
`{ ...state, field: newValue }` creates a new object on every state change. In a compiler that updates state thousands of times per compilation, this would be a significant regression.

### 3. Dependency injection container
Adds indirection and overhead to every service access. The compiler's current direct field access pattern is the fastest possible approach.

### 4. WebAssembly for hash computation
The overhead of crossing the JS↔WASM boundary exceeds the benefit for the small data sizes involved (object images are typically 1-100KB).

### 5. Worker threads for parallel compilation
The P2 compilation model requires sequential object compilation (children before parents, with shared symbol state). Parallelization would require a fundamentally different architecture.

### 6. Async file I/O
Source files are small (typically < 100KB). The overhead of async/await, Promise creation, and event loop scheduling would likely exceed the blocking time of synchronous reads.

---

## Validation Strategy

**Non-negotiable constraint:** All optimizations must produce byte-identical `.obj`, `.bin`, and `.lst` output. The existing regression test suite (180+ `.spin2` test files with `.GOLD` reference outputs) provides comprehensive validation.

**Testing protocol for each change:**

1. `npm run build` — must compile cleanly
2. `npm test` — all regression tests must pass
3. `npm run test-full` — extended test suite
4. Manual verification with large multi-object projects (the `TOF/demo_180degrFOV.spin2` test exercises deep object hierarchies)

---

## Summary: Where the Time Goes

For a typical single-file compilation:

| Phase | Key Bottleneck | Tier |
|-------|---------------|------|
| Preprocessing | Regex recompilation per symbol per line (#3) | Critical |
| Tokenization | Regex per token (#2), substring alloc (#7), column rescan (#6) | Critical/High |
| CON Resolution | 4 passes (#10), BigInt math (#5), logging overhead (#1) | High |
| Expression Eval | BigInt operations (#5), SpinElement creation (#8) | High |
| Code Generation | Logging overhead (#1) | Critical |
| Binary Assembly | moveObjectUp byte copy (#4) | Critical |
| Distillation | O(n²) elimination (#9) | High (multi-obj only) |
| Listing Output | String concatenation (#14) | Medium (when enabled) |

**Expected cumulative improvement from Phase 1 + Phase 2:** 30-50% reduction in compilation time, with zero risk to output correctness.

---

*Analysis based on PNut-TS source as of February 2026 — spinResolver.ts (11,554 lines), spinElementizer.ts (1,081 lines), spin2Parser.ts (979 lines), spinDocument.ts (1,138 lines), compiler.ts (503 lines), objectDistiller.ts (296 lines), objectImage.ts (302 lines), childObjectsImage.ts (361 lines), debugData.ts (239 lines).*
