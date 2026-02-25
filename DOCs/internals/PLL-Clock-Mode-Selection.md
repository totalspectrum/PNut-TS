# PLL Clock Mode Selection

How the PNut-TS compiler determines and applies the P2 clock configuration.

## User Declaration (CON Block)

The user specifies clock configuration via reserved CON symbols:

| Symbol | Purpose |
|--------|---------|
| `_CLKFREQ` | Desired system clock frequency in Hz (triggers PLL calculation) |
| `_XTLFREQ` | External crystal frequency in Hz |
| `_XINFREQ` | External clock input frequency in Hz |
| `_ERRFREQ` | Max allowable frequency error in Hz (default: 1,000,000) |
| `_RCFAST` | Use internal RC fast oscillator (~20 MHz) |
| `_RCSLOW` | Use internal RC slow oscillator (~20 KHz) |

Example:
```spin2
CON
  _xtlfreq = 10_000_000
  _clkfreq = 11_000_000
  _errfreq = 1000
```

---

## Key Files

| File | Role |
|------|------|
| `src/classes/spinResolver.ts` | `determine_clock()` and `pllCalc()` — core clock logic |
| `src/classes/spin2Parser.ts` | Binary patching (interpreter, debugger, clock setter) |
| `src/classes/parseUtils.ts` | Built-in symbol definitions (`CLKMODE`, `CLKFREQ`, `CLKSET`) |
| `src/ext/clock_setter.spin2` | PASM2 clock setter stub for PASM-mode binaries |

---

## Step 1: `determine_clock()` — spinResolver.ts:888-1017

Called during `compile2()`, after CON symbols are resolved. The algorithm:

### 1a. Symbol Lookup via Bitmask

Iterates over the main symbol table, building a bitmask of which clock symbols were declared:

```
0x80 = CLKMODE_    (compiler-generated, must NOT be user-declared)
0x40 = CLKFREQ_    (compiler-generated, must NOT be user-declared)
0x20 = _ERRFREQ
0x10 = _CLKFREQ
0x08 = _XTLFREQ
0x04 = _XINFREQ
0x02 = _RCFAST
0x01 = _RCSLOW
```

All clock symbols must be `type_con_int` (integer constants); otherwise an error is thrown.

### 1b. Validation

If `CLKMODE_` or `CLKFREQ_` are user-declared (bits 0x80 or 0x40), the compiler throws:
`"CLKMODE_ and CLKFREQ_ cannot be declared, since they are set by the compiler"`

### 1c. Default Mode Selection

If no clock symbols are found (bitmask = 0b00000):
- **Debug mode enabled**: Forces `_XTLFREQ = 20_000_000` (debugger requires external clocking)
- **Non-debug mode**: Forces `_RCFAST`

### 1d. Mode Switch (7 Valid Combinations)

| Bitmask | Symbols Present | Action |
|---------|----------------|--------|
| `0b10000` | `_CLKFREQ` only | PLL with assumed 20 MHz crystal; mode bits = `0b1011` |
| `0b11000` | `_CLKFREQ + _XTLFREQ` | PLL with specified crystal; `0b1011` if >= 16 MHz, else `0b1111` (30pF) |
| `0b10100` | `_CLKFREQ + _XINFREQ` | PLL with external clock; mode bits = `0b0111` |
| `0b01000` | `_XTLFREQ` only | XI direct (no PLL); `0b1010` or `0b1110` based on frequency |
| `0b00100` | `_XINFREQ` only | XI direct (no PLL); mode bits = `0b0110` |
| `0b00010` | `_RCFAST` | mode = `0b0000`, freq = 20,000,000 |
| `0b00001` | `_RCSLOW` | mode = `0b0001`, freq = 20,000 |

Any other combination throws: `"Conflicting or deficient _CLKFREQ/_XTLFREQ/_XINFREQ/_RCFAST/_RCSLOW symbols found"`

The low 4 bits of the clock mode word encode:
- **Bits [3:2]**: Crystal capacitance (00=no caps, 10=15pF, 11=30pF)
- **Bits [1:0]**: Clock source (00=RCFAST, 01=RCSLOW, 10=XI direct, 11=PLL)

### 1e. Recording Computed Symbols

After determining clock mode, the compiler records two computed symbols into the symbol table:
- `CLKMODE_` — the full clock mode register value
- `CLKFREQ_` — the actual achieved frequency

These become accessible to the program and appear in the listing file.

---

## Step 2: `pllCalc()` — spinResolver.ts:1169-1247

Direct port of the original PNut x86 assembly PLL calculator. Called only for the three PLL modes (where `_CLKFREQ` is specified).

**Signature**: `pllCalc(inputFrequency, requestedFrequency, allowedError) -> [mode, actualFrequency]`

### Input Validation
- `inputFrequency` (XI/crystal): 250,000 to 500,000,000 Hz
- `requestedFrequency` (`_CLKFREQ`): 3,333,333 to 500,000,000 Hz

### Search Algorithm

Brute-force search over all valid PLL parameter combinations:

```
For each post-divider pppp (0..15):
  post = (pppp << 1) + (pppp ? 0 : 1)     // post = 1, 2, 4, 6, 8, ... 30
  For each input divider divd (64 down to 1):
    fpfd = xinfreq / divd                   // phase-frequency detector freq
    mult = (post * divd * clkfreq) / xinfreq // PLL multiplier
    fvco = (xinfreq * mult) / divd          // VCO frequency
    fout = fvco / post                      // output frequency
    abse = |fout - clkfreq|                 // absolute error

    Accept if ALL of:
      - abse <= current best error
      - fpfd >= 250 KHz
      - mult <= 1024 (10-bit field)
      - fvco >= 99 MHz
      - fvco <= 201 MHz OR fvco <= clkfreq + errfreq
```

### Output Mode Word Construction

```typescript
_mode = (1 << 24) | ((_divd - 1) << 18) | ((_mult - 1) << 8) | (((_pppp - 1) & 0b1111) << 4);
```

P2 HUBSET clock mode register bit layout:
- **Bit 24**: PLL enable
- **Bits 23:18**: Input divider (DIVD-1), 6-bit field
- **Bits 17:8**: PLL multiplier (MULT-1), 10-bit field
- **Bits 7:4**: Post divider (PPPP-1), 4-bit field
- **Bits 3:2**: Crystal capacitance (ORed in by `determine_clock()`)
- **Bits 1:0**: Clock source (ORed in by `determine_clock()` — 0b11 = PLL)

If no valid settings are found: `"PLL settings could not be achieved per _CLKFREQ"`

---

## Step 3: Binary Patching (spin2Parser.ts)

The computed `clkMode` and `clkFreq` are written into the binary at multiple locations depending on the program type.

### 3a. Spin2 Interpreter — `P2InsertInterpreter()` (lines 591-697)

For Spin2 programs, the interpreter binary is prepended. Clock values patched at fixed offsets:

```typescript
const clkmode_hub = 0x40;   // hub address for CLKMODE
const clkfreq_hub = 0x44;   // hub address for CLKFREQ
```

### 3b. Debugger — `P2InsertDebugger()` (lines 714-799)

Debug mode requires crystal/external clocking at >= 10 MHz. Two values patched:

| Offset | Name | Value | Purpose |
|--------|------|-------|---------|
| `0xD4` | `_clkfreq_` | `clkFreq` | Clock frequency |
| `0xD8` | `_clkmode1_` | `clkMode & 0xFFFFFFFC` | Start ext clock, PLL bits cleared |
| `0xDC` | `_clkmode2_` | `clkMode` | Full mode with PLL engaged |

The two-value approach: `_clkmode1_` starts the external oscillator while remaining in RCFAST, then after stabilization `_clkmode2_` engages the PLL.

### 3c. Clock Setter — `P2InsertClockSetter()` (lines 929-967)

For PASM-mode programs (not Spin2, not debug) with non-zero clock mode. Prepends a clock setter stub that performs:

1. `hubset _clkmode1_` — Start external clock, remain in RCFAST
2. `waitx tenms` — Wait 10ms for stabilization
3. `hubset _clkmode2_` — Switch to PLL/external clock

Then relocates the application down to hub address 0 and relaunches cog 0.

For RCSLOW mode, the external clock instructions are NOP'd. The `_AUTOCLK = 0` symbol suppresses clock setter insertion entirely.

### 3d. `ASMCLK` Instruction — spinResolver.ts:2386-2412

The `ASMCLK` pseudo-instruction in PASM2 code expands inline to the same two-phase HUBSET sequence:

For PLL/external modes (bit 1 set):
```pasm2
hubset ##(clkmode & $FFFFFFFC)   ' start external clock, stay in RCFAST
waitx ##200_000                   ' wait 10ms at 20MHz RCFAST
hubset ##clkmode                  ' switch to PLL/external clock
```

For RCFAST/RCSLOW (bit 1 clear):
```pasm2
hubset #0   ' or #1 for RCSLOW
```

---

## Runtime Access

**parseUtils.ts:2581-2582** — Built-in symbols:

| Symbol | Type | Hub Address | Description |
|--------|------|-------------|-------------|
| `CLKMODE` | `type_hub_long` | `0x40` | Read current clock mode from hub RAM |
| `CLKFREQ` | `type_hub_long` | `0x44` | Read current clock frequency from hub RAM |
| `CLKSET` | bytecode `0x56` | — | Runtime call to dynamically change clock |

These are the same addresses patched by the interpreter insertion step.

---

## Listing File Output (spin2Parser.ts:310-327)

The listing file displays computed clock values from the `CLKMODE_` and `CLKFREQ_` symbols:

```
CLKMODE:   $0110628F
CLKFREQ:  11_000_000
XINFREQ:  10_000_000
```

---

## Test Coverage

14 clock-specific test files in `TEST/COV-tests/`:

| Test File | Configuration |
|-----------|--------------|
| `coverage_clock_001.spin2` | `_XTLFREQ=10MHz` + `_CLKFREQ=11MHz` + `_ERRFREQ=1000` |
| `coverage_clock_002.spin2` | `_XINFREQ=10MHz` + `_CLKFREQ=11MHz` + `_ERRFREQ=1000` |
| `coverage_clock_003.spin2` | Debug mode (defaults to 20MHz crystal) |
| `coverage_clock_004.spin2` | `_XINFREQ=10MHz` only (XI direct, no PLL) |
| `coverage_clock_005.spin2` | `_RCSLOW` |
| `coverage_clock_006.spin2` | Baud/pin config only (defaults to RCFAST) |
| `coverage_clock_012.spin2` | `_XTLFREQ=10MHz` only (XI direct, low frequency crystal) |
| `coverage_clock_013.spin2` | `_XTLFREQ=17MHz` + `_CLKFREQ=340MHz` (high freq PLL) |
| `coverage_clock_014.spin2` | `_XTLFREQ=17MHz` only (XI direct, high frequency crystal) |

(Tests 007-011 cover debug pin/baud/window configuration.)
