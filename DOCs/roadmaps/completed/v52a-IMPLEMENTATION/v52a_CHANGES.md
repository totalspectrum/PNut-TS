# PNut v52a Language Changes (from v51a)

**Release Date:** October 5, 2025 (compiler), September 28, 2025 (interpreter)
**Spin2 Version Constant:** 52 (was 51)

---

## Spin2 Language Changes

### New: MOVBYTS(value, order) Function

MOVBYTS is now available as a Spin2 function (previously it was only a PASM2 instruction). It reorders the four bytes within a 32-bit long value according to a 4-digit base-4 pattern.

```spin2
PUB example() | value, result
  value := $44_33_22_11
  result := MOVBYTS(value, %%0123)    ' reverse byte order → $11_22_33_44
  result := MOVBYTS(value, %%3210)    ' no change → $44_33_22_11
  result := MOVBYTS(value, %%0000)    ' broadcast byte 0 → $11_11_11_11
```

**Function Details:**
| Function | Bytecode | Params | Returns | Description |
|----------|----------|--------|---------|-------------|
| `MOVBYTS(value, order)` | `bc_movbyts` | 2 | 1 | Reorder bytes in long |

**Notes:**
- The `order` parameter uses base-4 digits (%%DDDD), where each digit (0-3) selects which source byte goes to that position
- Digit 0 = byte 0 (bits 7:0), digit 1 = byte 1 (bits 15:8), etc.
- Maps directly to the P2 `MOVBYTS` hardware instruction
- In PASM2 context, MOVBYTS continues to work as an assembly instruction as before

### New: ENDIANL(value) Function

Reverses the byte order of a 32-bit long value (big-endian ↔ little-endian conversion).

```spin2
PUB example() | value, result
  value := $44_33_22_11
  result := ENDIANL(value)    ' result = $11_22_33_44
```

**Function Details:**
| Function | Bytecode | Params | Returns | Description |
|----------|----------|--------|---------|-------------|
| `ENDIANL(value)` | `bc_endianl` | 1 | 1 | Reverse byte order of long |

**Notes:**
- Implemented using `MOVBYTS D, #%%0123` internally
- Requires `{Spin2_v52}` version directive (level 52 symbol)

### New: ENDIANW(value) Function

Reverses the byte order within each 16-bit word of a 32-bit long value.

```spin2
PUB example() | value, result
  value := $00_00_22_11
  result := ENDIANW(value)    ' result = $00_00_11_22
```

**Function Details:**
| Function | Bytecode | Params | Returns | Description |
|----------|----------|--------|---------|-------------|
| `ENDIANW(value)` | `bc_endianw` | 1 | 1 | Reverse byte order within words |

**Notes:**
- The input value is shifted left by 16 bits first, then byte-reversed using `MOVBYTS D, #%%0123`
- This effectively swaps bytes within the lower 16-bit word
- Requires `{Spin2_v52}` version directive (level 52 symbol)

### New: DEBUG_END_SESSION Constant

A new constant that can be output via DEBUG to cleanly terminate a debug session.

```spin2
PUB example()
  DEBUG(DEBUG_END_SESSION)    ' closes the debug window
```

**Constant Details:**
| Name | Value | Description |
|------|-------|-------------|
| `DEBUG_END_SESSION` | 27 | Terminates debug session when sent |

**Notes:**
- When the debug host receives byte value 27, it sets `DebugActive := False` and closes the debug window
- Requires `{Spin2_v52}` version directive (level 52 symbol)

### Enhanced: NEXT/QUIT with Level Parameter

NEXT and QUIT now accept an optional level parameter to continue or exit multiple levels of nested REPEAT loops.

```spin2
PUB example() | x, y
  REPEAT x FROM 0 TO 9            ' outer loop (level 2)
    REPEAT y FROM 0 TO 9          ' inner loop (level 1)
      IF (x == 5) AND (y == 3)
        NEXT 2                    ' continue the OUTER loop
      IF (x == 7)
        QUIT 2                    ' exit BOTH loops
```

**Syntax:**
```
NEXT              ' continue innermost REPEAT (existing behavior)
NEXT level        ' continue Nth enclosing REPEAT (new)
QUIT              ' exit innermost REPEAT (existing behavior)
QUIT level        ' exit N enclosing REPEATs (new)
```

**Level Parameter:**
| Value | Meaning |
|-------|---------|
| (omitted) | Same as before — affects innermost REPEAT |
| 1 | Same as omitted — innermost REPEAT |
| 2 | Second enclosing REPEAT |
| N | Nth enclosing REPEAT |
| Max: 15 | `block_nest_limit - 1` |

**New Errors:**
| Error Message | Condition |
|---------------|-----------|
| `NEXT/QUIT level must be from 1 to 15` | Level < 1 or > 15 |
| `NEXT/QUIT is not sufficiently nested within REPEAT block(s)` | Not enough enclosing REPEATs for the level specified |

**Implementation Notes:**
- When traversing outward through block nests to reach the target level, the compiler correctly generates POP instructions for intermediate REPEAT-VAR, REPEAT-COUNT-VAR, REPEAT-COUNT, and CASE blocks
- For NEXT with level > 1, intermediate REPEAT-VAR blocks get 4 long pops (same as QUIT)
- For NEXT with level > 1, intermediate REPEAT-COUNT blocks get 1 extra long pop
- The old error `This instruction is only allowed within a REPEAT block` was replaced with the more specific `NEXT/QUIT is not sufficiently nested within REPEAT block(s)`

---

## PASM2 Language Changes

### No New Instructions
v52a focused on Spin2-level additions; no new PASM2 instructions were added.

Note: MOVBYTS was already a PASM2 instruction — what changed is that it is now *also* available as a Spin2 function.

---

## DEBUG Display Changes

### New: Text Color and Background Color in TERM Display

The TERM debug display type now supports dynamic text color and background color changes during text rendering. In v51a, color keys (`BLACK`..`GRAY`) and `BACKCOLOR` were only processed during display configuration, not during text output. In v52a, they are handled inline within the text stream.

**New terminal text processing (DebugDisplayUnit.pas):**
```pascal
key_black..key_gray:      // set text color and maybe text background color
begin
  Dec(ptr);
  KeyColor(vTextColor);
  KeyColor(vTextBackColor);
end;
key_backcolor:            // set text background color
  KeyColor(vTextBackColor);
```

### New: DEBUG_END_SESSION Support

The debug host (DebugUnit.pas) now recognizes byte value 27 as an end-of-session command. When received, it sets `DebugActive := False` and closes the debug window.

```pascal
// end of debug session?
if x = 27 then
begin
  DebugActive := False;
  Close;
  Exit;
end;
```

---

## Bytecode Changes

### New Bytecodes

| Bytecode | Value | Description |
|----------|-------|-------------|
| `bc_movbyts` | $E4 | MOVBYTS(long, pattern) |
| `bc_endianl` | $E6 | ENDIANL(long) |
| `bc_endianw` | $E8 | ENDIANW(word) |

These are appended after `bc_task_return` ($E2), extending the hub bytecode table.

### Debugger NOP Offset Change

The `@@debugnop` offset in the interpreter image shifted:
```
@@debugnop = $0F2C  (v51a)
@@debugnop = $0F34  (v52a)
```
This is a consequence of the new bytecodes adding 3 word entries (6 bytes, long-aligned to 8 bytes) to the bytecode dispatch table.

---

## Compiler Internal Changes

### MOVBYTS Symbol Reclassification

MOVBYTS was reclassified from `type_asm_inst` to `type_i_flex`, making it available as both a Spin2 function and a PASM2 instruction:

| | v51a | v52a |
|---|------|------|
| Symbol type | `type_asm_inst, ac_movbyts` | `type_i_flex, fc_movbyts` |
| Location | Main symbol table only | Main symbol table (moved earlier) |
| Old entry | Active | Commented out with note |

A new check was added in the PASM2 compilation path to recognize `fc_movbyts` (a flex code) and map it back to `ac_movbyts` (an assembly opcode) for PASM2 context.

### New Flexcode Entries

```asm
flexcode  fc_movbyts, bc_movbyts, 2, 1, 0, 1  ;(also asm instruction)
flexcode  fc_endianl, bc_endianl  1, 1, 0, 1
flexcode  fc_endianw, bc_endianw  1, 1, 0, 1
```

### Level 52 Symbol Table

A new versioned symbol table (`level52_symbols`) was added, loaded when `spin2_level >= 52`:

```asm
level52_symbols:
  sym  type_i_flex,    fc_endianl,  'ENDIANL'
  sym  type_i_flex,    fc_endianw,  'ENDIANW'
  sym  type_con_int,   27,          'DEBUG_END_SESSION'
  db   0
```

Note: MOVBYTS is in the base symbol table (not gated by version level) since it was already a PASM2 instruction.

### NEXT/QUIT Rewrite

The `ci_next_quit` routine was substantially rewritten to support the level parameter:

**Key changes:**
- Calls `check_end` to detect whether a level parameter follows
- If present, calls `get_value_int` to parse the integer level (1..15)
- Uses `bh` register to track remaining levels to skip
- At `@@got` label, decrements `bh` and jumps back to `@@ignore` if not yet at target level
- Simplified the final branch address lookup: uses `ecx` offset directly, incrementing by 1 for QUIT vs NEXT
- Removed the separate `@@quit` label — unified the branch compilation path

**Removed error:**
- `This instruction is only allowed within a REPEAT block` (`error_tioawarb`)

**New errors:**
- `NEXT/QUIT is not sufficiently nested within REPEAT block(s)` (`error_nqinsn`)
- `NEXT/QUIT level must be from 1 to 15` (`error_nqlcmb`)

### Error Message Change

| v51a | v52a |
|------|------|
| `Expected "=" "[" "," "(" or end of line` | `Expected "=", "[" ",", or end of line` |

### Constant Expression Fix

In the CORDIC `@@exp_post` routine, the rounding bias was changed:
```asm
add  eax, 20h   ; v51a
add  eax, 40h   ; v52a
```
This is a precision fix for the EXP2/EXP10/EXP floating-point constant expressions.

### Minor: ASCII Print Threshold

In the listing/dump code, the printable ASCII check was changed from a character literal to a hex constant with a comment suggesting future change:
```asm
cmp  al,' '          ; v51a
cmp  al,20h          ; v52a  ;TESTT change to 30h
```

---

## Interpreter Changes (Spin2_interpreter.spin2)

### Version Update
```
'*  Spin2 Interpreter - v51 - 2025.04.02  *    (v51a)
'*  Spin2 Interpreter - v52 - 2025.09.28  *    (v52a)
```

### New Bytecode Dispatch Entries

Three new entries added at the end of the hub bytecode dispatch table:

| Bytecode | Address | Value | Description |
|----------|---------|-------|-------------|
| `bc_movbyts` | `@movbyts_` | $E4 | MOVBYTS(long, pattern) |
| `bc_endianl` | `@endianl_` | $E6 | ENDIANL(long) |
| `bc_endianw` | `@endianw_` | $E8 | ENDIANW(word) |

### New Interpreter Routines

**MOVBYTS(long, pattern) — `movbyts_`:**
```spin2
movbyts_  mov     w,x           'get pattern into w
          popa    x             'pop long into top of stack
  _ret_   movbyts x,w           'do MOVBYTS
```
Takes the pattern from the stack top (`x`), pops the long value, applies the P2 `MOVBYTS` instruction, and returns the result on stack.

**ENDIANL(long) — `endianl_`:**
```spin2
endianl_ _ret_  movbyts x,#%%0123   'get reverse-endian long
```
Reverses all four bytes using `MOVBYTS` with pattern `%%0123`.

**ENDIANW(word) — `endianw_`:**
```spin2
endianw_  shl     x,#16              'for ENDIANW, shift word up and clear lower word
endianl_ _ret_  movbyts x,#%%0123   'get reverse-endian word/long
```
Shifts the 16-bit value up, then falls through to `endianl_` to reverse bytes, effectively swapping the two bytes of the word.

### Future Features Noted

A comment block was added listing planned future additions:
```
' Things to add:
'   FROUND / FTRUNC
'   #>. / <#.
'   SIN / ASIN
'   COS / ACOS
'   TAN / ATAN
```

---

## Summary of New Language Features

| Category | Feature | Description |
|----------|---------|-------------|
| Spin2 | `MOVBYTS(value, order)` | Byte reordering function (was PASM2-only) |
| Spin2 | `ENDIANL(value)` | 32-bit endian swap |
| Spin2 | `ENDIANW(value)` | 16-bit word endian swap |
| Spin2 | `DEBUG_END_SESSION` | Constant (27) to terminate debug session |
| Spin2 | `NEXT level` | Continue Nth enclosing REPEAT loop |
| Spin2 | `QUIT level` | Exit N enclosing REPEAT loops |
| DEBUG | Text color in TERM | Dynamic color changes during text output |
| DEBUG | End session support | Byte 27 closes debug window |

---

## Bytecode Compatibility

v52a bytecodes are **not** compatible with v51a. The three new bytecodes ($E4, $E6, $E8) extend the dispatch table. Code compiled for v52a will not run on a v51a interpreter.
