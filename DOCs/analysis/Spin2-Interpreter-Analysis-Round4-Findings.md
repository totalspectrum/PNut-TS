# Spin2 Interpreter Analysis — Round 4 Findings (Chip's review)

**For:** Chip Gracey's review record
**Date:** 2026-05-01
**Subject document:** `DOCs/analysis/Spin2-Interpreter-Analysis.md`
**Trigger:** Chip's read of the round-2/3 revised analysis document.

---

## Part 1 — Feedback verbatim

Chip's commentary, transcribed exactly as delivered:

> *"I'm looking at the latest Spin2 Interpreter Analysis."*
>
> *"'Also REP and ALTI as instruction-stream modifier. Source: Silicon Doc v35 HUB EXECUTION section verbatim.'*
>
> *"REP is allowed in hubexec and so is ALTI or any other ALTx instruction.*
>
> *"In hubexec, REP is realized with branches which take a lot of time.*
>
> *"In hubexec, SKIP and SKIPF both work, but SKIPF will revert to SKIP behavior, where it replaces instructions in the pipeline with NOPs."*
>
> *"'$100..$11F is the multitasking taskptr table, building downward from $11F. Programs that use fewer than 32 software tasks leave the unused upper portion of this range available for user code as well.'*
>
> *"Should read 'unused lower portion,' not 'upper'. Not sure why Claude knows it builds downward but then says the upper part is available."*
>
> *"'Inline PASM (ORG ... END inside a Spin2 method) is loaded into cog RAM at runtime by the interpreter. It runs as cog-exec (not hub-exec). The total inline area is 16 longs, shared by parameters + result + locals + code (per p2kb p2kbSpin2InlinePasm).'*
>
> *"The total inline area is $000..$11F, assuming no multitasking. The first 16 params + results + locals are loaded from hub into the buff block at $1E0..$1EF, and then restored after the inline code exits.*
>
> *"Note: There is also now an ORGH..END inline option where no code is loaded, but executed directly from hub. Also, the first 16 params + results + locals are buffered and restored like in ORG..END. I just updated that part of the documentation to cover ORGH."*
>
> *"I think the biggest win on bytecodes would come from combining bitfield setups with reads and writes. That would have sizable impact on applications that use bitfields. Most bitfield operations are read and write, so for each one of those, we'd save a byte. The problem is that we don't have the room to do this in the cog registers. I have thought, for a long time, that LOOKUP/LOOKDOWN could go into hub. That would definitely get the space we'd need."*

---

## Part 2 — Decomposition into discrete points

| # | Point | Type |
|---|-------|------|
| **F1** | REP **is** allowed in hubexec (just slow — realized via branches). The analysis says it isn't allowed. | Factual correction |
| **F2** | ALTI (and all ALTx instructions) **are** allowed in hubexec. The analysis says ALTI as instruction-stream modifier is forbidden. | Factual correction |
| **F3** | SKIP and SKIPF both work in hubexec — with the caveat that SKIPF reverts to SKIP behavior (replaces instructions in the pipeline with NOPs rather than skipping fetch). The analysis doesn't address this nuance. | Factual addition |
| **F4** | Cog `$100..$11F` taskptr table builds downward from `$11F`. Therefore the **lower** portion is what's freed when fewer tasks are used, not the upper. Analysis text said "upper" — wrong. | Factual correction (text bug) |
| **F5** | Inline PASM area is **NOT** 16 longs. It is `$000..$11F` (288 longs) assuming no multitasking. The 16 longs (`$1E0..$1EF`, the `buff` block) is where the first 16 params/results/locals are buffered and restored — not the code area. | Factual correction (significant) |
| **F6** | New language feature: **ORGH..END inline option** where the inline PASM is **not loaded into cog** but **executes directly from hub**. First 16 params/results/locals are still buffered to `buff` and restored. Recently added; documentation updated. | New factual content |
| **F7** | Chip's view on the highest-leverage fusion: **combining bitfield setups with reads and writes** (i.e., F-2 in our analysis). Sizable impact because most bitfield operations are read-and-write, saving a byte per occurrence. | Strategic guidance |
| **F8** | The slot-budget problem for F-2: not enough room in cog registers. **Chip's longstanding idea: move LOOKUP/LOOKDOWN to hub.** That would free the slots needed for bitfield-fusion. | Strategic proposal |

---

## Part 3 — Analysis of each point

### F1, F2, F3: Hubexec instruction availability

**What the analysis currently says** (§"Corrected timing model" hubexec_forbidden_instructions and §1 inline note):

> *"Also REP and ALTI as instruction-stream modifier. Source: Silicon Doc v35 HUB EXECUTION section verbatim."*

**What's actually true** (per Chip):
- **REP works in hubexec** — but is realized via branches, so each iteration pays the FIFO refill cost (~13-20 clk per loop boundary). Functionally available, just much slower than cog-mode REP (where it's zero-overhead).
- **ALTI (and other ALTx) work in hubexec** — these are not forbidden.
- **SKIP/SKIPF both work in hubexec** — SKIPF specifically degrades to SKIP semantics (replacing instructions in the pipeline with NOPs rather than skipping fetch from FIFO).

**Implication for the analysis:**
The "forbidden in hubexec" list in §"Corrected timing model" was wrong about REP and ALTI. The actual forbidden list is the FIFO/streamer instructions only (RDFAST, WRFAST, FBLOCK, RFx, WFx, XINIT, XZERO, XCONT). REP/ALTI/SKIPF need to be reframed as "available but with degraded semantics in hubexec" — which is a meaningful difference from "forbidden."

**Source-quality concern (for the p2kb update list):**
This means the p2kb entry I cited (`p2kbPasm2CogHubExecution`'s `cannot_be_used` list) **also has the same error**. When Chip last updated p2kb, the FIFO-instruction-forbidden list got included; the entries about REP/ALTI as also-unavailable should be re-examined. Per Chip's verbatim note, those instructions ARE available, just with branch-based / SKIP-based realizations.

This is the second time we've found p2kb entries that need correction after the round-2 refresh. Worth a discrete pass to scrub the `also_unavailable_in_hubexec` list with Chip's correct framing.

### F4: Taskptr text bug ("upper" should be "lower")

**Where it appears in the analysis** (§Architecture recap, table for `taskptr`):

> *"`$100..$11F` is the multitasking taskptr table, building downward from `$11F`. Programs that use fewer than 32 software tasks leave the unused upper portion of this range available for user code as well."*

**The bug:** if the table builds *downward* from `$11F` (high address), the unused entries are at the *low* addresses, not high. So the freed range is `$100..(some address below $11F)` — the **lower** portion, not the upper.

Pure text error on my part. Chip is right to call it out — the words contradict the directionality I just stated.

**Implication for the analysis:**
Trivial fix. Replace "upper" with "lower" in the taskptr description. Same fix needs to land in §1's user-PASM-coexistence subsection where the same wording appears.

### F5: Inline PASM area is 288 longs, not 16

**What the analysis currently says** (§1 "Inline PASM and the user-PASM region"):

> *"Inline PASM (ORG ... END inside a Spin2 method) is loaded into cog RAM at runtime by the interpreter. It runs as cog-exec (not hub-exec). The total inline area is 16 longs, shared by parameters + result + locals + code (per p2kb p2kbSpin2InlinePasm)."*

**What's actually true** (per Chip):
- The total inline code area is **`$000..$11F`** — i.e., 288 longs assuming no multitasking. This is the same region documented as the user-PASM coexistence area.
- The 16 longs at **`$1E0..$1EF` (the `buff` block)** is where the first 16 params/results/locals are **buffered** during inline execution — and **restored** after the inline code exits. The 16-long figure is about *parameter buffering*, not the code area.

This is a significant correction. The analysis treated "16 longs total" as the inline-PASM size limit; in reality, inline PASM has the *full 288-long region* available, with the 16-long buff just holding the first 16 locals during the inline execution.

**Implication for the analysis:**
This actually **strengthens** the §1 argument. The user-PASM coexistence region is genuinely large — 288 longs of code space — not constrained to the small 16-long figure I had cited. Chip's video-driver-on-interrupts use case fits much more comfortably than my framing suggested. The cost of consuming `$000..$0FF` for interpreter relocation (Finding 7) is therefore *more substantial* than v3 stated, because the foreclosed region is genuinely useful at full code-region scale.

The 16-long buff block is a separate piece of context worth mentioning: it's the parameter-spill area, not a code-size limit. p2kb description likely needs the same clarification.

### F6: New ORGH..END inline option

**What the analysis currently says:**
Nothing. This is new language content not in the previous review.

**What's actually true** (per Chip):
There is now an `ORGH..END` inline option where:
- The inline PASM is **not loaded into cog** but **executes directly from hub**.
- The first 16 params/results/locals are still buffered to `buff` (`$1E0..$1EF`) and restored after exit, same as `ORG..END`.
- Documentation has been updated to cover ORGH.

**Implication for the analysis:**
For interpreter optimization, this matters because:
1. ORGH..END inline runs as **hubexec** — subject to the corrected hubexec timing model (sequential fast, branches expensive).
2. ORGH..END inline does **not** consume cog code space at runtime — so it doesn't compete with the user-PASM coexistence region at all. Programs using ORGH..END inline have no "inline-vs-coexistence-region" tension.
3. This affects the user-PASM-coexistence framing: users who want to do larger PASM work but not load it can use ORGH..END and bypass the cog-region consumption entirely. The 288-long ORG..END region matters most when PASM needs deterministic cog-exec timing or REP/ALTI-as-modifier.

The analysis should note ORGH..END exists and clarify which user use-cases each form fits.

### F7: Chip's view on highest-leverage fusion — bitfield setups + reads/writes

**What the analysis currently says** (§2.2 Pass 1 fusion candidates):

> *"#### Candidate F-2: Setup-bitfield-local + read/write fusion — second-strongest"*
> *"...Strong but slot-hungry. Worth doing only if §2.5 frees enough slots to absorb 32-way fusion."*

**What Chip says:**
F-2 is the **biggest win on bytecodes**, not the second-strongest. Most bitfield operations are read-and-write; fusing setup with read or write saves a byte per occurrence, which adds up substantially in applications that use bitfields heavily (which most P2 hardware-control code does).

**Implication for the analysis:**
This is a priority correction. Chip is closer to the actual P2 application landscape than my static analysis (which ranked F-1 first on the basis of "every loop has these"). His read is that:
- F-2 occurs **per bitfield op**, and most bitfield ops are reads/writes.
- Hardware-interfacing code uses bitfields constantly.
- The byte-savings per occurrence (not just speed) matter for binary size.

The trade-off cited as "F-2 is slot-hungry" remains real — but Chip has a specific solution for the slot problem (F8 below). With that solution, F-2 moves from "second-strongest, deferred" to **highest-priority fusion candidate**.

The analysis ranking should flip: F-2 first, F-1 second.

### F8: Move LOOKUP/LOOKDOWN to hub to free slots for F-2

**What the analysis currently says** (§2.5 Strategy A and the round-3 correction):

The round-3 correction noted that compressing the unary-writes group has runtime cost (per-dispatch overhead from skip-pattern retrieval). The analysis suggested possibly compressing the LOOKUP/LOOKDOWN four-way group as a small / cheap source of slot savings, but didn't otherwise address the slot crunch.

**What Chip says:**
He has thought "for a long time" that **LOOKUP/LOOKDOWN should be moved to hub**. This would free the slots needed for F-2 bitfield fusion.

**Implication for the analysis:**

This is a substantive, Chip-validated proposal that I should treat as a first-class optimization candidate. Looking at the dispatch table:
- `bc_lookup_value`, `bc_lookdown_value`, `bc_lookup_range`, `bc_lookdown_range`, `bc_look_done` — 5 slots in the cog/LUT dispatch table (`$1F`..`$23`).
- These are not high-frequency in typical Spin2 programs (LOOKUP/LOOKDOWN are control-flow constructs used selectively, not in inner loops).
- Moving the implementation to hub means each LOOKUP/LOOKDOWN bytecode pays one extra dispatch for the hub-routine call (~6 clk XBYTE + branch refill), but the slots become available for higher-frequency bytecodes like the fused bitfield ops.

This is exactly the trade Strategy B (extended-prefix) would offer at ~6 clk per use. For LOOKUP/LOOKDOWN — control-flow constructs that aren't inner-loop — the per-use cost is paid rarely while the freed slots benefit every bitfield operation in the program.

**Net evaluation:** F8 is a clean, Chip-validated path to making F-2 practical. The analysis should:
1. Promote F-2 to top fusion candidate (per F7).
2. Add F8 (LOOKUP/LOOKDOWN to hub) as the slot-freeing mechanism that enables F-2.
3. Re-rank the overall optimization roadmap accordingly.

---

## Part 4 — What this means for the document

### 4.1 Edits required to `Spin2-Interpreter-Analysis.md`

| Location | Required change |
|----------|----------------|
| §"Corrected timing model" hubexec_forbidden list | Remove REP and ALTI from the forbidden list. Add a separate note: "REP works in hubexec (realized via branches, so each loop boundary pays ~13-20 clk FIFO refill — much slower than cog-mode zero-overhead REP). ALTI and other ALTx instructions also work in hubexec. SKIP and SKIPF both work; SKIPF degrades to SKIP semantics (replaces pipeline instructions with NOPs)." |
| §"Architecture recap" taskptr table description | Change "upper portion" → "lower portion" |
| §1 "Inline PASM and the user-PASM region" | Rewrite. The 16-long figure is the buff block (`$1E0..$1EF`), used for buffering+restoring the first 16 params/results/locals during inline execution — NOT the code area. The actual inline code area is `$000..$11F` (288 longs assuming no multitasking). Add note about ORGH..END inline (executes directly from hub, doesn't consume cog code space). |
| §1 "Recommendation" | Reframe slightly: the user-PASM region is more substantial than v3 suggested (288 longs available for code, not 16). Cost of consuming `$000..$0FF` for relocation is therefore more significant. |
| §2.2 Pass 1 candidate ranking | **Flip F-1 and F-2:** F-2 (bitfield setup + read/write fusion) is now the strongest candidate per Chip's read of real-program byte-savings. F-1 (pop-then-branch) is second. |
| §2.5 Opcode-space accounting | Add new "Strategy D: Move LOOKUP/LOOKDOWN to hub" section. This is Chip's validated proposal. Describes the slot savings (5 slots from `$1F..$23`), the per-use cost (~6 clk extra dispatch via hub call), and why it's a good trade (LOOKUP/LOOKDOWN are non-inner-loop control constructs). |
| §2.5 Bottom-line on opcode space | Update to reflect that **F-2 + LOOKUP/LOOKDOWN-to-hub is the recommended sequencing** rather than "F-1 first via Strategy B prefix." |
| §Recommendations (overall priority order) | Re-rank: F-2 implementation (with LOOKUP/LOOKDOWN-to-hub as enabling step) becomes highest-priority fusion. F-1 second. |
| §Summary | Update closing framing to reflect F-2 promotion and Chip's hub-LOOKUP/LOOKDOWN proposal. |

### 4.2 Documents to update

- **`Spin2-Interpreter-Analysis.md`** — apply edits per §4.1.
- **`Spin2-Interpreter-Analysis-Chip-Feedback.md`** (the original round-1 feedback doc, which captured the broader Chip-review pattern) — no update needed; round-2/3/4 corrections are documented in their own findings docs.
- **`Spin2-Interpreter-Analysis-Round2-Findings.md`** — add a "see also Round 4" pointer at end if convenient, but not strictly required.

### 4.3 Things p2kb could improve

This round of feedback surfaced two p2kb information-quality issues worth flagging for the next round of p2kb updates:

#### P2KB Issue Q1 — REP and ALTI in hubexec

**Current p2kb text (per `p2kbPasm2CogHubExecution.also_unavailable_in_hubexec`):**

> *"REP — fast loop instruction (cogexec/lutexec only)"*
> *"ALTI used as instruction-stream modifier (a following instruction is fetched from a fixed location, which the FIFO does not support)"*

**Chip's correction:**
- REP **works** in hubexec, just realized via branches (each iteration ~13-20 clk).
- ALTI (and all ALTx) **work** in hubexec.

**Suggested p2kb update:** move REP and ALTI out of the "forbidden in hubexec" list into a "performance-degraded in hubexec" list. The Silicon Doc verbatim "forbidden" list should be only the FIFO/streamer instructions (RDFAST/WRFAST/FBLOCK/RFx/WFx/XINIT/XZERO/XCONT). REP and ALTI are *available with degraded performance*, which is a fundamentally different property.

This is the second time we've audited a p2kb entry and found it had the wrong framing. Both errors share a pattern: conflating "forbidden" with "available but slow."

#### P2KB Issue Q2 — SKIP/SKIPF in hubexec

**Current p2kb text:**
SKIP and SKIPF behavior in hubexec is not addressed in any entry I've queried.

**Chip's correction:**
SKIP and SKIPF both **work** in hubexec, but **SKIPF degrades to SKIP semantics** (replaces instructions in the pipeline with NOPs rather than skipping fetch from FIFO).

**Suggested p2kb update:** add SKIP/SKIPF behavior in hubexec to either `p2kbPasm2CogHubExecution` or a dedicated SKIP/SKIPF entry. The "SKIPF reverts to SKIP behavior in hubexec" is a non-obvious silicon detail that affects performance reasoning.

#### P2KB Issue Q3 — Inline PASM size constraints

**Current p2kb text (per `p2kbSpin2InlinePasm.execution_model.size_limit`):**

> *"total_longs: 16"*
> *"breakdown: 'params + result + locals + code, all sharing the 16-long inline area'"*

**Chip's correction:**
- The inline code area is **`$000..$11F`** (288 longs assuming no multitasking).
- The 16 longs is the **`buff` block at `$1E0..$1EF`** — buffering area for the first 16 params/results/locals during inline execution.
- Code does not share space with params/locals; they're in separate cog regions.

**Suggested p2kb update:** rewrite the size_limit section. Code area is up to 288 longs (`$000..$11F`); params/results/locals are buffered into a 16-long region (`$1E0..$1EF`) during inline execution and restored after.

#### P2KB Issue Q4 — ORGH..END inline form

**Current p2kb text:**
Per Chip, p2kb has been updated to cover ORGH..END inline. Worth confirming the update landed and that the `p2kbSpin2InlinePasm` entry now describes both ORG..END (cog-loaded) and ORGH..END (hub-resident) variants.

**Suggested p2kb verification:** confirm `p2kbSpin2InlinePasm` covers both forms with their respective execution models.

---

## Part 5 — Outstanding questions for Chip

Before applying the document edits, a few clarifications would help:

1. **REP in hubexec — exact cost.** REP is "realized with branches" — does this mean each loop iteration pays one branch cost (13-20 clk) at the loop end? Or is there additional cost? Confirming the per-iteration overhead helps calibrate any analysis of REP-in-hubexec patterns.

2. **SKIP vs SKIPF degradation.** "SKIPF reverts to SKIP behavior" — does this mean any hubexec-resident code using SKIPF effectively just gets SKIP semantics with NOP-fill, with no warning? And what's the cost difference (SKIP fills with NOPs vs SKIPF skips fetch entirely; in cogexec this matters; in hubexec the FIFO masks some of the difference)?

3. **F-2 bitfield fusion practicality.** With LOOKUP/LOOKDOWN moved to hub, the slots become available. But the F-2 fusion still needs PASM kernels for bitfield-setup-and-read and bitfield-setup-and-write. The kernels look straightforward, but is there an interpreter quirk that would prevent merging the two dispatches into one (similar to the F-1 rfvar-ordering question from round 3)?

4. **LOOKUP/LOOKDOWN-to-hub — implementation skeleton.** Today these are 5 dispatch slots with PASM bodies in cog/LUT. Moving to hub means: one stub bytecode (or maybe a `bc_hub_lookup` family) that calls into a hub-resident routine. Per-use cost is one extra dispatch (~6 clk) plus the hub branch (13-20 clk). Want to confirm this is the architecture you have in mind.

5. **Order of ship.** Given F-2 promoted and F-8 (LOOKUP/LOOKDOWN-to-hub) is the enabler — should the implementation order be: (a) move LOOKUP/LOOKDOWN to hub first as a slot-freeing prep, then (b) ship F-2 bitfield fusion? Or do them together as one coordinated change?

---

*End of round-4 findings.*
