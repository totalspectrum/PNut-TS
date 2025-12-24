# Object Distiller Extraction Roadmap

## Current State Analysis

The Object Distiller is currently **partially extracted** with dual implementations:

### ✅ Completed Extraction
- `DistillerList` class (`src/classes/distillerList.ts`) - ✅ Fully extracted
- `DistillerRecord` class - ✅ Proper data structure
- Logging integration - ✅ Uses distiller-specific logging
- Record creation - ✅ Creates structured records in parallel

### ❌ Remaining Legacy Code
- Core algorithms still use `distiller[]` array + `distillPtr`
- FIXME comments indicating incomplete extraction (lines 303-304)
- Direct array manipulation throughout optimization phases

## Extraction Phases

### Phase 1: Data Structure Migration
**Goal**: Replace all legacy array access with `DistillerList` methods

#### Step 1.1: Enhance DistillerList Interface
Add missing methods to `DistillerList` class:

```typescript
// Add to src/classes/distillerList.ts
export class DistillerList {
  // Existing methods...

  // New methods needed for extraction:
  public clear(): void
  public removeRecord(index: number): void
  public updateRecord(index: number, record: DistillerRecord): void
  public findRecordByObjectId(objectId: number): number | undefined
  public getRecordAt(index: number): DistillerRecord | undefined
  public getRecordCount(): number
  public replaceSubObjectId(oldId: number, newId: number): void
}
```

#### Step 1.2: Add Iterator Support
```typescript
// Add iterator interface for seamless migration
public *records(): Generator<[number, DistillerRecord]> {
  for (let i = 0; i < this._recordList.length; i++) {
    yield [i, this._recordList[i]];
  }
}
```

### Phase 2: Algorithm Refactoring

#### Step 2.1: Extract `distill_scrub()`
**Current** (lines 5126-5148):
```typescript
private distill_scrub() {
  let recordOffset = 0;
  do {
    const objectOffset = this.distiller[recordOffset + 1];
    const subObjectCount = this.distiller[recordOffset + 2];
    // ... array manipulation
    recordOffset += 5 + subObjectCount;
  } while (recordOffset < this.distillPtr);
}
```

**Target**:
```typescript
private distill_scrub() {
  for (const [index, record] of this.distillerList.records()) {
    for (let subObjIndex = 0; subObjIndex < record.subObjectCount; subObjIndex++) {
      this.objImage.replaceLong(0, record.objectOffset + subObjIndex * 8);
    }
  }
}
```

#### Step 2.2: Extract `distill_eliminate()`
**Complexity**: High - Contains nested loops and array manipulation

**Strategy**:
1. Create helper methods for record comparison
2. Replace array indexing with DistillerList methods
3. Maintain elimination algorithm logic

```typescript
// Helper method
private compareRecords(record1: DistillerRecord, record2: DistillerRecord): boolean {
  // Size comparison
  if (record1.objectSize !== record2.objectSize) return false;

  // Sub-object count comparison
  if (record1.subObjectCount !== record2.subObjectCount) return false;

  // Sub-object IDs comparison
  if (!this.arraysEqual(record1.subObjectIds, record2.subObjectIds)) return false;

  // Binary content comparison
  return this.compareBinaryContent(record1.objectOffset, record2.objectOffset, record1.objectSize);
}
```

#### Step 2.3: Extract `distill_rebuild()`
**Current**: Direct array manipulation for offset updates
**Target**: Use DistillerRecord objects with proper encapsulation

#### Step 2.4: Extract `distill_reconnect()`
**Current**: Complex array traversal and ID matching
**Target**: Use DistillerList search methods

### Phase 3: Complete Class Extraction

#### Step 3.1: Create ObjectDistiller Class
```typescript
// New file: src/classes/objectDistiller.ts
export class ObjectDistiller {
  private context: Context;
  private distillerList: DistillerList;
  private isLogging: boolean;

  constructor(ctx: Context) {
    this.context = ctx;
    this.distillerList = new DistillerList(ctx);
    this.isLogging = ctx.logOptions.logDistiller;
  }

  public distillObjects(objImage: ObjectImage): number {
    const startingOffset = objImage.offset;

    this.buildObjectTree(objImage);
    this.scrubObjectOffsets(objImage);
    this.eliminateRedundantObjects();
    this.rebuildOptimizedImage(objImage);
    this.reconnectReferences(objImage);

    return startingOffset - objImage.offset; // bytes saved
  }

  private buildObjectTree(objImage: ObjectImage): void { /* ... */ }
  private scrubObjectOffsets(objImage: ObjectImage): void { /* ... */ }
  private eliminateRedundantObjects(): void { /* ... */ }
  private rebuildOptimizedImage(objImage: ObjectImage): void { /* ... */ }
  private reconnectReferences(objImage: ObjectImage): void { /* ... */ }
}
```

#### Step 3.2: Update SpinResolver Integration
```typescript
// In src/classes/spinResolver.ts
import { ObjectDistiller } from './objectDistiller';

export class SpinResolver {
  private objectDistiller: ObjectDistiller;

  constructor(ctx: Context) {
    // ... existing initialization
    this.objectDistiller = new ObjectDistiller(ctx);
  }

  private distill_obj_blocks() {
    if (this.pasmMode == false) {
      this.logMessageOutline(`++ distill_obj_blocks() - ENTRY`);
      const bytesRemoved = this.objectDistiller.distillObjects(this.objImage);
      this.distilledBytes += bytesRemoved;
      this.logMessageOutline(`++ distill_obj_blocks() - EXIT`);
    }
  }
}
```

### Phase 4: Legacy Code Removal

#### Step 4.1: Remove Legacy Properties
```typescript
// Remove from SpinResolver class:
// private distillPtr: number = 0;          // REMOVE
// private distiller: number[] = [];        // REMOVE
// private distillerList: DistillerList;    // KEEP - move to ObjectDistiller
```

#### Step 4.2: Remove Helper Methods
- `distillRecordCount()`
- `distillDumpRecords()`
- `distillBuildEnter()`
- All legacy distill_* methods

#### Step 4.3: Clean Up Imports
Remove DistillerList import from SpinResolver once fully extracted.

## Implementation Strategy

### Incremental Approach
1. **Parallel Implementation**: Keep both systems running during transition
2. **Method-by-Method**: Extract one algorithm at a time
3. **Validation**: Compare outputs between legacy and new systems
4. **Gradual Migration**: Replace usage points one by one

### Testing Strategy
```typescript
// Create test harness
class DistillerTester {
  public testEquivalence(objImage: ObjectImage): void {
    // Clone objImage for parallel testing
    const legacyResult = this.runLegacyDistiller(objImage.clone());
    const newResult = this.runNewDistiller(objImage.clone());

    // Compare results
    assert(legacyResult.size === newResult.size);
    assert(legacyResult.content.equals(newResult.content));
  }
}
```

### Risk Mitigation
1. **Comprehensive Logging**: Maintain detailed logs for comparison
2. **Regression Testing**: Use existing test suite to validate
3. **Binary Comparison**: Ensure optimized binaries remain identical
4. **Performance Monitoring**: Verify no performance degradation

## File Structure After Extraction

```
src/classes/
├── objectDistiller.ts          # Main distiller class (NEW)
├── distillerList.ts           # Enhanced with new methods
├── spinResolver.ts            # Simplified, legacy code removed
└── tests/
    ├── objectDistiller.test.ts # Unit tests for distiller (NEW)
    └── distillerList.test.ts   # Enhanced tests
```

## Benefits of Complete Extraction

### Code Quality
- ✅ Remove FIXME comments and technical debt
- ✅ Eliminate dual implementation maintenance
- ✅ Improve type safety with proper data structures
- ✅ Better separation of concerns

### Maintainability
- ✅ Isolated distiller logic easier to understand
- ✅ Unit testable distiller algorithms
- ✅ Cleaner SpinResolver class
- ✅ Extensible optimization framework

### Future Enhancements
- ✅ Additional optimization strategies
- ✅ Configurable optimization levels
- ✅ Better performance profiling
- ✅ Alternative elimination algorithms

## Estimated Effort

### Time Investment
- **Phase 1**: 8-12 hours (DistillerList enhancement)
- **Phase 2**: 20-30 hours (Algorithm extraction)
- **Phase 3**: 12-16 hours (Class creation and integration)
- **Phase 4**: 4-6 hours (Legacy removal and cleanup)

**Total**: 44-64 hours for complete extraction

### Risk Level: Medium
- Complex algorithms with intricate dependencies
- Binary output must remain identical
- Extensive testing required for validation

## Success Criteria
- [ ] All FIXME comments removed
- [ ] No legacy array-based distiller code
- [ ] Identical binary output compared to current implementation
- [ ] All regression tests pass
- [ ] Performance remains equivalent or improves
- [ ] Clean object-oriented distiller interface
- [ ] Comprehensive unit test coverage

This roadmap provides a systematic approach to completing the distiller extraction while maintaining system stability and functionality.