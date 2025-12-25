# PNut-TS Release Process

This document defines the release checklist and quality gates for PNut-TS releases.

---

## Pre-Release Checklist

Complete all items before packaging a release.

### 1. Build and Regression Tests

- [ ] Run `npm run build` - must complete without errors
- [ ] Run `npm test` - all regression tests must pass
- [ ] Run `npm run test-full` - complete test suite must pass

```bash
npm run build && npm test
```

### 2. Code Coverage Verification

Ensure coverage has not regressed from the baseline.

- [ ] Run coverage setup: `npm run cov-setup`
- [ ] Run coverage: `npm run coverage`
- [ ] Verify coverage meets or exceeds baseline:
  - Statements: >= 88%
  - Branches: >= 84%
  - Functions: >= 86%
- [ ] Run coverage teardown: `npm run cov-teardown`

```bash
npm run cov-setup
npm run coverage
# Review coverage report in jest-coverage/lcov-report/index.html
npm run cov-teardown
```

**Coverage Baseline (v1.51.x):**
| Metric | Baseline | Current |
|--------|----------|---------|
| Statements | 88.1% | ____% |
| Branches | 84.06% | ____% |
| Functions | 86.8% | ____% |

### 3. Error Code Audit

All compiler error messages must have unique error codes where duplicates exist.

- [ ] Run error code audit script: `npm run audit-errors`
- [ ] Fix any reported issues:
  - Duplicate messages missing unique codes
  - Same error code used for different messages
- [ ] Re-run audit to verify all issues resolved

```bash
npm run audit-errors
```

**Manual Audit (until script exists):**
```bash
# Find all error codes
grep -oE '\(m[0-9]+\)' src/classes/spinResolver.ts | sort | uniq -c | sort -rn

# Check for duplicated codes (count > 1 indicates problem)
grep -oE '\(m[0-9]+\)' src/classes/*.ts | cut -d: -f2 | sort | uniq -d
```

### 4. Documentation Updates

- [ ] Update `CHANGELOG.md` with all changes since last release
- [ ] Review and update `TECHNICAL-DEBT.md` if items were addressed
- [ ] Ensure any new features have appropriate documentation

### 5. Version Update

- [ ] Update version in `package.json`
- [ ] Verify version follows semantic versioning (MAJOR.MINOR.PATCH)
- [ ] Version should match PNut compatibility (e.g., 1.51.x for PNut v51)

---

## Release Build

After all checklist items pass:

```bash
npm run bld-dist
```

This produces:
- npm package (`.tgz`)
- Platform binaries in `pkgs/` directory

---

## Post-Release

- [ ] Tag the release in git: `git tag v1.XX.Y`
- [ ] Push tag: `git push origin v1.XX.Y`
- [ ] Create GitHub release with changelog notes
- [ ] Publish to npm if applicable

---

## Error Code Convention

Error codes follow the pattern `(mGGI)` where:
- `m` prefix indicates "message"
- `GG` is a 2-digit group ID (01-99) identifying a group of duplicate error messages
- `I` is a 1-digit instance ID (1-9) identifying which occurrence within the group

**Example:** If the message "Expected end of line" appears 3 times in the code:
- First occurrence: `(m011)` - group 01, instance 1
- Second occurrence: `(m012)` - group 01, instance 2
- Third occurrence: `(m013)` - group 01, instance 3

**Numbering Rules:**
1. Each unique duplicate message text gets the next available group number (01, 02, 03...)
2. Within each group, instances are numbered 1 through N
3. Single-occurrence messages don't need error codes (no duplicates to distinguish)
4. Maximum 9 instances per group (if more needed, split into logical subgroups)

**When adding new error codes:**
1. Run `npm run audit-errors` to find duplicate messages without codes
2. Assign the next available group number to each new duplicate message group
3. Number each instance within the group (1, 2, 3...)

---

## Audit Script (Future)

TODO: Create `scripts/audit-errors.ts` that:
1. Extracts all `throw new Error` statements
2. Identifies messages without error codes that have duplicates
3. Identifies error codes used more than once with different messages
4. Reports issues in a clear format
5. Returns non-zero exit code if issues found

---

## Release History

| Version | Date | Notes |
|---------|------|-------|
| 1.51.6 | 2025-09-30 | Line number fix, early deduplication |
| 1.51.5 | 2025-07-11 | send() fix, encoding fixes |
| 1.51.4 | 2025-05-30 | OBJ limit fix |
| 1.51.3 | 2025-05-27 | Include directories, OBJ limit |
| 1.51.2 | 2025-05-19 | Preprocessor fixes |
| 1.51.1 | 2025-05-05 | Post increment/decrement fix |
| 1.51.0 | 2025-05-01 | Language version v51 support |
