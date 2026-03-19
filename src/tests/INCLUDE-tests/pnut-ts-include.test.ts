/* eslint-disable no-console */
'use strict';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { removeExistingFile, topLevel } from '../testUtils';

// test lives in <rootDir>/src/tests/INCLUDE-tests
const testDirPath = path.resolve(__dirname, '../../../TEST/INCLUDE-tests');
const libDirPath = path.join(testDirPath, 'lib');
const toolPath = path.resolve(__dirname, '../../../dist');

const directories = [
  { name: 'Test directory', path: testDirPath, relFolder: testDirPath.replace(topLevel, './') },
  { name: 'Lib directory', path: libDirPath, relFolder: libDirPath.replace(topLevel, './') },
  { name: 'Tool directory', path: toolPath, relFolder: toolPath.replace(topLevel, './') }
];

describe('Directory existence tests', () => {
  test.each(directories)('$relFolder should exist', ({ path }) => {
    if (!fs.existsSync(path)) {
      throw new Error(`Directory does not exist: ${path}`);
    }
  });
});

describe('PNut_ts resolves OBJ files via -I with absolute path', () => {
  const file = path.join(testDirPath, 'inc_test_abs_path.spin2');
  const basename = 'inc_test_abs_path';

  test(`Compile file: ${basename}.spin2 with -I <absolute-path>`, () => {
    const binFSpec = path.join(testDirPath, `${basename}.bin`);
    const lstFSpec = path.join(testDirPath, `${basename}.lst`);

    removeExistingFile(binFSpec);
    removeExistingFile(lstFSpec);

    // Use absolute path for -I — verifies that locateSpin2File() handles
    // absolute include paths correctly (the bug was path.join() corrupting them)
    const options: string = `-l -I ${libDirPath} --`;
    try {
      execSync(`node ${toolPath}/pnut-ts.js ${options} ${file}`, { stdio: 'pipe' });
    } catch (error) {
      fail(`Compilation failed for ${basename}.spin2 with absolute -I path: ${error}`);
    }

    expect(fs.existsSync(binFSpec)).toBe(true);

    // cleanup
    removeExistingFile(binFSpec);
    removeExistingFile(lstFSpec);
  });
});
