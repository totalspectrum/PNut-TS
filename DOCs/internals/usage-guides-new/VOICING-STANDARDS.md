# Usage Guide Voicing Standards

Read this before writing any usage guide. Keep it open as reference.

## Core Principles

**Grounded in evidence.** Every claim traces to compiler source or test files. If you can't find evidence, investigate—don't guess. No hand-waving, no hallucination.

**Compiler's perspective.** These guides represent how the compiler actually works, not how someone hopes or assumes it works.

**Deeply trustworthy.** Readers must be able to trust this content completely. Acknowledge uncertainty rather than fake confidence.

## Technical Standards

- **No bytecodes or compiler internals.** These change between versions.
- **Source your findings.** Research in spinResolver.ts, types.ts, parseUtils.ts, and TEST/ folder.
- **Complete examples.** No `...` or fragments. Code should be compilable or clearly marked as snippet.
- **Include anti-patterns.** Show what NOT to do and explain WHY it fails.

## Voice & Tone

- **Neutral technical voice.** Not marketing ("powerful!"), not casual ("kinda"), not condescending.
- **Assume competent reader.** Don't explain basic programming. Focus on Spin2/PASM2 specifics.
- **Consistent terminology.** Same terms for same concepts across all guides.

## Pedagogy

- **Concrete before abstract.** Show working example FIRST, then explain the principle.
- **Progressive complexity.** Simple case → variations → advanced usage → edge cases.
- **Meaningful examples.** Solve real problems (blink LED, read sensor), not foo/bar abstractions.
- **Show error paths.** What happens when it fails? Readers learn from mistakes.
- **Anticipate confusion.** Address common misconceptions explicitly. Contrast similar concepts.
- **Explain why.** Understanding prevents future errors.

## Structure (Each Guide)

1. **Overview** - What this feature does, when to use it
2. **Basic Usage** - Simplest working examples
3. **Syntax/Forms** - All variations with examples
4. **Patterns** - Common idioms and best practices
5. **Anti-patterns** - What not to do and why
6. **Summary Table** - Quick reference for return visitors
7. **Related Documentation** - Links to related guides

## Checklist Before Finishing

- [ ] Every claim is grounded in compiler source or test evidence
- [ ] Examples are complete and realistic
- [ ] Anti-patterns included with explanations
- [ ] Progressive complexity (simple → advanced)
- [ ] Summary table for quick reference
- [ ] No bytecode values or compiler internals exposed
