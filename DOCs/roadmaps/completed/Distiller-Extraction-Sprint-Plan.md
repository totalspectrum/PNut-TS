# Object Distiller Extraction - Sprint Plan

## Executive Summary

This sprint plan details the systematic extraction of the Object Distiller from SpinResolver into a standalone, well-encapsulated class. The extraction follows a **zero-regression** strategy where binary output must remain identical at every step.

**Test Validation Gate**: 39 OBJ tests + full regression suite (`npm test`) must pass after each sprint.

---

## Pre-Sprint Preparation

### Current State Inventory

| Component | Status | Location |
|-----------|--------|----------|
| `DistillerList` class | Partial | `src/classes/distillerList.ts` |
| `DistillerRecord` class | Complete | `src/classes/distillerList.ts` |
| Legacy `distiller[]` array | Active | `spinResolver.ts:304` |
| Legacy `distillPtr` pointer | Active | `spinResolver.ts:303` |
| `distill_*` methods (6) | Active | `spinResolver.ts:4879-5487` |
| Helper methods (5) | Active | `spinResolver.ts:4942-5156` |

### Key Methods to Extract

1. `distill_obj_blocks()` - Entry point orchestrator
2. `distill_build()` - Builds object tree recursively
3. `distill_scrub()` - Clears sub-object offsets for comparison
4. `distill_eliminate()` - Removes duplicate objects
5. `distill_rebuild()` - Reconstructs optimized image
6. `distill_reconnect()` - Reconnects sub-object references

### Helpers to Migrate/Remove

- `distillBuildEnter()` - Will be obsolete
- `distillRecordCount()` - Move to DistillerList
- `distillDumpRecords()` - Move to DistillerList
- `findMatchForRecord()` - Move to ObjectDistiller
- `distillEliminateUpdate()` - Move to ObjectDistiller

---

## Sprint 1: Enhance DistillerList Foundation

**Goal**: Extend DistillerList with all methods needed for full extraction.

### Sprint 1.1: Core Access Methods

**Files**: `src/classes/distillerList.ts`

Add the following methods to `DistillerList`:

```typescript
// Clear all records
public clear(): void {
  this._recordList = [];
}

// Get record count (already exists as getter, add method alias)
public getRecordCount(): number {
  return this._recordList.length;
}

// Get record at index (rename from record() for clarity)
public getRecordAt(index: number): DistillerRecord | undefined {
  return index >= 0 && index < this._recordList.length
    ? this._recordList[index]
    : undefined;
}
```

### Sprint 1.2: Mutation Methods

```typescript
// Remove record at index
public removeRecordAt(index: number): boolean {
  if (index >= 0 && index < this._recordList.length) {
    this._recordList.splice(index, 1);
    return true;
  }
  return false;
}

// Replace record at index
public replaceRecordAt(index: number, record: DistillerRecord): boolean {
  if (index >= 0 && index < this._recordList.length) {
    this._recordList[index] = record;
    return true;
  }
  return false;
}
```

### Sprint 1.3: Search Methods

```typescript
// Find record by object ID
public findRecordIndexByObjectId(objectId: number): number {
  for (let i = 0; i < this._recordList.length; i++) {
    if ((this._recordList[i].objectId & 0x7FFFFFFF) === (objectId & 0x7FFFFFFF)) {
      return i;
    }
  }
  return -1;
}

// Find record by object ID (returns record)
public findRecordByObjectId(objectId: number): DistillerRecord | undefined {
  const index = this.findRecordIndexByObjectId(objectId);
  return index >= 0 ? this._recordList[index] : undefined;
}
```

### Sprint 1.4: Bulk Update Methods

```typescript
// Replace all sub-object ID references
public replaceSubObjectId(oldId: number, newId: number): void {
  const maskedOldId = oldId & 0x7FFFFFFF;
  const newIdWithFlag = newId | 0x80000000;

  for (const record of this._recordList) {
    for (let i = 0; i < record.subObjectIds.length; i++) {
      const subId = record.subObjectIds[i] & 0x7FFFFFFF;
      if (subId === maskedOldId || subId === (newId & 0x7FFFFFFF)) {
        record.subObjectIds[i] = newIdWithFlag;
      }
    }
  }
}
```

### Sprint 1.5: Iterator Support

```typescript
// Generator for iteration
public *records(): Generator<[number, DistillerRecord]> {
  for (let i = 0; i < this._recordList.length; i++) {
    yield [i, this._recordList[i]];
  }
}

// forEach helper
public forEach(callback: (record: DistillerRecord, index: number) => void): void {
  this._recordList.forEach((record, index) => callback(record, index));
}
```

### Sprint 1.6: Make DistillerRecord Mutable

**Current issue**: DistillerRecord properties are read-only. Need setters for:

```typescript
// Add to DistillerRecord class
set objectOffset(value: number) {
  this._objectOffset = value;
}

set subObjectIds(ids: number[]) {
  this._subObjectIds = ids;
}

// Method to update a specific sub-object ID
public updateSubObjectId(index: number, newId: number): void {
  if (index >= 0 && index < this._subObjectIds.length) {
    this._subObjectIds[index] = newId;
  }
}
```

**Validation**: Compile project, run `npm run test-obj` (expect 39 pass)

---

## Sprint 2: Create ObjectDistiller Shell

**Goal**: Create the ObjectDistiller class with stub methods that delegate to existing SpinResolver methods.

### Sprint 2.1: Create ObjectDistiller Class File

**New file**: `src/classes/objectDistiller.ts`

```typescript
/** @format */

'use strict';

import { Context } from '../utils/context';
import { DistillerList, DistillerRecord } from './distillerList';
import { ObjectImage } from './objectImage';

export class ObjectDistiller {
  private context: Context;
  private distillerList: DistillerList;
  private isLogging: boolean;
  private isLoggingOutline: boolean;

  constructor(ctx: Context) {
    this.context = ctx;
    this.distillerList = new DistillerList(ctx);
    this.isLogging = ctx.logOptions.logDistiller;
    this.isLoggingOutline = ctx.logOptions.logOutline;
  }

  public get recordCount(): number {
    return this.distillerList.recordCount;
  }

  // Main entry point - will replace distill_obj_blocks()
  public distillObjects(objImage: ObjectImage): number {
    const startingOffset = objImage.offset;

    this.distillerList.clear();
    this.buildObjectTree(objImage, 0, 0, 1);
    this.scrubObjectOffsets(objImage);

    let wasEliminated: boolean;
    do {
      wasEliminated = this.eliminateRedundantObjects(objImage);
    } while (wasEliminated);

    this.rebuildOptimizedImage(objImage);
    this.reconnectReferences(objImage, 0);

    return startingOffset - objImage.offset; // bytes saved
  }

  private buildObjectTree(
    objImage: ObjectImage,
    objectId: number,
    objectOffset: number,
    subObjectId: number
  ): number {
    // STUB - to be implemented in Sprint 3
    throw new Error('Not yet implemented - use legacy');
  }

  private scrubObjectOffsets(objImage: ObjectImage): void {
    // STUB - to be implemented in Sprint 3
    throw new Error('Not yet implemented - use legacy');
  }

  private eliminateRedundantObjects(objImage: ObjectImage): boolean {
    // STUB - to be implemented in Sprint 4
    throw new Error('Not yet implemented - use legacy');
  }

  private rebuildOptimizedImage(objImage: ObjectImage): void {
    // STUB - to be implemented in Sprint 5
    throw new Error('Not yet implemented - use legacy');
  }

  private reconnectReferences(objImage: ObjectImage, recordIndex: number): void {
    // STUB - to be implemented in Sprint 5
    throw new Error('Not yet implemented - use legacy');
  }

  private logMessage(message: string): void {
    if (this.isLogging) {
      this.context.logger.logMessage(message);
    }
  }
}
```

### Sprint 2.2: Add ObjectDistiller to SpinResolver (Dormant)

Add import and instantiation but don't use yet:

```typescript
// In spinResolver.ts
import { ObjectDistiller } from './objectDistiller';

// In constructor
// private objectDistiller: ObjectDistiller;  // FUTURE USE
```

**Validation**: Compile project, run `npm run test-obj` (expect 39 pass)

---

## Sprint 3: Migrate Build and Scrub Algorithms

**Goal**: Implement `buildObjectTree()` and `scrubObjectOffsets()` in ObjectDistiller.

### Sprint 3.1: Implement buildObjectTree()

This is the most complex method due to recursion. Port logic from `distill_build()`:

```typescript
private buildObjectTree(
  objImage: ObjectImage,
  objectId: number = 0,
  objectOffset: number = 0,
  subObjectId: number = 1
): number {
  // Count sub-objects
  let tableEntry: number;
  let subObjectCount = 0;

  while (true) {
    tableEntry = objImage.readLong(objectOffset + subObjectCount * 8);
    if ((tableEntry & 0x80000000) === 0) {
      subObjectCount++;
    } else {
      break;
    }
  }

  // Count methods
  let methodCount = 0;
  while (true) {
    tableEntry = objImage.readLong(objectOffset + subObjectCount * 8 + methodCount * 4);
    if ((tableEntry & 0x80000000) !== 0) {
      methodCount++;
    } else {
      break;
    }
  }

  // Collect sub-object IDs
  const subObjIds: number[] = [];
  for (let i = 0; i < subObjectCount; i++) {
    subObjIds.push(subObjectId + i);
  }

  // Create and add record
  const record = new DistillerRecord(
    objectId,
    objectOffset,
    subObjectCount,
    methodCount,
    tableEntry,  // object size is last tableEntry
    subObjIds
  );
  this.distillerList.addrecord(record);

  // Process sub-objects recursively
  let newSubObjectId = subObjectId + subObjectCount;
  for (let i = 0; i < subObjectCount; i++) {
    const subObjectOffset = objImage.readLong(objectOffset + i * 8);
    newSubObjectId = this.buildObjectTree(
      objImage,
      subObjectId + i,
      objectOffset + subObjectOffset,
      newSubObjectId
    );
  }

  return newSubObjectId;
}
```

### Sprint 3.2: Implement scrubObjectOffsets()

Port logic from `distill_scrub()`:

```typescript
private scrubObjectOffsets(objImage: ObjectImage): void {
  this.logMessage(`* scrubObjectOffsets()`);

  for (const [index, record] of this.distillerList.records()) {
    for (let subObjIndex = 0; subObjIndex < record.subObjectCount; subObjIndex++) {
      objImage.replaceLong(0, record.objectOffset + subObjIndex * 8);
    }
  }
}
```

### Sprint 3.3: Create Parallel Test Harness

Add temporary validation code to SpinResolver to compare outputs:

```typescript
// TEMPORARY: In distill_obj_blocks() after distill_build()
if (process.env.VALIDATE_DISTILLER) {
  const testDistiller = new ObjectDistiller(this.context);
  // Compare record counts and content
}
```

**Validation**:
1. Run `npm run test-obj` (expect 39 pass)
2. Enable VALIDATE_DISTILLER and verify parallel results match

---

## Sprint 4: Migrate Elimination Algorithm

**Goal**: Implement the complex `eliminateRedundantObjects()` method.

### Sprint 4.1: Implement Record Comparison Helper

```typescript
private areRecordsEquivalent(
  objImage: ObjectImage,
  record1: DistillerRecord,
  record2: DistillerRecord
): boolean {
  // Size comparison
  if (record1.objectSize !== record2.objectSize) return false;

  // Sub-object count comparison
  if (record1.subObjectCount !== record2.subObjectCount) return false;

  // Sub-object IDs comparison
  for (let i = 0; i < record1.subObjectCount; i++) {
    if (record1.subObjectIds[i] !== record2.subObjectIds[i]) return false;
  }

  // Binary content comparison
  const sizeInLongs = (record1.objectSize + 3) >> 2;
  for (let i = 0; i < sizeInLongs; i++) {
    const long1 = objImage.readLong(record1.objectOffset + i * 4);
    const long2 = objImage.readLong(record2.objectOffset + i * 4);
    if (long1 !== long2) return false;
  }

  return true;
}
```

### Sprint 4.2: Implement eliminateRedundantObjects()

Port logic from `distill_eliminate()`:

```typescript
private eliminateRedundantObjects(objImage: ObjectImage): boolean {
  this.logMessage(`* eliminateRedundantObjects()`);

  for (let matchIdx = 0; matchIdx < this.distillerList.recordCount; matchIdx++) {
    const matchRecord = this.distillerList.getRecordAt(matchIdx)!;

    // Check if all sub-objects are marked complete
    let allComplete = true;
    for (const subId of matchRecord.subObjectIds) {
      if ((subId & 0x80000000) === 0) {
        allComplete = false;
        break;
      }
    }

    if (!allComplete) continue;

    // Search for matching record
    for (let searchIdx = matchIdx + 1; searchIdx < this.distillerList.recordCount; searchIdx++) {
      const searchRecord = this.distillerList.getRecordAt(searchIdx)!;

      if (this.areRecordsEquivalent(objImage, matchRecord, searchRecord)) {
        // Found match - update references and remove
        const oldId = matchRecord.objectId;
        const newId = searchRecord.objectId;

        this.distillerList.replaceSubObjectId(oldId, newId);
        this.distillerList.removeRecordAt(matchIdx);

        return true; // Signal that we eliminated something
      }
    }
  }

  return false;
}
```

**Validation**: Run `npm run test-obj` with parallel comparison enabled

---

## Sprint 5: Migrate Rebuild and Reconnect

**Goal**: Implement remaining algorithms.

### Sprint 5.1: Implement rebuildOptimizedImage()

Port logic from `distill_rebuild()`:

```typescript
private rebuildOptimizedImage(objImage: ObjectImage): void {
  const savedOffset = objImage.offset;
  this.logMessage(`* rebuildOptimizedImage() imgOfs=${savedOffset}`);

  const rebuildImage = new ObjectImage(this.context, 'rebuildImage');
  rebuildImage.setOffsetTo(0);

  for (const [index, record] of this.distillerList.records()) {
    const sourceOffset = record.objectOffset;

    // Update record with new offset
    record.objectOffset = rebuildImage.offset;

    // Copy object content
    const sizeInLongs = (record.objectSize + 3) >> 2;
    for (let i = 0; i < sizeInLongs; i++) {
      const sourceLong = objImage.readLong(sourceOffset + i * 4);
      rebuildImage.appendLong(sourceLong);
    }
  }

  // Replace objImage content
  objImage.rawUint8Array.set(rebuildImage.rawUint8Array.subarray(0, rebuildImage.offset));
  objImage.setOffsetTo(rebuildImage.offset);
}
```

### Sprint 5.2: Implement reconnectReferences()

Port logic from `distill_reconnect()`:

```typescript
private reconnectReferences(objImage: ObjectImage, recordIndex: number = 0): void {
  const record = this.distillerList.getRecordAt(recordIndex);
  if (!record) return;

  this.logMessage(`* reconnectReferences(recordIndex=${recordIndex})`);

  for (let subIdx = 0; subIdx < record.subObjectCount; subIdx++) {
    const subObjId = record.subObjectIds[subIdx] & 0x7FFFFFFF;

    // Find the record with matching ID
    const matchIndex = this.distillerList.findRecordIndexByObjectId(subObjId);
    if (matchIndex < 0) {
      throw new Error(`Failed to locate Object Id ${subObjId} in list`);
    }

    const matchRecord = this.distillerList.getRecordAt(matchIndex)!;
    const relativeOffset = (matchRecord.objectOffset - record.objectOffset) & 0x7FFFFFFF;

    objImage.replaceLong(relativeOffset, record.objectOffset + subIdx * 8);

    // Recurse into sub-object
    this.reconnectReferences(objImage, matchIndex);
  }
}
```

**Validation**: Run `npm run test-obj` (expect 39 pass)

---

## Sprint 6: Integration and Switchover

**Goal**: Switch SpinResolver to use ObjectDistiller.

### Sprint 6.1: Update distill_obj_blocks()

Replace legacy implementation with ObjectDistiller call:

```typescript
private distill_obj_blocks() {
  if (this.pasmMode === false) {
    this.logMessageOutline(`++ distill_obj_blocks() objImgLen=${this.objImage.offset} - ENTRY`);

    const bytesRemoved = this.objectDistiller.distillObjects(this.objImage);
    this.distilledBytes += bytesRemoved;

    this.logMessageOutline(`++ distill_obj_blocks() - EXIT`);
  }
}
```

### Sprint 6.2: Enable ObjectDistiller

```typescript
// In SpinResolver constructor
this.objectDistiller = new ObjectDistiller(ctx);
```

**Validation**:
1. Run `npm run test-obj` (expect 39 pass)
2. Run `npm test` (full regression)
3. Binary compare output files against known-good baselines

---

## Sprint 7: Legacy Removal and Cleanup

**Goal**: Remove all legacy distiller code from SpinResolver.

### Sprint 7.1: Remove Legacy Properties

Delete from SpinResolver:
```typescript
// DELETE these lines:
private distillPtr: number = 0;
private distiller: number[] = [];
private distillerList: DistillerList;  // Moved to ObjectDistiller
```

### Sprint 7.2: Remove Legacy Methods

Delete from SpinResolver:
- `distill_build()`
- `distill_build_new()` (commented)
- `distillBuildEnter()`
- `distill_scrub()`
- `distill_eliminate()`
- `distill_eliminate_old()` (commented)
- `distillEliminateUpdate()`
- `findMatchForRecord()`
- `distill_rebuild()`
- `distill_reconnect()`
- `distillRecordCount()`
- `distillDumpRecords()`

### Sprint 7.3: Update Imports

Remove from SpinResolver:
```typescript
// DELETE this import:
import { DistillerList, DistillerRecord } from './distillerList';
```

### Sprint 7.4: Remove FIXME Comments

The FIXME comments at lines 303-304 will be naturally removed with the legacy code.

**Validation**:
1. Run `npm run lint` (no errors)
2. Run `npm run test-obj` (expect 39 pass)
3. Run `npm test` (full regression)

---

## Sprint 8: Documentation and Polish

**Goal**: Final cleanup and documentation.

### Sprint 8.1: Add JSDoc Comments

Document all public methods in ObjectDistiller and DistillerList.

### Sprint 8.2: Update Roadmap

Mark roadmap as complete, move to `completed/` folder.

### Sprint 8.3: Update CHANGELOG

Add entry documenting the distiller extraction.

**Validation**: Final full test run

---

## Risk Mitigation Checklist

| Risk | Mitigation |
|------|------------|
| Binary output differs | Compare .bin/.obj files at each sprint |
| Off-by-one errors in record indexing | Parallel testing during Sprints 3-5 |
| Recursion depth issues | Test with spin_test22 (4 levels deep) |
| Duplicate elimination logic errors | Test with spin_test23 (mixed dedup scenario) |
| Performance regression | Profile before/after Sprint 6 |

---

## Test Coverage Map

| Test File | Coverage Area |
|-----------|--------------|
| spin_test10-11 | Basic parent-child objects |
| spin_test12-13 | Single object (no children) |
| spin_test14 | Two children |
| spin_test15-17 | Multiple children with recursion |
| spin_test18-19 | Child with sub-children |
| spin_test20 | Duplicate object reference |
| spin_test21 | New test (basic OBJ) |
| spin_test22 | **Deep nesting (4 levels)** - Critical for recursion |
| spin_test23 | **Mixed duplicates** - Critical for elimination |

---

## Sprint Summary

| Sprint | Effort | Risk | Dependency |
|--------|--------|------|------------|
| Sprint 1: DistillerList Enhancement | 2-3 hours | Low | None |
| Sprint 2: ObjectDistiller Shell | 1-2 hours | Low | Sprint 1 |
| Sprint 3: Build/Scrub Migration | 3-4 hours | Medium | Sprint 2 |
| Sprint 4: Elimination Migration | 4-6 hours | High | Sprint 3 |
| Sprint 5: Rebuild/Reconnect | 3-4 hours | Medium | Sprint 4 |
| Sprint 6: Integration | 1-2 hours | Medium | Sprint 5 |
| Sprint 7: Legacy Removal | 1-2 hours | Low | Sprint 6 |
| Sprint 8: Documentation | 1 hour | Low | Sprint 7 |

**Total Estimated Effort**: 16-24 hours

---

## Definition of Done

- [ ] All 39 OBJ tests pass
- [ ] Full regression suite (`npm test`) passes
- [ ] Binary output identical to pre-extraction baseline
- [ ] No FIXME comments related to distiller
- [ ] `distiller[]` array removed from SpinResolver
- [ ] `distillPtr` removed from SpinResolver
- [ ] ObjectDistiller class is sole owner of distillation logic
- [ ] Code passes `npm run lint`
- [ ] Roadmap moved to `completed/` folder
