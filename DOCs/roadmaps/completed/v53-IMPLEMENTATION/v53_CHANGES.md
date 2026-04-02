# PNut v53 Language Changes (from v52a)

**Release Date:** March 1, 2026 (compiler)
**Spin2 Version Constant:** 53 (was 52)
**Copyright:** Updated to 2006-2026

---

## Spin2 Language Changes

### New: OFFSETOF(struct.member) Function

OFFSETOF is a new compile-time function that returns the byte offset of a member within a structure. It navigates nested structures and supports constant array indexing at each level.

```spin2
STRUCT point(LONG x, LONG y)
STRUCT rect(point topLeft, point bottomRight)

PUB example() | offset
  offset := OFFSETOF(point.x)           ' 0
  offset := OFFSETOF(point.y)           ' 4
  offset := OFFSETOF(rect.bottomRight)  ' 8
  offset := OFFSETOF(rect.bottomRight.x)  ' 8
  offset := OFFSETOF(rect.bottomRight.y)  ' 12
```

**Syntax:**
```
OFFSETOF( struct_name{[index]}{.member{[index]}{.member{[index]}...}} )
```

**Function Details:**
| Function | Params | Returns | Context |
|----------|--------|---------|---------|
| `OFFSETOF(struct.member)` | 1 (compile-time) | Byte offset | Compile-time constant expression |

**Traversal Rules:**
- The argument must begin with a defined `STRUCT` name (`type_con_struct`)
- Each level can have an optional constant array index in brackets `[N]`
- Dot-separated member names navigate into nested structures
- For terminal BYTE/WORD/LONG members, the size is 1/2/4 bytes respectively
- For terminal STRUCT members, the size is the full struct size

**Block Restrictions:**
- Allowed in: DAT, VAR, PUB, PRI blocks
- **Not** allowed in: CON, OBJ blocks (same restrictions as SIZEOF)

**Errors:**
| Error Message | Condition |
|---------------|-----------|
| `OFFSETOF() is only allowed in DAT, VAR, PUB, and PRI blocks` | Used in CON or OBJ block |
| `Expected an existing STRUCT name` | First element is not a defined struct |
| `Expected a structure member name` | After dot, member name not found |
| `Structure does not contain this name` | Named member doesn't exist in the struct |
| `Indexed structures cannot exceed $FFFF bytes in size` | Struct too large for indexing |
| `Structure index must be from 0 to $FFFF` | Index value out of range |
| `Structure exceeds hub range of $FFFFF` | Computed offset too large |

**Notes:**
- Requires `{Spin2_v53}` version directive (level 53 symbol)
- Returns a compile-time integer constant — generates no runtime bytecode
- The implementation walks the internal `struct_def` records, following the same member layout used by the runtime struct access code
- Has its own dedicated error message `error_ooioa` (`OFFSETOF() is only allowed in DAT, VAR, PUB, and PRI blocks`)

---

## PASM2 Language Changes

### No New Instructions
v53 focused on Spin2-level additions; no new PASM2 instructions were added.

---

## DEBUG Display Changes

### No Changes
The debug display code (DebugDisplayUnit.pas, DebugUnit.pas) is unchanged from v52a.

---

## Bytecode Changes

### No New Bytecodes
OFFSETOF is a compile-time-only function — it evaluates to a constant during compilation and emits no new bytecodes. The bytecode dispatch table is unchanged from v52a.

---

## Interpreter Changes (Spin2_interpreter.spin2)

### No Changes
The interpreter is identical to v52a. Since OFFSETOF is resolved entirely at compile time, no interpreter support is needed.

---

## Compiler Internal Changes

### New Type Constant: `type_offsetof`

A new type constant `type_offsetof` was added to the type enumeration, inserted between `type_sizeof` and `type_size`:

```asm
; v52a:
count   type_sizeof     ; SIZEOF
count   type_size       ; BYTE, WORD, LONG

; v53:
count   type_sizeof     ; SIZEOF
count   type_offsetof   ; OFFSETOF    (NEW)
count   type_size       ; BYTE, WORD, LONG
```

**Note:** This insertion shifts all subsequent type constant values by 1. While this doesn't affect source-level compatibility, it changes the internal numeric values of `type_size`, `type_size_fit`, `type_fvar`, etc.

### New Error String

```asm
error_ooioa:  call  set_error
              db    'OFFSETOF() is only allowed in DAT, VAR, PUB, and PRI blocks',0
```

Used by the OFFSETOF block restriction checks in the constant expression evaluator.

### Level 53 Symbol Table

A new versioned symbol table (`level53_symbols`) was added, loaded when `spin2_level >= 53`:

```asm
level53_symbols:
    sym  type_offsetof, 0, 'OFFSETOF'   ;returns offset of structure member
    db   0
```

### New Routine: `get_offset_of_struct_member`

A substantial new routine (~130 lines) that walks struct definition records to compute member offsets:

**Algorithm:**
1. Parse the initial `type_con_struct` element to get the struct ID
2. Look up the struct definition via `struct_id_to_def` table
3. Initialize offset accumulator to 0
4. At each struct level:
   - Read the struct record size and total size
   - Handle optional `[constant_index]` — multiply index by struct size, add to offset
   - Check for `.member` — if no dot, return current offset
   - Search through member entries comparing names
   - On match: add member offset, recurse into sub-struct or handle BYTE/WORD/LONG terminal
5. Return final computed offset in `ebx`

**Member record format traversed:**
```
[4 bytes: member offset] [1 byte: type (0=BYTE,1=WORD,2=LONG,3=STRUCT)]
  if STRUCT: [sub-struct record follows]
[1 byte: name length] [N bytes: name] [1 byte: 0=end or next member]
```

### Compile Term Integration: `ct_offsetof`

OFFSETOF is integrated into the compile-term dispatch alongside SIZEOF:

```asm
ct_offsetof:  call  get_left                    ;get '('
              call  get_offset_of_struct_member  ;get offset of struct member
              call  compile_constant             ;compile offset as constant
              jmp   get_right                    ;get ')'
```

### Constant Expression Integration

OFFSETOF is also handled in the constant expression evaluator (alongside SIZEOF), with the same CON/OBJ block restrictions:

```asm
        cmp  al,type_offsetof      ;OFFSETOF(struct)?
        jne  @@notoffsetof
        cmp  [con_block_flag],1    ;not allowed in CON block
        je   error_ooioa
        cmp  [obj_block_flag],1    ;not allowed in OBJ block
        je   error_ooioa
        call @@checkint
        call get_left              ;get '('
        call get_offset_of_struct_member  ;get offset of struct member
        call get_right             ;get ')'
        jmp  @@okay
@@notoffsetof:
```

### Bug Fix: NEXT/QUIT Default Level Branch

In the `ci_next_quit` routine, a conditional branch was changed to an unconditional jump:

```asm
; v52a:
        mov  bh,0            ;do this level (0)
        je   @@gotlevel      ;conditional jump (relies on flags from back_element)

; v53:
        mov  bh,0            ;do current level (0)
        jmp  @@gotlevel      ;unconditional jump (correct — always taken)
```

This fixes a potential bug where the `je` could fall through to `@@getlevel` if `back_element` happened to clear the zero flag. The `jmp` ensures the default level-0 path is always taken when no level parameter is present.

### Bug Fix: CASE Block Colon Parsing

Three locations in the CASE compilation code changed from `get_element` to `get_colon` for skipping the colon after case values/OTHER:

```asm
; v52a:
        call  get_element    ;skip colon

; v53:
        call  get_colon      ;skip colon
```

**Affected locations:**
1. After `OTHER` in first pass (compiling 'other' block) — line 11270
2. After `OTHER` in second pass (skipping 'other' block) — line 11299
3. After range/value in second pass — line 11306

Using `get_colon` is more robust — it validates that the element is actually a colon and raises an error if not, whereas `get_element` would silently consume any token.

---

## Summary of New Language Features

| Category | Feature | Description |
|----------|---------|-------------|
| Spin2 | `OFFSETOF(struct.member)` | Compile-time byte offset of struct member |

---

## Bug Fixes

| Fix | Description |
|-----|-------------|
| NEXT/QUIT default branch | Changed `je` to `jmp` for unconditional jump to default level |
| CASE colon parsing | Changed `get_element` to `get_colon` for proper colon validation (3 locations) |

---

## Bytecode Compatibility

v53 bytecodes are **fully compatible** with v52a. No new bytecodes were added. The interpreter is unchanged. Code compiled for v53 that doesn't use OFFSETOF will produce identical output to v52a compilation. OFFSETOF itself resolves to a constant at compile time and emits standard constant-push bytecodes.

---

## Upgrade Notes

### Breaking Changes
None — all changes are additive. The `type_offsetof` insertion shifts internal type constant numbering, but this is invisible to Spin2 source code.

### Migration Considerations
1. **OFFSETOF:** Enables compile-time struct layout queries without manual offset calculation
2. **NEXT/QUIT fix:** Edge case where `NEXT`/`QUIT` without a level parameter could malfunction is now fixed
3. **CASE parsing:** Stricter colon validation in CASE blocks may catch previously-silent syntax errors

### New Reserved Words (v53+)
- `OFFSETOF`
