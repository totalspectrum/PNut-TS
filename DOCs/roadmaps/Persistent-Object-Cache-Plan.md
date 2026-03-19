# Persistent Object Cache — Implementation Plan

## Problem Statement

When running a suite of regression tests (or any batch of compilations), many test files reference the same child object (e.g., a large hardware driver). Each `pnut-ts` invocation recompiles that child object from scratch, even though the source, overrides, and compiler version are identical across runs.

**Example:** 20 test files each include `big_driver.spin2` → 20 full compilations of the driver. With caching: 1 compilation on first run, 0 on subsequent runs.

This also handles **variant scenarios** naturally: if 17 tests use no overrides, 2 use `| MODE = 1`, and 1 uses `| MODE = 2`, the cache stores 3 entries (one per unique combination). All subsequent runs hit cache for all 20 tests.

---

## Design

### Core Concept: Content-Addressed Disk Cache

The cache is **content-addressed**, not name-addressed. The key is a cryptographic hash of everything that affects the compiled output. If any input changes, the hash changes, and the cache misses — making stale hits impossible by construction.

### Cache Key

```
SHA-256(
  preprocessed_source_text    // all lines after #include expansion
  + parameter_overrides       // sorted "NAME:TYPE:VALUE" pairs
  + compiler_version          // e.g., "1.52.2"
)
```

**Why each component:**

| Component | Why It's in the Key |
|-----------|-------------------|
| Preprocessed source text | Captures the source file AND all `#include` contents (since includes are expanded inline during preprocessing) |
| Parameter overrides | `OBJ driver : "file" \| CONST=100` vs `CONST=200` produce different binaries |
| Compiler version | Prevents stale cache when the compiler itself changes |

**Why preprocessed text (not raw source)?** The `SpinDocument` preprocessor expands `#include` directives inline. By hashing the preprocessed output, we automatically capture the transitive closure of all included files without needing to track include dependencies separately.

### Cache Storage

```
.pnut-cache/
  a3f7c2...bin      # compiled binary (Uint8Array)
  a3f7c2...meta     # JSON metadata (optional, for debugging/diagnostics)
  b8e1d4...bin
  b8e1d4...meta
```

- Flat directory, no nesting needed (SHA-256 has no collision risk)
- `.meta` files contain: source filename, override summary, timestamp, compiler version, binary size
- `.meta` files are optional — the `.bin` is sufficient for cache hits
- Add `.pnut-cache/` to `.gitignore`

### CLI Interface

**Two flags:**

| Flag | Behavior |
|------|----------|
| `--cache` (or `-C`) | Enable caching — both reads and writes. On miss: compile normally and store result. On hit: skip compilation, use cached binary. |
| `--cache-clear` | Delete all entries from `.pnut-cache/` before starting compilation. Combinable with `--cache` to start fresh but cache this run's results. |

**Usage examples:**
```bash
# Normal batch run — first invocation builds cache, rest use it
pnut-ts --cache test1.spin2
pnut-ts --cache test2.spin2   # driver hits cache
...
pnut-ts --cache test20.spin2  # driver hits cache

# Start fresh (e.g., after suspecting corruption, or reclaiming disk)
pnut-ts --cache --cache-clear test1.spin2

# Manual cache wipe (equivalent alternative)
rm -rf .pnut-cache/
```

**Why not separate `--cache-build` / `--cache-use` flags?** A combined read+write flag is simpler and covers all use cases. The first invocation that encounters a new object populates the cache; subsequent invocations use it. No need for the user to plan which runs build vs. consume.

### Cache Location

The `.pnut-cache/` directory is created in the **current working directory** (where `pnut-ts` is invoked). This keeps caches local to projects and avoids cross-project contamination.

Alternative considered: `~/.pnut-ts/cache/` (global). Rejected because different projects may have different source trees, and a global cache would need project-scoping logic.

---

## Implementation

### Phase 1: Cache Infrastructure (New File)

**New file: `src/classes/objectCache.ts`**

```typescript
// Pseudocode — final implementation will follow project conventions

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class ObjectCache {
  private cacheDir: string;
  private enabled: boolean;
  private hits: number = 0;
  private misses: number = 0;

  constructor(enabled: boolean, cacheDir: string = '.pnut-cache') {
    this.enabled = enabled;
    this.cacheDir = cacheDir;
    if (enabled && !fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /** Compute cache key from preprocessed source + overrides + version */
  computeKey(
    preprocessedLines: TextLine[],
    overrides: SymbolTable | undefined,
    compilerVersion: string
  ): string {
    const hash = crypto.createHash('sha256');
    // Hash all preprocessed source lines
    for (const line of preprocessedLines) {
      hash.update(line.text);
      hash.update('\n');
    }
    // Hash sorted overrides
    if (overrides) {
      const entries = overrides.allSymbols()  // needs API addition
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const sym of entries) {
        hash.update(`${sym.name}:${sym.type}:${sym.value}`);
      }
    }
    // Hash compiler version
    hash.update(`v:${compilerVersion}`);
    return hash.digest('hex');
  }

  /** Check cache for a compiled object */
  get(key: string): Uint8Array | undefined {
    if (!this.enabled) return undefined;
    const binPath = path.join(this.cacheDir, `${key}.bin`);
    if (fs.existsSync(binPath)) {
      this.hits++;
      return new Uint8Array(fs.readFileSync(binPath));
    }
    this.misses++;
    return undefined;
  }

  /** Store a compiled object in cache */
  set(key: string, binary: Uint8Array, metadata?: object): void {
    if (!this.enabled) return;
    const binPath = path.join(this.cacheDir, `${key}.bin`);
    fs.writeFileSync(binPath, binary);
    if (metadata) {
      const metaPath = path.join(this.cacheDir, `${key}.meta`);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    }
  }

  /** Clear all cache entries */
  clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true });
    }
  }

  /** Report cache statistics */
  get stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}
```

### Phase 2: SymbolTable API Addition

**File: `src/classes/symbolTable.ts`**

The `SymbolTable` class needs a method to iterate all symbols for serialization. Check if one exists; if not, add:

```typescript
/** Return all symbols for serialization (cache key computation) */
public allSymbols(): iSymbol[] {
  return Array.from(this.symbols.values()).map(entry => ({
    name: entry.name,
    type: entry.type,
    value: entry.value
  }));
}
```

### Phase 3: CLI Flags

**File: `src/pnut-ts.ts`**

Add Commander.js options:

```typescript
.option('-C, --cache', 'Enable object compilation cache')
.option('--cache-clear', 'Clear object cache before compiling')
```

Wire into `Context` so the compiler can check `context.compileOptions.cache` and `context.compileOptions.cacheClear`.

### Phase 4: Compiler Integration

**File: `src/classes/compiler.ts`**

The cache check goes in `compileRecursively()`, wrapping the compilation of child objects (`depth > 0`).

**Insertion point:** After line 175 (`setSourceFile`), before line 181 (`P2Compile1`).

```
compileRecursively(depth, srcFile, overrideParameters):

    // --- CACHE CHECK (new code) ---
    if (cacheEnabled && depth > 0) {
        key = objectCache.computeKey(
            srcFile.allPreprocessedLines,
            overrideParameters,
            compilerVersion
        )
        cachedBinary = objectCache.get(key)
        if (cachedBinary) {
            // Inject into childImages (same logic as the non-duplicate
            // path at lines 324-339, but using cached binary)
            injectCachedChild(cachedBinary)
            return   // SKIP P2Compile1 + P2Compile2 entirely
        }
    }
    // --- END CACHE CHECK ---

    // ... existing P2Compile1, child recursion, P2Compile2 ...

    // --- CACHE STORE (new code, after line 305) ---
    if (cacheEnabled && depth > 0) {
        objectCache.set(key, childImage, {
            source: srcFile.fileName,
            overrides: serializeOverrides(overrideParameters),
            timestamp: Date.now()
        })
    }
    // --- END CACHE STORE ---
```

### Phase 5: Handling Recursive Children

**Important subtlety:** When we get a cache hit on a child object, that child may itself have had sub-children. The cached `.bin` already contains the fully resolved binary (post-`P2Compile2`), so sub-children are already incorporated. We do NOT need to recursively compile the child's children — that's the whole point.

However, we must still:
1. Increment `globalLogicalIndexCounter` (to keep the parent's index mapping correct)
2. Map the logical index to the physical index in `childImages`
3. Run the duplicate detection (`findDuplicateChild`) on the cached binary — it may match another child already in this compilation's `childImages`

### Phase 6: Cache Statistics Reporting

When `--cache` is active, report stats at end of compilation:

```
Object cache: 3 hits, 1 miss (.pnut-cache/)
```

Use same logging pattern as existing `logDuplicationStats()`.

---

## Critical Considerations

### What About the Symbol Table for Map Files?

At lines 293-298 of `compiler.ts`, after `P2Compile2`, the compiler stores user symbols for map file generation:

```typescript
const symbols = this.spin2Parser.getUserSymbolTable();
this.context.objectSymbolStore.storeSymbols(fileIndex, symbols);
```

**Options:**
1. **Cache the symbol table alongside the binary.** Serialize symbols to JSON in the `.meta` file. Restore on cache hit.
2. **Skip map symbols on cache hit.** Map file generation for cached children would show the object name but no internal symbol details. Acceptable for a first implementation.
3. **Always generate map from uncached compilation.** If the user needs a map, run without `--cache`.

**Recommendation:** Start with option 2 (skip symbols on cache hit). Add option 1 later if map file fidelity for cached objects matters.

### What About `spinFiles` State?

`P2Compile1` populates `spinFiles.objFiles` and `spinFiles.datFiles` as a side effect. When skipping compilation via cache hit, these won't be populated. This is fine because:
- The cached binary already includes all sub-objects (fully linked)
- The parent only needs the binary blob, not the child's internal structure

However, `ObjFile.setSpinSourceFileId()` at line 204 must still be called for source tracking. This needs attention during implementation — the child's SpinDocument must still be loaded into `context.sourceFiles` even on a cache hit.

### Thread Safety / Parallel Builds

Not a concern for now. `pnut-ts` is single-threaded. If parallel compilation is ever added, the cache would need file-level locking (e.g., write to `.tmp` then atomic rename).

### Cache Size Management

No automatic eviction in the first implementation. The cache is self-limiting:
- Each entry ≈ size of one compiled object (typically 1-100 KB)
- 100 unique objects × 100 KB = ~10 MB max — negligible
- `--cache-clear` provides manual cleanup
- Future: could add LRU eviction or max-size limit if needed

---

## Testing Strategy

### Unit Tests

1. **Cache key stability:** Same inputs → same key. Different inputs → different key.
2. **Cache round-trip:** Store binary, retrieve binary, verify byte-identical.
3. **Override sensitivity:** Same source with different overrides → different keys.
4. **Version sensitivity:** Same source with different compiler version → different keys.

### Integration Tests

5. **Cache miss path:** First compilation of a child object stores to cache.
6. **Cache hit path:** Second compilation of same child object reads from cache, produces identical output.
7. **Mixed overrides:** Multiple variants cached and retrieved correctly.
8. **Cache clear:** `--cache-clear` removes all entries, next run recompiles.

### Regression Validation

9. **Binary equivalence:** Run full test suite WITHOUT `--cache`, save outputs. Run WITH `--cache`, compare outputs. Must be byte-identical.
10. **This is the critical test.** Any difference means the cache is returning incorrect results.

---

## Implementation Order

| Step | Task | Files | Risk |
|------|------|-------|------|
| 1 | Add `--cache` and `--cache-clear` CLI flags | `pnut-ts.ts`, `context.ts` | Low |
| 2 | Create `ObjectCache` class | New: `objectCache.ts` | Low |
| 3 | Add `allSymbols()` to SymbolTable (if needed) | `symbolTable.ts` | Low |
| 4 | Integrate cache check into `compileRecursively` | `compiler.ts` | Medium |
| 5 | Handle `globalLogicalIndexCounter` and `childImages` injection on cache hit | `compiler.ts` | Medium |
| 6 | Add cache statistics logging | `compiler.ts` | Low |
| 7 | Add `.pnut-cache/` to `.gitignore` | `.gitignore` | Low |
| 8 | Regression validation (binary equivalence test) | Test scripts | Critical |

**Estimated scope:** ~200-300 lines of new code, ~30-50 lines of modifications to existing files.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stale cache hit (wrong binary) | Very Low | High | Content-addressed keys make this structurally impossible unless SHA-256 collides |
| Missing state on cache hit (e.g., spinFiles not populated) | Medium | Medium | Careful testing of cache-hit path; ensure all side effects are replicated |
| Preprocessed lines don't capture all inputs | Low | High | Verify that `allPreprocessedLines` includes all `#include` content; add `#define` state to key if conditional compilation exists |
| Performance regression from hashing | Very Low | Low | SHA-256 of source text is microseconds vs. milliseconds of compilation |
| Cache grows unbounded | Low | Low | Manual `--cache-clear`; objects are small; add eviction later if needed |

---

## Future Enhancements (Not in Scope)

- **Automatic cache eviction** (LRU, max-size, or max-age policies)
- **Cache symbol tables** for full map file support on cache hits
- **Parallel-safe writes** with atomic rename
- **Cache sharing** across projects (global cache with project-scoped keys)
- **Cache warming** script that pre-compiles commonly used objects
