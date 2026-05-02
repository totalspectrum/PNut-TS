# Spin2 Interpreter Analysis — Round 5 Findings (application of Round 4 corrections)

**For:** Chip Gracey's review record
**Date:** 2026-05-01
**Subject document:** `DOCs/analysis/Spin2-Interpreter-Analysis.md`
**Trigger:** Application of Round 4 review feedback (captured in `Spin2-Interpreter-Analysis-Round4-Findings.md`).
**Note on p2kb:** Chip indicated p2kb updates are in flight to address the four information-quality issues identified in Round 4 (Q1 REP/ALTI in hubexec, Q2 SKIP/SKIPF in hubexec, Q3 inline PASM size, Q4 ORGH..END coverage). This Round 5 application incorporates the *correct* facts as Chip stated them, rather than waiting for the p2kb refresh.

---

## Purpose

Round 4 captured Chip's substantive feedback on the interpreter analysis (`Spin2-Interpreter-Analysis-Round4-Findings.md`). This Round 5 document records what changed in `Spin2-Interpreter-Analysis.md` as a result, so Chip has a clean before/after audit trail without having to re-read the entire analysis document.

For the underlying corrections themselves (what was wrong, why, and how Chip described them), see Round 4. This document is the **application summary** — what landed where in the analysis as a result of Round 4.

---

## Part 1 — Edits applied to `Spin2-Interpreter-Analysis.md`

Each edit is identified by (a) Round 4 finding number it addresses, (b) section of the analysis touched, (c) summary of the change.

### Edit 1 — Hubexec instruction availability (addresses F1, F2, F3)

**Section:** §"Corrected timing model" — hubexec_forbidden_instructions

**Before:**
> *"Hubexec forbidden instructions ... Also REP and ALTI as instruction-stream modifier. Source: Silicon Doc v35 HUB EXECUTION section verbatim."*

**After:**
> *"Hubexec forbidden instructions (these don't run slowly — they cannot be used at all in hubexec, because the FIFO is dedicated to instruction prefetch): RDFAST, WRFAST, FBLOCK, RFBYTE, RFWORD, RFLONG, RFVAR, RFVARS, WFBYTE, WFWORD, WFLONG, XINIT, XZERO, XCONT (when streamer engages FIFO). Source: Silicon Doc v35 HUB EXECUTION section verbatim.*
>
> *"Hubexec available-but-degraded instructions (per Chip's round-4 correction; p2kb update in flight):*
> - *REP — available in hubexec, realized via branches. Each loop iteration pays the FIFO refill cost (~13-20 clk per loop boundary) — much slower than zero-overhead REP in cogexec/lutexec, but functionally usable.*
> - *ALTI / ALTR / ALTD / ALTS / ALTB / ALTGN / ALTGW / ALTGB / ALTSN / ALTSW / ALTSB — available in hubexec.*
> - *SKIP — works in hubexec.*
> - *SKIPF — works in hubexec, but degrades to SKIP semantics (replaces instructions in the pipeline with NOPs rather than skipping fetch from the FIFO).*"

**Why this matters:** the analysis had carried forward an earlier p2kb error that conflated "forbidden" with "available but slow." The corrected text distinguishes these clearly. This affects any future reasoning about moving interpreter routines to hubexec — REP/ALTI/SKIPF would still work, just with degraded performance, rather than being unusable.

### Edit 2 — Taskptr text bug (addresses F4)

**Section:** §1 (user-PASM-coexistence subsection — the bullet describing `$100..$11F`)

**Before:**
> *"Programs that use fewer than 32 software tasks leave the unused upper portion of this range available for user code as well."*

**After:**
> *"Because the table fills from the top, programs that use fewer than 32 software tasks leave the unused lower portion of this range (entries near `$100`) available for user code as well."*

**Why this matters:** pure text bug — the table builds *downward* from `$11F`, so the freed region is at the **low** addresses, not the high. Chip flagged this as self-contradicting (the same bullet correctly noted the downward direction but then said "upper" was free). Fixed.

### Edit 3 — Inline PASM section rewrite (addresses F5, F6)

**Section:** §1 — "Inline PASM and the user-PASM region"

**Before (incorrect):**
> *"Inline PASM (ORG ... END inside a Spin2 method) is loaded into cog RAM at runtime by the interpreter. It runs as cog-exec (not hub-exec). The total inline area is 16 longs, shared by parameters + result + locals + code (per p2kb p2kbSpin2InlinePasm)."*

**After (correct):**
> *"Inline PASM in a Spin2 method comes in two forms:*
>
> *1. ORG ... END — PASM is loaded into cog RAM at runtime by the interpreter and runs as cog-exec (deterministic 2 clk/instruction; REP, ALTI, etc. fully available at full speed). The available code area is `$000..$11F` (288 longs assuming no multitasking) — the same range that hosts user-PASM coexistence code (interrupt handlers, peripheral drivers, etc.).*
>
> *2. ORGH ... END (recently added) — PASM is not loaded into cog, but executes directly from hub as hub-exec. Sequential code runs at 2 clk/instruction (FIFO-streamed) but branches pay 13-20 clk FIFO refill. ORGH..END inline is the right form when the PASM block is too large to fit alongside everything else in `$000..$11F`, or when the program does not need cog-exec timing determinism.*
>
> *In both forms, the first 16 method parameters/result/locals are buffered to the `buff` block at `$1E0..$1EF` (16 longs) on entry to the inline section, and restored after the inline code exits. The `buff` block is a fixed parameter-spill region — not the inline code area. Earlier versions of this analysis incorrectly conflated `buff`'s 16 longs with the code area; the code area is the full 288-long `$000..$11F` for ORG..END (or zero cog footprint for ORGH..END).*
>
> *This means the user-PASM coexistence region (`$000..$11F`) is genuinely substantial — 288 longs of code space. ..."*

**Why this matters:** this was the most significant factual correction in Round 4. The analysis had treated 16 longs as the inline code limit; the actual limit is 288 longs (for ORG..END), with the 16-long `buff` region being a separate parameter-spill area. The cost framing of "consuming the user-PASM region" is now honestly large — there are 288 longs at stake, not 16. Also added the new ORGH..END form per F6.

### Edit 4 — §1 Recommendation strengthened (downstream of F5)

**Section:** §1 — "Recommendation"

**Change:** added a paragraph noting that the foreclosed-region cost is now better understood (288 longs of cog code space, not 16). The cost side of the relocation trade-off is therefore more substantial than round-3 stated. Also referenced the new ORGH..END inline form as an escape valve for programs that need more PASM than fits.

**Why this matters:** the §1 recommendation framing now matches the corrected facts. The "deliberate-decision" framing from round 3 stays, but the cost side now reflects 288-long stakes, not 16.

### Edit 5 — Pass 1 fusion candidate ranking flipped (addresses F7)

**Section:** §2.2 — "Pass 1 fusion-candidate survey"

**Change:** F-1 and F-2 swapped in priority order. Added a leading "Round 4 ranking update" block explaining Chip's reasoning:

> *"Round 4 ranking update: Per Chip's review (2026-05-01), F-2 (bitfield setup + read/write fusion) is now the strongest candidate, not the second-strongest. His reasoning: most bitfield operations are read-and-write, the byte-savings per occurrence matter for binary size on hub-RAM-constrained programs, and applications that interface with P2 hardware use bitfields constantly. F-1 (pop-then-branch) drops to second place — still a strong, clean candidate, just behind F-2 in real-program impact. The slot cost of F-2 (32 slots) is addressable via §2.5 Strategy D (move LOOKUP/LOOKDOWN to hub) — Chip's longstanding proposal for freeing the needed space."*

The F-2 candidate description was also updated to:
- Note "Per Chip: 'biggest win on bytecodes'" with byte-saving emphasis.
- Annotate that fusion saves bytecode in addition to dispatch overhead (1 byte per bitfield read/write).
- Reference Strategy D as the slot-freeing mechanism.

The F-1 description was updated to note its drop to second place and why (real-program byte-count savings of F-2 are larger on hardware-interfacing code).

**Why this matters:** Chip's read of the actual P2 application landscape outranks my static-analysis "every loop has these" ranking. The corrected priority order puts the real-world-highest-leverage fusion first.

### Edit 6 — Strategy D added to §2.5 (addresses F8)

**Section:** §2.5 — "Bytecode opcode-space accounting and how to make room"

**Change:** new subsection added between Strategy C and the Bottom-Line:

> *"#### Strategy D — Move LOOKUP/LOOKDOWN to hub (Chip's longstanding proposal)*
>
> *Per Chip's round-4 review (2026-05-01), this is his preferred path for freeing the slot budget needed to ship F-2 ..."*

Includes:
- Identification of the 5 freed slots (`$1F..$23`: bc_lookup_value, bc_lookdown_value, bc_lookup_range, bc_lookdown_range, bc_look_done).
- Per-use cost analysis: ~6 clk extra dispatch + 13-20 clk hub branch ≈ 19-26 clk per LOOKUP/LOOKDOWN use.
- Comparison table positioning Strategy D against Strategies A, B, C — showing why D wins for the F-2 use case (low per-use cost on rarely-used control constructs vs. high payoff on freed slots used by high-frequency new bytecodes).
- Implementation sketch (hub-resident routines + dispatch stubs).

**Why this matters:** Chip has been thinking about this trade for a long time and now has a concrete use case (F-2). The strategy is documented as a first-class option in the analysis with explicit cost/benefit accounting.

### Edit 7 — §2.5 Bottom-line revised (downstream of F7, F8)

**Section:** §2.5 — "Bottom line on opcode space"

**Before:** order of operations was "verify F-1 → ship F-1 via Strategy B prefix or LOOKUP/LOOKDOWN compression → Pass 2 for F-2/F-3."

**After:** order of operations is now:

1. **Move LOOKUP/LOOKDOWN to hub (Strategy D).** Frees ~4-5 slots.
2. **Ship F-2 (bitfield setup + read/write fusion).** Allocate from Strategy D's freed budget plus selective Strategy A compression.
3. **Verify F-1 practicality and ship if practical.** Allocate 3 slots from remaining budget.
4. **Pass 2 corpus survey.** Refine F-3 and identify further candidates.

**Why this matters:** the recommended sequencing now matches Chip's view that F-2 is the top win and Strategy D is the right slot-freeing mechanism.

### Edit 8 — §Recommendations re-ranked (downstream of all of F5, F7, F8)

**Section:** §Recommendations (top-level priority order)

**Change:** 12-item priority list reordered to match the §2.5 bottom-line sequencing:

1. Move LOOKUP/LOOKDOWN to hub (Strategy D) — enabling step.
2. Ship F-2 (bitfield setup + read/write fusion) — top fusion win.
3. Verify F-1 practicality, ship if practical.
4. Stack-tracking telemetry (line 1 TODO) — ship in parallel.
5. Branch-reduction pass on `callh`/`returnh`/`mfieldh`.
6. Eliminate `callsubh` NOP — saves 2 clk per same-object call.
7. Reclaim hub `$00..$3F` for user programs.
8. Pass 2 corpus survey.
9. Document `$000..$11F` user-PASM-coexistence feature **and the new ORGH..END inline form** in silicon docs and p2kb.
10. Defer §7 selective relocation.
11. FP additions (additive feature pass).
12. Source-level cosmetic cleanup.

**Why this matters:** the headline-ordered list of "what to do next" now reflects Chip's strategic guidance.

### Edit 9 — §Summary updated (closing framing)

**Section:** §Summary

**Change:** the closing summary now explicitly captures the Round 4 reframing:
- F-2 is the top fusion candidate (not F-1).
- Strategy D is the recommended slot-freeing mechanism.
- F-1 still strong, just second-ranked.
- Headline coordinated change: ship Strategy D + F-2 together, then F-1.
- The 288-long user-PASM region cost framing is reflected in the relocation discussion.

The "three concrete things that can ship independently" list also now includes the ORGH..END inline form mention in the documentation item.

### Edit 10 — Revision header updated

**Section:** document header (lines 1-10)

**Change:** added a new dated revision line for round 4 / round 5 and a reference to this Round 5 findings document.

> *"**Date of revision (round 4 captured / round 5 applied):** 2026-05-01 — REP/ALTI/SKIPF in hubexec, taskptr text bug, inline-PASM size, ORGH..END inline form, F-2 promoted to top fusion candidate, LOOKUP/LOOKDOWN-to-hub strategy added (per Chip's feedback)"*

---

## Part 2 — Outstanding items (carried forward from Round 4)

Five questions for Chip remain open from Round 4 that this Round 5 application did not resolve (because they are implementation-detail or strategy questions that require Chip's input rather than document edits):

1. **REP in hubexec — exact per-iteration cost.** Confirmed available; question of exact branch overhead for calibrating any future analysis of REP-in-hubexec patterns.
2. **SKIP vs SKIPF degradation cost.** Documented qualitatively in the analysis now; precise cost comparison would help any future SKIPF-using-relocated-routines reasoning.
3. **F-2 implementation practicality.** PASM kernels look straightforward; flagging in case there's an interpreter quirk like the F-1 rfvar-ordering question from Round 3.
4. **LOOKUP/LOOKDOWN-to-hub implementation skeleton.** The analysis has a sketch; Chip's preferred architecture (single dispatch stub vs. family) would refine it.
5. **Order of ship for F-2 + Strategy D.** Together as one coordinated change, or separately with Strategy D first as a slot-prep?

These remain open. The analysis text uses language that doesn't lock in a specific answer (e.g., "Chip flagged this as a question" rather than asserting an implementation detail).

---

## Part 3 — P2KB verification results (post-refresh)

After Chip's p2kb updates landed, p2kb was refreshed (index version 3.4.0) and all four Round 4 information-quality issues were re-queried. **All four are confirmed fixed**, plus two bonus facts now appear in p2kb that strengthen the analysis.

| Issue | What it addresses | Status |
|-------|-------------------|--------|
| Q1 | REP/ALTI/SKIPF as available-but-degraded in hubexec, not forbidden | ✅ **Fixed** in `p2kbPasm2CogHubExecution` — REP and all ALTx instructions explicitly moved out of the forbidden list; new `also_works_in_hubexec_but_with_caveat` and `works_in_both_modes_with_caveats` sections cite Silicon Doc verbatim and Chip Gracey clarification 2026-05-02 |
| Q2 | SKIP/SKIPF behavior in hubexec | ✅ **Fixed** in `p2kbPasm2SkipfBranching` — explicit per-clock-cost analysis added: skipped instructions in cog/LUT cost 0 clocks (leap), skipped instructions in hub-exec cost 2 clocks each (NOP cancel). Quotes Silicon Doc v35 verbatim: *"If SKIPF is used in hub exec, it will revert to SKIP behavior, canceling instructions in the pipeline, instead of stepping over them"* |
| Q3 | Inline PASM correct size (288 longs code area, separate 16-long variable buffer) | ✅ **Fixed** in `p2kbSpin2InlinePasm` — `variable_limit.breakdown` now states "16-long limit applies to VARIABLES ONLY — not to the PASM code itself"; `code_buffering.code_size_limit` correctly states the 288-long inline code area at `$000..$11F`; multitasking taskptr table correctly described as building DOWNWARD from `$11F` with the LOWER portion freed when fewer tasks are used |
| Q4 | ORGH..END inline form coverage | ✅ **Fixed** in `p2kbSpin2InlinePasm` — new `orgh_inline` syntax form added, with execution-model description, V50 introduction date, and contrast-with-org_inline explanation |

### Bonus facts from the refreshed p2kb (now folded into the analysis)

The refreshed `p2kbSpin2InlinePasm` entry contains two additional facts that the Round 4 findings did not capture:

1. **Additional inline code area in LUT.** The `code_buffering.code_size_limit` field clarifies that ORG..END inline can use **`$000..$11F` (288 longs) PLUS LUT `$000..$00F` (16 longs)** when no multitasking is in use. The 16-long LUT extension was not in our prior framing.

2. **ORGH..END maximum block size.** The `orgh_inline` execution field states: max block size is **`$FFFF` longs** (auto-RET included). Useful concrete number for the analysis. (The p2kb entry also gave a specific bytecode value/name for ORGH; that citation has been omitted from the analysis since p2kb-supplied bytecode values may change rev to rev — only the v54 interpreter source is the version-pinned authority for `bc_*` symbols.)

Both facts have been folded into the §1 "Inline PASM and the user-PASM region" section of the analysis (Round 5.1 micro-edit).

### Net status: p2kb actions complete

All Round 4 p2kb-update actions are resolved. The interpreter analysis is now aligned with the refreshed p2kb across every claim that touches hubexec timing, instruction availability, inline PASM, and the ORGH..END form. No further p2kb-update work is pending from Round 4.

---

## Part 4 — Net qualitative impact

The analysis document is now more accurate in three significant ways and one moderate way:

**Significant:**

1. The user-PASM coexistence region is correctly characterized as **288 longs** of code space (not 16). This makes the cost side of the relocation trade-off honestly large — and validates Chip's longstanding view that the region is a genuinely substantial architectural feature.

2. F-2 (bitfield fusion) is correctly ranked as the **top fusion candidate**. Chip's read of real-program impact aligns with the binary-size-savings-matter-most premise of hub-RAM-constrained P2 programming.

3. Strategy D (LOOKUP/LOOKDOWN-to-hub) is documented as a first-class slot-freeing approach. This validates and records Chip's longstanding intuition that LOOKUP/LOOKDOWN belong in hub.

**Moderate:**

4. Hubexec instruction availability is now correctly framed: REP/ALTI/SKIPF are available with degraded performance, only the FIFO/streamer instructions are truly forbidden. This affects any future reasoning about hubexec interpreter routines or hubexec inline PASM.

The headline ranking shifts:

- **Was:** F-1 first, F-2 deferred (slot-budget concern).
- **Now:** Strategy D first (slot prep) → F-2 (top fusion) → F-1 (second fusion).

The §1 user-PASM-coexistence framing (do-not-relocate-by-default unless deliberately scoped) stays, but with a stronger cost-side argument (288 longs, not 16).

---

## Part 5 — Documents touched in Round 5

- **`Spin2-Interpreter-Analysis.md`** — 9 substantive edits (header + 8 content edits), enumerated in Part 1 of this document.
- **`Spin2-Interpreter-Analysis-Round5-Findings.md`** — this document (newly created).
- **`Spin2-Interpreter-Analysis-Round4-Findings.md`** — unchanged (recorded Chip's verbatim feedback and proposed edits).

The audit trail is now: Round 1 (Chip's first feedback) → Round 2 (p2kb timing refresh) → Round 3 (XBYTE compression cost correction) → Round 4 (Chip's review of v3 analysis) → **Round 5 (this — Round 4 corrections applied to analysis)**.

---

*End of Round 5 application summary.*
