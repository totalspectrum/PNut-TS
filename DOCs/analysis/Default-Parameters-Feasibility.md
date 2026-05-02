# Default Method Parameters — Feasibility & Implementation Analysis

**Audience:** Chip Gracey (Pascal/x86 PNut) and Stephen M Moraco (PNut-TS)
**Status:** Analysis & planning — not implementation
**Subject compiler:** PNut v52 (REF-V52A: `p2com.asm`, `Spin2_interpreter.spin2`)
**Date:** 2026-04-27

> **Note on bytecode references:** `bc_*` identifier **names** are stable across compiler releases (they're identifiers in source code, kept consistent for human readability and debugger UX) and are cited freely in this document. Numeric **opcode values** (e.g., `$0A`, `$D6`) are NOT stable — the interpreter re-sorts and optimizes the value-to-name mapping release to release — so this document does not cite specific numeric values. To find the current numeric value for any named bytecode, consult the shipped interpreter source (`src/ext/Spin2_interpreter.spin2`).

---

## 1. Feature definition (agreed)

Allow `PUB` and `PRI` method declarations to assign **default values to trailing parameters**:

```spin2
PUB doit(a, b = 5, c = 10)
```

Rules confirmed in prior round of questions:

| # | Rule | Decision |
|---|------|----------|
| 1 | Default expression form | **Compile-time constant expression** only (CON-evaluable: literals, named CON symbols, constant arithmetic, `OFFSETOF`/`SIZEOF`, etc.) |
| 2 | Syntax token | **`=`** (mirrors CON; avoids `:=` runtime-assignment confusion) |
| 3 | Scope | **All call sites** — same-object PUB/PRI, child-object `obj.method()`, **and** method-pointer invocation (symmetry goal) |
| 4 | Multi-return interaction | **None.** Defaults attach only to input parameters, not to result slots |
| 5 | No-gaps rule | Once a parameter has a default, **every parameter to its right must also have a default** |

---

## 2. Where this lives in the v52 compiler

A short tour, with the key files/lines you'll need to touch.

### 2.1 PUB/PRI parameter parsing — Pass 1 (symbol indexing)

`p2com.asm:4186 compile_sub_blocks_id`

Parses `PUB name (p1, p2, ...)` once across the whole source to assign each method an index and record param/result counts on its `type_method` symbol. The packed format is:

```
type_method symbol value (32 bits):
  [31:24]  parameter count          (limit = method_params_limit = 127)
  [23:20]  result count             (limit = method_results_limit = 15)
  [19:0]   sub index (within object)
```

This pass also writes to `pubcon_list` for export to `.obj` consumers (line 4326):
```
objx_pub | name_len    (1 byte)
<name bytes>           (name_len bytes)
params                 (1 byte)
results                (1 byte)
```

### 2.2 PUB/PRI body parsing — Pass 2 (codegen)

`p2com.asm:6439 compile_sub_blocks`

Re-parses each PUB/PRI body, this time entering parameters as `type_loc_long` / `type_loc_struct` / `type_loc_byte_ptr` etc. **local symbols** at offsets 0, 4, 8, …. Then results, then locals. After locals, the body is compiled.

What the runtime sees per-method (laid out in object image):
```
LONG at pbase + sub*4:        params[31:24] | results[23:20] | bytecode_offset[19:0]
At bytecode_offset (rfvar):   local-long-count
Then:                         method bytecode body
```

### 2.3 Call-site emission

| Call kind | Routine | Bytecode | Notes |
|-----------|---------|----------|-------|
| Same-object call | `p2com.asm:13994 ct_method` | `bc_call_sub` + rfvar(sub_idx) | Param count read from method symbol; passed to `compile_parameters` |
| Child-object call | `p2com.asm:13927 ct_objpub` | `bc_call_obj_sub` + rfvar(obj_idx) + rfvar(pub_idx) | Same param-count source: imported `type_obj_pub` symbol from `.obj` |
| Method-pointer call | `p2com.asm:14016 ct_method_ptr` | `bc_call_ptr` (after evaluating ptr var) | Uses `compile_parameters_mptr` — **does not know expected count**; just compiles until `)` |
| `@method` (take ptr) | `p2com.asm:14386` | `bc_mptr_sub` + rfvar(sub_idx) | Captures sub_idx into a long; default info is lost at this point unless we extend something |

`compile_parameters` (line 15640) requires `ecx` = expected param count and **errors on mismatch** (`error_enope`). Today, fewer args is a hard error.

### 2.4 Calling convention at runtime

`Spin2_interpreter.spin2:1525-1590` (`callsubh`, `calloffh`, `callhot`, `callgo`):

1. Caller pushes parameter values onto the bytecode stack (one long each, structs pre-flattened).
2. Caller emits `bc_call_sub` (etc.).
3. Runtime loads the method's header long (params/results/offset).
4. Runtime advances `ptra` by `params * 4` to point past the parameter slots.
5. Runtime zero-fills `results` slots.
6. Runtime executes `rfvar` to get local-long count and zero-fills locals.
7. Bytecode body runs.

**Key observation:** the caller must push *exactly* `params` values, because the runtime advances the stack pointer by `params * 4` unconditionally. Any default-substitution scheme must preserve this invariant — either the caller pushes the defaults itself, or the *bytecode call site emits a sentinel value per missing slot* and the callee patches it before use.

### 2.5 PNut-TS mirror

For Stephen's reference, the same logic lives in:

| Pascal/x86 | PNut-TS |
|------------|---------|
| `compile_sub_blocks_id` | `SpinResolver.compile_sub_blocks_id` (`src/classes/spinResolver.ts`) |
| `compile_sub_blocks` | `SpinResolver.compile_sub_blocks` |
| `compile_parameters` | `SpinResolver.compile_parameters` |
| `pubcon_byte` / pubcon_list | `SpinResolver.pubcon_*` and `ObjectImage` writers |
| `bc_call_sub` etc. | `eByteCode` enum |

PNut-TS changes will closely shadow the Pascal/x86 changes.

---

## 3. Two implementation strategies

### 3.1 Strategy A — Caller-side filling

**Idea:** Defaults are stored alongside the method's parameter metadata. At every call site, if the user supplied fewer args than declared, the **compiler emits the default values into the bytecode stream** at the appropriate positions, exactly as if the user had typed them. The method body, the `bc_call_*` bytecodes, and the runtime calling convention are **unchanged**.

#### What changes

| Layer | Change |
|-------|--------|
| Parser (`compile_sub_blocks_id`) | After each parameter name, accept optional `= <const_expr>`. Evaluate the const_expr immediately. Store default values into a **per-method default table** keyed by method symbol |
| Symbol metadata | Extend `type_method` symbol info: in addition to params/results, attach a "first-default index" (= `params - default_count`) and a small array of default values |
| Call-site (`ct_method`, `ct_objpub`) | After parsing the supplied args, if fewer than `params`, for each missing slot emit a `bc_con_*` push of the stored default value before emitting `bc_call_sub` |
| `compile_parameters` | No longer hard-error on shortfall when method has defaults; instead return the count of "missing trailing slots," which the caller code emits defaults for |
| `.obj` format | **Must be extended** so child-object calls can see defaults. See §3.1.2 |
| Method pointers | **Cannot be supported uniformly** — see §3.1.3 |
| Runtime | **No change** |
| `Spin2_interpreter.spin2` | **No change** |

#### 3.1.1 Same-object: trivially supported

Defaults live on the method symbol; resolver has full access. Cost is essentially free at runtime — just bytecode size identical to a fully-explicit call.

#### 3.1.2 Child-object: requires `.obj` format extension

Today the `.obj` per-pub record carries only `params` and `results` bytes. For child-object calls to substitute defaults, the importer must learn the defaults at link time.

**Proposed `.obj` extension** (backward-compatible by flag bit):

```
objx_pub | name_len             (1 byte; existing — but reuse 1 high bit of name_len as "has_defaults" flag)
<name bytes>                    (name_len bytes)
params                          (1 byte)
results                         (1 byte)
[if has_defaults flag set:]
  default_count                 (1 byte)   ; number of trailing params with defaults (1..params)
  default_value[0]              (4 bytes)  ; long; value for parameter (params - default_count)
  ...
  default_value[default_count-1] (4 bytes) ; long; value for last parameter
```

`name_len` in pubcon today fits in 6 bits comfortably (Spin2 symbol names ≤ 32 chars; field already ORs with `objx_*` in high bits — see `pubcon_symbol2` line 17449). Bit usage is tight; if no spare bit exists, alternative is a new `objx_pub_def = 5 shl 5` tag for pubs-with-defaults.

**Compatibility cost:** old PNut consuming a new `.obj` will mis-parse if it sees the new tag/flag. We must bump an `.obj` version marker or only emit the new form when defaults are actually present. *Old `.obj` files remain readable.*

For struct-typed defaults: defaults are constants, but a struct literal could exceed 4 bytes. **Recommendation:** for v1, restrict defaults on struct/struct-pointer params to "must be 0/zeroed" (or simply disallow defaults on struct-by-value params). Pointers (`^byte`/`^word`/`^long`/`^struct`) are longs, so any const long including 0 works.

#### 3.1.3 Method pointers: structural problem

A method pointer is a runtime long that encodes pbase/vbase/sub_idx. The compiler at the *call site* (`ct_method_ptr`) has only a `var` of type long — it does not know which method the pointer refers to.

**No purely caller-side scheme can supply defaults to a method-pointer call**, because the caller doesn't know the method. The only paths to symmetry under Strategy A are:

- **(a) Type the variable.** Introduce a method-pointer type (`PUB_PTR`?) that carries param signature including defaults. Spin2 has no such type today; this is a substantial language change touching variable declarations, `@method` capture, method-ptr storage layout, and is largely orthogonal to the default-params feature.
- **(b) Disallow defaults at method-pointer call sites.** A method with defaults can be `@method`-captured, but the resulting pointer call must pass *all* parameters explicitly. Asymmetric — violates the symmetry goal.

Neither is attractive.

#### 3.1.4 Pros / Cons of Strategy A

**Pros**
- Zero runtime cost.
- Zero interpreter (`Spin2_interpreter.spin2`) change.
- Bytecode footprint at call sites unchanged in shape — just emits the defaults inline like any other constant.
- Mental model is simple: "default = compiler types it for you."

**Cons**
- `.obj` format extension required for child-object support.
- Method-pointer symmetry is **not achievable** without separate, large infrastructure (typed method pointers).
- Defaults for child-object methods must be re-emitted at every call site → slight code-size growth proportional to (call_sites × default_size). For an 8-byte default literal called from 50 sites, that's 400 bytes of redundant pushes. Often negligible, but consider for small-Hub apps.

---

### 3.2 Strategy B — Callee-side filling

**Idea:** Defaults are stored **inside the method body**, in a small table that the runtime consults during the method's prologue. The call site indicates *how many parameters were actually supplied*. The runtime fills the missing slots from the table before executing the body.

#### What changes

| Layer | Change |
|-------|--------|
| Parser (`compile_sub_blocks_id`) | Same as Strategy A — parse `= const_expr`, capture defaults |
| Pass-2 codegen (`compile_sub_blocks`) | Emit a **default-table** between the locals rfvar and the body bytecode. Format below |
| Call-site bytecodes | Use existing `bc_call_sub` / `bc_call_obj_sub` / `bc_call_ptr`, but **caller still pushes a value for every parameter slot**. For missing args, caller pushes a sentinel (see §3.2.1) |
| `compile_parameters` | Allow fewer args; for each shortfall slot, emit `bc_default_marker` (a new 1-byte bytecode that pushes a "use default" value) |
| `.obj` format | **Unchanged.** Defaults travel inside the method bytecode — already part of the obj data block |
| Method pointers | **Naturally supported** — the runtime path is the same |
| Runtime (`Spin2_interpreter.spin2`) | Modified prologue: after zeroing locals, scan parameter slots for the sentinel and replace with the corresponding default-table value |

#### 3.2.1 The sentinel approach

Two sub-options:

**B1 — Stack-slot sentinel.**
Define a unique 32-bit sentinel value (e.g. `$DEFA_DEFA`). Caller pushes this for missing slots via a new `bc_use_default` bytecode that just pushes the sentinel. Callee prologue scans param slots, replaces sentinels with default-table entries.
*Risk:* sentinel value collision — what if a user's actual integer happens to equal the sentinel? Even an obscure 32-bit value can theoretically collide. Mitigation: pick `$BAD_DEFA` carefully, document. Still queasy.

**B2 — Supplied-count prefix.**
Define a new bytecode form that carries the *supplied count* explicitly. E.g. replace `bc_call_sub` with `bc_call_sub_d` followed by a 1-byte supplied-count, used only when fewer than max args were supplied. Caller pushes only the supplied values. Runtime prologue, knowing supplied-count and total-params (from header), pushes the missing trailing defaults itself before executing the body.
*Cost:* +1 byte per defaulted call site, ~6 PASM instructions in interpreter prologue, plus a new bytecode opcode (`bc_call_sub_d`, `bc_call_obj_sub_d`, `bc_call_ptr_d`). Cleanest from a correctness standpoint — no sentinel collision possible.

**Recommendation if Strategy B chosen:** B2. Sentinel B1 saves one bytecode slot but introduces a small but real correctness hazard, and the savings vs B2 are negligible (B2 adds 1 byte only on calls that omit args, which by definition want shorter source).

#### 3.2.2 Default-table format inside method body

Today the method body layout (immediately after the header long) is:

```
rfvar local-long-count
<bytecode body>
```

Proposed extension:

```
rfvar local-long-count
[if header.params > header.required_params:]
   rfvar default_count          ; equals (params - required_params)
   long default[0]              ; for parameter slot (params - default_count)
   long default[1]
   ...
   long default[default_count-1]
<bytecode body>
```

We need a way for the runtime to know there's a default table to read. Two options:

- **Borrow a bit from `header.results`** (results count is 0..15, fits in 4 bits; bits [27:24] are free in the header long today — see `Spin2_interpreter.spin2:1564 mov v,##$7FF00000` which masks the params/results region; if we widen the mask we can carry one extra "has_defaults" bit).
- **Always read an rfvar count.** Simpler: every method emits `rfvar default_count`, with `0` meaning none. Costs 1 byte per method that has no defaults, but saves header-bit thinking. Given thousands of methods aren't typical, probably acceptable.

**Recommendation:** "always read rfvar default_count" — uniform code path, no header-bit gymnastics, ~+1 byte per method.

#### 3.2.3 Runtime prologue modification

`Spin2_interpreter.spin2` `callgo` (around line 1591) currently:
```
callgo  rdfast  #0,x
        rfvar   x        ; local long count
        djnf    x,#.clear
.clear  setq    x
        wrlong  #0,ptra++
```

After (sketch):
```
callgo  rdfast  #0,x
        rfvar   x        ; local long count
        djnf    x,#.lc_done
        setq    x
        wrlong  #0,ptra++
.lc_done
        rfvar   x        ; default count
        tjz     x,#.body
        ; for each default: rfvar long, store into params slot
        ; slot index for default[i] = (header.params - default_count) + i
        ; We have header in pb; get params=getbyte pb,#3
        ; supplied_count carried separately (B2): pulled from the call bytecode
        ; ... PASM here ...
.body
```

Detailed PASM is omitted — the point is it's a tight, fixed-overhead loop. Probably ~10 PASM instructions plus per-default ~3 instructions. In hub bytecode-execution context that's modest.

#### 3.2.4 Pros / Cons of Strategy B

**Pros**
- **Method-pointer symmetry achieved naturally.** Pointer call resolves to method body at runtime; defaults are right there in the body.
- **No `.obj` format change.** Defaults travel with the method bytecode, which is already part of obj data. Old PNut consumers reading new `.obj` files still work — they just see slightly larger method bytes; the call sites in dependent objects compile against new PNut anyway.
- Default values are stored once per method, not duplicated at each call site (small code-size win on heavily-called defaulted methods).

**Cons**
- Interpreter (`Spin2_interpreter.spin2`) modification — touches the hot path of every method call.
- Per-call runtime overhead, even when no defaults are involved (the extra `rfvar default_count` happens always; it's `0` in the common case but still costs a few cycles).
- New bytecode opcodes (`bc_call_sub_d`, `bc_call_obj_sub_d`, `bc_call_ptr_d`) — opcode space pressure.
- More moving parts: parser + emitter + runtime must agree on the table layout.

---

## 4. Side-by-side comparison

| Dimension | A: Caller-side | B: Callee-side |
|-----------|----------------|----------------|
| Same-object support | ✅ Trivial | ✅ Easy |
| Child-object support | ⚠️ Requires `.obj` format extension | ✅ No format change |
| Method-pointer support (symmetric) | ❌ Requires typed method pointers (large language change) | ✅ Natural |
| Runtime cost | None | Small per-call (extra rfvar) + per-default (~3 PASM ops) |
| Interpreter change | None | Yes — modifies `callgo` hot path |
| Bytecode opcode space | None | +3 new opcodes (`bc_call_sub_d`, `bc_call_obj_sub_d`, `bc_call_ptr_d`) |
| `.obj` format change | Yes | No |
| Code-size at call sites | Defaults inlined per-call (small growth) | Defaults stored once per method (smaller) |
| Implementation surface area | Parser + symbol table + caller emitter + obj reader/writer | Parser + symbol table + body emitter + interpreter |
| Asymmetry / sharp edges | Method pointers are second-class | Few — uniform model |

---

## 5. Recommendation

**Strategy B (callee-side, with B2 supplied-count prefix).**

Reasoning:

1. **Symmetry across all three call kinds was an explicit goal.** Strategy A does not give this without a typed-method-pointer overhaul, which is a separate, larger language project. Strategy B gives it for free.
2. **The `.obj` format extension that Strategy A demands is the more painful change of the two.** `.obj` files are consumed by other tools (loaders, viewers, downstream PNut consumers); even backward-compatible flag bits create coordination cost. Touching `Spin2_interpreter.spin2` is internal and one-shot.
3. **The runtime cost of B is small and bounded.** One extra `rfvar` per method call (1-byte read + a few cycles); zero per-default cost when the method has no defaults; ~3 PASM ops per actual-default-fill. For a feature that lets users write more concise code, this is a fair trade.
4. **The "world is telling us"** observation from the user is correct: child-object support and method-pointer support both want defaults to live with the method, not the caller. The caller-side path keeps fighting that gravity.

**Defer the runtime prologue work to whoever is most comfortable with it** — Chip's Pascal/x86 source is the authority for the bytecode interpreter PASM; PNut-TS will mirror the bytecode emission but doesn't need to modify any interpreter (the interpreter is the same Spin2_interpreter.spin2 binary in both compilers' output).

---

## 6. Listing/map file changes

For both strategies, the `.lst` file should make defaults visible. Recommended additions:

### 6.1 At the method declaration

In the per-method header section of the listing, show the resolved signature including defaults:

```
PUB doit(a, b = 5, c = 10) : result
   params=3 (1 required, 2 with defaults)  results=1  locals=0
   default[0] = 5         (parameter b)
   default[1] = 10        (parameter c)
```

### 6.2 At each call site

Show whether defaults were applied. When user wrote `doit(7)`:

```
doit(7)                    ; called with 1 arg; b=5, c=10 from defaults
```

Implementation note: the listing emitter (`compile_top_block` callees, info records `inf_*`) already tracks per-bytecode source spans; adding a flag "this call had implicit defaults" is straightforward in either strategy.

### 6.3 Map file

If a per-method symbol-export map is generated (PNut-TS produces one; v52 PNut produces a `.bin` + symbols), each PUB/PRI entry should expose:
- `param_count_total`
- `param_count_required`
- `default_values[]`

This lets external tools (debuggers, IDE assistance) understand the calling contract.

---

## 7. Edge cases & open questions to resolve before implementation

These don't change the strategy choice but need a decision before coding:

1. **Defaults referencing CON symbols from other objects.** `PUB doit(a, b = OBJ.SOME_CON)` — must the const-expr evaluator have access to imported OBJ constants at the time `compile_sub_blocks_id` runs? Current pass ordering should make this fine (OBJ symbols are imported before PUB/PRI scanning), but verify against `compile_obj_symbols` ordering.

2. **Defaults using `OFFSETOF` / `SIZEOF`.** v53 added `OFFSETOF`. If allowed in defaults, the resolver must evaluate it during pass 1, before struct definitions in the same OBJ are necessarily resolved. Likely fine because struct defs precede PUB/PRI in the source order, but worth a unit test.

3. **Defaults on `^byte` / `^word` / `^long` / `^struct` parameters.** A `^long` is a long — any const long (including 0, `@some_dat_label`) could be a default. `@dat_label` is resolved at link time; in v52 this is a "compile-time known offset" → encodable as a long. Both strategies handle this fine, but Strategy A's `.obj`-embedded default would store a relocatable long; Strategy B's body-embedded default also stores it but it's in the method's own bytecode stream, which is already relocatable via `pbase`. Strategy B is slightly cleaner here.

4. **Defaults on struct-by-value parameters.** A struct param occupies multiple longs on the stack. A const struct literal isn't a thing in Spin2 today. **Recommendation: forbid defaults on `STRUCT` and `^STRUCT` parameters in v1.** Revisit if a struct-literal syntax appears.

5. **No-gaps enforcement.** Both strategies enforce this in the parser at `compile_sub_blocks_id`: once a `=` is seen, subsequent params must also have `=`. Error message: `"once a parameter has a default value, all subsequent parameters must have defaults"`.

6. **Result-list interaction.** `PUB doit(a = 5) : x` is fine. `PUB doit(a, : x = 5)` is **not** in scope per agreed rule 4. Parser should reject `=` in the result list explicitly.

7. **Locals with defaults?** Locals already initialize to zero; an `= expr` after a local would be a different feature (initialized locals). **Out of scope** — explicitly disallow.

8. **Interaction with `SEND` / `RECV` / abstract objects.** `SEND` and `RECV` are special — they take ad-hoc parameter lists handled by `ct_method_ptr` notrecv/notsend paths (`p2com.asm:14034-14056`). They have no formal parameter list, so defaults don't apply. Abstract objects (object methods accessed through `^OBJ` references) — confirm at implementation time that the path works through the same `compile_parameters_mptr` machinery.

9. **`COGSPIN` / `TASKSPIN` interaction** (`p2com.asm:13950+`). These compile a method call using `compile_parameters_mptr` for var-method case and `compile_parameters` for direct method case. Both paths must learn to fill defaults under whichever strategy is chosen. Same code path as regular calls — should "just work."

10. **Bytecode disassembler / `.lst` listing of method bytecodes.** Strategy B adds a new bytecode opcode family; the disassembler tables (`disop_*` in `p2com.asm`) need entries.

---

## 8. Implementation roadmap (assuming Strategy B chosen)

### Phase 1 — Parser + symbol table (PNut Pascal/x86 first, then PNut-TS)
- `compile_sub_blocks_id`: accept `= <const_expr>` after parameter names; enforce no-gaps; store default values on per-method default table indexed by sub_idx.
- Error messages for: gap violation, default on result, default on local, default on struct/^struct param.

### Phase 2 — Pass-2 codegen
- `compile_sub_blocks` body emitter: after `compile_rfvar` for locals, emit `compile_rfvar` for default_count, then each default value as a long.

### Phase 3 — Call-site emission
- `compile_parameters` and `compile_parameters_mptr`: track supplied_count, allow shortfall when method has defaults.
- New bytecodes: `bc_call_sub_d`, `bc_call_obj_sub_d`, `bc_call_ptr_d`. Emit the supplied-count byte.
- `ct_method`, `ct_objpub`, `ct_method_ptr`: choose the regular vs `_d` variant based on whether shortfall occurred.

### Phase 4 — Runtime (`Spin2_interpreter.spin2`)
- Modify `callgo` to read default_count rfvar after locals rfvar.
- Add `bc_call_sub_d` / `bc_call_obj_sub_d` / `bc_call_ptr_d` handlers — same as their non-_d variants but record supplied_count for the prologue.
- Prologue: for slots from supplied_count to params-1, copy default_table[i - (params - default_count)] into the param slot.

### Phase 5 — Disassembler / listing / map file
- New opcode tables.
- `.lst` annotations per §6.

### Phase 6 — Tests
- Same-object call: missing trailing args, all defaults, no defaults, mixed.
- Child-object call: same matrix.
- Method-pointer call: same matrix.
- Edge cases: gap-violation rejected, default-on-result rejected, struct-param-default rejected.
- Negative: too few args (less than `required_params` count) rejected with clear error.

### Phase 7 — Cross-compiler validation
- GOLD-file regeneration (Windows-only) for new test sources.
- PNut-TS produces byte-identical output for all defaulted-call test cases.

---

## 9. Summary

| Question | Answer |
|----------|--------|
| Is the feature feasible? | **Yes, comfortably.** v52 source is well-structured for this. |
| Recommended strategy? | **Strategy B — callee-side filling, with B2 supplied-count prefix in the call bytecode.** |
| Why not caller-side? | It cannot give us symmetric method-pointer support without a separate, much larger typed-method-pointer language change; and it forces a `.obj` format extension that callee-side avoids. |
| Cost? | One interpreter prologue change in `Spin2_interpreter.spin2`; three new bytecode opcodes; per-call-site cost is +1 byte only when args are omitted; per-method cost is +1 byte (rfvar default_count = 0) when no defaults. |
| `.obj` format change? | **Not required** under Strategy B. |
| Listing/map changes? | Yes — show resolved signatures with defaults and annotate call sites where defaults filled in. |
| Open issues? | 10 listed in §7; none are strategy-blocking. |
