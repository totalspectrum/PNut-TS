/**
 * Map File Verification Tests
 *
 * Tests that verify .map file output matches .lst file and expected.json
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { verifyMapAgainstExpected, formatResults } from './verify-map';

// When compiled to dist/tests/MAP-tests/, __dirname is dist/tests/MAP-tests/
const COMPILER_PATH = path.resolve(__dirname, '../../pnut-ts.js');
// Test data files are in TEST/MAP-tests/, not the dist folder
const TEST_DIR = path.resolve(__dirname, '../../../TEST/MAP-tests');

function compileTest(testDir: string, topFile: string): void {
  const sourceFile = path.join(testDir, topFile);
  try {
    execSync(`node ${COMPILER_PATH} -l -m ${sourceFile}`, {
      cwd: testDir,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (error: unknown) {
    if (error instanceof Error && 'stderr' in error) {
      throw new Error(`Compilation failed: ${(error as { stderr: string }).stderr}`);
    }
    throw error;
  }
}

function cleanupGeneratedFiles(testDir: string): void {
  const extensions = ['.lst', '.map', '.obj', '.bin'];
  const files = fs.readdirSync(testDir);
  for (const file of files) {
    if (extensions.some((ext) => file.endsWith(ext))) {
      fs.unlinkSync(path.join(testDir, file));
    }
  }
}

describe('Map File Verification', () => {
  describe('test1-simple', () => {
    const testDir = path.join(TEST_DIR, 'test1-simple');
    const expectedJson = JSON.parse(fs.readFileSync(path.join(testDir, 'expected.json'), 'utf8'));

    beforeAll(() => {
      compileTest(testDir, expectedJson.top_file);
    });

    afterAll(() => {
      cleanupGeneratedFiles(testDir);
    });

    it('should verify map matches listing and expected values', () => {
      const result = verifyMapAgainstExpected(testDir);
      if (!result.passed) {
        console.log(formatResults(result));
      }
      expect(result.passed).toBe(true);
    });

    it('should have correct object count', () => {
      const result = verifyMapAgainstExpected(testDir);
      const objectCheck = result.checks.find((c) => c.name === 'Object count');
      expect(objectCheck?.passed).toBe(true);
    });

    it('should have correct VAR symbol count', () => {
      const result = verifyMapAgainstExpected(testDir);
      const varCheck = result.checks.find((c) => c.name === 'VAR symbol count (top object)');
      expect(varCheck?.passed).toBe(true);
    });

    it('should have correct OBJ bytes', () => {
      const result = verifyMapAgainstExpected(testDir);
      const bytesCheck = result.checks.find((c) => c.name === 'OBJ bytes match');
      expect(bytesCheck?.passed).toBe(true);
    });
  });

  describe('test2-deep', () => {
    const testDir = path.join(TEST_DIR, 'test2-deep');
    const expectedJson = JSON.parse(fs.readFileSync(path.join(testDir, 'expected.json'), 'utf8'));

    beforeAll(() => {
      compileTest(testDir, expectedJson.top_file);
    });

    afterAll(() => {
      cleanupGeneratedFiles(testDir);
    });

    it('should verify map matches listing and expected values', () => {
      const result = verifyMapAgainstExpected(testDir);
      if (!result.passed) {
        console.log(formatResults(result));
      }
      expect(result.passed).toBe(true);
    });

    it('should have correct object count for deep hierarchy', () => {
      const result = verifyMapAgainstExpected(testDir);
      const objectCheck = result.checks.find((c) => c.name === 'Object count');
      expect(objectCheck?.passed).toBe(true);
      expect(objectCheck?.expected).toBe('3'); // 3 deep levels
    });
  });

  describe('test3-wide', () => {
    const testDir = path.join(TEST_DIR, 'test3-wide');
    const expectedJson = JSON.parse(fs.readFileSync(path.join(testDir, 'expected.json'), 'utf8'));

    beforeAll(() => {
      compileTest(testDir, expectedJson.top_file);
    });

    afterAll(() => {
      cleanupGeneratedFiles(testDir);
    });

    it('should verify map matches listing and expected values', () => {
      const result = verifyMapAgainstExpected(testDir);
      if (!result.passed) {
        console.log(formatResults(result));
      }
      expect(result.passed).toBe(true);
    });

    it('should have correct object count for wide hierarchy', () => {
      const result = verifyMapAgainstExpected(testDir);
      const objectCheck = result.checks.find((c) => c.name === 'Object count');
      expect(objectCheck?.passed).toBe(true);
      expect(objectCheck?.expected).toBe('4'); // 1 top + 3 children
    });
  });

  describe('test4-override', () => {
    const testDir = path.join(TEST_DIR, 'test4-override');
    const expectedJson = JSON.parse(fs.readFileSync(path.join(testDir, 'expected.json'), 'utf8'));

    beforeAll(() => {
      compileTest(testDir, expectedJson.top_file);
    });

    afterAll(() => {
      cleanupGeneratedFiles(testDir);
    });

    it('should verify map matches listing and expected values', () => {
      const result = verifyMapAgainstExpected(testDir);
      if (!result.passed) {
        console.log(formatResults(result));
      }
      expect(result.passed).toBe(true);
    });

    it('should have correct object count for override instances', () => {
      const result = verifyMapAgainstExpected(testDir);
      const objectCheck = result.checks.find((c) => c.name === 'Object count');
      expect(objectCheck?.passed).toBe(true);
      expect(objectCheck?.expected).toBe('4'); // 1 top + 3 instances of param_child
    });

    it('should have correct OBJ bytes', () => {
      const result = verifyMapAgainstExpected(testDir);
      const bytesCheck = result.checks.find((c) => c.name === 'OBJ bytes match');
      expect(bytesCheck?.passed).toBe(true);
    });
  });
});
