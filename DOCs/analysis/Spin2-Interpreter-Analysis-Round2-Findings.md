# Spin2 Interpreter Analysis — Round 2 Findings (post-P2KB update)

**For:** Chip Gracey's review
**Date:** 2026-04-29
**Subject document:** `DOCs/analysis/Spin2-Interpreter-Analysis.md` (v2, last revised 2026-04-29 first-round)
**Trigger:** P2KB was updated with corrected hub-execution timings; this document captures what changes in the interpreter analysis as a result.

---

## Purpose

After Round 1's correction (which removed the "hub-exec is much slower per-instruction" misconception), Chip updated p2kb with explicit, Silicon-Doc-cited timing numbers across the board. I re-queried the corrected entries and walked the analysis document section-by-section against the new numbers.

This document is a **review-ready summary** of:
- What in the analysis was already correct (and stays).
- What needs numerical correction (with old → new values).
- New facts worth adding.
- Whether any qualitative conclusion changes.
- The proposed edits to the analysis document, listed concretely.

The intent is that Chip can verify the corrections are accurate before they land in the analysis itself.

---

## Source of corrected numbers

Three p2kb entries were re-queried against the refreshed index (index_version 3.4.0, 2026-04-29):

1. **`p2kbPasm2CogHubExecution`** — comprehensive cog-vs-hub execution model. Now distinguishes sequential streaming (2 clk/instruction in both modes) from branch refill (minimum 13 clk in hub, 4 clk in cog). Includes the FIFO depth (19 stages on an 8-cog P2 = (cogs+11)) and the forbidden-in-hubexec instruction list.

2. **`p2kbPasm2Hubexec`** — HUBEXEC constant. Notes section now states sequential code matches cogexec speed; branches cost minimum 13 clocks; FIFO/streamer instructions are forbidden.

3. **`p2kbSpin2InlinePasm`** — Inline PASM. Now correctly states inline PASM runs as cog-exec (not hub-exec), and documents the 16-long size limit (params + result + locals + code).

4. **`p2kbArchXbyteEngine`** — XBYTE engine. Confirms 6-clock dispatch overhead (Silicon Doc verbatim) and provides the software-dispatch baseline (9 clk per bytecode) and minimum XBYTE loop (8 clk).

All four entries cross-cite Silicon Doc v35 verbatim where applicable.

---

## What the analysis already had right

These claims in the v2 analysis are confirmed by the corrected p2kb and need no change:

| Claim | Source confirmed |
|-------|------------------|
| Sequential cog-exec instructions: 2 clk each | p2kbPasm2CogHubExecution |
| Sequential hub-exec instructions: 2 clk each (FIFO streaming) | p2kbPasm2CogHubExecution |
| Cog branches: 4 clk | p2kbPasm2CogHubExecution |
| RDLONG: 9-24 clk; WRLONG: 3-12 clk | Both modes; egg-beater dependent |
| XBYTE dispatch overhead: ~6 clk per bytecode | p2kbArchXbyteEngine (Silicon Doc verbatim) |
| Cog `$000..$11F` reserved for user-PASM coexistence | Round 1 fix (Chip's input); standalone p2kb entry still recommended |
| `bc_send_byte_step` PASM kernel and savings | Independent of branch-timing correction |
| Pass 1 fusion candidate list (F-1 through F-5) | Independent of branch-timing correction |
| Opcode-space accounting (§2.5) | Independent of branch-timing correction |

---

## What needs numerical correction

### Correction 1 — Hub branch cost

| What v2 says | What p2kb (corrected) says |
|--------------|----------------------------|
| Hub branch: "9–15 clocks (FIFO-dependent)" | **Minimum 13 clocks** (Silicon Doc verbatim), **+1 if target not long-aligned**, up to ~20 with hub-window misalignment |

Silicon Doc v35 verbatim quote (HUB EXECUTION section):

> *"Branching to a hub address takes a minimum of 13 clock cycles. If the instruction being branched to is not long-aligned, one additional clock cycle is required."*

Per-instruction YAMLs (jmp.yaml, call.yaml, ret.yaml) cite the range **13...20**.

The 9-clk floor I used in the v2 analysis was wrong. The real floor is 13.

### Correction 2 — Per-branch saving from relocation or branch-elimination

| Quantity | v2 says | Corrected |
|----------|---------|-----------|
| Hub-branch cost minus cog-branch cost | ~5-11 clk per branch | **~9-16 clk per branch** |

This propagates into every per-routine and per-call estimate in the analysis.

### Correction 3 — Worked example in the timing-model section

Current v2 text:

> Cog: 50 × 2 = 100 clocks plus 4 × 4 = 16 clocks of branch = ~116 clocks
> Hub: 46 × 2 (sequential) + 4 × 12 (branch refill, mid-range estimate) = 92 + 48 = ~140 clocks
> Difference: ~24 clocks for the whole routine

Corrected:

> Cog: 50 × 2 = 100 clocks plus 4 × 4 = 16 clocks of branch = **~116 clocks** (unchanged)
> Hub: 46 × 2 (sequential) + 4 × 14 (branch refill, ~minimum + alignment) = 92 + 56 = **~148 clocks**
> Worst case (all branches non-long-aligned, hub-window misaligned): 4 × 20 = 80 → **~172 clocks**
> Difference: **~32-56 clocks for the whole routine**, all concentrated at branch points.

### Correction 4 — Finding 4 (branch reduction) intro

Current v2 text:

> "each branch in hub costs ~9–15 clocks vs ~4 in cog"

Corrected:

> "each branch in hub costs **minimum 13 clocks (+1 if not long-aligned, up to ~20 with hub-window misalignment) vs 4 in cog**. **Per-branch saving from elimination: ~9-16 clocks.**"

### Correction 5 — Finding 7 (selective relocation) numeric table

| Routine | v2 says | Corrected |
|---------|---------|-----------|
| callh (~3 branches) | 20-30 clk per call | **27-48 clk per call** |
| returnh (~4 branches) | 25-40 clk per return | **36-64 clk per return** |
| mfieldh (~3 branches) | 20-30 clk (only on field-using methods) | **27-48 clk** |
| Combined (~10 branches) | 60-100 clk per call+return | **90-160 clk per call+return** |
| Overall program impact, call-heavy | ~5-10% | **~8-15%** |

### Correction 6 — Qualitative framing

The corrected numbers make the relocation case **~50% stronger** than v2 claimed. The qualitative conclusion ("user-PASM-coexistence is more valuable than this savings") still holds, but the framing in §1 ("In practice this almost always means don't relocate") is too dismissive given 90-160 clk/call+return savings.

Recommended new framing:

> *"The savings from relocation are non-trivial — 8-15% on call-heavy programs. This is no longer 'noise.' Whether it justifies consuming the user-PASM coexistence region is a deliberate-decision question, not a presumed 'don't.' If the user-PASM region is being deliberately scoped down for documentation purposes, relocation captures real value. If the region is being preserved as the architectural feature it is, the §4 branch-reduction approach captures most of the same upside without the trade-off."*

This is more honest than v2's "almost always don't."

---

## New facts to add

These weren't in v2 because they weren't in p2kb at the time. They're worth weaving into the analysis now.

### N1 — FIFO depth

> *Per-cog instruction-prefetch FIFO has (cogs+11) = 19 stages on an 8-cog P2 (Silicon Doc v35 verbatim).*

Belongs in the §"Corrected timing model" section, as the silicon-level explanation for *why* sequential hubexec hits 2 clk/instruction.

### N2 — Hubexec forbidden-instruction list

The following instructions **cannot be used in hubexec** (they don't run slowly — they don't run at all, because the FIFO is dedicated to instruction prefetch in hubexec mode):

- RDFAST, WRFAST, FBLOCK
- RFBYTE, RFWORD, RFLONG, RFVAR, RFVARS
- WFBYTE, WFWORD, WFLONG
- XINIT, XZERO, XCONT (when streamer engages FIFO)
- REP (cogexec/lutexec only)
- ALTI as instruction-stream modifier

Source: Silicon Doc v35 HUB EXECUTION section verbatim.

**Why it matters for the analysis:** the interpreter currently uses RFVAR, RFBYTE, RFLONG, REP heavily — and runs in cogexec, so all are available. Stating this list explicitly prevents future "could we move part of this to hubexec?" misreadings, and confirms that any future fusion kernels in cog/LUT can freely use these instructions, but a hypothetical hubexec kernel could not.

### N3 — Inline PASM size limit

Inline PASM in a Spin2 method (`ORG ... END` inside a PUB/PRI body) is loaded into cog RAM at runtime by the interpreter. It runs as **cog-exec** (not hub-exec). The total inline area is **16 longs**, shared by parameters + result + locals + code.

Source: p2kb p2kbSpin2InlinePasm.

**Why it matters for the analysis:** the §1 user-PASM-coexistence framing is strengthened. The 16-long inline-PASM limit means most user PASM in `$000..$11F` will be larger structures (interrupt handlers, peripheral drivers, the video-driver-on-interrupts pattern Chip cited) — i.e., the use case is genuinely about substantial code in that region, not the small-block inline use case.

### N4 — XBYTE software-dispatch baseline

XBYTE dispatch hardware: **6 clk** overhead per bytecode (Silicon Doc verbatim).
Software-dispatched bytecode interpreter: **9 clk** overhead per bytecode (Silicon Doc verbatim: *"takes only 2+3+4, or 9, clocks to get the next bytecode, look it up, then execute that bytecode's routine"*).
Improvement: 3-7× faster dispatch.

**Why it matters for the analysis:** confirms the §2 fusion-savings math ("~6 clk saved per fused dispatch"). XBYTE is already saving ~3 clk/bytecode versus a naive interpreter, which is why the *additional* savings from fusion is "6 clk per dispatch eliminated" rather than larger.

### N5 — Minimum XBYTE loop

A single-instruction bytecode routine (one 2-clock instruction with `_ret_` prefix) gives a minimum XBYTE loop of **8 clk**. Source: p2kb p2kbArchXbyteEngine, Silicon Doc verbatim.

**Why it matters for the analysis:** sets the lower bound on per-bytecode cost. A maximally-fused bytecode (single PASM op + return) costs 8 clk; current bytecodes range from this floor up to multi-instruction routines.

---

## Qualitative impact summary

The headline ranking does not change:

1. Bytecode pattern fusion remains the highest-leverage class.
2. Branch reduction in hub remains the next lever.
3. Selective relocation remains gated on the user-PASM-coexistence cost decision.

What does change:

- **The gap between (1)+(2) and (3) narrows.** Relocation is now ~8-15% on call-heavy programs (was ~5-10% in v2). It moved from "noise-floor" to "real but conditional."
- **The §Summary framing should soften** — relocation is no longer "almost always don't," it's "deliberate decision worth making explicit."
- The §1 user-PASM-coexistence framing **stays as the primary conclusion**, but the cost side of the trade-off is bigger than v2 said, so the trade-off deserves treatment as a trade-off rather than a presumed answer.

---

## Proposed edits to the analysis document

When you've reviewed and signed off on the numerical corrections in this document, the following targeted edits will land in `Spin2-Interpreter-Analysis.md`:

1. **Revision header** — add a "Revised 2026-04-29 (round 2)" line to the existing revision notice, citing this review document.
2. **§Corrected timing model** — update the table row for hub branches (13-20 clk), update the worked example numbers (148-172 clk hub vs 116 clk cog), add the FIFO depth fact (N1).
3. **§Finding 4** — update the "9–15 clocks vs 4" → "13-20 vs 4" with per-branch saving 9-16 clk; update "20-60 clk per call+return pair" → "30-90 clk".
4. **§Finding 7** — update the per-routine table (callh, returnh, mfieldh, combined) with corrected ranges; update overall program-impact estimate from 5-10% to 8-15%; soften the gating language.
5. **§Finding 1 / Recommendation** — soften "In practice this almost always means don't relocate" to "this is a deliberate decision the trade-off deserves," referencing the corrected magnitude.
6. **§2 (Bytecode pattern fusion) intro** — add the XBYTE software-dispatch baseline (N4) and minimum loop (N5) as one-line explanatory notes.
7. **§Architecture recap or new sub-section** — add the hubexec forbidden-instruction list (N2). Most natural home is a footnote near where the analysis describes interpreter cog-exec.
8. **§1 / §Architecture recap** — note inline-PASM 16-long limit (N3) where the user-PASM coexistence is described.
9. **§Summary** — adjust the closing framing to reflect the slightly stronger relocation case while preserving the ranking.

---

## Questions for Chip

Before applying the edits, a few clarifications would help land them correctly:

1. **Branch-cost typical case.** Silicon Doc says minimum 13, +1 if not long-aligned, up to ~20 with hub-window misalignment. For the analysis estimates, is "~14 clk" (13 minimum + typical alignment penalty) a fair "common case" figure, or should the analysis cite the 13-20 range without picking a midpoint? I leaned toward "~14 mid-estimate, 20 worst-case" but happy to adjust.

2. **Relocation framing.** With the corrected savings at 8-15% on call-heavy programs, do you have a view on whether the trade against user-PASM coexistence is worth it for the Spin interpreter cog specifically? My current analysis preserves the trade-off as a deliberate decision; if you have a strong opinion either way, I'll align the analysis to it rather than leaving it open.

3. **Inline-PASM 16-long limit.** I've described it as "params + result + locals + code share 16 longs." Is that accurate, or is it "code-only after locals are spilled, with locals separately budgeted"? The p2kb entry implied the former; flagging in case the framing is off.

4. **Per-bytecode body times.** The `bc_send_byte_step` per-byte savings estimate (300 → 205 clk) depends on per-routine body times for `bc_setup_local_0_15`, `bc_var_postinc_push`, `bc_setup_byte_pa`, `bc_read`, `bc_call_send`. The XBYTE 6-clk dispatch overhead is verified (Silicon Doc), but the routine bodies' execution times are estimated. Can you confirm whether direct hardware measurement is needed to firm these up, or whether your estimates of the routine bodies are well-calibrated?

---

## Round 2.5 — Full timing-claim audit (added 2026-04-29)

After the initial round-2 findings landed, the analysis document was audited line-by-line for **every** timing claim. Some claims that depended on instruction timings I had not yet re-verified against the refreshed p2kb were found to need correction. This section captures the audit results.

### Audit method

Every numerical timing claim in `Spin2-Interpreter-Analysis.md` was extracted (via grep for clock / clk / cycle / ~N patterns). Each claim was then traced to either:

(a) an instruction-level p2kb entry (e.g., RDBYTE timing → `p2kbPasm2Rdbyte`),
(b) a structural p2kb entry (e.g., XBYTE dispatch → `p2kbArchXbyteEngine`), or
(c) an estimate that depends on un-measured execution paths (per-routine body times).

### Verified-correct claims (no change needed)

| Claim | p2kb source |
|-------|-------------|
| 2 clk sequential cog/hub ALU ops | p2kbPasm2CogHubExecution |
| 4 clk cog branches | p2kbPasm2CogHubExecution |
| 13-20 clk hub branches (min 13, +1 alignment) | p2kbPasm2CogHubExecution (Silicon Doc verbatim) |
| 6 clk XBYTE dispatch | p2kbArchXbyteEngine (Silicon Doc verbatim) |
| 9 clk software-dispatch baseline | p2kbArchXbyteEngine (Silicon Doc verbatim) |
| 8 clk minimum XBYTE loop | p2kbArchXbyteEngine (Silicon Doc verbatim) |
| 19-stage FIFO ((cogs+11)) | p2kbPasm2CogHubExecution (Silicon Doc verbatim) |
| 2 clk RFVAR (FIFO read) | p2kbPasm2Rfvar |
| REP zero-overhead per iteration after setup | p2kbPasm2RepInstruction |
| 9-24 clk RDLONG | p2kbPasm2CogHubExecution / cogVsHub |
| 9-16 clk RDBYTE (cogexec) | p2kbPasm2Rdbyte |
| 3-12 clk WRLONG (broad range) | p2kbPasm2CogHubExecution / cogVsHub |

### Corrections made (Round 2.5)

#### Correction A — NOP cost in callsubh elimination

**Found wrong:** Both line 622 (Recommendations §) and line 641 (Finding B detail §) claimed `callsubh` NOP elimination saves "~1 clk per same-object call."

**Verified per p2kb `p2kbPasm2Nop`:** *NOP simply consumes two clock cycles; no other operation is performed. Two clock cycles are consumed.* Timing is fixed at 2 clk.

**Fix applied:** Both occurrences updated to "**2 clk per same-object call** (NOP is 2 clk fixed; verified per p2kb `p2kbPasm2Nop`)."

This **doubles** the savings figure for Finding B. Net qualitative impact: still small per-call, but worth being honest about magnitude.

#### Correction B — Outdated revision-notice value

**Found wrong:** Round-1 revision notice (line 17) still cited "9–15 clock penalty" for hub branches — which was itself the old, incorrect value being retracted in round 1, but remained in the text after round 2 corrected the floor to 13.

**Fix applied:** Updated to cite the correct round-2 values: "minimum 13 clocks, +1 if target not long-aligned, up to ~20 with hub-window misalignment (Silicon Doc v35 verbatim)."

#### Correction C — Outdated TL;DR call+return saving range

**Found wrong:** TL;DR Finding 6 (line 37) said "real savings are 30–80 clocks per call+return pair (a few percent on a typical Spin2 program)." This was a stale value from before round 2's corrections.

**Fix applied:** Updated to "**90–160 clocks per call+return pair (~8–15% on call-heavy programs)**," matching the Finding 7 numeric table.

#### Correction D — Predicated-execution comparison

**Found wrong:** §Finding 4 line 434 said the would-have-been-taken-branch cost was "~12 + 2N clocks." The "~12" used the old hub-branch estimate.

**Fix applied:** Updated to "minimum 13 (+1 alignment) + 2N clocks."

#### Correction E — bc_send_byte_step savings caveat

**Found:** §Finding 3 quoted firm savings of "300 → 205 clk (~32% speedup)" without indicating that the 300/205 numbers depend on per-routine body times for `bc_setup_local_0_15`, `bc_var_postinc_push`, `bc_setup_byte_pa`, `bc_read`, and `bc_call_send` — which are not directly verified in p2kb.

**Fix applied:** Added explicit caveat: the XBYTE 6-clk dispatch overhead is verified, the routine body times are estimates. The per-byte savings table now distinguishes the **firm ~24 clk** from XBYTE dispatch elimination from the **~50-70 clk estimated** from saved routine bodies. Hardware measurement would firm these up.

### Unverified estimates (intentionally retained as estimates)

Two load-bearing figures in the analysis cannot be verified against p2kb because they describe end-to-end interpreter behavior that no single p2kb entry covers:

1. **"Method call+return cost: 200–400 clocks"** (§Finding 7 line 512). Used to derive the 8-15% overall-program-runtime impact. This is a back-of-envelope estimate; firming it up would require either profiling on hardware or detailed PASM cycle counting through `callh`/`callsubh`/`callgo`/`callhot`/`returnh`.

2. **"~30 occurrences of pop-then-branch per typical 1,000–5,000 LOC program"** (§F-1 candidate). Used to estimate F-1's program-level savings. Pass 2 corpus survey would replace this estimate with measured frequencies.

Both are flagged as estimates in the analysis. Their imprecision affects the ranking only slightly — even at the low ends of both ranges, the qualitative conclusions (fusion is highest-leverage; F-1 is the strongest fusion candidate; relocation is now real-magnitude but conditional) hold.

### Summary of audit impact

Five corrections applied. None changes the qualitative conclusions of the analysis. The most consequential is **Correction A** (NOP is 2 clk, not 1) — this doubles the headline number for Finding B (callsubh NOP elimination), but Finding B is a tier-3 housekeeping item, so the ranking is unaffected.

The audit confirms that **all major timing claims supporting the analysis's conclusions are now grounded in p2kb-verified Silicon Doc values**. Remaining estimates are clearly marked as such.

---

*End of round-2 findings document.*

---

## Round 3 — XBYTE-compression-cost correction (Chip's feedback 2026-05-01)

### What Chip caught

After reading the §2.5 opcode-space accounting in `Spin2-Interpreter-Analysis.md`, Chip pointed out:

> *"The really big ones that would free up lots of entries in the x-bite table would then have to pull data from Hub memory to get the proper skip patterns. Claude didn't seem to understand that this would slow things down and that all those skip patterns would have to come from somewhere. The first thing it suggested would cause a speed up and code savings, I'm talking about quit and next, but I need to see if it's practical to do in the interpreter."*

He's right. The original framing of §2.5 Strategy A understated the cost.

### What §2.5 missed

Verified against the refreshed `p2kbArchXbyteEngine` entry:

> *"Each LUT entry contains: [31:23] = Base routine address (9 bits), [22:0] = SKIPF pattern (23 bits) or extended address."*

Today, each unary-write opcode (`$90..$9A` etc.) has its own LUT entry with **its own distinct 23-bit SKIPF pattern**:

```
bc_lognot_write  long  una_iso  | %00011111111011110010 << 10  '90
bc_bitnot_write  long  una_iso  | %00011111110111110010 << 10  '91
bc_neg_write     long  una_iso  | %00011111101111110010 << 10  '92
...
```

The patterns differ by approximately one bit each — they encode "which subset of the shared `una_iso` chain to execute for this specific operation." The dispatch read brings the routine address AND the per-operation skip pattern in a single 2-clock RDLUT.

**My §2.5 Strategy A** proposed collapsing the 22 unary-write opcodes ($90..$9A iso + $B7..$C1 push) into one 32-way XBYTE-compressed family. A compressed family has **one LUT entry covering all 32 variants**, carrying **one SKIPF pattern**. The 22 distinct per-operation patterns the routine would need have to come from somewhere:

1. **Hub lookup.** ~9-24 clk per dispatch. Net slowdown.
2. **Second LUT lookup.** ~3 clk RDLUT + address computation. Slight slowdown. Also consumes ~22 LUT longs for the per-operation pattern table — partially offsetting the slot savings.
3. **Computed skip pattern.** If the patterns are regular (the existing patterns appear to be a single-bit rotation, which suggests yes), the routine can derive the pattern from `pa` (the bytecode value) via shift/rotate ops. ~2-4 extra clk per dispatch. Best case, but requires verifying *all* 22 patterns fit a single formula.

In every realistic scenario, **dispatch into the compressed family pays additional overhead**. The slot reclamation has a runtime cost. The original "compress more for free" framing was wrong.

### Why F-1 (pop-then-branch fusion) is exempt from this concern

Chip explicitly singled out F-1 as a real win: code savings AND speedup. F-1 doesn't have the compression problem because:

- F-1 allocates new **dedicated** bytecodes (`bc_pop_jmp_rfvar`, `bc_pop_jnz_rfvar`, `bc_pop_djnz_rfvar`), not a compressed family.
- Each new bytecode gets its own LUT dispatch entry with its own SKIPF pattern.
- No second-level pattern lookup needed; structurally identical to the existing `bc_call_sub`, `bc_jmp`, etc.
- The PASM kernel reads the rfvar pop-count and rfvar branch-offset from the bytecode stream in the same order the existing `bc_pop_rfvar + bc_jmp_rfvar` does — just within one dispatch instead of two.

Chip flagged that F-1's practicality "needs to see if it's practical to do in the interpreter." Likely concerns:
- **Rfvar-ordering.** Current `bc_pop_rfvar` reads its rfvar count, then `bc_jmp_rfvar` reads its rfvar offset. The fused kernel must read both in the right order from the FIFO.
- **Stack manipulation.** The `popa` semantics for N values may need care if N is variable and large.
- **Branch encoding compatibility.** The existing `bc_jmp` rfvar offset is signed 32-bit (RFVARS); the fused version must preserve that.

None of these are blockers, but they're real implementation questions worth verifying before committing.

### What changed in `Spin2-Interpreter-Analysis.md`

Three edits to §2.5:

1. **Strategy A header** got a correction box explaining that the 22 distinct skip patterns can't all come from a single compressed-family LUT entry. The "no per-call cost" claim was retracted.

2. **"Most attractive single move"** paragraph rewritten. The simple framing was replaced with a three-option breakdown (computed pattern / second-table lookup / hub lookup), each with explicit per-dispatch cost.

3. **"Bottom line on opcode space"** rewritten. The original "no fundamental scarcity, just compress more" claim was retracted. The revised order of operations is:
   - (1) Verify F-1 is practical to implement (Chip's next step).
   - (2) Ship F-1 via Strategy B extended-prefix or LOOKUP/LOOKDOWN compression (the four-way LOOKUP/LOOKDOWN group has only 4 patterns, small enough that pattern computation is straightforward — frees 3 slots cheaply).
   - (3) Pass 2 corpus survey to determine if F-2/F-3 are frequent enough to justify the compression cost on the unary writes.

### Net qualitative impact

- **F-1 is still the strongest fusion candidate** — Chip confirmed it.
- **F-2 and F-3 are now harder to justify** — they require slot budgets that push us into compressing the unary-writes group, which has the per-dispatch cost concern. Defer until Pass 2 demonstrates frequency justifies the trade.
- **The "no fundamental scarcity" claim is gone.** Real scarcity exists; the slot budget is tighter than v2.5 said.
- **The recommended sequencing is now: verify F-1 practicality → ship F-1 → measure → only then consider further compression.**

### Outstanding questions for Chip

1. **F-1 implementation practicality.** Are there interpreter quirks that would prevent merging `bc_pop_rfvar + bc_jmp_rfvar` into a single dispatch (rfvar ordering, branch encoding, stack-pop bounds)?
2. **Computed skip patterns.** If we did pursue collapsing the unary writes someday, is the single-bit-rotation pattern across the 22 ops actually computable via a clean formula on the bytecode index? Or are there exceptions in the pattern that would need a small lookup table?
3. **Where does F-1 land?** Strategy B prefix at `$40`, or compress the four-way LOOKUP/LOOKDOWN to free 3 dedicated slots? My read is the latter is cleaner (no per-dispatch prefix tax), but you'd know better whether the LOOKUP/LOOKDOWN four patterns are amenable to computation.

---

*End of round-3 correction.*
