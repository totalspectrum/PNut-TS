# BigInt → Number Conversion Research: Mathematical Behavior Audit

**Date:** 2026-02-25
**Context:** Opt#5 from Performance Optimization Sprint — Risk 8/10, Gain 8/10
**Scope:** Research and documentation only — no code changes

---

## 1. Executive Summary

### Feasibility Verdict: FEASIBLE, with 3 isolated exceptions

The PNut-TS compiler uses BigInt for all 32-bit integer arithmetic in the compile-time constant resolver. This is correct but unnecessarily expensive — JavaScript's native 32-bit bitwise operators (`| 0`, `>>> 0`, `Math.imul()`) provide identical behavior for the vast majority of operations.

**Key findings:**
- **66 of 69 operations** in `resolveOperation()` can safely use Number with native JS bitwise operators
- **3 operations** (SCA, SCAS, FRAC) genuinely require >32-bit intermediates that exceed Number's safe range
- **372 BigInt usage sites** across 13 files; 254 (68%) concentrated in spinResolver.ts
- The original PNut compiler (x86 assembly) naturally uses 32-bit registers — our BigInt approach over-engineers what the hardware does natively
- Float operations already use Number internally (via `bigIntFloat32ToNumber`/`numberToBigIntFloat32`); BigInt is just the transport wrapper

### Risk Assessment

| Risk Area | Level | Mitigation |
|-----------|-------|------------|
| Signed/unsigned confusion | **HIGH** | `\| 0` for signed, `>>> 0` for unsigned — must get each site right |
| SCA/SCAS/FRAC precision | **MEDIUM** | Keep BigInt locally for these 3 operations only |
| Type propagation ripple | **MEDIUM** | Change `bigint \| string` → `number \| string` in 13 files |
| Regression risk | **LOW** | 180+ test files with GOLD file comparisons catch any error |
| Float boundary changes | **LOW** | Float32 conversion functions only change signature, not logic |

### Expected Performance Gain

BigInt operations are 5-20x slower than Number operations in V8. The compile-time resolver is called for every constant expression evaluation. Based on profiling data from Opt#8 (which showed ~240 BigInt sites):
- Hot path: `resolveOperation()` called thousands of times per compilation
- NumberStack push/pop: every stack operation involves BigInt
- Expected compilation time reduction: **8-15%** for expression-heavy files

---

## 2. Per-Operation Comparison: x86 Assembly vs TypeScript

This section documents every operation in `resolveOperation()` (spinResolver.ts lines 10863-11548), contrasted against the x86 implementations in `ref-v52a/p2com.asm` (lines 9660-10113).

### Architecture Overview

**Original (x86):** All values live in 32-bit registers (`eax`, `ecx`). The x86 ISA naturally provides 32-bit arithmetic with wrapping. Float/int dispatch uses the zero flag (`jz` = float context).

**PNut-TS (current):** All values are BigInt. Every operation must explicitly mask to 32 bits with `& mask32Bit` (`& BigInt(0xffffffff)`). This is the overhead we're analyzing.

**Legend for conversion table:**
- **Safe** = Direct Number replacement, no edge cases
- **Careful** = Requires specific JS idiom for correctness
- **Exception** = Cannot use Number, must keep BigInt or use workaround

### 2.1 Unary Bitwise Operations

| # | Operation | x86 | Current TS (BigInt) | Number Equivalent | Safety |
|---|-----------|-----|--------------------|--------------------|--------|
| 1 | **op_bitnot** `!` | `not eax` | `a ^= mask32Bit` | `a = ~a \| 0` or `a ^= -1; a = a >>> 0` | **Safe** — JS `~` is 32-bit NOT, produces signed. Use `>>> 0` for unsigned |
| 2 | **op_neg** `-` (int) | `neg eax` | `((a ^ mask32Bit) + 1n) & mask32Bit` | `a = (-a) >>> 0` | **Safe** — JS negation + unsigned coerce |
| 3 | **op_fneg** `-.` | `xor eax, 80000000h` | `a ^= msb32Bit` | `a = (a ^ 0x80000000) >>> 0` | **Safe** — simple XOR on sign bit |
| 4 | **op_abs** (int) | `or eax,eax; jns skip; neg eax` | `a & msb32Bit ? ((a ^ mask32Bit) + 1n) & mask32Bit : a` | `let s = a \| 0; a = (s < 0 ? -s : s) >>> 0` | **Careful** — must sign-interpret first |
| 5 | **op_fabs** | `and eax, 7FFFFFFFh` | `a &= mask31Bit` | `a = a & 0x7FFFFFFF` | **Safe** — stays positive, no coerce needed |

### 2.2 Unary Bit Manipulation Operations

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 6 | **op_encod** | `shl eax,1; jc found; loop` | 32-iteration loop with `1n << index` | `a = 31 - Math.clz32(a)` (but clz32(0)=32, handle edge) | **Safe** — `Math.clz32()` is exact match. Edge: input=0 → x86 gives 0 (ecx loops to 0), clz32 gives 32. Need: `a = a === 0 ? 0 : 31 - Math.clz32(a)` |
| 7 | **op_decod** | `mov cl,al; mov eax,1; shl eax,cl` | `1n << (a & 31n)` | `a = 1 << (a & 31)` (but JS: `1 << 31` = -2147483648 signed). Use `(1 << (a & 31)) >>> 0` | **Careful** — JS shift gives signed; use `>>> 0` |
| 8 | **op_bmask** | `mov eax,2; shl eax,cl; dec eax` | `mask32Bit >> (31n - (a & 31n))` | `a = ((2 << (a & 31)) - 1) >>> 0` | **Careful** — x86 uses `2 << cl`, not `1 << cl`. Match exactly. |
| 9 | **op_ones** | `shl+adc loop` | 32-iteration BigInt loop | `let c=0; let v=a; while(v){c++;v&=v-1;} a=c;` (Brian Kernighan) or `Math.popcount` if available | **Safe** — popcount on 32-bit value. Result ≤ 32, always positive. Alternative: `a = popcount32(a)` via bit trick |
| 10 | **op_sqrt** | Binary search: `or ecx,ebx; mul eax; cmp; xor` | Binary search with BigInt multiply | Same algorithm with Number: `root\|=bit; if(root*root>a) root^=bit` — all intermediates ≤ 32-bit × 32-bit (max 0xFFFF × 0xFFFF = 0xFFFE0001, fits in Number) | **Safe** — max intermediate is 65535² = 4,294,836,225 which is well within 2^53 |

### 2.3 QLOG/QEXP (Transcendental Integer Operations)

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 11 | **op_qlog** | CORDIC algorithm (40+ iterations with 64-bit intermediate precision) | `Math.trunc(Math.log2(Number(a)) * 2^27 + 0.5)` | Already uses Number internally! Just remove BigInt wrapper | **Safe** — already Number math with BigInt shell |
| 12 | **op_qexp** | CORDIC algorithm (40+ iterations with 64-bit intermediate precision) | `Math.trunc(Math.pow(2, Number(a) / 2^27) + 0.25)` | Already uses Number internally! | **Safe** — same situation |

**NOTE on QLOG/QEXP precision:** The TS implementation uses `Math.log2`/`Math.pow` which differ from the x86 CORDIC implementation. The existing comments warn of ±2-3 bit precision differences. This is a pre-existing behavioral difference, not related to BigInt→Number conversion. The `+ 0.5` and `+ 0.25` rounding adjustments were hand-tuned to minimize divergence.

### 2.4 Float Operations (All Use Number Internally)

These operations already convert to Number for the actual math, then convert back to BigInt for storage. The BigInt is purely a transport mechanism.

| # | Operation | x86 | Current TS Pattern | Impact of Change |
|---|-----------|-----|--------------------|-----------------|
| 13 | **op_fsqrt** | Custom: unpack → bit29 mantissa → binary search → pack | `bigIntFloat32ToNumber(a)` → `Math.sqrt()` → `numberToBigIntFloat32()` | Only change: input/output type from bigint to number |
| 14 | **op_log2** | Custom: unpack → CORDIC qlog → scale → pack | Same pattern with `Math.log2()` | Same |
| 15 | **op_log10** | Custom: unpack → CORDIC qlog → scale by `log10(2)` → pack | Same pattern with `Math.log10()` | Same |
| 16 | **op_log** | Custom: unpack → CORDIC qlog → scale by `ln(2)` → pack | Same pattern with `Math.log()` | Same |
| 17 | **op_exp2** | Custom: scale → CORDIC qexp → pack | Same pattern with `Math.pow(2, x)` | Same |
| 18 | **op_exp10** | Custom: scale by `log2(10)` → CORDIC qexp → pack | Same pattern with `Math.pow(10, x)` | Same |
| 19 | **op_exp** | Custom: scale by `log2(e)` → CORDIC qexp → pack | Same pattern with `Math.exp()` | Same |
| 20 | **op_fmul** `*.` | Custom: unpack both → add exponents → mul mantissas (64-bit) → bit29 → pack | Same pattern with `*` | Same |
| 21 | **op_fdiv** `/.` | Custom: unpack both → sub exponents → 30-bit long division → pack | Same pattern with `/` | Same |
| 22 | **op_fadd** `+.` | Custom: unpack → align mantissas → add → pack | Same pattern with `+` | Same |
| 23 | **op_fsub** `-.` | Custom: negate b sign → fp_add | Same pattern with `-` | Same |
| 24 | **op_pow** | Custom: `fp_log2 → fp_mul → fp_exp2` | Same pattern with `Math.pow()` | Same |

**Key insight:** The x86 compiler implements its own software floating-point using bit29-justified mantissas with 30-bit precision and custom rounding (`add eax, 100h` = round at bit 8). PNut-TS uses JavaScript's `Float32Array` which uses hardware IEEE 754 with round-to-nearest-even. This produces ±1 ULP differences on some operations — this is a **pre-existing** behavioral difference documented in the regression tests, completely independent of the BigInt/Number question.

### 2.5 Shift Operations

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 25 | **op_shr** `>>` | `shr eax, cl` | `a >> bitCountFromB` | `a = a >>> (b & 31)` | **Safe** — JS `>>>` is unsigned right shift, exact match for `shr` |
| 26 | **op_shl** `<<` | `shl eax, cl` | `(a << bitCountFromB) & mask32Bit` | `a = (a << (b & 31)) >>> 0` | **Safe** — JS `<<` is 32-bit, just unsigned-coerce result |
| 27 | **op_sar** SAR | `sar eax, cl` | Complex: detect sign, extend to 64-bit BigInt, shift, mask | `a = (a \| 0) >> (b & 31)` then `>>> 0` | **Careful** — `\| 0` converts to signed, then `>>` does arithmetic shift. Then `>>> 0` for unsigned storage. Exact match for `sar`. |
| 28 | **op_ror** ROR | `ror eax, cl` | `((a << 32n) \| a) >> bitCountFromB & mask32Bit` | `let n = b & 31; a = ((a >>> n) \| (a << (32 - n))) >>> 0` | **Safe** — standard rotate-right idiom |
| 29 | **op_rol** ROL | `rol eax, cl` | `((a << 32n) \| a) >> (32n - bitCountFromB) & mask32Bit` | `let n = b & 31; a = ((a << n) \| (a >>> (32 - n))) >>> 0` | **Safe** — standard rotate-left idiom. Edge: n=0 → `a >>> 32` is 0 in JS (unlike x86 where shift by 0 is no-op). Handle: `if (n === 0) skip` |
| 30 | **op_rev** REV | Bit-reverse loop with `shr`/`rcl` | Loop with `(revValue << 1n) \| (a & 1n)` | Same loop with Number: `revValue = (revValue << 1) \| (a & 1); a >>>= 1` | **Safe** — all values ≤ 32 bits |

### 2.6 Sign/Zero Extension

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 31 | **op_zerox** ZEROX | `not cl; shl eax,cl; shr eax,cl` | `a &= mask32Bit >> (31n - bitCountFromB)` | `let n = 31-(b&31); a = (a << n) >>> n` | **Safe** — matches x86 exactly |
| 32 | **op_signx** SIGNX | `not cl; shl eax,cl; sar eax,cl` | Complex: detect bit, mask, OR | `let n = 31-(b&31); a = (((a << n) \| 0) >> n) >>> 0` | **Careful** — must use `\| 0` before `>>` for arithmetic shift, then `>>> 0` for unsigned result |

### 2.7 Binary Bitwise Operations

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 33 | **op_bitand** `&` | `and eax, ecx` | `a &= b` | `a = (a & b) >>> 0` | **Safe** |
| 34 | **op_bitxor** `^` | `xor eax, ecx` | `a ^= b` | `a = (a ^ b) >>> 0` | **Safe** |
| 35 | **op_bitor** `\|` | `or eax, ecx` | `a \|= b` | `a = (a \| b) >>> 0` | **Safe** |

### 2.8 Integer Arithmetic (The Critical Section)

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 36 | **op_mul** `*` (int) | `imul ecx` → keeps low 32 bits | `(a * b) & mask32Bit` | `a = Math.imul(a \| 0, b \| 0) >>> 0` | **Safe** — `Math.imul` is exact match for `imul ecx` (low 32 bits of signed multiply) |
| 37 | **op_add** `+` (int) | `add eax, ecx` | `(a + b) & mask32Bit` | `a = (a + b) >>> 0` | **Safe** — max: 0xFFFFFFFF + 0xFFFFFFFF = 0x1FFFFFFFE (34 bits, well within 2^53) |
| 38 | **op_sub** `-` (int) | `sub eax, ecx` | `(a - b) & mask32Bit` | `a = (a - b) >>> 0` | **Careful** — can go negative. `>>> 0` handles wrap correctly |
| 39 | **op_div** `/` (int, signed) | `cdq; idiv ecx` | `(signExtendFrom32Bit(a) / signExtendFrom32Bit(b)) & mask32Bit` | `a = ((a \| 0) / (b \| 0)) >>> 0` but **WARNING**: JS `/` is float division! Must use `Math.trunc((a\|0) / (b\|0)) >>> 0` | **Careful** — JS division is floating-point. Need `Math.trunc` for truncation-toward-zero (matches `idiv` behavior) |
| 40 | **op_divu** `+/` (unsigned) | `xor edx,edx; div ecx` | `a /= b` | `a = Math.trunc(a / b) >>> 0` | **Careful** — same truncation issue. Both operands unsigned. |
| 41 | **op_rem** `//` (signed) | `cdq; idiv ecx; mov eax,edx` | `(signExtendFrom32Bit(a) % signExtendFrom32Bit(b)) & mask32Bit` | `a = ((a \| 0) % (b \| 0)) >>> 0` | **Safe** — JS `%` truncates toward zero, matching `idiv` remainder semantics |
| 42 | **op_remu** `+//` (unsigned) | `xor edx,edx; div ecx; mov eax,edx` | `a %= b` | `a = (a % b) >>> 0` | **Safe** — both unsigned, result fits in 32 bits |

### 2.9 The Three Exceptions: SCA, SCAS, FRAC

These operations produce 64-bit intermediates that can exceed Number's 2^53 safe integer range.

| # | Operation | x86 | Current TS | Why Number Fails | Recommended Approach |
|---|-----------|-----|-----------|------------------|---------------------|
| 43 | **op_sca** SCA | `mul ecx; mov eax,edx` (unsigned 32×32→64, return high 32) | `(a * b) >> 32n` | 0xFFFFFFFF × 0xFFFFFFFF = 0xFFFFFFFE00000001 (64 bits). Number loses low bits. | **Keep BigInt locally** — convert in, multiply, shift, convert out |
| 44 | **op_scas** SCAS | `imul ecx; shl eax,1; rcl edx,1; ×2; mov eax,edx` (signed 32×32→64, shift left 2, return high 32) | `(signExtendFrom32Bit(a) * signExtendFrom32Bit(b)) >> 30n & mask32Bit` | Signed multiply can produce up to 62-bit magnitude. Shift by 30 requires full 64-bit precision. | **Keep BigInt locally** |
| 45 | **op_frac** FRAC | `mov edx,eax; xor eax,eax; div ecx` (edx:eax=a<<32, divide by b, unsigned) | `(a << 32n) / b` | `a << 32` produces up to 64-bit value. Number can't represent this. | **Keep BigInt locally** |

**Concrete examples showing Number failure:**

SCA: `0x80000001 × 0x80000001`:
- True result: `0x4000000100000001` (64 bits)
- Number(`0x4000000100000001`) = `0x4000000100000000` (lost low bit)
- Expected high 32: `0x40000001`, Number gives: `0x40000001` (happens to be OK here)
- But `0xFFFFFFFF × 0xFFFFFFFF = 0xFFFFFFFE00000001`:
  - High 32 should be: `0xFFFFFFFE`
  - `Number(0xFFFFFFFFn * 0xFFFFFFFFn)` = `18446744065119617024` = `0xFFFFFFFE00000000` → high 32 = `0xFFFFFFFE` ✓
- **Worst case:** when low 32 bits carry into high 32 bits via addition/shift. With pure multiply-then-shift, the error is in the low bits which get discarded. **However**, SCAS does additional left-shift-by-2 which can propagate errors upward.

FRAC: `0x7FFFFFFF << 32 = 0x7FFFFFFF00000000`:
- As Number: `9223372032559808512` vs true `9223372032559808512` — representation may lose precision.
- Division of imprecise dividend by small divisor amplifies the error.

### 2.10 Comparison Operations (Signed/Unsigned)

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 46 | **op_lt** `<` | `cmp eax,ecx; jl` (signed) | `signExtendFrom32Bit(a) < signExtendFrom32Bit(b)` | `(a \| 0) < (b \| 0)` | **Safe** — `\| 0` gives signed 32-bit |
| 47 | **op_ltu** `+<` | `cmp eax,ecx; jb` (unsigned) | `a < b` | `a < b` (both already unsigned) | **Safe** — direct comparison |
| 48 | **op_lte** `<=` | `cmp eax,ecx; jle` (signed) | `signExtendFrom32Bit(a) <= signExtendFrom32Bit(b)` | `(a \| 0) <= (b \| 0)` | **Safe** |
| 49 | **op_lteu** `+<=` | unsigned `jbe` | `a <= b` | `a <= b` | **Safe** |
| 50 | **op_e** `==` | `cmp; je` | `a == b` | `a === b` | **Safe** |
| 51 | **op_ne** `<>` | `cmp; jne` | `a != b` | `a !== b` | **Safe** |
| 52 | **op_gte** `>=` | `cmp; jge` (signed) | `signExtendFrom32Bit(a) >= signExtendFrom32Bit(b)` | `(a \| 0) >= (b \| 0)` | **Safe** |
| 53 | **op_gteu** `+>=` | unsigned `jae` | `a >= b` | `a >= b` | **Safe** |
| 54 | **op_gt** `>` | `cmp; jg` (signed) | `signExtendFrom32Bit(a) > signExtendFrom32Bit(b)` | `(a \| 0) > (b \| 0)` | **Safe** |
| 55 | **op_gtu** `+>` | unsigned `ja` | `a > b` | `a > b` | **Safe** |
| 56 | **op_ltegt** `<=>` | Ternary: `cmp` → -1/0/+1 | `signExtend(a) == signExtend(b) ? 0n : signExtend(a) < signExtend(b) ? mask32Bit : 1n` | `let sa = a\|0, sb = b\|0; a = sa === sb ? 0 : sa < sb ? 0xFFFFFFFF : 1` | **Safe** |

### 2.11 Float Comparison Operations

| # | Operation | Pattern | Impact |
|---|-----------|---------|--------|
| 57-63 | **op_flt, op_flte, op_fe, op_fne, op_fgte, op_fgt** | All use `bigIntFloat32ToNumber()` → compare → return `true32Bit`/`false32Bit` | Only change: function signature. Internal Number math unchanged. |

### 2.12 Min/Max with Float/Int Dispatch

| # | Operation | Int Path | Float Path | Safety |
|---|-----------|----------|------------|--------|
| 64 | **op_fge** `#>` | `signExtend(a) < signExtend(b) ? b : a` | Float compare via `bigIntFloat32ToNumber` | **Safe** — `(a\|0) < (b\|0)` for signed comparison |
| 65 | **op_fle** `<#` | `signExtend(a) > signExtend(b) ? b : a` | Float compare | **Safe** |

### 2.13 Logical Operations

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 66 | **op_lognot** `NOT` | `@@logic` (→ 0/-1) then `not eax` | `a ? false32Bit : true32Bit` | `a = a ? 0 : 0xFFFFFFFF` | **Safe** |
| 67 | **op_logand** `AND` | `@@logic` then `and eax,ecx` | `a != 0n && b != 0n ? true32Bit : false32Bit` | `a = (a !== 0 && b !== 0) ? 0xFFFFFFFF : 0` | **Safe** |
| 68 | **op_logxor** `XOR` | `@@logic` then `xor eax,ecx` | `(a==0n&&b!=0n)\|\|(a!=0n&&b==0n) ? true32Bit : false32Bit` | `a = (!!a !== !!b) ? 0xFFFFFFFF : 0` | **Safe** |
| 69 | **op_logor** `OR` | `@@logic` then `or eax,ecx` | `a != 0n \|\| b != 0n ? true32Bit : false32Bit` | `a = (a !== 0 \|\| b !== 0) ? 0xFFFFFFFF : 0` | **Safe** |

### 2.14 Compound Encoding Operations

| # | Operation | x86 | Current TS | Number Equivalent | Safety |
|---|-----------|-----|-----------|-------------------|--------|
| 70 | **op_addbits** | `and eax,1Fh; and ecx,1Fh; shl ecx,5; or eax,ecx` | `(a & 31n) \| ((b & 31n) << 5n)` | `a = (a & 31) \| ((b & 31) << 5)` | **Safe** — max result = 0x3FF, positive |
| 71 | **op_addpins** | `and eax,3Fh; and ecx,1Fh; shl ecx,6; or eax,ecx` | `(a & 63n) \| ((b & 31n) << 6n)` | `a = (a & 63) \| ((b & 31) << 6)` | **Safe** — max result = 0x7FF, positive |

---

## 3. signExtendFrom32Bit() Analysis

### Current Implementation (line 11557)

```typescript
private signExtendFrom32Bit(value: bigint): bigint {
  let result: bigint = value & BigInt(0xffffffff);
  if (result & BigInt(0x80000000)) {
    result = -((result ^ BigInt(0xffffffff)) + 1n);
  }
  return result;
}
```

**Semantics:** Converts an unsigned 32-bit BigInt (0 to 2^32-1) to a signed BigInt (-2^31 to 2^31-1).

### Number Equivalent

In JavaScript, `value | 0` converts any Number to a signed 32-bit integer. This is the exact equivalent:

```typescript
// BigInt version: signExtendFrom32Bit(value)
// Number version: value | 0
```

**Proof of equivalence:**
- `0x7FFFFFFF | 0` = `2147483647` ✓ (max positive)
- `0x80000000 | 0` = `-2147483648` ✓ (min negative, MSB set)
- `0xFFFFFFFF | 0` = `-1` ✓ (all bits set)
- `0x00000000 | 0` = `0` ✓ (zero)

### Call Site Analysis

All 11 call sites require signed semantics. In a Number-based implementation:

| Call Site | Current Pattern | Number Pattern |
|-----------|----------------|----------------|
| Pointer index (lines 2733, 2746) | `Number(this.signExtendFrom32Bit(v))` | `v \| 0` (already Number) |
| Range bounds (lines 4082, 4086) | `Number(this.signExtendFrom32Bit(v))` | `v \| 0` |
| Constant compilation (line 8175) | `Number(this.signExtendFrom32Bit(v))` | `v \| 0` |
| Register address (line 9912) | `Number(this.signExtendFrom32Bit(v))` | `v \| 0` |
| Signed division (line 11194) | `this.signExtendFrom32Bit(a) / this.signExtendFrom32Bit(b)` | `Math.trunc((a\|0) / (b\|0))` then `>>> 0` |
| Signed remainder (line 11229) | `this.signExtendFrom32Bit(a) % this.signExtendFrom32Bit(b)` | `((a\|0) % (b\|0)) >>> 0` |
| SCAS (line 11245) | `this.signExtendFrom32Bit(a) * this.signExtendFrom32Bit(b)` | **Keep BigInt** (64-bit intermediate) |
| FGE/FLE (lines 11344, 11359) | `this.signExtendFrom32Bit(a) < signExtend(b)` | `(a\|0) < (b\|0)` |
| Comparisons (lines 11386, 11410+) | `this.signExtendFrom32Bit(a) < signExtend(b)` | `(a\|0) < (b\|0)` |
| LTEGT (lines 11519-11521) | Two sign-extends, compare | `(a\|0)` comparisons |

**The signExtendFrom32Bit() function can be eliminated entirely** — replaced by `| 0` at each call site (for the Number-based implementation). The function exists solely because BigInt has no built-in signed interpretation of 32-bit patterns.

---

## 4. Complete BigInt Site Inventory

### Summary by File

| File | BigInt Sites | Role | Conversion Complexity |
|------|-------------|------|----------------------|
| `spinResolver.ts` | 254 | Arithmetic engine | **HIGH** — core of the change |
| `spinElement.ts` | 36 | Value storage (`_value: bigint \| string`) | **MEDIUM** — change union type |
| `spinElementizer.ts` | 28 | String→number parsing | **LOW** — change `BigInt(parseInt(...))` to `parseInt(...)` |
| `float32.ts` | 14 | Float conversion boundary | **MEDIUM** — change function signatures |
| `mapGenerator.ts` | 14 | Debug map output | **LOW** — bit extraction |
| `numberStack.ts` | 7 | Expression eval stack | **LOW** — change `bigint[]` to `number[]` |
| `symbolTable.ts` | 6 | Symbol value storage | **LOW** — change type declarations |
| `spin2Parser.ts` | 4 | Value comparisons | **LOW** |
| `objectStructures.ts` | 4 | Binary output | **LOW** — output boundary |
| `objectSymbols.ts` | 3 | Symbol output | **LOW** |
| `spinDocument.ts` | 2 | Preprocessor symbols | **LOW** |
| `objInstanceInfo.ts` | 2 | Object instance data | **LOW** |
| `spinFiles.ts` | 1 | Override recording | **LOW** |
| **Total** | **372** | | |

### Usage Pattern Categories

**Category 1: Arithmetic (resolveOperation)** — 69 operations, ~150 sites
- The hot path. Every constant expression evaluation goes through here.
- All 32-bit integer operations can use Number.
- 3 operations (SCA/SCAS/FRAC) need local BigInt.

**Category 2: Storage boundaries** — ~80 sites
- `bigint | string` union types in SpinElement, SymbolTable, interfaces
- These change to `number | string`
- Mostly type annotations, not runtime behavior

**Category 3: Parsing/conversion** — ~40 sites
- `BigInt(parseInt(str, base))` in elementizer → becomes `parseInt(str, base)`
- `BigInt(charCodeAt(...))` → `charCodeAt(...)`
- `BigInt(dataView.getUint32(...))` → `dataView.getUint32(...)`

**Category 4: Output/formatting** — ~30 sites
- `Number(value & BigInt(0xffffffff))` → just `value >>> 0` or `value` directly
- Hex formatting already uses Number internally

**Category 5: Float conversion** — ~25 sites
- `bigIntFloat32ToNumber()` and `numberToBigIntFloat32()` change signatures
- Internal math is already Number — only the wrapper changes

**Category 6: Bit-field extraction** — ~20 sites
- `(value >> 8n) & 0xFFn` patterns → `(value >> 8) & 0xFF`
- All in positive-result range, straightforward

---

## 5. SCA/SCAS/FRAC Exception Handling

### The Problem

These three operations genuinely produce 64-bit intermediates:

| Operation | x86 Implementation | Intermediate Range |
|-----------|-------------------|-------------------|
| SCA | `mul ecx` (unsigned 32×32→64, return high 32) | 0 to 0xFFFFFFFE00000001 |
| SCAS | `imul ecx` + shift left 2 (signed 32×32→64, shift, return high 32) | -0x8000000000000000 to 0x7FFFFFFF80000002 |
| FRAC | `mov edx,eax; xor eax,eax; div ecx` (a<<32 / b) | 0 to 0xFFFFFFFE00000000 |

Number's safe integer range is 2^53. The maximum 64-bit product is ~2^64, far exceeding this.

### Test Suite Frequency

| Operation | Files | Total Occurrences | Usage Pattern |
|-----------|-------|-------------------|---------------|
| SCA | 7 | 43 | Encoding tests, real-world scaling |
| SCAS | 7 | 43 | Interpreter code, encoding tests |
| FRAC | 9 | 39+ | BLDC motor driver (46 alone), coverage tests |

These are **well-used operations** — not obscure corner cases.

### Recommended Approach: Local BigInt Conversion

```typescript
case eOperationType.op_sca: // SCA
  a = Number((BigInt(a) * BigInt(b)) >> 32n);
  break;

case eOperationType.op_scas: // SCAS
  a = Number(((BigInt(a | 0) * BigInt(b | 0)) >> 30n) & 0xFFFFFFFFn);
  break;

case eOperationType.op_frac: // FRAC
  if (b === 0) throw new Error('Divide by zero (m144)');
  {
    const result = (BigInt(a) << 32n) / BigInt(b);
    if ((result >> 32n) & 0xFFFFFFFFn) throw new Error('Division overflow');
    a = Number(result & 0xFFFFFFFFn);
  }
  break;
```

**Cost:** Two `BigInt()` conversions per call to these 3 operations.
**Frequency:** Low — these operations are uncommon in constant expressions (they're primarily used in runtime PASM code, not compile-time `CON` blocks).

### Alternative: Multi-word Arithmetic (Not Recommended)

Could implement 32×32→64 multiply using four 16×16 multiplies:
```typescript
function mulHigh32(a: number, b: number): number {
  const al = a & 0xFFFF, ah = (a >>> 16) & 0xFFFF;
  const bl = b & 0xFFFF, bh = (b >>> 16) & 0xFFFF;
  const mid = al * bh + ah * bl;
  return (ah * bh + (mid >>> 16) + ((al * bl >>> 16) + (mid & 0xFFFF) >>> 16)) >>> 0;
}
```
This avoids BigInt entirely but is error-prone and harder to verify. The BigInt-locally approach is simpler and the operations are infrequent enough that the cost is negligible.

---

## 6. Float32 Conversion Boundary Analysis

### Current Architecture

```
Source text → parseFloat → Float32Array → DataView.getUint32 → BigInt
                                                                   ↓
                              resolve operations (BigInt transport) ↓
                                                                   ↓
BigInt → DataView.setUint32 → Float32Array[0] → Number (f64) ← bigIntFloat32ToNumber
         Number (f64) → Float32Array[0] → DataView.getUint32 → BigInt ← numberToBigIntFloat32
```

### Function Signature Changes Needed

| Function | Current Signature | New Signature |
|----------|------------------|---------------|
| `stringToFloat32` | `(numStr: string): bigint` | `(numStr: string): number` |
| `float32ToHexString` | `(float32: bigint): string` | `(float32: number): string` |
| `bigIntFloat32ToNumber` | `(float32BigInt: bigint): number` | `(float32Uint: number): number` |
| `numberToBigIntFloat32` | `(float64: number): bigint` | `(float64: number): number` |
| `hexString` | `(value: bigint \| number \| string): string` | `(value: number \| string): string` |

### Internal Logic Changes

**`stringToFloat32`** — change last line:
```typescript
// Current: return BigInt(dataView.getUint32(0, true));
// New:     return dataView.getUint32(0, true);
```

**`bigIntFloat32ToNumber`** — change masking line:
```typescript
// Current: dataView.setUint32(0, Number(float32BigInt & BigInt(0xffffffff)), true);
// New:     dataView.setUint32(0, float32Uint >>> 0, true);
```

**`numberToBigIntFloat32`** — change last line:
```typescript
// Current: return BigInt(dataView.getUint32(0, true));
// New:     return dataView.getUint32(0, true);
```

**The internal float math is completely unchanged.** The Float32Array / DataView pipeline that does the actual IEEE 754 conversion is identical. We're only changing the wrapper type on input/output.

### Root Cause of ±1 ULP Differences (Pre-existing)

The original PNut compiler implements **custom software floating-point** with:
- Mantissa bit29-justified (30 bits with 2 guard bits for rounding)
- Rounding: `add eax, 100h` (adds 0.5 ULP at bit 8 of 32-bit register)
- Subnormal handling: explicit shift loop

PNut-TS uses JavaScript's **hardware IEEE 754** via `Float32Array`:
- Standard round-to-nearest-even
- Hardware subnormal handling

These are fundamentally different rounding paths. The ±1 ULP difference is architectural, not a bug. It cannot be fixed without reimplementing the custom software float routines (which would be a separate project). This difference is **completely independent** of BigInt vs Number.

---

## 7. Value Type Propagation Chain

### Complete Flow Diagram

```
                      SOURCE TEXT
                          │
                          ▼
              ┌───────────────────────┐
              │   SpinElementizer     │
              │                       │
              │ parseInt(str, base)   │──── Currently: BigInt(parseInt(...))
              │ charCodeAt(ch)        │──── Currently: BigInt(charCodeAt(...))
              │ stringToFloat32(str)  │──── Currently: returns bigint
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    SpinElement        │
              │                       │
              │ _value: bigint|string │──── Stored as bigint for numbers
              │                       │──── Stored as string for identifiers
              │ bigintValue: bigint   │──── Accessor (returns _value or 0n)
              │ numberValue: number   │──── Accessor (Number(_value))
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    SymbolTable        │
              │                       │
              │ iSymbol.value:        │──── bigint | string union
              │   bigint|string       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │    SpinResolver       │
              │                       │
              │ getValue() →          │──── iValueReturn { value: bigint }
              │   iValueReturn        │
              │                       │
              │ NumberStack           │──── bigint[] array
              │   push(bigint)        │
              │   pop(): bigint       │
              │                       │
              │ resolveOperation()    │──── (bigint, bigint) → bigint
              │   66 ops: BigInt math │     ← ALL can be Number
              │   3 ops: 64-bit math  │     ← Must keep BigInt locally
              │                       │
              │ signExtendFrom32Bit() │──── bigint → signed bigint
              │                       │     ← Replaced by: value | 0
              │                       │
              │ Float ops:            │
              │   bigIntFloat32ToNum()│──── bigint → Number (for math)
              │   numToBigIntFloat32()│──── Number → bigint (for storage)
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   ObjectImage /       │
              │   ObjectStructures /  │
              │   ObjectSymbols       │
              │                       │
              │ enterLong(bigint)     │──── Number(value & 0xFFFFFFFF)
              │ writeLong(bigint)     │──── writes 4 bytes to buffer
              └───────────────────────┘
                          │
                          ▼
                    BINARY OUTPUT
```

### Conversion Points in the Chain

| Boundary | Current Conversion | New Conversion |
|----------|-------------------|----------------|
| Text → Element | `BigInt(parseInt(str))` | `parseInt(str)` |
| Element → Resolver | `element.bigintValue` | `element.numberValue` or just `element.value` |
| Resolver → Stack | `numberStack.push(bigint)` | `numberStack.push(number)` |
| Stack → Resolver | `numberStack.pop(): bigint` | `numberStack.pop(): number` |
| Resolver → Float | `bigIntFloat32ToNumber(bigint)` | `float32UintToNumber(number)` |
| Float → Resolver | `numberToBigIntFloat32(number)` | `numberToFloat32Uint(number)` |
| Resolver → Output | `Number(value & BigInt(0xFFFFFFFF))` | `value >>> 0` |

---

## 8. Signed/Unsigned Pattern Reference

### JavaScript 32-bit Conversion Cheat Sheet

| Need | JavaScript Idiom | Notes |
|------|-----------------|-------|
| Unsigned 32-bit | `x >>> 0` | Treats as unsigned, returns 0 to 0xFFFFFFFF |
| Signed 32-bit | `x \| 0` | Treats as signed, returns -2^31 to 2^31-1 |
| NOT | `~x` | Returns signed; use `(~x) >>> 0` for unsigned |
| AND | `x & y` | Result is signed; use `(x & y) >>> 0` |
| OR | `x \| y` | Result is signed; use `(x \| y) >>> 0` |
| XOR | `x ^ y` | Result is signed; use `(x ^ y) >>> 0` |
| Left shift | `x << n` | Result is signed; use `(x << n) >>> 0` |
| Logical right shift | `x >>> n` | Always unsigned |
| Arithmetic right shift | `(x \| 0) >> n` | Signed; use `((x\|0) >> n) >>> 0` for unsigned result |
| Signed multiply (low 32) | `Math.imul(x, y)` | Returns signed; use `Math.imul(x,y) >>> 0` |
| Signed comparison | `(a\|0) < (b\|0)` | Interprets both as signed |
| Unsigned comparison | `(a>>>0) < (b>>>0)` | Interprets both as unsigned |
| Signed divide | `Math.trunc((a\|0) / (b\|0))` | Must use Math.trunc! |
| Negate | `(-x) >>> 0` | Two's complement negate |

### Critical Rule

**All resolveOperation() results must be stored as unsigned 32-bit values** (0 to 0xFFFFFFFF). Use `>>> 0` on the result of any operation that might produce a signed value.

The internal storage format is always unsigned. Signed interpretation happens only at the point of comparison or sign-dependent operation, using `| 0`.

---

## 9. Edge Cases and Risk Areas

### 9.1 Known Behavioral Differences (Pre-existing, Not BigInt-Related)

| Area | Difference | Impact |
|------|-----------|--------|
| QLOG precision | TS: `Math.log2` (IEEE 754 double). x86: CORDIC with 31 iterations on 38-bit values | ±2 bits. Rounding adjustment (`+ 0.5`) minimizes but can't eliminate |
| QEXP precision | TS: `Math.pow(2, x)`. x86: CORDIC | ±3 bits. Rounding adjustment (`+ 0.25`) |
| Float multiply rounding | TS: round-to-nearest-even (IEEE 754). x86: custom round at bit 8 of bit29-justified mantissa | ±1 ULP occasionally |
| Float divide | TS: single hardware division. x86: 30-iteration bit-by-bit division | ±1 ULP occasionally |
| Float sqrt | TS: `Math.sqrt()`. x86: bit-search on unpacked mantissa | ±1 ULP occasionally |

### 9.2 Edge Values That Must Be Tested

| Value | Hex | Significance |
|-------|-----|-------------|
| Zero | `0x00000000` | Identity, division-by-zero check |
| One | `0x00000001` | Minimum positive |
| Max positive signed | `0x7FFFFFFF` | Boundary: `\| 0` = +2147483647 |
| Min negative signed | `0x80000000` | Boundary: `\| 0` = -2147483648 |
| All ones | `0xFFFFFFFF` | `-1` signed, max unsigned |
| Float +1.0 | `0x3F800000` | Used as true in float comparisons |
| Float -1.0 | `0xBF800000` | Negative float |
| Float overflow | `0x7F800000` | Infinity (overflow check) |

### 9.3 Shift Count Edge Case

x86 `shl`/`shr` with `cl` uses the **lower 5 bits** of the count (i.e., modulo 32). The current TS code uses `b & 31n` which matches this. With Number, JS bitwise shifts also use modulo 32 natively, so `a << (b & 31)` is equivalent to `a << b` for shift operations (JS already masks to 5 bits). However, we should still mask explicitly for clarity.

**ROL/ROR with count=0:** In x86, `rol eax, 0` is a no-op. In JS, `a >>> 32` gives 0 (not the original value). The current BigInt implementation handles this correctly because `32n - 0n = 32n` and `a >> 32n = 0` for 32-bit values. With Number, the same issue applies: `(a >>> 0) | (a << 32)` — `a << 32` gives 0 in JS. This is a non-issue because the mask `b & 31` means `b=0` → shift by 0, which is correct for both `>>>` and `<<`.

### 9.4 Division Truncation Direction

x86 `idiv` truncates toward zero: `-7 / 2 = -3` (not -4).
JavaScript `/` produces floating-point: `-7 / 2 = -3.5`.
**Must use `Math.trunc()`** for signed integer division.

BigInt `/` already truncates toward zero, matching `idiv`. This is why the current code works correctly. The Number conversion **must** add `Math.trunc()` to maintain correctness.

### 9.5 op_neg Edge Case: 0x80000000

- x86: `neg eax` where eax=0x80000000 → result is 0x80000000 (overflow wraps, same value)
- Current TS: `((0x80000000 ^ 0xFFFFFFFF) + 1) & 0xFFFFFFFF` = `(0x7FFFFFFF + 1) & 0xFFFFFFFF` = `0x80000000` ✓
- Number: `(-0x80000000) >>> 0` = `(-(-2147483648)) >>> 0` = `2147483648 >>> 0` = `0x80000000` ✓

All three agree.

---

## 10. Strengths, Weaknesses, and Opportunities

### Where PNut-TS Is Strong

1. **Integer arithmetic correctness is excellent.** The BigInt approach guarantees no precision loss on any 32-bit operation. Every operation has been carefully ported with explicit masking. The regression test suite (180+ files with GOLD file comparison) validates this comprehensively.

2. **Division semantics are correct.** The use of `signExtendFrom32Bit()` before BigInt division produces the right truncation-toward-zero behavior, matching `idiv`/`cdq`.

3. **Bit manipulation is thorough.** REV, ZEROX, SIGNX, ENCOD, DECOD, BMASK — all implement the exact x86 algorithms faithfully.

4. **Float transport is clean.** The `bigIntFloat32ToNumber` / `numberToBigIntFloat32` pair cleanly separates the bit-pattern storage (BigInt/Number) from the actual IEEE 754 math (always Number via Float32Array).

### Where PNut-TS Has Weaknesses

1. **Float precision diverges from original.** The original uses custom bit29-justified software float with manual rounding (`add eax, 100h`). PNut-TS uses hardware IEEE 754. This produces ±1 ULP differences. The codebase has comments acknowledging this and hand-tuned rounding constants (QLOG: `+0.5`, QEXP: `+0.25`).

2. **QLOG/QEXP use different algorithms entirely.** The original uses a carefully-tuned CORDIC with 31 iterations and 38-bit intermediate precision. PNut-TS uses `Math.log2` and `Math.pow` which follow completely different numerical paths. The rounding adjustments are empirical, not proven.

3. **Performance overhead from BigInt.** Every 32-bit operation pays the BigInt allocation and masking tax. This is the core issue this research addresses.

4. **ENCOD(0) behavior.** The x86 implementation loops `ecx` from 31 down. If no bit is found, `loop` decrements to 0 and falls through. The result is `ecx=0`, meaning ENCOD(0)=0. The TS implementation also returns 0 for input 0 (the `bitPosition` is initialized to 0n and never updated). These agree, but the behavior is worth documenting.

### Opportunities for Improvement

1. **BigInt→Number conversion (this research).** Estimated 8-15% compilation speedup with zero behavioral change for 66/69 operations.

2. **Math.clz32 for ENCOD.** Replace the 32-iteration loop with `31 - Math.clz32(a)`. Single CPU instruction on most platforms.

3. **Popcount for ONES.** Replace the 32-iteration loop with Brian Kernighan's bit trick or a lookup table. Modern JS engines may even optimize `Math.popcount` if/when it's standardized.

4. **SQRT: Math.sqrt shortcut.** For integer SQRT, `Math.sqrt(a) | 0` with a one-off correction check would be faster than a 16-iteration binary search. But must verify edge-case correctness against the binary search.

5. **Float operations: consider reimplementing custom software float.** To achieve bit-exact compatibility with the original PNut compiler (eliminating the ±1 ULP differences), we could reimplement the `fp_unpack`/`fp_pack`/`fp_add`/`fp_mul`/`fp_div` routines in TypeScript. This would be a significant effort (~500 lines) but would eliminate all float-related GOLD file discrepancies. This is a separate project from BigInt→Number.

---

## 11. Recommendations for Implementation Phase

### Phase 1: Core Type Change (Highest Risk, Highest Reward)

1. Change `resolveOperation()` signature from `(bigint, bigint, ...) → bigint` to `(number, number, ...) → number`
2. Change `NumberStack` from `bigint[]` to `number[]`
3. Change `iValueReturn.value` from `bigint` to `number`
4. Change `SpinElement._value` from `bigint | string` to `number | string`
5. Change `iSymbol.value` from `bigint | string` to `number | string`

### Phase 2: Operation Implementation

1. Replace all operations using the patterns in Section 2
2. For SCA/SCAS/FRAC: use local BigInt conversion (3 sites)
3. Eliminate `signExtendFrom32Bit()` — replace with `| 0` at each call site
4. Replace `BigInt(0xffffffff)` masks with `>>> 0` unsigned coercion

### Phase 3: Boundary Updates

1. Update `float32.ts` function signatures
2. Update `spinElementizer.ts` parsing: `BigInt(parseInt(str))` → `parseInt(str)`
3. Update `objectStructures.ts` / `objectSymbols.ts` output: remove `BigInt()` wrapping
4. Update `mapGenerator.ts` bit extraction

### Phase 4: Validation

1. Run `npm run build` — fix all TypeScript type errors
2. Run `npm test` — all 180+ regression tests must pass
3. Run `npm run test-full` — complete validation
4. Spot-check SCA/SCAS/FRAC operations with edge values
5. Verify float operations haven't changed behavior (same ±1 ULP as before)

### Key Principle

**Every operation result stored in the resolver must be an unsigned 32-bit Number** (0 to 0xFFFFFFFF). Use `>>> 0` to ensure this. Signed interpretation (`| 0`) happens only at the point of signed comparison or signed arithmetic, never in storage.
