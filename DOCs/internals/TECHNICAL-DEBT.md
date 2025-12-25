# Technical Debt

This document tracks known technical debt items in the PNut-TS compiler that need to be addressed to maintain compatibility with the original PNut compiler.

---

## Resolved Items

### Symbol Name Length Validation ✅ (v1.51.7)

**Issue**: Missing 30-character symbol name length limit enforcement
**Date Identified**: 2025-01-03
**Date Resolved**: December 2025 (v1.51.7)
**Priority**: High
**Compatibility Impact**: Code that compiles in PNut-TS may fail in original PNut

**Resolution**: Added 30-character limit validation in the elementizer. Symbols exceeding 30 characters now generate an error matching the original PNut behavior.

**Test Coverage**: `TEST/CON-tests/symbol_length_test.spin2`

---

## Open Items

*No open technical debt items at this time.*

---

## Adding New Items

When identifying new technical debt, include:
1. **Issue**: Brief description
2. **Date Identified**: When discovered
3. **Priority**: High/Medium/Low
4. **Compatibility Impact**: How it affects PNut compatibility
5. **Description**: Detailed explanation
6. **Implementation Notes**: Where/how to fix
7. **Resolution Steps**: Checklist for fixing
