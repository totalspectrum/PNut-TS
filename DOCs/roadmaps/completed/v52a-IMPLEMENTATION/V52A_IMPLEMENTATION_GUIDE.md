# V52A Implementation Guide for PNut-ts

This document provides the precise implementation details an agent needs to implement v52a changes in PNut-ts. It complements `v52a_CHANGES.md` (what changed) and `V52A_LANGUAGE_REFERENCE_ADDITIONS.md` (user-facing spec) with the algorithmic and structural detail required for implementation.

**Source reference:** All code excerpts below are from `v52a/p2com.asm` and `v52a/Spin2_interpreter.spin2` unless noted.

---

## 1. Version Constant

```asm
spin2_version = 52    ; was 51 in v51a
```

Update the PNut-ts equivalent of `spin2_version` from 51 to 52.

---

## 2. New Bytecodes

Three new bytecodes are appended after `bc_task_return` ($E2). They use the `count2` macro which increments by 2 (bytecodes are word-aligned in the dispatch table):

```asm
count2    bc_task_return              ; $E2

count2    bc_movbyts                  ; $E4  - hub bytecodes, miscellaneous routines
count2    bc_endianl                  ; $E6
count2    bc_endianw                  ; $E8
```

Add these three bytecodes to the PNut-ts bytecode enum, values $E4, $E6, $E8.

---

## 3. Flexcode Format and New Entries

### 3.1 Flexcode Macro Format

The `flexcode` macro packs 6 fields into a single computed constant:

```asm
macro flexcode symbol, bytecode, params, results, pinfld, hubcode
symbol = bytecode + (params shl 8) + (results shl 11) + (pinfld shl 14) + (hubcode shl 15)
endm
```

| Field | Bits | Mask | Description |
|-------|------|------|-------------|
| `bytecode` | 7:0 | `$FF` | The bytecode value |
| `params` | 10:8 | `flex_params` = `$07` (after shift) | Number of input parameters (0-7) |
| `results` | 13:11 | `flex_results` = `$38` (after shift) | Number of return values (0-7) |
| `pinfld` | 14 | `flex_pinfld` = `$40` (after shift) | Pin field flag (first param is pin range) |
| `hubcode` | 15 | `flex_hubcode` = `$80` (after shift) | Hub execution flag |

### 3.2 New Flexcode Entries

Add these three entries after `fc_xypol` and before `fc_float`:

```asm
;         symbol        bytecode      params results pinfld hubcode
flexcode  fc_movbyts,   bc_movbyts,   2,     1,      0,     1       ;(also asm instruction)
flexcode  fc_endianl,   bc_endianl,   1,     1,      0,     1
flexcode  fc_endianw,   bc_endianw,   1,     1,      0,     1
```

**Note:** The v52a source has missing commas after `bc_endianl` and `bc_endianw` on lines 1267-1268. This appears to be a source typo that the assembler tolerates. In PNut-ts, use the correct values: `fc_endianl = bc_endianl + (1 << 8) + (1 << 11) + (0 << 14) + (1 << 15)`, and same pattern for `fc_endianw`.

### 3.3 Computed Flexcode Values

For reference, the computed constant values are:

| Symbol | Bytecode | Params | Results | Pinfld | Hubcode | Computed Value |
|--------|----------|--------|---------|--------|---------|----------------|
| `fc_movbyts` | $E4 | 2 | 1 | 0 | 1 | $E4 + $200 + $800 + $0 + $8000 = $8AE4 |
| `fc_endianl` | $E6 | 1 | 1 | 0 | 1 | $E6 + $100 + $800 + $0 + $8000 = $89E6 |
| `fc_endianw` | $E8 | 1 | 1 | 0 | 1 | $E8 + $100 + $800 + $0 + $8000 = $89E8 |

---

## 4. Symbol Table Changes

### 4.1 MOVBYTS Reclassification

**v51a** — MOVBYTS was `type_asm_inst` (PASM2-only):
```asm
sym  type_asm_inst,  ac_movbyts,  'MOVBYTS'       ; line ~20546 in v51a
```

**v52a** — MOVBYTS is `type_i_flex` (Spin2 function + PASM2 instruction):
```asm
sym  type_i_flex,    fc_movbyts   'MOVBYTS'        ; line ~20316, moved earlier in table
```

The old `type_asm_inst` entry is commented out with a note:
```asm
;  sym  type_asm_inst,  ac_movbyts,  'MOVBYTS'    (declared as type_i_flex)
```

**Action:** Change the MOVBYTS symbol entry from `type_asm_inst` / `ac_movbyts` to `type_i_flex` / `fc_movbyts`.

### 4.2 Level 52 Symbols

Add a new versioned symbol table loaded when `spin2_level >= 52`:

```asm
level52_symbols:
    sym  type_i_flex,    fc_endianl,   'ENDIANL'
    sym  type_i_flex,    fc_endianw,   'ENDIANW'
    sym  type_con_int,   27,           'DEBUG_END_SESSION'
    db   0                              ; end marker
```

These three symbols are gated by the `{Spin2_v52}` version directive. They load **after** `level51_symbols`.

**Note:** MOVBYTS is NOT in `level52_symbols` -- it's in the base (ungated) symbol table because it was already a PASM2 instruction.

---

## 5. MOVBYTS PASM2 Mapping (The `@@checkflex` Routine)

When the compiler encounters a symbol in PASM2 context (inline ORG/ORGH or DAT block), it checks whether a `type_i_flex` symbol has a corresponding assembly instruction. This is the `@@checkflex` routine.

### 5.1 The Change

**v51a** — `@@checkflex` started with `ac_hubset`:
```asm
@@checkflex:  push   eax
              mov    eax,ac_hubset        ;HUBSET ?
              cmp    ebx,fc_hubset
              je     @@checkok
              ; ... other flex-to-asm mappings ...
```

**v52a** — `@@checkflex` now starts with `ac_movbyts` (new first entry):
```asm
@@checkflex:  push   eax
              mov    eax,ac_movbyts       ;MOVBYTS ?
              cmp    ebx,fc_movbyts
              je     @@checkok
              mov    eax,ac_hubset        ;HUBSET ?
              cmp    ebx,fc_hubset
              je     @@checkok
              ; ... rest unchanged ...
```

### 5.2 The Complete Flex-to-ASM Mapping Table

The `@@checkflex` routine is a linear search that maps flex codes to assembly opcodes for PASM2 context. Here is the complete list (all existing entries, with the new one marked):

| Flex Code | Assembly Code | Instruction | New in v52a? |
|-----------|--------------|-------------|--------------|
| `fc_movbyts` | `ac_movbyts` | MOVBYTS | **YES** |
| `fc_hubset` | `ac_hubset` | HUBSET | no |
| `fc_coginit` | `ac_coginit` | COGINIT | no |
| `fc_cogstop` | `ac_cogstop` | COGSTOP | no |
| `fc_cogid` | `ac_cogid` | COGID | no |
| `fc_getrnd` | `ac_getrnd` | GETRND | no |
| `fc_getct` | `ac_getct` | GETCT | no |
| `fc_wrpin` | `ac_wrpin` | WRPIN | no |
| `fc_wxpin` | `ac_wxpin` | WXPIN | no |
| `fc_wypin` | `ac_wypin` | WYPIN | no |
| `fc_akpin` | `ac_akpin` | AKPIN | no |
| `fc_rdpin` | `ac_rdpin` | RDPIN | no |
| `fc_rqpin` | `ac_rqpin` | RQPIN | no |
| `fc_locknew` | `ac_locknew` | LOCKNEW | no |
| `fc_lockret` | `ac_lockret` | LOCKRET | no |
| `fc_locktry` | `ac_locktry` | LOCKTRY | no |
| `fc_lockrel` | `ac_lockrel` | LOCKREL | no |
| `fc_cogatn` | `ac_cogatn` | COGATN | no |
| `fc_pollatn` | `ac_pollatn` | POLLATN | no |
| `fc_waitatn` | `ac_waitatn` | WAITATN | no |
| `fc_call` | `ac_call` | CALL | no |

If none match, the symbol is not valid in PASM2 context. The check falls through to `@@checknot`.

### 5.3 The Assembly Opcode for MOVBYTS

```asm
asmcode  ac_movbyts,  100111111b, 00b, operand_ds    ; MOVBYTS D,S/#
```

This is unchanged from v51a -- the instruction encoding was already defined. What changed is only the symbol table path that reaches it.

### 5.4 Full Control Flow

When a PASM2 instruction is being assembled:

```
1. get_element() → returns type + value
2. If type == type_asm_inst → use value as ac_* directly → @@checkdone
3. If type == type_i_flex  → enter @@checkflex
   a. Linear search: compare value against each fc_* constant
   b. If match found: replace with corresponding ac_* → @@checkok
   c. If no match: not a valid PASM2 instruction → @@checknot
4. If type == type_op      → enter @@checkop (similar mapping for operators)
5. @@checkok: ebx = ac_* opcode, continue assembling
6. @@checknot: pop eax, continue (will likely error)
7. @@checkdone: ret
```

**Action:** Add the `fc_movbyts → ac_movbyts` mapping to PNut-ts's equivalent of this PASM2 instruction resolution logic.

---

## 6. NEXT/QUIT Level Implementation

This is the most complex change. The `ci_next_quit` routine was substantially rewritten.

### 6.1 Entry Point

```
ci_next_quit:
  Entry: bl = 0 for NEXT, bl = 1 for QUIT
```

### 6.2 Parse the Level Parameter

```asm
ci_next_quit:
    call  check_end              ; is there anything after NEXT/QUIT?
    jne   @@getlevel             ; yes → parse level
    call  back_element           ; no → end of line, back up
    mov   bh, 0                  ; level = 0 (current level)
    je    @@gotlevel

@@getlevel:
    mov   al, bl                 ; save NEXT/QUIT flag
    call  get_value_int          ; parse integer → ebx
    cmp   ebx, 1
    jl    @@levelerror           ; level < 1 → error
    cmp   ebx, block_nest_limit-1  ; = 15
    jle   @@levelok              ; level <= 15 → ok
@@levelerror:
    jmp   error_nqlcmb           ; "NEXT/QUIT level must be from 1 to 15"
@@levelok:
    mov   bh, bl                 ; bh = level (1..15) — levels still to skip
    mov   bl, al                 ; restore bl = NEXT(0) / QUIT(1)
@@gotlevel:
```

**Key:** `bh` = remaining levels to skip. Value 0 means "target this level" (the default when no level is specified). Value N (from parsed input) means "skip N REPEAT blocks, target the Nth one."

### 6.3 Block Nest Traversal

The traversal walks DOWN the block nest stack (from current to outermost), accumulating pop counts for intermediate blocks:

```asm
    mov  ecx, [bnest_ptr]        ; current nest depth
    mov  edx, 0                  ; accumulated pop byte count

@@find:
    cmp  ecx, 0                  ; out of blocks?
    je   error_nqinsn            ; "NEXT/QUIT is not sufficiently nested"

    mov  al, [bnest_type-1+ecx]  ; get this block's type
    mov  ah, bc_jmp              ; default branch = unconditional jump
```

### 6.4 Pop Count Table by Block Type

This is the critical implementation detail. For each block type encountered during traversal:

| Block Type | At Target Level (bh=0) NEXT | At Target Level (bh=0) QUIT | Intermediate Level (bh>0) | Notes |
|------------|---------------------------|----------------------------|--------------------------|-------|
| `type_repeat` | 0 pops, branch with `bc_jmp` | 0 pops, branch with `bc_jmp` | Decrement bh, continue search | Plain REPEAT has nothing on stack |
| `type_repeat_var` | 0 pops, branch with `bc_jmp` | 4 longs (16 bytes) pop, branch with `bc_jmp` | 4 longs (16 bytes) pop, continue search | REPEAT-VAR has 4 longs on stack (from, to, step, var) |
| `type_repeat_count_var` | 0 pops, branch with `bc_jmp` | 4 longs (16 bytes) pop, branch with `bc_jmp` | 4 longs (16 bytes) pop, continue search | Same as repeat_var |
| `type_repeat_count` | 0 pops, branch with `bc_jmp` | 0 pops, branch with `bc_jnz` (pops the count) | 1 long (4 bytes) pop, continue search | REPEAT-COUNT has 1 long on stack; bc_jnz consumes it at target |
| `type_case` | — (not a REPEAT, always intermediate) | — | 2 longs (8 bytes) pop, continue search | CASE has 2 longs on stack |
| `type_case_fast` | — (not a REPEAT, always intermediate) | — | 1 long (4 bytes) pop, continue search | CASE_FAST has 1 long on stack |
| `type_if` | — (not a REPEAT, always intermediate) | — | 0 pops, continue search | IF has nothing on stack |
| anything else | — | — | `error_internal` | Should never happen |

### 6.5 The Algorithm in Detail

Here is the complete traversal as pseudocode:

```
function ci_next_quit(is_quit: boolean):
    level = parse_optional_level()   // 0 if omitted, 1..15 if specified
    remaining = level                // levels still to skip
    pop_bytes = 0                    // accumulated pop count in bytes
    ecx = bnest_ptr                  // current block nest depth
    branch_type = bc_jmp             // default branch instruction

    loop:
        if ecx == 0:
            error "NEXT/QUIT is not sufficiently nested"

        block_type = bnest_type[ecx - 1]
        branch_type = bc_jmp         // reset default each iteration

        switch block_type:
            case type_repeat:
                // No stack cleanup needed for plain REPEAT
                goto found_repeat

            case type_repeat_var, type_repeat_count_var:
                if is_quit OR remaining > 0:
                    pop_bytes += 16  // 4 longs
                // else: target-level NEXT needs no pops
                goto found_repeat

            case type_repeat_count:
                if remaining > 0:
                    pop_bytes += 4   // 1 long (intermediate level)
                    goto found_repeat
                // At target level:
                if is_quit:
                    branch_type = bc_jnz  // bc_jnz pops the non-zero count value
                // else: NEXT needs no pops
                goto found_repeat

            case type_case:
                pop_bytes += 8       // 2 longs
                goto skip_block

            case type_case_fast:
                pop_bytes += 4       // 1 long
                goto skip_block

            case type_if:
                goto skip_block      // no pops needed

            default:
                error_internal       // should never happen

        found_repeat:
            remaining -= 1
            if remaining >= 0:       // not yet at target level
                goto skip_block      // keep searching outward
            // else: this IS the target REPEAT block
            goto emit_code

        skip_block:
            ecx -= 1                // move to outer block
            goto loop

    emit_code:
        // Emit pop instructions
        if pop_bytes > 0:
            if pop_bytes == 4:
                emit(bc_pop)         // single pop
            else:
                emit(bc_pop_rfvar)   // multi-pop
                emit_rfvar(pop_bytes - 4)  // -4 because interpreter does final pop

        // Get branch target address
        base = bstack_base[ecx - 1]
        if is_quit:
            target_addr = bstack[base + 1]  // QUIT address
        else:
            target_addr = bstack[base + 0]  // NEXT address

        emit_branch(branch_type, target_addr)
```

### 6.6 Key Differences from v51a

**v51a** `ci_next_quit`:
- No level parameter parsing
- Only finds the FIRST enclosing REPEAT block
- For NEXT: no pops needed regardless of block type (always goes to innermost)
- For QUIT: pops for the found REPEAT's type only
- Separate `@@quit` label with different branch address lookup

**v52a** `ci_next_quit`:
- Parses optional level parameter (1..15)
- Traverses multiple REPEAT blocks, decrementing `bh` at each one
- For NEXT with level > 1: intermediate REPEAT-VAR blocks need 4 long pops (same as QUIT)
- For NEXT with level > 1: intermediate REPEAT-COUNT blocks need 1 long pop
- Unified branch compilation: uses `ecx` offset, +1 for QUIT vs +0 for NEXT
- New errors: `error_nqlcmb` and `error_nqinsn` replace `error_tioawarb`

### 6.7 bc_pop_rfvar Encoding

When multiple pops are needed, the compiler emits `bc_pop_rfvar` followed by an rfvar-encoded byte count. The rfvar value is `pop_bytes - 4` because the interpreter performs one final manual long pop itself.

Example: If `pop_bytes` = 16 (4 longs), emit `bc_pop_rfvar` + rfvar(12).

---

## 7. Error Message Changes

### 7.1 Removed Error

```asm
; v51a — REMOVED in v52a:
error_tioawarb:  call set_error
                 db   'This instruction is only allowed within a REPEAT block',0
```

### 7.2 New Errors

```asm
; v52a — NEW:
error_nqinsn:    call set_error
                 db   'NEXT/QUIT is not sufficiently nested within REPEAT block(s)',0

error_nqlcmb:    call set_error
                 db   'NEXT/QUIT level must be from 1 to 15',0
```

### 7.3 Changed Error

```asm
; v51a:
error_eelcoeol:  call set_error
                 db   'Expected "=" "[" "," "(" or end of line',0

; v52a:
error_eelcoeol:  call set_error
                 db   'Expected "=", "[" ",", or end of line',0
```

The `"("` option was removed and the quoting style slightly changed.

---

## 8. Interpreter Routines

### 8.1 New Dispatch Table Entries

Appended to the hub bytecode dispatch table after `bc_task_return`:

```spin2
bc_task_return  word  @task_return_   'task return, stops task or cog     $E2

bc_movbyts      word  @movbyts_       'MOVBYTS(long,pattern)       (push) $E4
bc_endianl      word  @endianl_       'ENDIANL(long)               (push) $E6
bc_endianw      word  @endianw_       'ENDIANW(word)               (push) $E8
```

### 8.2 New Interpreter Routines

```spin2
' MOVBYTS(long, pattern)
'
movbyts_    mov     w,x             'get pattern into w
            popa    x               'pop long into top of stack
    _ret_   movbyts x,w             'do MOVBYTS

' ENDIANL(long)
' ENDIANW(word)
'
endianw_    shl     x,#16           'for ENDIANW, shift word up and clear lower word
endianl_  _ret_  movbyts x,#%%0123  'get reverse-endian word/long
```

**Key implementation detail:** `endianw_` falls through into `endianl_`. The `shl x, #16` shifts the 16-bit value into the upper word, clearing the lower word. Then `movbyts x, #%%0123` reverses all four bytes, putting the original low byte into the high position of the result's lower word.

### 8.3 Debugnop Offset Shift

The three new dispatch table entries (6 bytes, long-aligned to 8 bytes) shift the `@@debugnop` offset:

```
v51a: @@debugnop = $0F2C
v52a: @@debugnop = $0F34  (shift of +8 bytes)
```

The debugnop instructions in the interpreter are patched by the compiler at link time:

```spin2
_debugnop1_   dirh    #63-63          'write clkfreq to rx pin long repository
_debugnop2_   wxpin   z,#63-63
_debugnop3_   dirl    #63-63          '(these 3 are NOP'd by compiler if not DEBUG)
```

**Action:** If PNut-ts embeds the interpreter image, the debugnop offset must be updated from $0F2C to $0F34.

---

## 9. CORDIC Exp Rounding Fix

In the constant expression evaluator's CORDIC `@@exp_post` routine:

```asm
@@exp_post:   mov   eax,[@@x+0]       ;qexp post-fix
              mov   edx,[@@x+4]
              add   eax,[@@y+0]
              adc   edx,[@@y+4]
              add   eax,40h            ; <<< was 20h in v51a
              adc   edx,0
              mov   cl,7
```

**Change:** `add eax, 20h` → `add eax, 40h`

This affects the rounding precision of EXP2/EXP10/EXP constant expressions evaluated at compile time. The effect is that some floating-point constant expression results may differ in the least significant bits.

**Action:** Find the CORDIC/exp constant expression evaluator in PNut-ts and change the rounding bias from $20 to $40.

---

## 10. Minor: ASCII Print Threshold

In the listing/dump output code:

```asm
; v51a:
cmp   al,' '           ; printable ASCII threshold

; v52a:
cmp   al,20h           ;TESTT change to 30h
```

The logic is unchanged (both compare against space/$20), but the comment suggests this may change to $30 in a future version. This affects listing file output.

---

## 11. Implementation Checklist

| # | Change | Category | Complexity |
|---|--------|----------|------------|
| 1 | `spin2_version` = 52 | Constant | Trivial |
| 2 | Add bytecodes $E4, $E6, $E8 | Enum | Simple |
| 3 | Add flexcode entries `fc_movbyts`, `fc_endianl`, `fc_endianw` | Table | Simple |
| 4 | Reclassify MOVBYTS symbol: `type_asm_inst` → `type_i_flex` | Symbol table | Simple |
| 5 | Add `fc_movbyts → ac_movbyts` to PASM2 flex-to-asm mapping | PASM2 compiler | Simple |
| 6 | Add `level52_symbols` table (ENDIANL, ENDIANW, DEBUG_END_SESSION) | Symbol table | Simple |
| 7 | Rewrite `ci_next_quit` for level parameter | Compiler | **Complex** |
| 8 | Add error `error_nqinsn` | Error table | Simple |
| 9 | Add error `error_nqlcmb` | Error table | Simple |
| 10 | Remove error `error_tioawarb` | Error table | Simple |
| 11 | Change error `error_eelcoeol` string | Error table | Trivial |
| 12 | CORDIC exp rounding: $20 → $40 | Constant expr | Simple |
| 13 | Update interpreter image (3 new dispatch entries + routines) | Interpreter | Medium |
| 14 | Update debugnop offset $0F2C → $0F34 | Interpreter | Simple |

**Recommended implementation order:** 1 → 2 → 3 → 4 → 5 → 6 → 8-11 → 12 → 7 → 13-14

Do the simpler symbol/bytecode/flexcode changes first. Tackle the NEXT/QUIT rewrite after the infrastructure is in place. Do interpreter changes last since they depend on the bytecodes being defined.

---

## 12. Regression Test Files

See `regression_tests/README.md` for the full test file index. Key files for v52a validation:

| Test File | Covers |
|-----------|--------|
| `v52a_test_movbyts.spin2` | MOVBYTS as Spin2 function + inline PASM2 (ORG, ORGH, immediate) |
| `v52a_test_endian.spin2` | ENDIANL, ENDIANW, PASM2 equivalence tests |
| `v52a_test_next_quit_level.spin2` | NEXT/QUIT level 1-3, all REPEAT types, CASE nesting |
| `v52a_test_debug_end_session.spin2` | DEBUG_END_SESSION constant |
| `v52a_test_all_features.spin2` | Comprehensive single-file test of all v52a features |
