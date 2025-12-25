#!/usr/bin/env npx ts-node
/**
 * Error Code Audit Script
 *
 * Scans compiler source files for error messages and validates:
 * 1. No duplicate error codes (same code used in multiple places)
 * 2. Duplicate messages have unique codes to distinguish them
 *
 * Run: npx ts-node scripts/audit-error-codes.ts
 * Or:  npm run audit-errors
 */

import * as fs from 'fs';
import * as path from 'path';

interface ErrorInfo {
  file: string;
  line: number;
  message: string;
  code: string | null;
}

const SRC_DIR = path.join(__dirname, '..', 'src', 'classes');

// Files to scan for error messages
const FILES_TO_SCAN = [
  'spinResolver.ts',
  'spinElementizer.ts',
  'spin2Parser.ts',
  'compiler.ts',
  'spinDocument.ts',
  'spinFiles.ts',
  'objectImage.ts',
  'objectStructures.ts',
  'debugData.ts'
];

function extractErrors(filePath: string): ErrorInfo[] {
  const errors: ErrorInfo[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);

  // Match throw new Error('...') or throw new Error(`...`)
  const errorRegex = /throw new Error\(['`](.+?)['`]\)/g;
  const codeRegex = /\(m(\d+)\)/;

  lines.forEach((line, index) => {
    // Skip commented-out lines
    if (line.trim().startsWith('//')) {
      return;
    }
    let match;
    while ((match = errorRegex.exec(line)) !== null) {
      const message = match[1];
      const codeMatch = message.match(codeRegex);

      errors.push({
        file: fileName,
        line: index + 1,
        message: message,
        code: codeMatch ? `m${codeMatch[1]}` : null
      });
    }
  });

  return errors;
}

function normalizeMessage(msg: string): string {
  // Remove error code for comparison
  return msg.replace(/\s*\(m\d+\)$/, '').trim();
}

function audit(): boolean {
  let hasIssues = false;
  const allErrors: ErrorInfo[] = [];

  console.log('=== PNut-TS Error Code Audit ===\n');

  // Collect all errors
  for (const file of FILES_TO_SCAN) {
    const filePath = path.join(SRC_DIR, file);
    if (fs.existsSync(filePath)) {
      const errors = extractErrors(filePath);
      allErrors.push(...errors);
    }
  }

  console.log(`Found ${allErrors.length} error statements across ${FILES_TO_SCAN.length} files.\n`);

  // Check 1: Find duplicate error codes
  console.log('--- Check 1: Duplicate Error Codes ---');
  const codeToErrors = new Map<string, ErrorInfo[]>();

  for (const error of allErrors) {
    if (error.code) {
      const existing = codeToErrors.get(error.code) || [];
      existing.push(error);
      codeToErrors.set(error.code, existing);
    }
  }

  let duplicateCodeCount = 0;
  for (const [code, errors] of codeToErrors) {
    if (errors.length > 1) {
      // Check if they're the same message (allowed) or different (not allowed)
      const normalizedMessages = errors.map((e) => normalizeMessage(e.message));
      const uniqueMessages = new Set(normalizedMessages);

      if (uniqueMessages.size > 1) {
        hasIssues = true;
        duplicateCodeCount++;
        console.log(`\nISSUE: Code (${code}) used for DIFFERENT messages:`);
        for (const error of errors) {
          console.log(`  ${error.file}:${error.line}: "${normalizeMessage(error.message)}"`);
        }
      }
    }
  }

  if (duplicateCodeCount === 0) {
    console.log('OK: No error codes used for different messages.\n');
  } else {
    console.log(`\nFound ${duplicateCodeCount} codes used for different messages.\n`);
  }

  // Check 2: Find duplicate messages missing unique codes
  console.log('--- Check 2: Duplicate Messages Missing Codes ---');
  const messageToErrors = new Map<string, ErrorInfo[]>();

  for (const error of allErrors) {
    const normalized = normalizeMessage(error.message);
    const existing = messageToErrors.get(normalized) || [];
    existing.push(error);
    messageToErrors.set(normalized, existing);
  }

  let missingCodeCount = 0;
  for (const [message, errors] of messageToErrors) {
    if (errors.length > 1) {
      // Multiple occurrences - check if they all have codes
      const withoutCodes = errors.filter((e) => e.code === null);
      const withCodes = errors.filter((e) => e.code !== null);

      if (withoutCodes.length > 0) {
        // Some or all are missing codes
        if (withoutCodes.length === errors.length) {
          // ALL missing codes
          hasIssues = true;
          missingCodeCount++;
          console.log(`\nISSUE: Duplicate message with NO codes (needs ${errors.length} unique codes):`);
          console.log(`  Message: "${message}"`);
          for (const error of errors) {
            console.log(`  - ${error.file}:${error.line}`);
          }
        } else {
          // Some have codes, some don't
          hasIssues = true;
          missingCodeCount++;
          console.log(`\nISSUE: Duplicate message with INCONSISTENT codes:`);
          console.log(`  Message: "${message}"`);
          for (const error of errors) {
            const codeStr = error.code ? `(${error.code})` : '(NO CODE)';
            console.log(`  - ${error.file}:${error.line} ${codeStr}`);
          }
        }
      } else {
        // All have codes - verify they're unique
        const codes = withCodes.map((e) => e.code);
        const uniqueCodes = new Set(codes);
        if (uniqueCodes.size !== codes.length) {
          hasIssues = true;
          missingCodeCount++;
          console.log(`\nISSUE: Duplicate message with SAME code (need unique codes):`);
          console.log(`  Message: "${message}"`);
          for (const error of errors) {
            console.log(`  - ${error.file}:${error.line} (${error.code})`);
          }
        }
      }
    }
  }

  if (missingCodeCount === 0) {
    console.log('OK: All duplicate messages have unique codes.\n');
  } else {
    console.log(`\nFound ${missingCodeCount} duplicate messages needing attention.\n`);
  }

  // Summary
  console.log('=== Summary ===');
  const uniqueCodes = new Set(allErrors.filter((e) => e.code).map((e) => e.code));
  console.log(`Total error statements: ${allErrors.length}`);
  console.log(`Unique error codes: ${uniqueCodes.size}`);
  console.log(`Errors without codes: ${allErrors.filter((e) => !e.code).length}`);

  if (hasIssues) {
    console.log('\nAUDIT FAILED: Issues found that need to be fixed before release.');
    return false;
  } else {
    console.log('\nAUDIT PASSED: All error codes are properly assigned.');
    return true;
  }
}

// Run audit
const success = audit();
process.exit(success ? 0 : 1);
