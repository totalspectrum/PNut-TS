/* eslint-disable no-console */
'use strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const topLevel: string = path.join(path.sep, 'workspaces', path.sep, 'Pnut-ts-dev', path.sep);

export async function delay_mSec(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if all files in a list exist, polling every 500ms, for up to 5 minutes.
 * @param fileSpecs Array of file paths to check.
 * @returns Promise that resolves to a boolean indicating if all files are present.
 */

export async function waitForFiles(fileSpecs: string[]): Promise<boolean> {
  //console.log(`* waitForFiles([${fileSpecs.join(', ')}])`);
  const maxAttempts = 600; // 5 minutes / 500ms

  let foundAllFilesStatus: boolean = false;
  let attempts = 0;
  while (attempts < maxAttempts) {
    let allFilesPresentStatus: boolean = true;
    for (let index = 0; index < fileSpecs.length; index++) {
      const fileSpec = fileSpecs[index];
      if (!fs.existsSync(fileSpec)) {
        allFilesPresentStatus = false;
        break;
      }
    }
    if (allFilesPresentStatus) {
      foundAllFilesStatus = true;
      break;
    }
    await delay_mSec(500); // Wait for 500ms before checking again
    attempts++;
  }

  return foundAllFilesStatus; // Timeout reached without finding all files
}

export function generateFileHash(filePath: string): string {
  // Function to generate an MD5 hash of a file's contents
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('md5');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

export function removeFileIfEmpty(fileSpec: string) {
  if (fileExists(fileSpec)) {
    const stats = fs.statSync(fileSpec);
    if (stats.size == 0) {
      removeExistingFile(fileSpec);
    }
  }
}

export function fileEmpty(fileSpec: string): boolean {
  let emptyFileStatus: boolean = true;
  if (fileExists(fileSpec)) {
    const stats = fs.statSync(fileSpec);
    if (stats.size > 0) {
      emptyFileStatus = false;
    }
  }
  return emptyFileStatus;
}

export function fileExists(fileSpec: string): boolean {
  const fileFoundStatus: boolean = fs.existsSync(fileSpec);
  //console.log(`testUtils: fileExists([${fileSpec}]) -> (${fileFoundStatus})`);
  return fileFoundStatus;
}

export function compareObjOrBinFiles(outputFSpec: string, goldenFSpec: string): boolean {
  let filesMatchStatus: boolean = false;
  let inputFileCount: number = 0;
  if (fs.existsSync(outputFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing compile output [${outputFSpec}]`);
  }
  if (fs.existsSync(goldenFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing GOLDEN output [${goldenFSpec}]`);
  }
  if (inputFileCount == 2) {
    const file1Hash = generateFileHash(outputFSpec);
    const file2Hash = generateFileHash(goldenFSpec);
    filesMatchStatus = file1Hash === file2Hash;
  }
  return filesMatchStatus;
}

export function compareExceptionFiles(reportFSpec: string, goldenFSpec: string): boolean {
  let filesMatchStatus: boolean = false;
  let inputFileCount: number = 0;
  if (fs.existsSync(reportFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing compile output [${reportFSpec}]`);
  }
  if (fs.existsSync(goldenFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing GOLDEN output [${goldenFSpec}]`);
  }
  if (inputFileCount == 2) {
    // Read the report file and split into lines
    const reportContentLines = fs.readFileSync(reportFSpec, 'utf8').split(/\s*\r?\n/);
    // Read the golden file and split into lines
    const goldenContentLines = fs.readFileSync(goldenFSpec, 'utf8').split(/\s*\r\n|\s*\r/);

    // Remove empty lines at the end
    while (reportContentLines.length > 0 && reportContentLines[reportContentLines.length - 1].trim() === '') {
      reportContentLines.pop();
    }
    while (goldenContentLines.length > 0 && goldenContentLines[goldenContentLines.length - 1].trim() === '') {
      goldenContentLines.pop();
    }

    // Function to normalize error lines for comparison
    const normalizeErrorLine = (line: string): string => {
      // Remove patterns like (m123) or (m1234) at the end of error messages
      let normalized = line.replace(/\s*\(m\d+\)\s*$/, '');

      // Normalize paths - extract just the filename and line number portion
      // Match patterns like /any/path/filename.spin2:line:error:message
      // or C:\any\path\filename.spin2:line:error:message
      const errorPattern = /^.*[/\\]([^/\\]+\.spin2:\d+:error:.*)$/;
      const match = normalized.match(errorPattern);
      if (match) {
        normalized = match[1]; // Just keep filename.spin2:line:error:message
      }
      // Trim any trailing whitespace
      normalized = normalized.trim();

      return normalized;
    };

    // Only log details when there's a problem
    const debugComparison = false; // Set to true for debugging

    // Compare the filtered content of both files
    filesMatchStatus = reportContentLines.length == goldenContentLines.length;
    if (filesMatchStatus == true) {
      // line count is SAME, now do more detailed match
      // Compare each line individually, normalizing paths and stripping location markers
      for (let i = 0; i < reportContentLines.length; i++) {
        const reportLineNormalized = normalizeErrorLine(reportContentLines[i]);
        const goldenLineNormalized = normalizeErrorLine(goldenContentLines[i]);

        if (reportLineNormalized !== goldenLineNormalized) {
          console.log(`compareExceptionFiles: Mismatch at line ${i}:`);
          console.log(`  Report: [${reportContentLines[i]}]`);
          console.log(`  Golden: [${goldenContentLines[i]}]`);
          console.log(`  Report normalized: [${reportLineNormalized}]`);
          console.log(`  Golden normalized: [${goldenLineNormalized}]`);
          filesMatchStatus = false;
          break;
        }
      }
      if (filesMatchStatus && debugComparison) {
        console.log(`compareExceptionFiles: All ${reportContentLines.length} lines match`);
      }
    } else {
      console.log(`compareExceptionFiles: Line count mismatch: report=${reportContentLines.length}, golden=${goldenContentLines.length}`);
    }
  }
  return filesMatchStatus;
}

export function compareListingFiles(reportFSpec: string, goldenFSpec: string, stringsToExlude?: string[]): boolean {
  let filesMatchStatus: boolean = false;
  let inputFileCount: number = 0;
  if (fs.existsSync(reportFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing compile output [${reportFSpec}]`);
  }
  if (fs.existsSync(goldenFSpec)) {
    inputFileCount++;
  } else {
    console.error(`ERROR: missing GOLDEN output [${goldenFSpec}]`);
  }
  const isPreprocessorReport: boolean = reportFSpec.endsWith('.pre');
  if (inputFileCount == 2) {
    // Read the report file and split into lines
    const reportContentLines = fs.readFileSync(reportFSpec, 'utf8').split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.length > 0);
    // Read the golden file and split into lines (handle different line endings)
    const goldenContentLines = fs.readFileSync(goldenFSpec, 'utf8').split(/\r\n|\r|\n/).map(line => line.trim()).filter(line => line.length > 0);

    // Strings to exclude from comparison
    const filterStrings: string[] = stringsToExlude !== undefined ? stringsToExlude : ['Redundant OBJ bytes removed'];

    // Filter out lines based on exclusion criteria
    const reportFiltered = reportContentLines.filter((line) => !filterStrings.some((excludeString) => line.startsWith(excludeString)));
    const goldenFiltered = goldenContentLines.filter((line) => !filterStrings.some((excludeString) => line.startsWith(excludeString)));

    // Compare the filtered content of both files
    // NOPE, not good enough:  filesMatchStatus = reportFiltered.join('\n') === goldenFiltered.join('\n');
    filesMatchStatus = reportFiltered.length == goldenFiltered.length;
    if (filesMatchStatus == true) {
      // line count is SAME, now do more detaile match
      if (isPreprocessorReport) {
        filesMatchStatus = comparePreprocessOutput(reportFiltered, goldenFiltered);
      } else {
        filesMatchStatus = compareConFloatValues(reportFiltered, goldenFiltered);
      }
    }
    if (filesMatchStatus == false) {
      const listingFName = path.basename(reportFSpec);
      const goldFName = path.basename(goldenFSpec);
      console.error(`ERROR: don't match: [${listingFName}](${reportFiltered.length}) <=> [${goldFName}](${goldenFiltered.length})`);
      /*
        for (let index = 0; index < 5; index++) {
          const lhs: string = reportContentLines[index];
          const rhs: string = goldenContentLines[index];
          console.log(`lhs=[${lhs}](${lhs.length}), rhs[${rhs}](${rhs.length})`);
        }

      */
    }
  }
  return filesMatchStatus;
}

function comparePreprocessOutput(compileLines: string[], goldenLines: string[]): boolean {
  let matchStatus: boolean = false;
  if (compileLines.length == goldenLines.length) {
    for (let index = 0; index < compileLines.length; index++) {
      const compLine: string = compileLines[index];
      const goldLine: string = goldenLines[index];
      matchStatus = compLine === goldLine;
      if (matchStatus == false) {
        // on first non-match, break! we have answer
        console.error(`ERROR: rprt: [${compLine}](${compLine.length}) <=> `);
        console.error(`ERROR: GOLD: [${goldLine}](${goldLine.length})`);
        break;
      }
    }
  }
  return matchStatus;
}

function compareConFloatValues(compileLines: string[], goldenLines: string[]): boolean {
  let matchStatus: boolean = false;
  if (compileLines.length == goldenLines.length) {
    for (let index = 0; index < compileLines.length; index++) {
      const compLine: string = compileLines[index];
      const goldLine: string = goldenLines[index];
      matchStatus = compLine === goldLine;
      if (compLine.includes('CON_FLOAT')) {
        // diff float hex strings (can be +/- 1)
        // LHS:  TYPE: CON_FLOAT       VALUE: 40C90FDB          NAME: TWOPI (...FDB, ...FDA or ...FD9 should pass!)
        // RHS:  TYPE: CON_FLOAT       VALUE: 40C90FDA          NAME: TWOPI
        // Regular expression to extract TYPE, VALUE, and NAME
        const regex = /TYPE:\s*(\w+)\s+VALUE:\s*([0-9A-F]+)\s+NAME:\s*(\w+)/;

        // Extracting information from both lines
        const goldMatch = goldLine.match(regex);
        const compMatch = compLine.match(regex);
        if (goldMatch !== null && compMatch !== null) {
          // have good match values, let's see what we have

          // Destructuring to get TYPE, VALUE, and NAME from matches
          const [, goldType, goldValue, goldName] = goldMatch;
          const [, compType, compValue, compName] = compMatch;

          // Compare TYPE and NAME for equality
          if (goldType === compType && goldName === compName) {
            // have matching type and name, now check values

            // Convert VALUE from hex string to number and compare within +/- 1 range
            const goldValueNum = parseInt(goldValue, 16);
            const compValueNum = parseInt(compValue, 16);

            matchStatus = Math.abs(goldValueNum - compValueNum) <= 1;
          }
        }
      } else if (compLine.includes('CLKMODE_')) {
        // diff strings: this pair can pass ( our compiler has diff default clock value)
        // LHS:  TYPE: CON             VALUE: 0000000A          NAME: CLKMODE_ (0000000A should pass when other is 00000000)
        // RHS:  TYPE: CON             VALUE: 00000000          NAME: CLKMODE_
        const regex = /TYPE:\s*(\w+)\s*VALUE:\s*([0-9A-F]+)\s*NAME:\s*(\w+)/;
        const goldMatch = goldLine.match(regex);
        const compMatch = compLine.match(regex);
        if (goldMatch !== null && compMatch !== null) {
          // have good match values, let's see what we have

          // Destructuring to get TYPE, VALUE, and NAME from matches
          const [, goldType, goldValue, goldName] = goldMatch;
          const [, compType, compValue, compName] = compMatch;

          // Compare TYPE and NAME for equality
          if (goldType === compType && goldName === compName) {
            // have matching type and name, now check values

            // ensure we have expected values
            matchStatus = compValue === goldValue || (compValue === '0000000A' && goldValue === '00000000');
            //console.log(
            //  ` -- name=[${compName},${goldName}], type=[${compType},${goldType}], value=[${compValue},${goldValue}], matchStatus=(${matchStatus})`
            //);
          }
        }
      } else if (compLine.includes('CLKMODE:')) {
        // diff strings: this pair can pass ( our compiler has diff default clock value)
        // LHS:  CLKMODE:   $0000000A ($0000000A should pass when other is $00000000)
        // RHS:  CLKMODE:   $00000000
        const regex = /([A-Z]+):\s*\$(\w+)/;
        const goldMatch = goldLine.match(regex);
        const compMatch = compLine.match(regex);
        if (goldMatch !== null && compMatch !== null) {
          // have good match values, let's see what we have

          // Destructuring to get TYPE, VALUE, and NAME from matches
          const [, goldName, goldValue] = goldMatch;
          const [, compName, compValue] = compMatch;

          // Compare NAME for equality
          if (goldName === compName) {
            // have matching type and name, now check values

            // ensure we have expected values, less the '$'
            matchStatus = compValue === goldValue || (compValue === '0000000A' && goldValue === '00000000');
            //console.log(` -- name=[${compName},${goldName}], value=[${compValue},${goldValue}], matchStatus=(${matchStatus})`);
          }
        }
      } else if (compLine.includes('XINFREQ:')) {
        // diff strings: this pair can pass ( our compiler has diff default clock value)
        // LHS:  XINFREQ:  20,000,000 (20,000,000 should pass when other is 0)
        // RHS:  XINFREQ:           0
        const regex = /([A-Z]+):\s*([0-9,]+)/;
        const goldMatch = goldLine.match(regex);
        const compMatch = compLine.match(regex);
        if (goldMatch !== null && compMatch !== null) {
          // have good match values, let's see what we have

          // Destructuring to get TYPE, VALUE, and NAME from matches
          const [, goldName, goldValue] = goldMatch;
          const [, compName, compValue] = compMatch;

          // Compare NAME for equality
          if (goldName === compName) {
            // have matching type and name, now check values

            // ensure we have expected values
            matchStatus = compValue === goldValue || (compValue === '20,000,000' && goldValue === '0');
            //console.log(` -- name=[${compName},${goldName}], value=[${compValue},${goldValue}], matchStatus=(${matchStatus})`);
          }
        }
      } else if (compLine.includes('TYPE:') && compLine.includes('VALUE:')) {
        // Handle all other symbol values with 1-bit tolerance
        // This catches TYPE: CON_INT, TYPE: OBJ_CON_INT, etc.
        const regex = /TYPE:\s*(\S+)\s+VALUE:\s*([0-9A-F]+)\s+NAME:\s*(.+?)(?:\s|$)/;

        const goldMatch = goldLine.match(regex);
        const compMatch = compLine.match(regex);

        if (goldMatch !== null && compMatch !== null) {
          const [, goldType, goldValue, goldName] = goldMatch;
          const [, compType, compValue, compName] = compMatch;

          // Compare TYPE and NAME for equality
          if (goldType === compType && goldName === compName) {
            // Convert VALUE from hex string to number and compare within +/- 1 range
            const goldValueNum = parseInt(goldValue, 16);
            const compValueNum = parseInt(compValue, 16);

            // Allow exact match or 1-bit difference
            matchStatus = Math.abs(goldValueNum - compValueNum) <= 1;
          }
        }
      }
      if (matchStatus == false) {
        // on first non-match, break! we have answer
        console.error(`  Mismatch at line ${index}:`);
        console.error(`    Report: [${compLine}]`);
        console.error(`    Golden: [${goldLine}]`);
        break;
      }
    }
  }
  return matchStatus;
}

export function removeExistingFiles(fileSpecList: string[]) {
  for (let index = 0; index < fileSpecList.length; index++) {
    const fileSpec = fileSpecList[index];
    if (fs.existsSync(fileSpec)) {
      fs.unlinkSync(fileSpec);
    }
  }
}

export function removeExistingFile(fileSpec: string) {
  if (fs.existsSync(fileSpec)) {
    fs.unlinkSync(fileSpec);
  }
}

export function appendDiagnosticString(origString: string, appendString: string, separator: string): string {
  let longerString: string = appendString;
  if (origString.length > 0) {
    longerString = `${origString}${separator}${appendString}`;
  }
  return longerString;
}
