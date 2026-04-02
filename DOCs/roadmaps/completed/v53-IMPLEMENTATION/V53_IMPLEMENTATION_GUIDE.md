# V53 Implementation Guide for PNut-ts

This document provides the precise implementation details an agent needs to implement v53 changes in PNut-ts. It complements `v53_CHANGES.md` (what changed) and `V53_LANGUAGE_REFERENCE_ADDITIONS.md` (user-facing spec) with the algorithmic and structural detail required for implementation.

**Source reference:** All code excerpts below are from `v53/p2com.asm` unless noted. The interpreter is unchanged from v52a.

---

## 1. Version Constant

```asm
spin2_version = 53    ; was 52 in v52a
```

Update the PNut-ts equivalent of `spin2_version` from 52 to 53.

---

## 2. No New Bytecodes

v53 adds no new bytecodes. OFFSETOF is resolved entirely at compile time. The bytecode dispatch table, interpreter, and debug display are all unchanged from v52a.

---

## 3. New Type Constant: `type_offsetof`

A new type constant is inserted between `type_sizeof` and `type_size`:

```asm
count   type_sizeof       ; SIZEOF
count   type_offsetof     ; OFFSETOF    (NEW — line 685)
count   type_size         ; BYTE, WORD, LONG
```

**Important:** This shifts all subsequent type constant values by 1. In PNut-ts, insert the new type constant at the equivalent position and verify that all type comparisons continue to use symbolic names (not hardcoded numbers).

**Affected type constants (all shift +1):**
- `type_size`, `type_size_fit`, `type_fvar`, `type_file`, `type_if`, `type_ifnot`, `type_elseif`, `type_elseifnot`, `type_else`, and all subsequent types.

---

## 4. Level 53 Symbol Table

Add a new versioned symbol table loaded when `spin2_level >= 53`:

```asm
        cmp  [spin2_level],53    ; line 19755
        jb   @@not53
        lea  esi,[level53_symbols]
        call enter_symbols
@@not53:
```

```asm
level53_symbols:                 ; line 21500
    sym  type_offsetof, 0, 'OFFSETOF'   ;returns offset of structure member
    db   0                               ;end marker
```

This loads **after** `level52_symbols` in the symbol initialization sequence.

**Action:** Add `OFFSETOF` to the PNut-ts symbol table, gated by `spin2_level >= 53`, with type `type_offsetof` and value 0.

---

## 5. New Error String

```asm
error_ooioa:  call  set_error                                    ; line 2525
              db    'OFFSETOF() is only allowed in DAT, VAR, PUB, and PRI blocks',0
```

**Action:** Add this error message to PNut-ts's error table.

---

## 6. Constant Expression Evaluator Integration

OFFSETOF is handled in the constant expression evaluator, inserted after the SIZEOF handling. The code is at lines 9481-9492:

```asm
@@notsizeof:
        cmp  al,type_offsetof        ;OFFSETOF(struct)?
        jne  @@notoffsetof
        cmp  [con_block_flag],1      ;not allowed in CON block
        je   error_ooioa
        cmp  [obj_block_flag],1      ;not allowed in OBJ block
        je   error_ooioa
        call @@checkint              ;ensure integer context
        call get_left                ;get '('
        call get_offset_of_struct_member  ;get offset of struct member → ebx
        call get_right               ;get ')'
        jmp  @@okay                  ;ebx = offset value
@@notoffsetof:
```

**Control flow:** This is in the same expression evaluator path as SIZEOF. It checks for the same block restrictions (CON and OBJ blocks forbidden), then delegates to `get_offset_of_struct_member` which returns the computed offset in `ebx`.

**Action:** In PNut-ts's constant expression evaluator, add a case for `type_offsetof` alongside the existing `type_sizeof` case. Apply the same CON/OBJ block restrictions. Call the equivalent of `get_offset_of_struct_member`.

---

## 7. Compile Term Integration

OFFSETOF is also handled in the compile-term dispatch (runtime expression compilation), inserted after the SIZEOF check. The code is at lines 13602-13604 (dispatch) and 13812-13822 (handler):

**Dispatch (in compile_term's type switch):**
```asm
        cmp  al,type_offsetof        ;OFFSETOF ?     (line 13603)
        je   ct_offsetof
```

**Handler:**
```asm
ct_offsetof:                                          ; line 13814
        call  get_left                ;get '('
        call  get_offset_of_struct_member  ;get offset of struct member → ebx
        call  compile_constant        ;compile offset as constant bytecode
        jmp   get_right               ;get ')'
```

**Key difference from constant expression path:** Here, after computing the offset, it calls `compile_constant` to emit the appropriate constant-push bytecodes. In the constant expression path, the value is returned directly in `ebx`.

**Action:** In PNut-ts's compile-term handler, add a case for `type_offsetof` that calls the same offset calculation routine, then emits the result as a constant.

---

## 8. The `get_offset_of_struct_member` Routine

This is the core new routine (~130 lines, lines 17259-17388). It walks the internal structure definition records to compute member byte offsets at compile time.

### 8.1 Entry/Exit Contract

```
Entry:  Source positioned after OFFSETOF(
        Next element must be a type_con_struct
Exit:   ebx = computed byte offset
        Source positioned after the last element consumed (before ')')
Registers preserved: eax, ecx, edx, esi, edi (all pushed/popped)
```

### 8.2 Algorithm Pseudocode

```
function get_offset_of_struct_member() → offset:
    element = get_element()
    if element.type != type_con_struct:
        error "Expected an existing STRUCT name"

    struct_def_ptr = struct_def + struct_id_to_def[element.value]
    offset = 0

    loop:  // @@structloop
        record_size = read_word(struct_def_ptr)    // skip record size field
        struct_size = read_dword(struct_def_ptr)   // total struct size

        handle_optional_index(struct_size, offset)  // [constant_index]

        if not check_dot():                         // no '.' follows?
            return offset                           // done — return current offset

        symbol = get_symbol()                       // get member name after '.'
        if error:
            error "Expected a structure member name"

        // Search through members: @@checkmember loop
        loop:
            member_offset = read_dword(struct_def_ptr)
            member_type = read_byte(struct_def_ptr)   // 0=BYTE, 1=WORD, 2=LONG, 3=STRUCT

            if member_type == 3:  // STRUCT
                sub_struct_ptr = struct_def_ptr        // remember for later
                sub_struct_record_size = read_word(struct_def_ptr)
                struct_def_ptr += sub_struct_record_size  // skip past sub-struct record

            name_length = read_byte(struct_def_ptr)
            name = read_bytes(struct_def_ptr, name_length)

            if name matches symbol:
                offset += member_offset

                if member_type == 3:  // nested STRUCT
                    struct_def_ptr = sub_struct_ptr     // repoint to sub-struct
                    goto loop  // @@structloop — recurse into nested struct
                else:  // BYTE(0), WORD(1), LONG(2)
                    size = 1 << member_type             // 1, 2, or 4
                    handle_optional_index(size, offset)
                    return offset

            end_marker = read_byte(struct_def_ptr)
            if end_marker == 0:
                error "Structure does not contain this name"
            // else: continue to next member (@@checkmember)
```

### 8.3 The `handle_optional_index` Subroutine

Located at lines 17363-17388 (`@@handleindex`):

```
function handle_optional_index(size, offset):
    if not check_leftb():          // no '[' follows?
        return                     // nothing to do

    index = get_value_int()        // parse constant index

    if size > $FFFF:
        error "Indexed structures cannot exceed $FFFF bytes in size"
    if index > $FFFF:
        error "Structure index must be from 0 to $FFFF"

    byte_offset = index * size
    if byte_offset > obj_size_limit:
        error "Structure exceeds hub range of $FFFFF"

    offset += byte_offset
    if offset > obj_size_limit:
        error "Structure exceeds hub range of $FFFFF"

    get_rightb()                   // consume ']'
```

### 8.4 Structure Definition Record Format

The routine traverses `struct_def` records. The format at each struct level:

```
[WORD: record_size]          — total size of this record in bytes (used for skipping)
[DWORD: struct_size]         — total byte size of this struct
[member entries...]          — one per member, variable length
```

Each member entry:
```
[DWORD: member_offset]      — byte offset of this member within the struct
[BYTE: member_type]          — 0=BYTE, 1=WORD, 2=LONG, 3=STRUCT
  if member_type == 3:
    [sub-struct record]      — recursively, same format as above
[BYTE: name_length]          — length of member name string
[BYTES: name]                — member name characters
[BYTE: continuation]         — 0=end of members, non-zero=another member follows
```

### 8.5 Local Variables

The routine uses five local variables (declared with `ddx`/`dbx` macros):

| Variable | Type | Purpose |
|----------|------|---------|
| `@@offset` | DWORD | Accumulated byte offset (the return value) |
| `@@size` | DWORD | Current struct/member size for indexing |
| `@@symbol_length` | DWORD | Length of the member name being searched |
| `@@member_offset` | DWORD | Offset of the current member being examined |
| `@@member_type` | BYTE | Type of the current member (0-3) |

**Action:** Implement the equivalent of `get_offset_of_struct_member` in PNut-ts. It must:
1. Parse the initial struct name
2. Walk the struct definition records
3. Handle dot-separated member navigation
4. Handle optional constant array indexing at each level
5. Return the accumulated byte offset

---

## 9. Bug Fix: NEXT/QUIT Default Level Branch

In `ci_next_quit` (line 12148-12149):

```asm
; v52a:
        mov  bh,0            ;do this level (0)
        je   @@gotlevel      ;conditional — could fall through!

; v53:
        mov  bh,0            ;do current level (0)
        jmp  @@gotlevel      ;unconditional — always taken
```

**Context:** When `check_end` finds end-of-line (no level parameter), `back_element` is called to rewind. The code then sets `bh=0` for default level. In v52a, the `je` relied on zero flag state from `back_element`, which could theoretically be non-zero, causing fall-through to `@@getlevel` where it would try to parse a non-existent level parameter.

**Action:** In PNut-ts, ensure the default (no level parameter) path unconditionally proceeds to the "level 0" handling, not conditionally.

---

## 10. Bug Fix: CASE Block Colon Parsing

Three locations in CASE compilation changed from `get_element` to `get_colon`:

| Line (v53) | Context | Change |
|------------|---------|--------|
| 11270 | After OTHER in first pass (compiling OTHER block) | `get_element` → `get_colon` |
| 11299 | After OTHER in second pass (skipping OTHER block) | `get_element` → `get_colon` |
| 11306 | After range/value in second pass (before compiling block) | `get_element` → `get_colon` |

**Why this matters:** `get_colon` validates that the consumed element is actually a colon (`:`) and raises an error if not. `get_element` would silently consume any token, potentially masking syntax errors in CASE blocks.

**Action:** In PNut-ts's CASE compilation, verify that colon consumption after case values and OTHER uses a colon-validating function rather than a generic element consumer. If PNut-ts already validates the colon, no change is needed.

---

## 11. Implementation Checklist

| # | Change | Category | Complexity |
|---|--------|----------|------------|
| 1 | `spin2_version` = 53 | Constant | Trivial |
| 2 | Add `type_offsetof` to type enum (between `type_sizeof` and `type_size`) | Type enum | Simple (but shifts values) |
| 3 | Add `level53_symbols` table with OFFSETOF | Symbol table | Simple |
| 4 | Add `error_ooioa` error message | Error table | Simple |
| 5 | Add OFFSETOF handling to constant expression evaluator | Compiler | Medium |
| 6 | Add OFFSETOF handling to compile-term dispatch | Compiler | Medium |
| 7 | Implement `get_offset_of_struct_member` | Compiler | **Complex** |
| 8 | Fix NEXT/QUIT default branch (`je` → `jmp`) | Compiler | Trivial |
| 9 | Fix CASE colon parsing (3 locations) | Compiler | Simple |

**Recommended implementation order:** 1 → 2 → 3 → 4 → 8 → 9 → 7 → 5 → 6

Do the trivial constant/enum/symbol/error changes first. Apply the two bug fixes (they're independent of OFFSETOF). Then implement `get_offset_of_struct_member` — this is the core complexity. Finally, wire it into the two expression evaluation paths.

---

## 12. Key Implementation Notes

### 12.1 OFFSETOF vs SIZEOF Parallels

OFFSETOF follows the same patterns as SIZEOF:
- Same block restrictions (no CON, no OBJ)
- Same integration points (constant expression evaluator + compile-term dispatch)
- Same struct definition record traversal starting point

The key difference: SIZEOF returns the total size of a struct, while OFFSETOF navigates into the struct's member hierarchy and returns the accumulated byte offset.

### 12.2 No Interpreter Changes

Since OFFSETOF is purely compile-time:
- No new bytecodes to add
- No interpreter routines to implement
- No dispatch table changes
- No debugnop offset shift

### 12.3 Struct Definition Record Access

The `get_offset_of_struct_member` routine accesses the same `struct_def` buffer and `struct_id_to_def` lookup table that existing struct compilation uses. In PNut-ts, the equivalent data structures should already exist for SIZEOF and struct access compilation. The new routine reads from them but does not modify them.

---

## 13. Regression Test Considerations

Key test scenarios for OFFSETOF:

| Test Case | Expected Behavior |
|-----------|-------------------|
| `OFFSETOF(simple_struct.first_member)` | Returns 0 |
| `OFFSETOF(simple_struct.second_member)` | Returns size of first member |
| `OFFSETOF(nested_struct.inner.member)` | Returns accumulated offset through nesting |
| `OFFSETOF(struct_name)` without member | Returns 0 |
| `OFFSETOF(struct_name[N].member)` | Returns N * struct_size + member_offset |
| `OFFSETOF(s.member[N])` | Returns member_offset + N * member_size |
| In CON block | Error: `OFFSETOF() is only allowed in...` |
| In OBJ block | Error: `OFFSETOF() is only allowed in...` |
| Non-existent member name | Error: `Structure does not contain this name` |
| Non-struct argument | Error: `Expected an existing STRUCT name` |
| Index > $FFFF | Error: `Structure index must be from 0 to $FFFF` |
| Without `{Spin2_v53}` directive | OFFSETOF not recognized as keyword |
