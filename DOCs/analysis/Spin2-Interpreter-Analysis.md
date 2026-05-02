# Spin2 Interpreter — Memory & Efficiency Analysis

**File analyzed:** `src/ext/Spin2_interpreter.spin2`
**Version:** v54 (equivalent to PNut v54a; shipped in PNut-TS 1.54.0), 2,988 lines, 101,644 bytes
**Author:** Chip Gracey (Parallax)
**Date of original analysis:** 2026-04-27
**Date of revision (round 1):** 2026-04-29
**Date of revision (round 2):** 2026-04-29 — corrected hub-branch timing per updated p2kb
**Date of revision (round 3):** 2026-05-01 — XBYTE-compression-cost correction (per Chip's feedback)
**Date of revision (round 4 captured / round 5 applied):** 2026-05-01 — REP/ALTI/SKIPF in hubexec, taskptr text bug, inline-PASM size, ORGH..END inline form, F-2 promoted to top fusion candidate, LOOKUP/LOOKDOWN-to-hub strategy added (per Chip's feedback)
**Revised in response to:** Chip's feedback collected in `Spin2-Interpreter-Analysis-Chip-Feedback.md`, follow-up review against refreshed p2kb (`Spin2-Interpreter-Analysis-Round2-Findings.md`), XBYTE-compression-cost correction (`Spin2-Interpreter-Analysis-Round2-Findings.md` Round 3 section), Chip's round-4 review (`Spin2-Interpreter-Analysis-Round4-Findings.md`), and round-5 application summary (`Spin2-Interpreter-Analysis-Round5-Findings.md`).

---

## Revision Notice

This document is **v2 — corrected**. The original (2026-04-27) reached its headline conclusion based on two errors that propagated from the P2 knowledge base into the analysis:

1. **Hub-exec timing was wrong.** The original treated hub-exec as "~9 clocks per instruction average." In reality, sequential hub-exec instructions run at **2 clocks each** once the FIFO is streaming — identical to cog-exec. Only **branches** pay the FIFO-refill penalty: minimum 13 clocks, +1 if target not long-aligned, up to ~20 with hub-window misalignment (Silicon Doc v35 verbatim).
2. **Cog `$000..$0FF` was treated as free space.** It is not. The range `$000..$11F` (288 longs, with task pointers building down from `$11F`) is **reserved for user PASM coexistence** — a documented architectural feature of the P2 / Spin2 model that allows user PASM (inline ORG, interrupt handlers, peripheral drivers) to live in the same cog as the running Spin interpreter. Putting interpreter code there forecloses a real user-facing capability.

The combination of these errors made Finding 1 ("relocate call/return into `$000..$0FF` for ~7×/instruction speedup") look like the headline win. With the corrections applied, that win **shrinks roughly an order of magnitude** (only branches benefit, not every instruction) **and carries a real architectural cost** (forecloses user PASM coexistence). It is no longer the headline.

This v2 walks the entire analysis through the corrected timing model and reranks the findings honestly.

---

## TL;DR (revised)

The interpreter is **already extraordinarily dense**. Nearly every compaction trick the P2 silicon offers is in use — XBYTE dispatch, SKIPF patterns, ALTI/ALTS/ALTD, EXECF, REP, SETQ, shared dispatch chains, and self-modifying instruction fields. There are no large untapped wins inside the existing scheme.

The most concrete findings, ranked by impact under the corrected timing model:

1. **Bytecode pattern fusion is the highest-leverage class of optimization.** XBYTE dispatch costs ~6 clocks regardless of whether the routine sits in cog or hub. Compressing a frequently-used 3–5 bytecode sequence into a single fused bytecode saves 4 × 6 = 24 clocks of pure dispatch overhead per occurrence, on every workload that exercises the pattern. The `bc_send_byte_step` idea (formerly Finding A) is one instance; there are likely others worth surveying.
2. **Branch reduction in hot hub routines is the next lever**, not relocation. Replacing conditional branches with SKIPF/predication, or reordering code to keep the FIFO streaming, captures most of the speedup that relocation would deliver — without consuming user-PASM cog space.
3. **The `bc_unused` slot at `$40`** is free design space for the first new fused bytecode.
4. **Author's own TODOs** — stack-tracking telemetry (line 1) and FP additions (lines 2483-2489) — are explicit work items.
5. **Cog `$000..$11F` user-PASM-coexistence region** is a *feature*, not headroom. The original analysis missed this; this revision elevates it to a first-class architectural fact.
6. **Selective hot-routine relocation into cog `$000..$0FF`** is *possible* but only worth doing if the user-PASM coexistence capability is being deliberately scoped down. Real savings (round 2 corrected) are **90–160 clocks per call+return pair (~8–15% on call-heavy programs)**, not the 350+ the original analysis claimed.

---

## Corrected timing model

Establishing the numbers up front, since they govern everything below. **All figures cross-checked against p2kb entries `p2kbPasm2CogHubExecution`, `p2kbPasm2Hubexec`, and `p2kbArchXbyteEngine` (refreshed 2026-04-29 with Silicon Doc v35 verbatim citations).**

| Operation | Cog-exec (clocks) | Hub-exec sequential (clocks) | Hub-exec branch (clocks) |
|-----------|-------------------|------------------------------|-------------------------|
| `MOV`, `ADD`, `SUB`, etc. (basic ALU) | 2 | **2** | n/a |
| `CMP`, `TEST`, conditional flags | 2 | **2** | n/a |
| `RDLONG` / `WRLONG` (hub I/O) | 9-24 / 3-12 | 9-24 / 3-12 | n/a |
| `JMP`, `CALL`, conditional branches taken | 4 | n/a | **min 13, +1 if target not long-aligned, up to ~20** |
| `JMP`, `CALL`, conditional branches not taken | 2 | **2** | n/a |
| Sequential instruction stream (FIFO primed) | 2 / instruction | **2 / instruction** | n/a |

**Silicon Doc v35 verbatim:** *"Branching to a hub address takes a minimum of 13 clock cycles. If the instruction being branched to is not long-aligned, one additional clock cycle is required."*

**FIFO depth:** the per-cog instruction-prefetch FIFO has **(cogs+11) = 19 stages** on an 8-cog P2 (Silicon Doc v35 verbatim). This is the silicon-level reason sequential hubexec hits 2 clk/instruction — the FIFO continuously prefetches and the pipeline drains at one instruction per 2 clocks regardless of hub window timing, as long as no branch flushes the stream.

**Hubexec forbidden instructions** (these don't run slowly — they cannot be used at all in hubexec, because the FIFO is dedicated to instruction prefetch): RDFAST, WRFAST, FBLOCK, RFBYTE, RFWORD, RFLONG, RFVAR, RFVARS, WFBYTE, WFWORD, WFLONG, XINIT, XZERO, XCONT (when streamer engages FIFO). Source: Silicon Doc v35 HUB EXECUTION section verbatim.

**Hubexec available-but-degraded instructions** (per Chip's round-4 correction; p2kb update in flight):
- **REP** — *available* in hubexec, realized via branches. Each loop iteration pays the FIFO refill cost (~13-20 clk per loop boundary) — much slower than the zero-overhead REP available in cogexec/lutexec, but functionally usable.
- **ALTI / ALTR / ALTD / ALTS / ALTB / ALTGN / ALTGW / ALTGB / ALTSN / ALTSW / ALTSB** — *available* in hubexec. The `also unavailable` framing in earlier p2kb releases was wrong.
- **SKIP** — works in hubexec.
- **SKIPF** — works in hubexec, but **degrades to SKIP semantics** (replaces instructions in the pipeline with NOPs rather than skipping fetch from the FIFO). Performance is closer to SKIP than to cogexec-mode SKIPF.

**The interpreter runs as cog-exec**, so all of these are fully available at full speed — REP, RFVAR, RFBYTE, RFLONG, ALTI, SKIPF are heavily used in the existing implementation. Stating this list explicitly prevents future "could we move part of this to hubexec?" misreadings: the FIFO/streamer instructions block such a move, while REP/ALTx/SKIPF would merely run with degraded performance.

**Key insight:** the FIFO streams hub instructions at one-per-2-clocks once primed. Branches break the stream and pay refill. So **the speed difference between cog-exec and hub-exec is concentrated in branch density**, not in average instruction speed.

For a routine that is mostly straight-line code (e.g., a 50-instruction routine with 4 branches), running it from hub vs cog costs roughly:
- Cog: 50 × 2 = 100 clocks plus 4 × 4 = 16 clocks of branch = **~116 clocks**
- Hub: 46 × 2 (sequential) + 4 × 14 (branch refill at minimum + typical alignment penalty) = 92 + 56 = **~148 clocks**
- Worst case (all branches non-long-aligned, hub-window misaligned): 4 × 20 = 80 → **~172 clocks**
- **Difference: ~32-56 clocks for the whole routine**, all concentrated at branch points.

This is a per-routine difference of **~28-50%**, concentrated entirely at branch points. Linear code runs at parity.

---

## Architecture recap (for context)

Memory map at runtime, after `launch_spin` — **with corrected labeling for the user-PASM region**:

| Region | Address | Size (longs) | Contents |
| --- | --- | --- | --- |
| **User PASM region** | `$000..$0FF` | 256 | **Reserved for user cog-PASM code** (loaded as zeros at launch; available for inline PASM, interrupt handlers, peripheral drivers coexisting with the Spin interpreter) |
| **`taskptr` table** | `$100..$11F` | 32 | Multitasking task pointer table; **builds downward from `$11F`**, so unused entries extend the user-PASM region |
| `tasknext_` etc. + cog code | `$120..$1EF` | 208 | Hot interpreter code |
| `buff` block | `$1E0..$1EF` | 16 | Operand scratch / float aliases |
| PASM-use regs | `$1D8..$1DF` (overlaps) | 8 | `reg[]` user space |
| Special regs | `$1F0..$1FF` | 16 | Hardware (ptra, dirA, etc.) |
| LUT streamer reserve | `$200..$20F` | 16 | Reserved for streamer LUT-DAC |
| LUT code | `$210..$278` | ~105 | LUT-resident routines |
| `altcodes` dispatch | `$279..$2FF` | 135 | Variable-operator bytecode table |
| `maincodes` dispatch | `$300..$3A5` | ~166 | Primary bytecode table (`$00..$9F` + compressed `Ax..Fx`) |
| LUT extra code | `$3A6..$3FF` | ~90 | More LUT-resident routines (returns, fields, casefi/d, op_rel, etc.) |

Hub holds the bulk of the slow-path code (FP, CORDIC, string ops, big move/fill, task scheduling).

The dispatch is via XBYTE (`_ret_ setq #$1A1`): every bytecode incurs ~6 clocks of dispatch overhead + the routine body. Every dispatch-table entry packs a routine address into 10 bits and a 22-bit SKIPF pattern that selectively executes a subset of a shared code chain — that's how 100+ bytecodes share ~25 actual code chains (`una_iso`, `sha_mod`, `mod_iso`, `hub_ap`, `branch`, `op_rel`, etc.).

---

## Finding 1 — Cog `$000..$11F` is a user-PASM-coexistence feature, not headroom

### What this region is

Per the architectural intent (under-documented today; see the `Spin2-Interpreter-Analysis-Chip-Feedback.md` audit for missing p2kb coverage):

- `$000..$0FF` (256 longs / 1 KB) is **reserved for user cog-PASM code** that runs alongside the Spin interpreter in the same cog.
- `$100..$11F` is the multitasking `taskptr` table, **building downward from `$11F`**. Because the table fills from the top, programs that use fewer than 32 software tasks leave the unused **lower** portion of this range (entries near `$100`) available for user code as well.
- Concrete demonstrated use case: Chip has previously run a video driver on interrupts inside the same cog as the Spin interpreter, with the driver code living in this region.

This is a real, exercised architectural capability — it just lacks public documentation. It allows P2 to host high-level Spin and low-level PASM in the **same cog**, without dedicating a whole additional cog to a peripheral driver, ISR, or inline routine.

### Implication for "is this region available for interpreter code?"

The original analysis treated this region as "zero, unused, available for relocation." That was wrong. **Putting interpreter code into `$000..$0FF` consumes (or constrains) a user-facing P2 capability.** That cost is real even when the capability is currently exercised by a small minority of users — it caps what the platform can do in the future and contradicts the design intent.

### Inline PASM and the user-PASM region

Inline PASM in a Spin2 method comes in **two forms**:

1. **`ORG ... END`** — PASM is loaded into cog RAM at runtime by the interpreter and runs as **cog-exec** (deterministic 2 clk/instruction; REP, ALTI, etc. fully available at full speed). The available code area is **`$000..$11F` (288 longs) plus LUT `$000..$00F` (16 longs)** when no multitasking is in use — the same range that hosts user-PASM coexistence code (interrupt handlers, peripheral drivers, etc.). Source: refreshed `p2kbSpin2InlinePasm`.

2. **`ORGH ... END`** *(introduced in Spin2 v50)* — PASM is **not loaded into cog**, but executes directly from hub as **hub-exec**. Sequential code runs at 2 clk/instruction (FIFO-streamed) but branches pay 13-20 clk FIFO refill. Maximum block size is **`$FFFF` longs** (auto-RET included). ORGH..END inline is the right form when the PASM block is too large to fit alongside everything else in `$000..$11F`, or when the program does not need cog-exec timing determinism.

In **both** forms, the first 16 method parameters/result/locals are buffered to the **`buff` block at `$1E0..$1EF`** (16 longs) on entry to the inline section, and restored after the inline code exits. The `buff` block is a fixed parameter-spill region — **not** the inline code area. Earlier versions of this analysis incorrectly conflated `buff`'s 16 longs with the code area; the code area is the full 288-long `$000..$11F` for ORG..END (or zero cog footprint for ORGH..END).

This means the **user-PASM coexistence region (`$000..$11F`) is genuinely substantial — 288 longs of code space**. Chip's video-driver-on-interrupts use case fits comfortably; an interrupt handler for a peripheral can live there alongside the interpreter without crowding the inline-PASM use case for ordinary methods. The fact that ORGH..END inline is now also available means programs that need *more* than 288 longs of inline PASM have an escape valve — but pay the hub-branch cost on every taken branch within the inline block.

### Recommendation

**Treat `$000..$11F` as reserved feature surface, not headroom.** Any proposal to relocate interpreter code into this region must:
- Be explicit about deprecating or formally scoping the user-PASM coexistence capability.
- Update silicon documentation, p2kb, and user-facing materials to reflect the new contract.

The savings from relocation are non-trivial — under the corrected branch-cost numbers (round 2), 90-160 clk per call+return pair, or ~8-15% on call-heavy programs. This is no longer noise-floor territory. **Whether it justifies consuming the user-PASM coexistence region is a deliberate-decision question, not a presumed "don't."**

The cost side of that decision is now better understood (round 4): the foreclosed region is 288 longs of cog code space — large enough for substantive user PASM (interrupt-driven drivers, ISRs, the video-on-interrupts pattern Chip cited). Consuming any meaningful fraction of it for interpreter code meaningfully shrinks what user code can host. The new `ORGH..END` inline form provides an escape valve for programs that need more PASM than fits, but at the cost of hub-branch overhead on every taken branch. If the user-PASM region is being deliberately scoped down for documentation purposes, relocation captures real value. If the region is being preserved as the architectural feature it is, the §4 branch-reduction approach captures most of the same upside without the trade-off.

---

## Finding 2 — Bytecode pattern fusion (highest-leverage class)

XBYTE dispatch costs **6 clocks** per bytecode (Silicon Doc v35 verbatim, per p2kb `p2kbArchXbyteEngine`), regardless of whether the dispatched routine lives in cog or hub. For comparison, a software-dispatched bytecode interpreter would cost **9 clocks** per bytecode (Silicon Doc verbatim: *"takes only 2+3+4, or 9, clocks to get the next bytecode, look it up, then execute that bytecode's routine"*). XBYTE is already saving ~3 clk/bytecode versus the naive interpreter.

The minimum XBYTE loop is **8 clocks** — a single-instruction bytecode routine (one 2-clock instruction with `_ret_` prefix) plus the 6-clock overhead. This sets the floor on per-bytecode cost.

This dispatch cost is structural: every bytecode in a Spin2 program pays it. Therefore, **reducing the bytecode count for common patterns is the highest-leverage optimization** available — it works on every Spin2 program and is independent of cog/hub placement. Each fused dispatch saves ~6 clocks (the eliminated dispatch's overhead).

The unused dispatch slot at `$40` (`bc_unused`, line 931) is the natural home for the first fused bytecode.

### 2.1 Concrete instance: `bc_send_byte_step` (formerly Finding A)

The full proposal is preserved below in §2.2 with corrected priority framing. In one sentence: today, `SEND(bytes...)` runs an inner loop of 6 dispatches per byte; replacing 4 of them with one fused PASM kernel drops the per-byte cost from an estimated ~300 clocks to ~205 clocks (a ~32% speedup on that path). **Note:** the 300/205 clk numbers are estimates that depend on the per-bytecode routine body times for `bc_setup_local_0_15`, `bc_var_postinc_push`, `bc_setup_byte_pa`, `bc_read`, and `bc_call_send`. The XBYTE 6-clk dispatch overhead per bytecode is verified (Silicon Doc); the routine bodies' execution times are estimates and would need direct measurement on hardware to firm up.

**Priority correction from the original analysis:** Chip's feedback was that `SEND(bytes...)` is not on most users' critical paths and the current implementation is already memory-optimal. So while the optimization is technically real, it should be classified as **situational** — worth doing if a real workload demands it, not as a default upgrade.

### 2.2 Pass 1 fusion-candidate survey (compiler-emitted patterns)

A static survey of `src/classes/spinResolver.ts` and the bytecode dispatch table (`src/ext/Spin2_interpreter.spin2:847-1052`) was performed to find **multi-byte sequences the compiler always emits together** — patterns whose ubiquity is structural (encoded in the calling convention, ABI, or expression-emission grammar), not dependent on user code style.

**Already-fused patterns** (mentioned for context, not candidates):
- `bc_setup_local_0_15+N` (16 variants) — first-16 local setup
- `bc_setup_var_0_15+N` (16 variants) — first-16 var setup
- `bc_setup_reg_1D8_1F8+N` (16 variants) — register access
- `bc_read_local_0_15+N` (16 variants) — first-16 local read (plain, no bitfield)
- `bc_write_local_0_15+N` (16 variants) — first-16 local write (plain, no bitfield)
- `bc_con_n` (16 variants) — small constants -1..14
- `bc_setup_bfield_0_31+N` (32 variants) — constant-bit bitfield setup

**Candidate fusions, ranked by structural ubiquity × dispatch savings:**

> **Round 4 ranking update:** Per Chip's review (2026-05-01), F-2 (bitfield setup + read/write fusion) is now the **strongest** candidate, not the second-strongest. His reasoning: most bitfield operations are read-and-write, the byte-savings per occurrence matter for binary size on hub-RAM-constrained programs, and applications that interface with P2 hardware use bitfields constantly. F-1 (pop-then-branch) drops to second place — still a strong, clean candidate, just behind F-2 in real-program impact. The slot cost of F-2 (32 slots) is addressable via §2.5 Strategy D (move LOOKUP/LOOKDOWN to hub) — Chip's longstanding proposal for freeing the needed space.

#### Candidate F-2: Setup-bitfield-local + read/write fusion — strongest (per Chip's round-4 ranking)

- **Trigger:** bitfield access on a local variable: `flags.[3..0] := value`, `result := pinmask.[7]`, etc.
- **Today:** `bc_setup_local_0_15+N` + `bc_read` (or write op) — **2 dispatches** plus 1 byte of bytecode
- **Fused:** `bc_setup_read_bfield_local_0_15+N` (16 variants) and `bc_setup_write_bfield_local_0_15+N` (16 variants)
- **Per occurrence saving:** ~6 clocks of dispatch overhead **plus 1 byte of bytecode** (binary-size win as well as speed win)
- **Frequency:** very common in I/O code, hardware-register code, packed-flag manipulation. Per Chip: "biggest win on bytecodes" — most bitfield ops are reads and writes, applications using bitfields heavily benefit substantially.
- **Slot cost:** 32 slots — addressable via §2.5 Strategy D (LOOKUP/LOOKDOWN-to-hub frees enough room)
- **Verdict:** **Top fusion candidate.** Real binary-size savings AND dispatch savings, on patterns that recur across hardware-interfacing Spin2 programs. Pair with Strategy D for slot budget.

#### Candidate F-1: Pop-then-branch (loop-exit fusion) — second-strongest

- **Trigger:** every `NEXT`, `QUIT`, and any branch out of a stack-frame that needs to drop the loop's stack values
- **Today:** `bc_pop_rfvar` + rfvar bytes + `bc_jmp` (or `bc_jnz`/`bc_djnz`) + rfvar bytes — **2 dispatches**
- **Fused:** `bc_pop_jmp_rfvar` (and variants for jnz, djnz) — 1 dispatch each
- **Per occurrence saving:** ~6 clocks
- **Frequency:** every loop with a non-trivial body has at least one of these; estimated ~10–30 per typical 1,000–5,000 LOC program
- **Slot cost:** 3 new bytecodes (one per branch type)
- **PASM kernel size:** ~6–10 longs each (drop N stack longs via `popa`/`add ptra,#N*4`, then standard branch)
- **Verdict:** Strong, structurally ubiquitous, cheap, self-contained. Ranked second behind F-2 because the per-program byte-count savings of F-2 are larger on real hardware-interfacing code, but F-1 remains a top-tier candidate.

#### Candidate F-3: Hub-bytecode + memory-op fusion

- **Trigger:** every `BYTEFILL`, `BYTEMOVE`, `WORDMOVE`, `LONGMOVE`, `BYTECOMP`, struct-copy, struct-fill
- **Today:** `bc_hub_bytecode` + `bc_bytefill` (or variant) — **2 dispatches**
- **Fused:** one direct slot per memory-op (`bc_hub_bytefill`, `bc_hub_bytemove`, `bc_hub_wordmove`, `bc_hub_longmove`, etc.)
- **Per occurrence saving:** ~6 clocks
- **Frequency:** moderate-to-high in struct-heavy programs; minimal in plain procedural code
- **Slot cost:** ~10 slots
- **Verdict:** Worth doing for struct-heavy library code; defer for general-purpose if slots tight.

#### Candidate F-4: bc_send_byte_step (formerly Finding A; preserved in §3)

Already detailed in §3 below. **Situational** — only on workloads that exercise `SEND(bytes...)` heavily.

#### Candidate F-5: Pop-N-longs fusion — marginal

- **Trigger:** discarding multi-return values when caller doesn't want them all
- **Today:** `bc_pop_rfvar` + rfvar bytes — **1 dispatch + rfvar fetch**
- **Fused:** `bc_pop_2`, `bc_pop_3`, `bc_pop_4` (rare cases)
- **Per occurrence saving:** ~3 clocks (rfvar fetch only — *not* a full dispatch)
- **Verdict:** Marginal. Skip unless slot budget is plentiful.

**Reality-corrections to common over-estimates:**

The first-pass survey produced two numerical errors that this section corrects:

1. **Method-call prologue** (`bc_call_sub` + small address): the rfvar address is fetched *inside* the `callsub` PASM handler (`Spin2_interpreter.spin2:861-862`), not via a separate dispatch. Pre-encoding small addresses into `bc_call_sub_0_15` would save only the **rfvar fetch** (~3 clk), not a full ~6-clk dispatch. Demoted out of the candidate set — not worth a slot family.
2. **Loop-exit savings magnitude**: the today-cost of `bc_pop_rfvar + bc_jmp` is 2 dispatches (not 4), so the saving per occurrence is ~6 clk (not ~24 clk). At ~30 occurrences per typical program, this is ~180 clk/program — still the strongest candidate, just at honest scale.

### 2.3 Pass 2 — corpus survey (not yet done)

Pass 1 (above) used a static read of the compiler source to find **patterns that are guaranteed to appear** because the emitter always emits them. Pass 2 would compile a corpus of real Spin2 programs (OBEX library objects, sample applications) and produce N-gram frequency histograms over the actual bytecode streams.

Pass 2 would:

1. Compile a representative corpus (OBEX libraries, sample applications).
2. For each compiled object, walk the bytecode stream and emit a frequency histogram of bigrams, trigrams, 4-grams.
3. Rank patterns by `frequency × (n - 1)` (the dispatch-savings score).
4. Filter for patterns that have a clean PASM kernel realization.
5. Calibrate the §2.2 candidates with measured occurrence counts.

This is a small piece of tooling — a few hundred lines of TypeScript walking PNut-TS-produced bytecode. Output: quantitative ranking of every fusion candidate. **Not yet performed.** A Pass 1 result is sufficient to commit to the top 1–2 candidates; Pass 2 calibrates the rest.

### 2.4 Recommendation

Implement **F-1 (pop-then-branch)** first. It is the highest-leverage structural fusion and the cheapest to ship:
- 3 slots (not 32 like F-2)
- ~6–10 longs of PASM per variant
- Self-contained: no interaction with bitfield/struct ABIs
- Compiler-side change is localized to `ci_next_quit()` in `spinResolver.ts`

If slot budget allows after the §2.5 reorganization, add **F-2 (bitfield-local fusion)** as the second wave.

The bc_send_byte_step proposal (§3) remains **situational** — ship if and only if SEND-bytes is a measured bottleneck.

### 2.5 Bytecode opcode-space accounting and how to make room

The §2.2 candidates require more bytecode slots than are currently free. This subsection inventories the existing allocation and proposes how to reclaim slots without breaking existing programs.

#### Current allocation (256 slots total)

| Range | Slots | Allocation |
|-------|-------|------------|
| `$00..$3F` | 64 | Method calls, branches, pops, hub-bytecodes, CASE, LOOKUP, COG/PIN/LOCK ops |
| `$40` | 1 | **Free** (`bc_unused`) |
| `$41..$9F` | 95 | Constants, math, comparison, var-modifiers, write-ops (isolated and push variants), bitrange, string |
| `$A0..$AF` | 16 | `bc_con_n` family — constants -1..14 |
| `$B0..$BF` | 16 | `bc_setup_reg_1D8_1F8` family |
| `$C0..$CF` | 16 | `bc_setup_var_0_15` family |
| `$D0..$DF` | 16 | `bc_setup_local_0_15` family |
| `$E0..$EF` | 16 | `bc_read_local_0_15` family |
| `$F0..$FF` | 16 | `bc_write_local_0_15` family |

**Net free slots today: 1.** That's nowhere near enough for the §2.2 candidates (F-1 needs 3, F-2 needs 32, F-3 needs ~10).

The `Ax/Bx/Cx/Dx/Ex/Fx` regions are runtime-collapsed via XBYTE compression to 6 dispatch entries (see `Spin2_interpreter.spin2:1045`), but from the **compiler's** perspective those 96 slots are individually addressable and used.

#### Strategy A — Compress more families via XBYTE (NOT free — see correction below)

> **Correction (Chip's feedback, 2026-05-01):** This strategy is *not* free as originally framed. Today, each unary-write opcode (e.g., `$90..$9A`) carries its own 23-bit SKIPF pattern *inside its LUT dispatch entry* — that pattern arrives "for free" with the dispatch read. Collapsing 22 entries into one 32-way XBYTE-compressed family means **only one LUT entry, one SKIPF pattern**. The 22 distinct per-operation skip patterns must then come from somewhere else: hub lookup (~9-24 clk per dispatch — net slowdown), a second RDLUT (~3 clk + address-computation overhead), or PASM computation of the pattern from the bytecode index (likely 2-4 clk extra if the patterns are regular enough to compute). **Each dispatch into the compressed family pays additional overhead.** The slot reclamation has a runtime cost. Whether it's a net win depends on (a) how often those specific bytecodes execute and (b) whether a computed/regular skip pattern is achievable for that family. The original framing below ("no fundamental scarcity, just compress more") was wrong — it understated the cost of getting the patterns.

Several existing bytecode groups in the `$90..$DD` range share PASM chains and differ only in SKIPF mask. The original analysis claimed they were prime candidates to collapse into a 16-way XBYTE-compressed family, in exactly the same way `bc_con_n` and friends already do. **The crucial difference** is that `bc_con_n`'s 16 variants don't need 16 different skip patterns — they all run the same `const` routine and discriminate via bytecode index used as a constant value. The unary-writes group needs 22 different skip patterns, which is structurally different.

| Group | Range | Count | Shared PASM chain | Slots freed if collapsed |
|-------|-------|-------|-------------------|--------------------------|
| Unary writes (isolated) | `$90..$9A` | 11 | `una_iso` | 10 |
| Unary writes (push) | `$B7..$C1` | 11 | `una_psh` | 10 |
| Binary write-shift/log/add (iso) | `$9B..$AE` | 20 | `sha_mod`, `log_mod`, `add_mod`, `rev_mod` | depends on sub-grouping; potentially 16 |
| Binary write-shift/log/add (push) | `$C2..$D5` | 20 | same chains, push variants | 16 |
| Mul/div writes (iso + push) | `$AF..$B6`, `$D6..$DD` | 16 | `muu_mod`, `mul_mod` | 8–14 |
| LOOKUP/LOOKDOWN value/range | `$1F..$22` | 4 | `lookv`, `range` | 3 |
| Pin ops (low/high/toggle/float) | `$35..$38` | 4 | `pinl_`, `pinh_`, `pint_`, `pinf_` | 3 |

**Originally proposed:** collapse the unary-writes pair (iso `$90..$9A` + push `$B7..$C1` = 22 ops) into a single 32-way family with bit 0 selecting iso vs push, claiming this would free ~20 slots at zero per-call cost. **This is incorrect** for the reasons spelled out in the correction box above — the 22 distinct skip patterns can't all come from a single LUT entry, so dispatch into the compressed family adds overhead.

The structural difference vs `bc_setup_local_0_15` and `bc_con_n` is critical: those existing 16-way compressed families work because their 16 variants share **one** skip pattern and discriminate by using the bytecode index as data (a constant value, a register-file offset). The unary-writes group needs **22 different skip patterns** to express the different unary operations through the shared `una_iso` chain — that information has to be retrieved per dispatch.

**If pursued, the realistic options are:**

1. **Computed skip pattern.** The existing patterns appear to be a single-bit rotation among ~22 positions (`%...11011110010` rotates by one position per opcode). If that regularity holds, the routine can compute the pattern from `pa` (bytecode value) using shift/rotate ops (~2-4 extra clk per dispatch into the compressed bytecode). Best case for runtime cost; needs verification that *all* 22 patterns are reproducible by the formula.
2. **Second-table lookup.** Per-operation skip patterns stored in a 22-entry LUT region, indexed by `pa`. ~3 clk RDLUT + address computation per dispatch. Still consumes LUT longs (~22 of them — partially offsetting the slot savings).
3. **Hub lookup.** ~9-24 clk per dispatch. Net slowdown almost certainly. Avoid.

**Whether any of these are net wins** depends on the execution frequency of those specific bytecodes (the unary-writes are a tail of the operator-write distribution; if most actual writes go through `bc_add_write` / `bc_sub_write` etc. rather than `bc_lognot_write`, the runtime cost is amortized over rare events) and whether the freed slots are needed for high-frequency new bytecodes.

**Compiler-side change** is unchanged from the original framing: emit the compressed bytecodes via base + 5-bit operation index. PNut-TS resolver and original PNut x86 both updated.

#### Strategy B — Extended-prefix bytecode

Reserve one slot (e.g., the current `$40`) as `bc_extended` — "the next byte is a secondary opcode in an extension table." This grants 256 new dispatch slots at the cost of:

- 1 extra dispatch (~6 clocks) per extended bytecode use
- A new small dispatch table for the extension namespace
- Compiler emits 2 bytes per extended op instead of 1

**Right for:** rare bytecodes that are infrequent enough that the per-call dispatch tax is negligible (e.g., FP additions, debugging instrumentation, library-rare operations).

**Wrong for:** the §2.2 fusion candidates themselves, because their whole point is to *save* dispatches — adding a dispatch back defeats the purpose.

#### Strategy C — Reorganize allocation

Move rarely-used bytecodes from `$00..$9F` to the extended-prefix region (Strategy B), freeing primary slots for high-frequency fusions. Candidates for relegation: float operations not yet implemented (line 2483 TODOs are good extension-region targets), debug-only bytecodes, infrequent pin operations.

**Cost:** every program that uses a relegated bytecode pays ~6 clk extra per use. Worth it for genuinely rare operations.

#### Strategy D — Move LOOKUP/LOOKDOWN to hub (Chip's longstanding proposal)

Per Chip's round-4 review (2026-05-01), this is his preferred path for freeing the slot budget needed to ship F-2 (bitfield setup + read/write fusion). LOOKUP/LOOKDOWN occupy 5 dispatch slots in the primary table (`$1F..$23`):

- `bc_lookup_value`, `bc_lookdown_value` (`$1F..$20`) — value comparison
- `bc_lookup_range`, `bc_lookdown_range` (`$21..$22`) — range comparison
- `bc_look_done` (`$23`) — terminator

**The trade:**
- LOOKUP/LOOKDOWN are control-flow constructs used selectively, **not in inner loops**. Per-use frequency is low compared to bitfield operations or arithmetic.
- Move the implementation to hub: each LOOKUP/LOOKDOWN bytecode dispatches to a stub (or a small `bc_hub_lookup` family) that calls into a hub-resident routine. Per-use cost: one extra dispatch (~6 clk XBYTE) plus the hub-routine entry branch (~13-20 clk).
- **Slot savings: 5 slots** — enough to allocate F-2's 32-slot bitfield-fusion families with room to spare (32 = 5 freed + 27 from compressing one or two unary-write groups, or some combination with Strategy A).

**Why this is the right slot-freeing mechanism for F-2:**

| Strategy | Frees | Per-use cost on freed bytecodes | Right for |
|----------|-------|--------------------------------|-----------|
| A (compress unary-writes) | ~20 slots | 2-24 clk added per dispatch into compressed bytecodes | Only if the compressed group is used rarely |
| B (extended prefix) | 256 slots in extension namespace | +6 clk per use | Rarely-used new bytecodes |
| C (relegate to extension region) | varies | +6 clk per use of relegated bytecode | Rarely-used existing bytecodes |
| **D (LOOKUP/LOOKDOWN to hub)** | **5 slots** | **+19-26 clk per LOOKUP/LOOKDOWN use** | **High-frequency bytecodes that can take the freed slots — like F-2** |

Strategy D pays the per-use cost on a low-frequency control construct (LOOKUP/LOOKDOWN) to free slots for high-frequency fusion (F-2 bitfield ops). The trade favors the high-frequency side decisively — paying ~25 clk per LOOKUP buys ~6 clk savings per bitfield op on every bitfield read/write in the program. On hardware-interfacing code, that's a clear net win.

**Implementation sketch:**

1. Move the LOOKUP/LOOKDOWN PASM bodies (`lookv`, `range`, `lookd` chains in cog/LUT) to hub.
2. Replace the 5 dispatch entries with stubs that branch to the hub-resident routines (similar to the existing `return_`/`abort_`/`field_` trampoline pattern, but freeing 4 of the 5 slots — only 1 trampoline slot is needed if the stubs share an entry that decodes the operation from `pa`).
3. Reclaim the freed slots for F-2's `bc_setup_read_bfield_local_0_15+N` and `bc_setup_write_bfield_local_0_15+N` families.
4. PNut-TS resolver and original PNut x86 emit bytecode unchanged for LOOKUP/LOOKDOWN (the wire format is the same — only the dispatch routine moves).

#### Recommended slot-budget plan

| Step | Action | Slots freed/used |
|------|--------|------------------|
| 1 | Collapse unary-writes (iso+push) into one 32-way XBYTE family (Strategy A) | +20 free |
| 2 | Collapse pin ops `$35..$38` into a 4-way family | +3 free |
| 3 | Allocate F-1 (pop-then-branch fusion): `bc_pop_jmp_rfvar`, `bc_pop_jnz_rfvar`, `bc_pop_djnz_rfvar` | -3 free |
| 4 | Reserve `$40` (current `bc_unused`) for either bc_send_byte_step (§3) or bc_extended prefix | -1 free |
| 5 | If F-3 (hub-bytecode+memory-op) is pursued, allocate ~10 slots | -10 free |
| 6 | If F-2 (bitfield-local fusion) is pursued, requires another XBYTE family of 32 slots | needs Strategy A round 2 |

**Net after Step 1+2+3:** ~19 slots free, comfortable for F-3 (10 slots) plus Strategy B prefix (1 slot) plus future-proof headroom.

**For F-2 (bitfield-local):** would need a second round of compression (e.g., binary write-shift/log/add = ~32 slots compressed to one 32-way family). Achievable but a larger refactor.

#### Bottom line on opcode space (revised — round 4 / 5)

The original analysis claimed "no fundamental scarcity, just compress more." **That was wrong.** Compressing the unary-writes group does *not* come for free: the 22 distinct per-operation SKIPF patterns must be sourced from somewhere outside the single compressed-family dispatch entry, costing 2-24 extra clk per dispatch into those bytecodes depending on retrieval mechanism. Real scarcity exists.

**Round 4 update:** Chip's view is that the highest-leverage fusion is **F-2 (bitfield setup + read/write)**, not F-1. He's also identified **Strategy D (move LOOKUP/LOOKDOWN to hub)** as the right slot-freeing mechanism for F-2. With these in hand, the recommended sequencing changes:

The new order of operations is:

1. **Move LOOKUP/LOOKDOWN to hub (Strategy D).** Frees ~4-5 slots. Pays ~25 clk per LOOKUP use (low-frequency control construct), which is far cheaper than other slot-freeing strategies' per-use cost on the bytecodes they affect.

2. **Ship F-2 (bitfield setup + read/write fusion).** Allocate 32 slots from the freed Strategy D budget plus modest additional compression of one less-frequent group (Strategy A applied selectively, e.g., the unary-writes-iso-only group of 11 ops compressed conservatively with computed skip patterns). Saves ~6 clk dispatch overhead AND ~1 byte of bytecode per bitfield read/write across every Spin2 program that does bitfield-heavy work. Per Chip: this is the biggest win.

3. **Verify F-1 (pop-then-branch fusion) practicality** (Chip flagged this as a separate question — rfvar ordering, branch encoding) and ship if practical. Allocates 3 dedicated slots from the remainder of the freed budget. Adds another ~6 clk × ~30 occurrences/program = ~180 clk savings on call/return-heavy programs.

4. **Pass 2 corpus survey** to refine F-3 (hub-bytecode + memory-op) and identify any further fusion candidates. Decide if any remaining slot pressure justifies more aggressive compression.

This sequencing puts Chip's largest-leverage fusion first, uses his preferred slot-freeing mechanism, and defers risky/aggressive compression until the proven wins are in hand.

---

## Finding 3 — Concrete fusion candidate: `bc_send_byte_step`

(Detail preserved from original Finding A. Priority adjusted per Chip's feedback: this is *situational*, not a top-tier default-upgrade win.)

### Today

`SEND(bytes...)` works as follows:

- `bc_call_send_bytes` dispatches to `callsendbh` (line 1504).
- `callsendbh` drops anchor, pushes count and data address as parameters, and **invokes the hand-rolled bytecode method `pri_sendb`** (lines 50-59) — a 9-byte bytecode sequence whose body loops `read byte at addr++, call SEND, decrement count, branch`.
- Each iteration of that bytecode loop pays full XBYTE dispatch overhead **six times** — one per inner bytecode (`bc_setup_local_0_15+1`, `bc_var_postinc_push`, `bc_setup_byte_pa`, `bc_read`, `bc_call_send`, `bc_djnz`).

A full PASM-only rewrite of the loop runs into a structural issue: invoking `msend` is intrinsically a Spin method call (msend is a method pointer), and method returns flow back through `returnh` and the bytecode dispatcher — not via PASM `call`/`ret`. So you cannot "loop in PASM, calling msend per byte" without erecting a bespoke continuation mechanism.

### Proposal

Collapse four of those six per-iteration dispatches into one new bytecode (`bc_send_byte_step`), claiming the currently-unused `$40` slot. The new bytecode does in one PASM kernel what the current four bytecodes do as five separate dispatches. `bc_djnz` continues to handle the loop, exactly as today. Per byte: **6 dispatches drops to 2**.

### PASM kernel (LUT-resident, ~8 longs)

```pasm
'
' bc_send_byte_step  (8 longs, LUT-resident)
'
' Per-iteration kernel for SEND(bytes...). Equivalent to:
'   bc_setup_local_0_15+1, bc_var_postinc_push, bc_setup_byte_pa, bc_read, bc_call_send
' compressed into a single dispatch.
'
' On entry:
'   x        = TOS = count (preserved across SEND)
'   dbase[1] = addr (param 1, post-incremented in place)
'
' Falls into callsendh, which invokes msend(byte) and returns to the
' next bytecode (bc_djnz) when SEND completes.
'
send_byte_step_ pusha   x               'save count onto stack
                mov     y,dbase         '\
                add     y,#1*4          ' > y -> &dbase[1]
                rdlong  z,y             '/  z = addr
                rdbyte  x,z             'x = byte (becomes parameter for SEND)
                add     z,#1            'addr++
                wrlong  z,y             'write back to dbase[1]
                jmp     #callsendh      'standard SEND invocation; recovers count via popa
```

### Dispatch table change (line 931)

```pasm
' Before:
bc_unused           long  0           |              %0 << 10  '40   <unused>

' After:
bc_send_byte_step   long  send_byte_step_ |          %0 << 10  '40
```

### `pri_sendb` shrinkage (lines 50-59)

```pasm
' Before (9 bytes):
pri_sendb       byte  0                          'no locals
                byte  bc_read_local_0_15+0       'read count
.loop           byte  bc_setup_local_0_15+1      'setup addr
                byte  bc_var_postinc_push  & $FF 'addr++
                byte  bc_setup_byte_pa     & $FF 'setup byte
                byte  bc_read              & $FF 'read
                byte  bc_call_send         & $FF 'call send
                byte  bc_djnz              & $FF 'djnz
                byte  (.loop-$) & $7F            'loop address
                byte  bc_return_results    & $FF 'return

' After (5 bytes):
pri_sendb       byte  0                          'no locals
                byte  bc_read_local_0_15+0       'read count
.loop           byte  bc_send_byte_step    & $FF 'send byte at addr++ (post-inc)
                byte  bc_djnz              & $FF 'djnz
                byte  (.loop-$) & $7F            'loop address
                byte  bc_return_results    & $FF 'return
```

### Costs and savings

| Item | Cost / Saving |
|---|---|
| New LUT code | ~8 longs |
| `pri_sendb` bytecode | -4 bytes (9 → 5) |
| Bytecode slots | $40 consumed; net -1 free slot |
| Per-byte dispatches in loop | 6 → 2 (~67% reduction) |
| Per-byte clock saving | **~24 clk firm** (4 saved dispatches × 6 clk XBYTE overhead) + **~50–70 clk estimated** from saved routine bodies — total **~80–100 clk estimated** |
| Per-byte total cycle estimate | **~300 clk → ~205 clk (~32% speedup) on the SEND-bytes path — estimate dependent on per-routine-body measurement** |

### Caveats

- The `bc_setup_byte_pa` step in the original sets up `rd`/`wr`/`sz`/`ad` for general byte access. The new kernel skips that setup since it does the read inline; this is fine because the next bytecode (`bc_djnz`) doesn't depend on the rd/wr setup. If any downstream code path were to assume rd/wr are configured for the byte after `bc_call_send`, it would break — review and confirm.
- `bc_var_postinc_push` in the original uses the variable-postinc machinery (which can affect bitfield setup, ALTI, etc.). The PASM kernel sidesteps all that and operates directly on `dbase[1]`. Functionally equivalent for this specific pattern (a long-aligned local treated as a byte pointer), but worth a focused test.

### Priority

**Situational.** Per Chip's feedback, `SEND(bytes...)` is not typically on a user critical path and the current implementation prioritizes minimum bytecode size — the right trade-off given hub-RAM constraints. Pursue this only if (a) a real workload demonstrates SEND-bytes as a bottleneck, or (b) the broader fusion-survey work in §2 elevates this as one of multiple candidates worth a coordinated patch.

---

## Finding 4 — Branch reduction in hot hub routines (corrected timing makes this the *real* relocation alternative)

### The corrected math

Under the corrected timing model, the speedup from relocating a hub routine to cog comes **entirely from its branches** (each branch in hub costs **minimum 13 clocks (+1 if not long-aligned, up to ~20 with hub-window misalignment) vs 4 in cog** — per Silicon Doc v35). **Per-branch saving from elimination or relocation: ~9-16 clocks.** A 50-instruction routine with 4 branches gets ~36-64 clocks faster from relocation; a 50-instruction routine with 12 branches gets ~108-192 clocks faster.

This means: **the more branches a routine has, the more it benefits from being in cog**. Conversely, routines that are mostly straight-line code don't gain much from relocation.

The same observation flips around: **reducing branch count in a hub routine recovers the same speedup as relocating it** — without consuming user-PASM cog space.

### Techniques

P2 silicon offers several ways to eliminate branches without changing cog/hub location:

1. **SKIPF / SKIP patterns.** P2 can predicate whole instruction sequences using a 32-bit skip mask. A typical "if condition, do A else do B" can become a single SKIPF + the union of A and B, with the mask choosing which instructions execute. This is already heavily used in the dispatch chains (§Density observations); could be applied to more places in `callh`, `returnh`, `mfieldh`.
2. **Predicated execution (`if_c`, `if_z`, etc.).** A taken branch over a few instructions can become predicated execution of those instructions inline, no branch. In hub, the "branch not taken" predication path costs 2 clocks/instruction; the would-have-been-taken branch + sequential resumption would have cost minimum 13 (+1 alignment) + 2N clocks. Often cheaper to predicate when N is small.
3. **Loop unrolling for short fixed iterations.** A `djnz` loop of 2–3 iterations can become straight-line code.
4. **Computed targets via `ALTI` / `EXECF`.** Replaces a branch table with sequential indirection (already used heavily for bytecode dispatch; could be applied to internal dispatch within routines).
5. **FIFO alignment of unavoidable branches.** When a branch *must* exist, ensuring the target is at a FIFO-friendly boundary (typically 64-byte block-aligned, but specific timing details deserve a measurement pass) can cut the refill cost. This is a layout-only change with no functional impact.

### Candidates in `callh`/`returnh`/`mfieldh`

A focused review of these routines under the corrected model:

- **`callh`** (line 1541, ~25 longs): contains at least the `jmp #callsubh`, the `jmp #makeptr`, and falls into `calloffh` (no branch). 2–3 branch sites total. Some of these are conditional and could potentially be predicated.
- **`returnh`** (line 1395, ~30 longs): handles return-frame restoration; likely 3–5 branches for the various return-types (return, return-results, abort, etc.). The structure may allow SKIPF unification across the return-types.
- **`mfieldh`** (line 1661, ~15 longs): field-access setup. 2–3 branches for field-type discrimination.

A measurement pass — count branches, estimate FIFO-alignment cost, identify SKIPF/predication opportunities — would produce a concrete branch-reduction proposal for each. Estimated payoff: **30–90 clocks per call+return pair** (3-6 branches × 9-16 clk per branch saved), comparable to relocation, **without touching `$000..$0FF`**.

### Recommendation

Pursue branch-reduction inside hub before considering relocation. The savings per call/return are similar; the cost (cog space) is zero. This is the right "hot-path optimization" answer once you correctly model hub-exec timing.

---

## Finding 5 — Bytecode dispatch slot `$40` is free

Line 931:

```pasm
bc_unused       long  0  | %0 << 10    '40   <unused>
```

One slot in the primary dispatch table is reserved as a no-op placeholder. **No memory savings** (the slot already exists), but **free design space for one new bytecode** without expanding any table or breaking existing layouts.

Under the v2 ranking, this slot is the natural home for the first fusion bytecode produced by the §2 survey work. Track in the bytecode allocation inventory.

---

## Finding 6 — Author's own TODOs

Two are explicit in the file and worth surfacing.

### Line 1 — stack-size telemetry

```text
'TESTT add registers stack_start (on launch) and stack_max
'(on call or return) to track stack size for allocation need
```

Add two cog registers that record initial stack pointer and high-water mark. User code could read these to size `stackaddr[]` allocations correctly. Cost: 2 cog longs of state + a handful of update instructions in `callhot` and the launch path. **Small, useful diagnostic** — no architectural conflict, easy to ship independently. Promoted in the v2 ranking because it has no tradeoff and provides real user-facing value.

### Lines 2483-2489 — float ops not yet implemented

```text
' Things to add:
'   FROUND / FTRUNC
'   #>. / <#.
'   SIN / ASIN
'   COS / ACOS
'   TAN / ATAN
```

These would consume bytecode slots (some adjacent to existing `bc_qsin/bc_qcos`). FP trig has CORDIC support already used by `qsin_/qcos_`; the missing set is mostly inverse trig. Cost is per-function, in hub. Mostly orthogonal to the optimization work above.

---

## Finding 7 — Selective hot-routine relocation (downgraded from original Finding 1)

If — after the §4 branch-reduction work — there is still a measured case for relocation, and the user-PASM coexistence feature is being deliberately scoped down, then relocation of the most branch-dense routines is *possible*. The realistic numbers under the corrected model (round 2, with hub-branch cost 13-20 clk):

### Realistic per-call savings

| Routine | Branches | Cog-space cost | Per-call/return saving |
|---------|----------|---------------|----------------------|
| `callh` | ~3 | ~25 longs | **~27–48 clocks** |
| `returnh` | ~4 | ~30 longs | **~36–64 clocks** |
| `mfieldh` | ~3 | ~15 longs | **~27–48 clocks** (only on field-using methods) |
| **Combined** | **~10** | **~70 longs (27% of `$000..$0FF`)** | **~90–160 clocks per call+return** |

Per-branch savings: 9-16 clk (cog branch is 4 clk; hub branch is min 13, +1 alignment, up to 20).

Compared to a typical method call+return cost of 200–400 clocks (depending on parameter count and locals), this is **22–40% on call/return overhead**, or **~8–15% on overall program runtime for call-heavy programs**.

### The cost side

Consuming 70 longs of `$000..$0FF` leaves 186 longs (~73%) for user PASM. That may be acceptable for many use cases — the video-driver-on-interrupts example would still fit in 186 longs comfortably — but it contracts the architectural surface, and the design intent has been "all of `$000..$11F` is yours."

### When to do this

Only when **all four** are true:
1. The §4 branch-reduction work has been done first and yielded its share.
2. The §2 fusion work is in flight, capturing the dispatch-overhead wins that don't require this trade.
3. There is a measured case (real workload, profiled) showing call/return overhead is the residual bottleneck.
4. There is an explicit, communicated decision to scope `$000..$0FF` user-PASM coexistence down to `$000..$BF` (or wherever the cut lands).

Without all four, **don't do this**. The headline original analysis assumed away the cost; the corrected analysis surfaces it as the determining factor.

---

## Finding 8 — Source-level dead code (no binary impact)

Five `{ ... }` block-commented duplicate declarations exist purely as documentation — they re-show certain LUT-resident routines at the point in the source where the corresponding hub fall-through is described:

| Lines | Duplicates |
| --- | --- |
| 1336-1339 | `lookd` (LOOKUP/LOOKDOWN done) |
| 1355-1361 | `cased` (CASE done) |
| 1492-1502 | `callobj/callsub/callptr/callrecv/callsend` chain |
| 1583-1589 | `callgo` |
| 1629-1635 | `casefi/casefd` |

Total: **~50 lines of source**, **0 bytes of binary**. They aid readability while reading the hub section but slightly duplicate the LUT section. Pure cosmetic — leave them or remove them, no impact.

---

## Finding 9 — Things that *look* like wins but aren't

These are tempting at first read; documented so future readers don't re-walk the same paths.

### Cog stubs to hub (`return_`, `abort_`, `field_`, `fieldi_`, `tasknext_`)

Each is a 1-long `JMP #xxxh`. Could they be eliminated? **No** — XBYTE's EXECF can only branch to a 10-bit cog/LUT address, so any hub routine reached from a dispatch entry needs a cog/LUT trampoline. The five stubs are the minimum trampoline cost for five distinct hub destinations.

(Note: under §7 selective relocation, *if* `returnh`/`callh`/etc. relocate into cog `$000..$0FF`, the corresponding trampolines become unnecessary — small additional bonus on top of the per-call savings. Conditional on §7 actually happening.)

### Merging `unpackf2`'s 4-MOV register copy

`unpackf2` does:

```pasm
mov nb,na
mov sb,sa
mov xb,xa
mov mb,ma
```

to duplicate 4 cog registers. A `setq #4-1; altd; rep` chain is the same length. No win.

### Folding the `stall + nop` patterns after CORDIC

The pattern

```pasm
rep @.stall,#1
qmul ...
getqx ...
.stall
nop
```

appears ~12 times in the FP code. The `nop` after `.stall` is for "accommodate any pending interrupt" (Chip's comment), so the hardware stack and CORDIC operands are atomic against interrupts. These are correctness, not bloat — leave them.

### Sharing hub routines across related bytecodes

Already done — line 75-76 in the dispatch table both point to `@getregs_`, and the routine differentiates via `cmp pa,#bc_getregs` (line 2086). Same trick used for ROTXY/POLXY/XYPOL, QSIN/QCOS, GETMS/GETSEC, WAITUS/WAITMS, LOG2/LOG10/LOG, EXP2/EXP10/EXP, ROUND/TRUNC, BYTEFILL/MOVE/SWAP/COMP (and word/long variants), and others. The pattern is exhaustively applied.

### "`pri_sendb` is a hand-rolled bytecode method — could it be inlined?"

It's already 9 bytes of bytecode (lines 50-59) defining the variadic `SEND(bytes...)` body. Replacing it with a hub routine would cost more cog/LUT longs *and* break the pattern of "all methods are bytecode methods." The §2/§3 fusion approach is the right path here — keep the bytecode-method shape, shrink the inner loop's dispatch count.

---

## Finding 10 — Density observations (informational)

Concrete examples of how dense the existing code is:

- **`hub_ap` setup chain (22 longs)** handles 21 distinct setup operations (a..u) by routing through a shared body of code with per-operation SKIPF masks. The annotation columns to the right of each instruction document which operations include that line.
- **`mod_iso` chain (29 longs)** handles 13 distinct variable pre/post modifier ops (++var, var++, ?var, var\new, etc.).
- **`muu_mod`/`mul_mod` chain (27 longs)** handles 8 distinct math ops including the 64-bit SCAS adjust.
- **`branch` chain (11 longs)** handles all 5 branch bytecodes (jmp/jz/jnz/tjz/djnz).
- **CORDIC pipelining via `rep #99,#1`** stalls interrupts cleanly without disabling them globally — a P2-specific idiom used consistently.

Cog/LUT footprint:

- 208 longs in cog (`$120..$1EF`)
- 105 longs in LUT before dispatch table (`$210..$278`)
- 90 longs in LUT after dispatch table (`$3A6..$3FF`)
- ≈ 403 longs total in fast memory

For a full Spin2/PASM2 VM that's a remarkably tight footprint.

---

## Recommendations (revised priority order — round 4 / 5)

In order of expected value under the corrected timing model and Chip's round-4 ranking:

1. **Move LOOKUP/LOOKDOWN to hub (§2.5 Strategy D).** Frees ~4-5 dispatch slots at low per-use cost on the affected (low-frequency) control constructs. **Enabling step for F-2.**
2. **Ship F-2 (bitfield setup + read/write fusion).** Per Chip: highest-leverage fusion. Saves ~6 clk dispatch + 1 byte per bitfield read/write across every program. Allocate 32 slots from Strategy D's freed slots plus selective Strategy A compression of one small group.
3. **Verify F-1 (pop-then-branch fusion) practicality** (rfvar ordering, branch encoding — Chip flagged this question) and ship if practical. Adds ~180 clk savings/program on call/return-heavy code. Allocate 3 slots from remaining freed budget.
4. **Add stack-tracking telemetry (line 1 TODO).** Cheap, useful, no architectural conflict. Ship in parallel with steps 1-3.
5. **Branch-reduction pass on `callh`/`returnh`/`mfieldh` (§4).** SKIPF/predication/FIFO-alignment review of the call/return hot path. Captures most of the would-have-been-relocation speedup without consuming user-PASM cog space.
6. **Eliminate the `callsubh` NOP (Finding B).** Saves 1 long of cog space and **2 clk per same-object call** (NOP is 2 clk, fixed — verified per p2kb `p2kbPasm2Nop`). Free.
7. **Reclaim hub `$00..$3F` for user programs (Finding C).** 64 bytes back to user space if launch sequence is restructured.
8. **Pass 2 corpus survey (§2.3)** to refine F-3 (hub-bytecode + memory-op) and identify any further fusion candidates.
9. **Document the `$000..$11F` user-PASM-coexistence feature and the new `ORGH..END` inline form** in silicon docs and p2kb. Architectural transparency — protects the feature from future "this looks unused" misreadings.
10. **Defer §7 selective relocation** unless steps 1–5 leave residual call/return overhead as the measured top issue and the user-PASM cog region is being deliberately scoped down.
11. **The FP additions** at lines 2483-2489 are an additive feature pass — orthogonal to the optimization work.
12. **Source-level cosmetic cleanup** (Finding 8 block-commented duplicates) — purely optional.

---

## Additional opportunities (unchanged or lightly revised)

### B. Eliminate the `callsubh` NOP

Line 1541:

```pasm
callh   nop                     'instruction after branch cannot be skipped
```

The NOP exists because the SKIPF pattern in the dispatch entry can't suppress the first instruction after the JMP that landed here. With a redesigned dispatch flow (e.g., re-ordering instructions so the unskippable position holds something useful, or routing `callsub` through a dedicated entry), the NOP can be reclaimed. **Saves 1 long, 2 clk per same-object call** (NOP is 2 clk fixed; verified per p2kb `p2kbPasm2Nop`). Call/return is hot, so this matters. Independent of any cog-relocation decision.

### C. Reclaim hub `$00..$3F` for user programs

The launch bootloader sits at hub `$00..$3F` (16 longs). After cog 0 launches with `coginit #hubexec, ##launch_spin` (line 32), those 16 longs are zeroed (line 22-23) and unused. The user's `pbase` starts at `@test_pbase + 8` (line 35). If the launch sequence is restructured so the bootloader lives elsewhere (e.g., loaded from the end of the binary, or invoked via a different entry path), those 64 bytes of hub `$00..$3F` become available for the user's program. Modest but real, and free from architectural tradeoffs.

### D. Streamline `callsendh` / `callrecvh` paths

Each of `callsendh`, `callrecvh`, `callsendbh` has its own preamble before reaching `callhot`. They could be unified via SKIPF patterns the way `bytefill_/wordfill_/longfill_` are. Probably saves 5–8 longs, no functional change. Pairs naturally with §4 branch-reduction work.

### E. Reconsider `taskptr` size

`taskptr res $20` reserves 32 cog longs for software-task pointers. If the documented limit dropped from 32 tasks to 16, `$110..$11F` opens up — 16 more cog longs **for user PASM**. Unlike the original framing, this is a *user-PASM gain*, not interpreter relocation space. **This is a feature change, not an optimization** — surface only if 32 tasks is empirically excessive.

### F. Streamer LUT reservation `$200..$20F`

Line 489: `leave $20x open for 16 streamer imm->LUT->DAC/pin values`. Sixteen LUT longs reserved for user streamer use. Removing the reservation frees 16 LUT longs but breaks the streamer use case. **Feature decision, not optimization** — confirm whether real users exercise this.

### G. Bytecode encoding compression

The current 256-entry primary table compresses `Ax..Fx` to 6 entries (uses XBYTE compressed mode). The remaining `$00..$9F` slots could potentially be reorganized for more compression by pulling rarely-used bytecodes into a single "extended" prefix slot, freeing primary table entries. Only worthwhile if you need the slots; right now there's no scarcity. The §2 fusion work may eventually create slot pressure that motivates this.

### H. Reduce launch zero-fill

`launch_spin` clears registers `$000..$1F7` (504 longs) before loading code at `$120..$1EF`. The `$120..$1EF` range gets overwritten anyway by the `rdlong reg_code, #@reg_code` that follows. Could clear only what stays zero (`$000..$11F` and possibly the buff/state region). Saves a hub round trip at startup only — measurable in cog launch time but immaterial after launch. Minor.

---

## Summary

The interpreter has **one large class of optimization** (bytecode pattern fusion to reduce XBYTE dispatch count and binary size, §2) and **one secondary lever** (branch reduction in hot hub routines, §4) that together capture most of what's available without architectural tradeoff. Both target real hot paths — dispatch overhead and call/return — and both work without consuming the user-PASM cog space.

The original analysis's headline "relocate to `$000..$0FF`" claim was approximately right about *which routines* matter (call/return is hot) but **wrong about both the magnitude of the speedup and the cost of the move**. Round 1 corrected the magnitude downward (multiplying per-instruction × instruction count was wrong; only branches benefit). Round 2 corrected the per-branch number upward (hub branches cost min 13, not 9) — net result is that relocation savings are ~50% larger than round-1 said, putting them at ~8-15% on call-heavy programs rather than ~5-10%. Round 4 clarified that the cost side is more substantial than v3 stated: the foreclosed user-PASM region is 288 longs of cog code space, not 16. **That makes relocation a real-magnitude optimization with a real architectural cost.** Whether to take it is a deliberate decision, not a presumed default. The §4 branch-reduction approach captures most of the same upside without consuming user-PASM space and is therefore the recommended first attempt.

**Round 4 also reframed the fusion ranking and slot-budget strategy** based on Chip's review:

- **F-2 (bitfield setup + read/write fusion) is the top fusion candidate**, not F-1. Saves ~6 clk dispatch + 1 byte of bytecode per bitfield read/write — sizable impact on hardware-interfacing programs that use bitfields heavily.
- **Strategy D (move LOOKUP/LOOKDOWN to hub)** is Chip's preferred path for freeing the slot budget needed to ship F-2. Trades a per-use cost on a low-frequency control construct for slots that benefit a high-frequency operation.
- F-1 (pop-then-branch fusion) drops to second place — still a strong, cheap, structurally ubiquitous candidate.

The three concrete things that can ship independently with no architectural conflict:

1. **Stack-tracking telemetry** (Finding 6, line 1 TODO).
2. **`callsubh` NOP elimination** (Finding B) — saves 2 clk per same-object call.
3. **Documenting the `$000..$11F` user-PASM coexistence feature and the new `ORGH..END` inline form** in silicon docs and p2kb.

Plus the **headline coordinated change**: ship Strategy D + F-2 together, then F-1 once practicality is verified. Pass 2 corpus survey (§2.3) refines further candidates after these baseline wins are in place.
