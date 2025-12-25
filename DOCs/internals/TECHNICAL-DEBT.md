# Technical Debt

This document tracks known technical debt items in the PNut-TS compiler that need to be addressed to maintain compatibility with the original PNut compiler.

## Symbol Name Length Validation

**Issue**: Missing 30-character symbol name length limit enforcement
**Date Identified**: 2025-01-03
**Priority**: High
**Compatibility Impact**: Code that compiles in PNut-TS may fail in original PNut

### Description
The original PNut compiler enforces a strict 30-character maximum length for all symbol names across all symbol categories (CON, VAR, DAT, PUB, PRI). PNut-TS currently has no such limit in its elementizer implementation.

### Current Behavior
- **PNut**: Fails with "symbol exceeds 30 characters" error for any symbol > 30 chars
- **PNut-TS**: Accepts symbols of any length (regex pattern: `/^([A-Z_a-z]+[A-Z_a-z0-9]*)/`)

### Test Coverage
Test file demonstrating the issue: `/TEST/CON-tests/symbol_length_test.spin2`
- Contains symbols at 28, 29, 30, and 31 character lengths
- 31-character symbols are commented out as they fail in original PNut
- All symbol categories tested and confirmed to have 30-char limit in PNut

### Implementation Notes
The limit check should be added in:
- `/src/classes/spinElementizer.ts` - In the `symbolNameConversion()` method
- Error message should match PNut: "symbol exceeds 30 characters"
- Should apply to all symbol types uniformly

### Resolution Steps
1. Add length validation in elementizer after symbol extraction
2. Generate appropriate error with line number reference
3. Update test suite to verify the limit is enforced
4. Consider making limit configurable for future extensibility