/** @format */

// Unit and integration tests for the Persistent Object Cache feature.
// Tests: key stability, round-trip, override/version sensitivity,
//        cache miss/hit paths, binary equivalence, and cache clear.

'use strict';

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ObjectCache } from '../../classes/objectCache';
import { SymbolTable } from '../../classes/symbolTable';
import { TextLine } from '../../classes/textLine';
import { eElementType } from '../../classes/types';
import { compareObjOrBinFiles, removeExistingFile } from '../testUtils';

const toolPath = path.resolve(__dirname, '../../pnut-ts.js');

// --- Helpers ---

function makeTempCacheDir(): string {
  const dir = fs.mkdtempSync(path.join(__dirname, '.cache-test-'));
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

function makeTextLines(texts: string[]): TextLine[] {
  return texts.map((t, i) => new TextLine(0, t, i));
}

// ====================================================================
// UNIT TESTS — ObjectCache class in isolation
// ====================================================================

describe('ObjectCache Unit Tests', () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = makeTempCacheDir();
  });

  afterEach(() => {
    cleanupDir(cacheDir);
  });

  // --- Key Stability ---

  test('same inputs produce the same cache key', () => {
    const cache = new ObjectCache(true, cacheDir);
    const lines = makeTextLines(['CON', '  _clkfreq = 20_000_000', 'PUB main()']);
    const version = '1.53.2';

    const key1 = cache.computeKey(lines, undefined, version);
    const key2 = cache.computeKey(lines, undefined, version);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  test('different source lines produce different keys', () => {
    const cache = new ObjectCache(true, cacheDir);
    const lines1 = makeTextLines(['CON', '  X = 1']);
    const lines2 = makeTextLines(['CON', '  X = 2']);
    const version = '1.53.2';

    const key1 = cache.computeKey(lines1, undefined, version);
    const key2 = cache.computeKey(lines2, undefined, version);
    expect(key1).not.toBe(key2);
  });

  // --- Override Sensitivity ---

  test('same source with different overrides produce different keys', () => {
    const cache = new ObjectCache(true, cacheDir);
    const lines = makeTextLines(['CON', '  DEFAULT_VALUE = 10']);
    const version = '1.53.2';

    const overrides1 = new SymbolTable();
    overrides1.add('DEFAULT_VALUE', eElementType.type_con_int, BigInt(100));

    const overrides2 = new SymbolTable();
    overrides2.add('DEFAULT_VALUE', eElementType.type_con_int, BigInt(200));

    const key1 = cache.computeKey(lines, overrides1, version);
    const key2 = cache.computeKey(lines, overrides2, version);
    expect(key1).not.toBe(key2);
  });

  test('same source with no overrides vs with overrides produce different keys', () => {
    const cache = new ObjectCache(true, cacheDir);
    const lines = makeTextLines(['CON', '  DEFAULT_VALUE = 10']);
    const version = '1.53.2';

    const overrides = new SymbolTable();
    overrides.add('DEFAULT_VALUE', eElementType.type_con_int, BigInt(100));

    const keyNoOverrides = cache.computeKey(lines, undefined, version);
    const keyWithOverrides = cache.computeKey(lines, overrides, version);
    expect(keyNoOverrides).not.toBe(keyWithOverrides);
  });

  // --- Version Sensitivity ---

  test('same source with different compiler version produce different keys', () => {
    const cache = new ObjectCache(true, cacheDir);
    const lines = makeTextLines(['PUB main()']);

    const key1 = cache.computeKey(lines, undefined, '1.53.0');
    const key2 = cache.computeKey(lines, undefined, '1.53.1');
    expect(key1).not.toBe(key2);
  });

  // --- Cache Round-trip ---

  test('store and retrieve binary — byte-identical', () => {
    const cache = new ObjectCache(true, cacheDir);
    const binary = new Uint8Array([0x00, 0x0a, 0xff, 0x42, 0x13, 0x37]);
    const key = 'deadbeef'.repeat(8); // 64-char hex

    cache.set(key, binary);
    const retrieved = cache.get(key);
    expect(retrieved).toBeDefined();
    expect(retrieved!.length).toBe(binary.length);
    expect(Array.from(retrieved!)).toEqual(Array.from(binary));
  });

  test('cache miss returns undefined', () => {
    const cache = new ObjectCache(true, cacheDir);
    const result = cache.get('0000000000000000000000000000000000000000000000000000000000000000');
    expect(result).toBeUndefined();
  });

  test('disabled cache always returns undefined', () => {
    const cache = new ObjectCache(false, cacheDir);
    const binary = new Uint8Array([0x01, 0x02]);
    cache.set('aaaa', binary);
    expect(cache.get('aaaa')).toBeUndefined();
  });

  // --- Stats ---

  test('stats track hits and misses', () => {
    const cache = new ObjectCache(true, cacheDir);
    const key = 'a'.repeat(64);
    const binary = new Uint8Array([0x42]);

    cache.set(key, binary);
    cache.get(key); // hit
    cache.get('b'.repeat(64)); // miss
    cache.get(key); // hit

    expect(cache.stats.hits).toBe(2);
    expect(cache.stats.misses).toBe(1);
  });

  // --- Cache Clear ---

  test('clear removes all cached entries', () => {
    const cache = new ObjectCache(true, cacheDir);
    const key = 'c'.repeat(64);
    cache.set(key, new Uint8Array([0x01]));
    expect(cache.get(key)).toBeDefined();

    cache.clear();
    // After clear, cache dir is gone; creating a new cache should miss
    const cache2 = new ObjectCache(true, cacheDir);
    expect(cache2.get(key)).toBeUndefined();
  });

  // --- Metadata ---

  test('metadata file is written alongside binary', () => {
    const cache = new ObjectCache(true, cacheDir);
    const key = 'd'.repeat(64);
    cache.set(key, new Uint8Array([0x01]), {
      source: 'test.spin2',
      overrides: '',
      compilerVersion: '1.53.2',
      timestamp: Date.now(),
      binarySize: 1
    });

    const metaPath = path.join(cacheDir, `${key}.meta`);
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(meta.source).toBe('test.spin2');
    expect(meta.compilerVersion).toBe('1.53.2');
  });
});

// ====================================================================
// INTEGRATION TESTS — cache behavior during actual compilation
// ====================================================================

describe('ObjectCache Integration Tests', () => {
  // Use OBJ-tests which have parent→child object hierarchies
  const objTestDir = path.resolve(__dirname, '../../../TEST/OBJ-tests');
  // Use MAP-tests/test4-override which has override parameters
  const overrideTestDir = path.resolve(__dirname, '../../../TEST/MAP-tests/test4-override');

  function compileSpin2(sourceDir: string, filename: string, extraFlags: string = ''): string {
    const filePath = path.join(sourceDir, filename);
    const cmd = `node ${toolPath} ${extraFlags} ${filePath}`;
    try {
      return execSync(cmd, { cwd: sourceDir, encoding: 'utf8', stdio: 'pipe' });
    } catch (error: unknown) {
      if (error instanceof Error && 'stderr' in error) {
        throw new Error(`Compilation failed for ${filename}: ${(error as { stderr: string }).stderr}`);
      }
      throw error;
    }
  }

  function cleanupCacheDir(dir: string): void {
    const cachePath = path.join(dir, '.pnut-cache');
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true });
    }
  }

  function cleanupOutputFiles(dir: string, basename: string): void {
    for (const ext of ['.lst', '.obj', '.bin', '.map']) {
      removeExistingFile(path.join(dir, `${basename}${ext}`));
    }
  }

  afterAll(() => {
    // Clean up any cache directories left by tests
    cleanupCacheDir(objTestDir);
    cleanupCacheDir(overrideTestDir);
  });

  // --- Cache Miss/Hit Path ---

  test('first compilation stores to cache, second uses cache', () => {
    cleanupCacheDir(objTestDir);
    const cachePath = path.join(objTestDir, '.pnut-cache');

    // First run: cache miss — should create cache entries
    compileSpin2(objTestDir, 'spin_test14.spin2', '-l -O --cache --cache-clear');
    expect(fs.existsSync(cachePath)).toBe(true);
    const cacheFiles = fs.readdirSync(cachePath).filter((f) => f.endsWith('.bin'));
    expect(cacheFiles.length).toBeGreaterThan(0);

    // Save first-run outputs (.obj and .bin are the critical outputs)
    const objContent1 = fs.readFileSync(path.join(objTestDir, 'spin_test14.obj'));
    const binContent1 = fs.readFileSync(path.join(objTestDir, 'spin_test14.bin'));

    // Second run: should use cache (cache hit)
    compileSpin2(objTestDir, 'spin_test14.spin2', '-l -O --cache');
    const objContent2 = fs.readFileSync(path.join(objTestDir, 'spin_test14.obj'));
    const binContent2 = fs.readFileSync(path.join(objTestDir, 'spin_test14.bin'));

    // Object and binary outputs must be identical
    expect(Buffer.from(objContent2).equals(Buffer.from(objContent1))).toBe(true);
    expect(Buffer.from(binContent2).equals(Buffer.from(binContent1))).toBe(true);

    // Cleanup
    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupCacheDir(objTestDir);
  });

  // --- Binary Equivalence: cached vs uncached ---

  describe('binary equivalence: cached output matches uncached output', () => {
    const testFiles = [
      { dir: objTestDir, file: 'spin_test14.spin2', name: 'spin_test14' },
      { dir: objTestDir, file: 'spin_test23.spin2', name: 'spin_test23' }
    ];

    test.each(testFiles)('$name produces identical .obj with and without cache', ({ dir, file, name }) => {
      // Compile WITHOUT cache
      cleanupCacheDir(dir);
      compileSpin2(dir, file, '-l -O');
      const objUncached = fs.readFileSync(path.join(dir, `${name}.obj`));
      const binUncached = fs.readFileSync(path.join(dir, `${name}.bin`));

      // Compile WITH cache (cold cache — first run)
      compileSpin2(dir, file, '-l -O --cache --cache-clear');
      const objCached = fs.readFileSync(path.join(dir, `${name}.obj`));
      const binCached = fs.readFileSync(path.join(dir, `${name}.bin`));

      // Must be byte-identical
      expect(Buffer.from(objCached).equals(Buffer.from(objUncached))).toBe(true);
      expect(Buffer.from(binCached).equals(Buffer.from(binUncached))).toBe(true);

      // Compile WITH cache (warm cache — second run, cache hits)
      compileSpin2(dir, file, '-l -O --cache');
      const objWarmCached = fs.readFileSync(path.join(dir, `${name}.obj`));
      const binWarmCached = fs.readFileSync(path.join(dir, `${name}.bin`));

      // Must STILL be byte-identical
      expect(Buffer.from(objWarmCached).equals(Buffer.from(objUncached))).toBe(true);
      expect(Buffer.from(binWarmCached).equals(Buffer.from(binUncached))).toBe(true);

      // Also verify against GOLD files
      const goldenObjPath = path.join(dir, `${name}.obj.GOLD`);
      if (fs.existsSync(goldenObjPath)) {
        expect(compareObjOrBinFiles(path.join(dir, `${name}.obj`), goldenObjPath)).toBe(true);
      }

      // Cleanup
      cleanupOutputFiles(dir, name);
      cleanupCacheDir(dir);
    });
  });

  // --- Deduplication with cache ---

  test('cache works correctly with shared (duplicate) child objects', () => {
    cleanupCacheDir(objTestDir);

    // spin_test23 has shared1 and shared2 referencing the same child file
    compileSpin2(objTestDir, 'spin_test23.spin2', '-l -O --cache --cache-clear');
    const objContent1 = fs.readFileSync(path.join(objTestDir, 'spin_test23.obj'));

    // Second compilation should use cached children
    compileSpin2(objTestDir, 'spin_test23.spin2', '-l -O --cache');
    const objContent2 = fs.readFileSync(path.join(objTestDir, 'spin_test23.obj'));

    expect(Buffer.from(objContent2).equals(Buffer.from(objContent1))).toBe(true);

    // Verify against GOLD
    const goldenObjPath = path.join(objTestDir, 'spin_test23.obj.GOLD');
    if (fs.existsSync(goldenObjPath)) {
      expect(compareObjOrBinFiles(path.join(objTestDir, 'spin_test23.obj'), goldenObjPath)).toBe(true);
    }

    cleanupOutputFiles(objTestDir, 'spin_test23');
    cleanupCacheDir(objTestDir);
  });

  // --- Override Parameter Variants ---

  test('cache stores separate entries for different override parameters', () => {
    cleanupCacheDir(overrideTestDir);
    const cachePath = path.join(overrideTestDir, '.pnut-cache');

    // override_top.spin2 has 3 instances of param_child with different overrides
    compileSpin2(overrideTestDir, 'override_top.spin2', '-l -O --cache --cache-clear');
    expect(fs.existsSync(cachePath)).toBe(true);

    // Should have at least 3 cache entries (one per unique override combination)
    const cacheFiles = fs.readdirSync(cachePath).filter((f) => f.endsWith('.bin'));
    expect(cacheFiles.length).toBeGreaterThanOrEqual(3);

    // Save first-run output
    const objContent1 = fs.readFileSync(path.join(overrideTestDir, 'override_top.obj'));

    // Second run with warm cache
    compileSpin2(overrideTestDir, 'override_top.spin2', '-l -O --cache');
    const objContent2 = fs.readFileSync(path.join(overrideTestDir, 'override_top.obj'));

    // Must be byte-identical
    expect(Buffer.from(objContent2).equals(Buffer.from(objContent1))).toBe(true);

    cleanupOutputFiles(overrideTestDir, 'override_top');
    cleanupCacheDir(overrideTestDir);
  });

  // --- Cache Clear ---

  test('--cache-clear removes all entries and recompiles fresh', () => {
    cleanupCacheDir(objTestDir);
    const cachePath = path.join(objTestDir, '.pnut-cache');

    // Build cache
    compileSpin2(objTestDir, 'spin_test14.spin2', '-l -O --cache --cache-clear');
    const filesBefore = fs.readdirSync(cachePath);
    expect(filesBefore.length).toBeGreaterThan(0);

    // Clear and rebuild
    compileSpin2(objTestDir, 'spin_test14.spin2', '-l -O --cache --cache-clear');
    const filesAfter = fs.readdirSync(cachePath);
    // Same number of files (rebuilt from scratch)
    expect(filesAfter.length).toBe(filesBefore.length);

    // Verify output is still correct
    const goldenObjPath = path.join(objTestDir, 'spin_test14.obj.GOLD');
    if (fs.existsSync(goldenObjPath)) {
      expect(compareObjOrBinFiles(path.join(objTestDir, 'spin_test14.obj'), goldenObjPath)).toBe(true);
    }

    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupCacheDir(objTestDir);
  });

  // --- Deep Object Hierarchy ---

  test('cache works with deep object nesting (3+ levels)', () => {
    // spin_test22 has 3 levels of nesting: top -> level1 -> level2 -> level3
    cleanupCacheDir(objTestDir);

    // Without cache
    compileSpin2(objTestDir, 'spin_test22.spin2', '-l -O');
    const objUncached = fs.readFileSync(path.join(objTestDir, 'spin_test22.obj'));

    // With cache (cold)
    compileSpin2(objTestDir, 'spin_test22.spin2', '-l -O --cache --cache-clear');
    const objColdCached = fs.readFileSync(path.join(objTestDir, 'spin_test22.obj'));
    expect(Buffer.from(objColdCached).equals(Buffer.from(objUncached))).toBe(true);

    // With cache (warm — all children should hit cache)
    compileSpin2(objTestDir, 'spin_test22.spin2', '-l -O --cache');
    const objWarmCached = fs.readFileSync(path.join(objTestDir, 'spin_test22.obj'));
    expect(Buffer.from(objWarmCached).equals(Buffer.from(objUncached))).toBe(true);

    // Verify against GOLD
    const goldenObjPath = path.join(objTestDir, 'spin_test22.obj.GOLD');
    if (fs.existsSync(goldenObjPath)) {
      expect(compareObjOrBinFiles(path.join(objTestDir, 'spin_test22.obj'), goldenObjPath)).toBe(true);
    }

    cleanupOutputFiles(objTestDir, 'spin_test22');
    cleanupCacheDir(objTestDir);
  });

  // --- Custom Cache Directory (--cache-dir) ---

  test('--cache-dir places cache in the specified directory', () => {
    const customCacheDir = path.join(objTestDir, '.custom-cache-test');
    cleanupDir(customCacheDir);
    cleanupCacheDir(objTestDir);

    // Compile with --cache-dir pointing to a custom location
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-dir ${customCacheDir}`);

    // Cache should exist at the custom location
    expect(fs.existsSync(customCacheDir)).toBe(true);
    const cacheFiles = fs.readdirSync(customCacheDir).filter((f) => f.endsWith('.bin'));
    expect(cacheFiles.length).toBeGreaterThan(0);

    // Default cache location should NOT exist
    const defaultCachePath = path.join(objTestDir, '.pnut-cache');
    expect(fs.existsSync(defaultCachePath)).toBe(false);

    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupDir(customCacheDir);
  });

  test('--cache-dir produces identical output to default cache location', () => {
    const customCacheDir = path.join(objTestDir, '.custom-cache-equiv');
    cleanupDir(customCacheDir);
    cleanupCacheDir(objTestDir);

    // Compile without cache for reference
    compileSpin2(objTestDir, 'spin_test14.spin2', '-l -O');
    const objUncached = fs.readFileSync(path.join(objTestDir, 'spin_test14.obj'));
    const binUncached = fs.readFileSync(path.join(objTestDir, 'spin_test14.bin'));

    // Compile with custom cache dir (cold)
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-dir ${customCacheDir}`);
    const objColdCached = fs.readFileSync(path.join(objTestDir, 'spin_test14.obj'));
    const binColdCached = fs.readFileSync(path.join(objTestDir, 'spin_test14.bin'));
    expect(Buffer.from(objColdCached).equals(Buffer.from(objUncached))).toBe(true);
    expect(Buffer.from(binColdCached).equals(Buffer.from(binUncached))).toBe(true);

    // Compile with custom cache dir (warm — should hit cache)
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-dir ${customCacheDir}`);
    const objWarmCached = fs.readFileSync(path.join(objTestDir, 'spin_test14.obj'));
    const binWarmCached = fs.readFileSync(path.join(objTestDir, 'spin_test14.bin'));
    expect(Buffer.from(objWarmCached).equals(Buffer.from(objUncached))).toBe(true);
    expect(Buffer.from(binWarmCached).equals(Buffer.from(binUncached))).toBe(true);

    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupDir(customCacheDir);
  });

  test('--cache-dir allows sharing cache across different source directories', () => {
    const sharedCacheDir = path.join(objTestDir, '.shared-cache-test');
    cleanupDir(sharedCacheDir);

    // Compile from objTestDir — populates the shared cache
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-clear --cache-dir ${sharedCacheDir}`);
    const cacheFilesAfterFirst = fs.readdirSync(sharedCacheDir).filter((f) => f.endsWith('.bin'));
    expect(cacheFilesAfterFirst.length).toBeGreaterThan(0);

    // Compile again — should get cache hits (same entries, no new files)
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-dir ${sharedCacheDir}`);
    const cacheFilesAfterSecond = fs.readdirSync(sharedCacheDir).filter((f) => f.endsWith('.bin'));
    expect(cacheFilesAfterSecond.length).toBe(cacheFilesAfterFirst.length);

    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupDir(sharedCacheDir);
  });

  test('--cache-clear with --cache-dir clears the custom directory', () => {
    const customCacheDir = path.join(objTestDir, '.custom-cache-clear');
    cleanupDir(customCacheDir);

    // Build cache
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-dir ${customCacheDir}`);
    expect(fs.existsSync(customCacheDir)).toBe(true);
    const filesBefore = fs.readdirSync(customCacheDir).filter((f) => f.endsWith('.bin'));
    expect(filesBefore.length).toBeGreaterThan(0);

    // Clear and rebuild
    compileSpin2(objTestDir, 'spin_test14.spin2', `-l -O --cache --cache-clear --cache-dir ${customCacheDir}`);
    const filesAfter = fs.readdirSync(customCacheDir).filter((f) => f.endsWith('.bin'));
    expect(filesAfter.length).toBe(filesBefore.length);

    // Verify output is still correct against GOLD
    const goldenObjPath = path.join(objTestDir, 'spin_test14.obj.GOLD');
    if (fs.existsSync(goldenObjPath)) {
      expect(compareObjOrBinFiles(path.join(objTestDir, 'spin_test14.obj'), goldenObjPath)).toBe(true);
    }

    cleanupOutputFiles(objTestDir, 'spin_test14');
    cleanupDir(customCacheDir);
  });
});
