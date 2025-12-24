# Enhanced Listing Feature Plan

## Executive Summary

This document presents the plan for adding a memory map file (`.map`) to PNut-TS output. The goal is to help developers debug memory corruption in multi-COG P2 applications by providing detailed symbol-to-address mapping for all symbol types.

See also: `Compiler-Listing-Enhancement-Proposal.md` for the original problem statement and use cases.

---

## Final Design Decisions

| Decision | Choice |
|----------|--------|
| CLI option | `-m, --map` |
| Output file | Separate `.map` file |
| Section selection | None - all sections always included |
| Relationship to `-l` | Independent flags |
| Format style | Tabular with column headers |
| Array notation | Code-like: `LONG[32]` |
| Section delimiters | `=== Section Name ===` |
| MVP scope | All features, no deferral |

---

## CLI Design

```bash
pnut-ts file.spin2           # Compile only, .bin output
pnut-ts -l file.spin2        # Compile + .lst
pnut-ts -m file.spin2        # Compile + .map
pnut-ts -l -m file.spin2     # Compile + .lst + .map
```

The `-l` and `-m` flags are completely independent. Either, both, or neither can be specified.

**Implementation:**
```typescript
.option('-m, --map', 'Generate memory map file (.map) from compilation')
```

---

## Map File Sections

The `.map` file contains 7 sections covering all symbol types:

| Section | Purpose | Symbol Types Covered |
|---------|---------|---------------------|
| DAT Section Symbols | DAT variable offsets and sizes | DAT variables |
| VAR Section Symbols | VAR variable offsets and sizes | VAR instance variables |
| Object Layout | Size breakdown per object | OBJ references |
| Methods | Method entry points and stack frames | PUB/PRI methods, local variables, parameters, results |
| Runtime Addresses | Absolute address ranges | All sections per object |
| PASM Labels | Assembly label offsets | DAT labels in PASM code |
| Address Cross-Reference | Reverse lookup by address | All addressable symbols |

---

## Map File Format

### Header
```
PNut-TS Memory Map: filename.spin2
Spin2_v44
Generated: 2025-01-15 14:32:00
```

### DAT Section Symbols
```
=== DAT Section: object_name (Object N) ===
Offset     Size  Type          Name
------     ----  ----          ----
$00000        4  LONG          freeHead
$00004        4  LONG          freeTail
$00008      128  LONG[32]      freeList
$00088       64  BYTE[64]      buffer
                               ---
                 DAT Total:    256 bytes
```

### VAR Section Symbols
```
=== VAR Section: object_name (Object N) ===
Offset     Size  Type          Name
------     ----  ----          ----
$00000        4  LONG          cog_id
$00004        4  LONG          frame_count
$00008      128  LONG[32]      color_palette
                               ---
                 VAR Total:    136 bytes
```

### Object Layout
```
=== Object Layout ===
Idx  Object                        Code    DAT    VAR   Total
---  ------                        ----    ---    ---   -----
  0  top_level_app                  892   4468      0    5360
  1  isp_hdmi_display              1456    264    296    2016
  2  isp_oled_driver               2104    268    312    2684
                                   ----    ---    ---   -----
                           Totals: 4452   5000    608    8060
```

### Methods
```
=== Methods: object_name (Object N) ===

PUB main()
  Entry:   $00000
  Params:  0   Results: 0   Locals: 3
  Stack Frame:
    Offset  Size  Type       Name
    ------  ----  ----       ----
    $0000      4  LONG       counter
    $0004      4  LONG       result
    $0008     16  LONG[4]    buffer

PRI process_data(src, len) : status
  Entry:   $00048
  Params:  2   Results: 1   Locals: 2
  Stack Frame:
    Offset  Size  Type       Name
    ------  ----  ----       ----
    $0000      4  LONG       src (param)
    $0004      4  LONG       len (param)
    $0008      4  LONG       status (result)
    $000C      4  LONG       temp
    $0010      4  LONG       index
```

### Runtime Addresses
```
=== Runtime Addresses ===
Object 0 (top_level_app):
  Code:  $00000-$0037B (892 bytes)
  DAT:   $0037C-$01513 (4468 bytes)
  VAR:   N/A

Object 1 (isp_hdmi_display):
  Code:  $01514-$01AC3 (1456 bytes)
  DAT:   $01AC4-$01BC3 (264 bytes)
  VAR:   $05B50-$05C77 (296 bytes per instance)
```

### PASM Labels
```
=== PASM Labels: object_name (Object N) ===
DAT Offset   COG Addr   Name
----------   --------   ----
$00100       $000       entry
$00124       $009       store_value
$00168       $01A       advance_ptr
$00180       $020       main_loop
```

### Address Cross-Reference
```
=== Address Cross-Reference ===
$00000-$0037B   [CODE]   top_level_app
$0037C-$003FF   [DAT]    freeHead (Object 0)
$00400-$0047F   [DAT]    freeList (Object 0)
$05B50-$05B53   [VAR]    cog_id (Object 1)
...
```

---

## Symbol Type Coverage

| Symbol Type | Section | How to Find Absolute Address |
|-------------|---------|------------------------------|
| DAT variable | DAT Section | Runtime Addresses (DAT base) + offset |
| VAR variable | VAR Section | Runtime Addresses (VAR base) + offset |
| PASM label | PASM Labels | Runtime Addresses (DAT base) + DAT offset |
| PUB/PRI method | Methods | Runtime Addresses (Code base) + entry |
| Local variable | Methods | Stack frame pointer + stack offset |
| Parameter | Methods | Stack frame pointer + stack offset |
| Result variable | Methods | Stack frame pointer + stack offset |
| OBJ instance | Object Layout + Runtime | Per-object address ranges |

---

## Estimated File Sizes

| Scenario | .lst Size | .map Size | Total |
|----------|-----------|-----------|-------|
| Small (1 object, 5 methods) | 5KB | 10KB | 15KB |
| Medium (5 objects, 25 methods) | 12KB | 32KB | 44KB |
| Large (10+ objects, 60 methods) | 30KB | 70KB | 100KB |

The Methods section (with local variables) accounts for approximately half of the .map file size.

---

## Implementation Architecture

### New Files

1. **`src/classes/mapGenerator.ts`** (new)
   - `MapGenerator` class
   - Methods for each section: `emitDatSymbols()`, `emitVarSymbols()`, `emitObjectLayout()`, `emitMethods()`, `emitRuntimeAddresses()`, `emitPasmLabels()`, `emitCrossReference()`

### Modified Files

| File | Changes |
|------|---------|
| `src/pnut-ts.ts` | Add `-m, --map` option |
| `src/utils/context.ts` | Add `writeMapFile` flag |
| `src/classes/spin2Parser.ts` | Call MapGenerator after compilation |
| `src/classes/spinResolver.ts` | Possibly expose additional accessors for method/local data |

### Data Flow

```
Compilation Phase:
  spinResolver collects:
    → mainSymbols (DAT, VAR, CON symbols)
    → localSymbols (method locals, params, results)
    → method metadata (entry points, stack sizes)
  objImage tracks:
    → DAT offsets
  distillerList tracks:
    → object metadata, sizes

Map Generation Phase (after successful compile):
  1. MapGenerator.generate(resolver, context, outputPath)
  2. For each object:
     - emitDatSymbols()
     - emitVarSymbols()
     - emitMethods() with locals
     - emitPasmLabels()
  3. emitObjectLayout() (all objects)
  4. emitRuntimeAddresses() (all objects)
  5. emitCrossReference() (sorted by address)
```

---

## Roadmap Dependencies

**No prerequisites required.** This feature can be implemented independently because:

1. Symbol data already available in `spinResolver.mainSymbols` and `localSymbols`
2. Object metadata accessible via `distillerList` and `childObjectsImage`
3. Method information tracked during compilation
4. Map generation is isolated from listing generation

---

## Implementation Phases

### Phase 1: Infrastructure
- Add `-m, --map` CLI option
- Add `writeMapFile` context flag
- Create `MapGenerator` class skeleton
- Implement file output infrastructure

### Phase 2: Core Sections
- DAT Section Symbols
- VAR Section Symbols
- Object Layout
- Runtime Addresses

### Phase 3: Methods
- Method entry points
- Stack frame layout
- Parameters, results, locals

### Phase 4: PASM and Cross-Reference
- PASM Labels with COG addresses
- Address Cross-Reference (sorted view)

### Phase 5: Testing
- Unit tests for each section
- Integration tests with multi-object programs
- Verify address calculations match runtime

---

## Success Criteria

- [ ] `-m` flag generates `.map` file independently of `-l`
- [ ] All 7 sections present and correctly formatted
- [ ] Every addressable symbol type can be looked up
- [ ] Addresses in .map match actual runtime addresses
- [ ] Cross-reference enables address → symbol lookup
- [ ] Multi-object programs correctly show all objects
- [ ] File format is human-readable and grep-friendly

---

## References

- Original proposal: `Compiler-Listing-Enhancement-Proposal.md`
- Current listing generation: `src/classes/spin2Parser.ts` → `P2List()`
- Symbol storage: `src/classes/spinResolver.ts` → `mainSymbols`, `localSymbols`
