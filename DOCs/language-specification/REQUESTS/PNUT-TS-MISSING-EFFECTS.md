# PNut TS Database: Effect Flags - CORRECTED

**Generated:** 2025-12-13
**Corrected:** 2025-12-13
**Source:** PNut-TS compiler implementation (spinResolver.ts, parseUtils.ts)

## Status: RESOLVED

The database has been corrected to accurately reflect what the PNut-TS compiler actually supports.

## Correction Summary

The original analysis compared CSV v35 syntax against the database, but did not account for the compiler's actual implementation. The compiler has specific rules for which effects are valid for each instruction category.

### Key Findings from Compiler Source Code

#### 1. `tryWCZ()` Only Accepts WCZ (spinResolver.ts:2826-2832)

```typescript
private tryWCZ() {
  if (this.nextElementType() == eElementType.type_asm_effect && this.nextElementValue() == 0b11) {
    this.getElement();
    this.instructionImage |= 0b11 << 19;
  }
}
```

This function only accepts WCZ (value 0b11), not WC or WZ individually.

**Affected instructions:** BIT*, DIR*, DRV*, FLT*, OUT* (40 instructions)

#### 2. Effect Validation Logic (spinResolver.ts:2487)

```typescript
if ((attemptedEffects & allowedEffects) == 0 || (attemptedEffects == 0b11 && allowedEffects != 0b11)) {
  throw new Error('This effect is not allowed for this instruction');
}
```

- If `allowedEffects = 0b10`: Only WC is valid
- If `allowedEffects = 0b01`: Only WZ is valid
- If `allowedEffects = 0b11`: WC, WZ, and WCZ are all valid

#### 3. `getCorZ()` for Extended Effects (spinResolver.ts:2835-2850)

```typescript
if (this.currElement.type == eElementType.type_asm_effect2 ||
    (this.currElement.type == eElementType.type_asm_effect && Number(this.currElement.value) != 0b11)) {
  // ... process effect
} else {
  throw new Error('Expected WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, or XORZ');
}
```

This explicitly rejects WCZ (value 0b11) for TEST* instructions.

## Corrected Effect Categories

### WCZ Only (40 instructions)

These instructions use `tryWCZ()` which only accepts WCZ as a unit:

| Category | Instructions |
|----------|--------------|
| BIT* | BITC, BITH, BITL, BITNC, BITNOT, BITNZ, BITRND, BITZ |
| DIR* | DIRC, DIRH, DIRL, DIRNC, DIRNOT, DIRNZ, DIRRND, DIRZ |
| DRV* | DRVC, DRVH, DRVL, DRVNC, DRVNOT, DRVNZ, DRVRND, DRVZ |
| FLT* | FLTC, FLTH, FLTL, FLTNC, FLTNOT, FLTNZ, FLTRND, FLTZ |
| OUT* | OUTC, OUTH, OUTL, OUTNC, OUTNOT, OUTNZ, OUTRND, OUTZ |

**Syntax:** `instruction D,S/# WCZ` (WC or WZ alone will be ignored)

### WC Only (9 instructions)

These have `allowedEffects = 0b10` in parseUtils.ts:

| Instruction | Compiler Definition | C Flag Meaning |
|-------------|---------------------|----------------|
| COGID | `setAsmcodeValue(..., 0b10, ...)` | 1 if cog is on |
| COGINIT | `setAsmcodeValue(..., 0b10, ...)` | 1 if no free cog |
| GETCT | `setAsmcodeValue(..., 0b10, ...)` | CT[32] (bit 32 of counter) |
| LOCKNEW | `setAsmcodeValue(..., 0b10, ...)` | 1 if no LOCK available |
| LOCKREL | `setAsmcodeValue(..., 0b10, ...)` | 1 if lock was already free |
| LOCKTRY | `setAsmcodeValue(..., 0b10, ...)` | 1 if got LOCK |
| MODC | `setAsmcodeValue(..., 0b10, ...)` | cccc[{C,Z}] |
| RDPIN | `setAsmcodeValue(..., 0b10, ...)` | modal result |
| RQPIN | `setAsmcodeValue(..., 0b10, ...)` | modal result |

### WZ Only (5 instructions)

These have `allowedEffects = 0b01` in parseUtils.ts:

| Instruction | Compiler Definition | Z Flag Meaning |
|-------------|---------------------|----------------|
| MODZ | `setAsmcodeValue(..., 0b01, ...)` | zzzz[{C,Z}] |
| MUL | `setAsmcodeValue(..., 0b01, ...)` | (S == 0) \| (D == 0) |
| MULS | `setAsmcodeValue(..., 0b01, ...)` | (S == 0) \| (D == 0) |
| SCA | `setAsmcodeValue(..., 0b01, ...)` | result == 0 |
| SCAS | `setAsmcodeValue(..., 0b01, ...)` | result == 0 |

### WC, WZ, WCZ (5 branch instructions in register mode)

These dynamically set `allowedEffects = 0b11` when using register mode:

| Instruction | Mode | Effects Supported |
|-------------|------|-------------------|
| CALL | Register (D) | WC, WZ, WCZ |
| CALLA | Register (D) | WC, WZ, WCZ |
| CALLB | Register (D) | WC, WZ, WCZ |
| CALLD | Register (D,S) | WC, WZ, WCZ |
| JMP | Register (D) | WC, WZ, WCZ |

**Note:** In immediate mode (`CALL #address`), no effects are supported.

### Extended Effects (4 TEST* instructions)

These use `getCorZ()` which supports extended effects but NOT WCZ:

| Instruction | Supported Effects |
|-------------|-------------------|
| TESTP | WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ |
| TESTPN | WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ |
| TESTB | WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ |
| TESTBN | WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ |

**WCZ is explicitly rejected** for these instructions.

## Database Corrections Applied

The database was corrected using `correct-effects.js` script which:

1. Set BIT*/DIR*/DRV*/FLT*/OUT* to WCZ only
2. Set COGID group to WC only
3. Set MUL group to WZ only
4. Verified CALL/JMP group has WC, WZ, WCZ
5. Set TEST* group to extended effects (no WCZ)

## Verification

The corrections were verified against:
- `src/classes/parseUtils.ts` - instruction definitions with `allowedEffects` field
- `src/classes/spinResolver.ts` - effect handling logic (`tryWCZ()`, `getCorZ()`, validation)

The database now accurately represents what the PNut-TS compiler accepts.
