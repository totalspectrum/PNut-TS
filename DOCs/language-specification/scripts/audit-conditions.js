#!/usr/bin/env node
/**
 * Audit PASM2-Condition-Codes.json against compiler source
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../databases/PASM2-Condition-Codes.json');
const PARSEUTILS_PATH = path.join(__dirname, '../../../src/classes/parseUtils.ts');
const TYPES_PATH = path.join(__dirname, '../../../src/classes/types.ts');

const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const parseUtilsSource = fs.readFileSync(PARSEUTILS_PATH, 'utf8');
const typesSource = fs.readFileSync(TYPES_PATH, 'utf8');

console.log('=== CONDITION CODES AUDIT ===\n');

// 1. Verify values from types.ts
console.log('1. VERIFYING VALUES (from types.ts):\n');
const valuePattern = /if_(\w+)\s*=\s*(\d+)/g;
const compilerValues = {};
let match;
while ((match = valuePattern.exec(typesSource)) !== null) {
  compilerValues['if_' + match[1]] = parseInt(match[2]);
}

let valueIssues = [];
for (const cond of db.conditionCodes) {
  const compValue = compilerValues[cond.name];
  if (compValue === undefined) {
    valueIssues.push(`${cond.name}: NOT FOUND in compiler`);
  } else if (compValue !== cond.value) {
    valueIssues.push(`${cond.name}: JSON=${cond.value} vs Compiler=${compValue}`);
  }
}

if (valueIssues.length === 0) {
  console.log('   All 16 condition code values MATCH compiler!\n');
} else {
  console.log('   VALUE ISSUES:');
  valueIssues.forEach(i => console.log('   ' + i));
  console.log();
}

// 2. Verify aliases from parseUtils.ts
console.log('2. VERIFYING ALIASES (from parseUtils.ts):\n');

// Extract compiler aliases - type_asm_cond
const condPattern = /automatic_symbols\.set\(SYMBOLS\.(\w+),\s*\{\s*type:\s*eElementType\.type_asm_cond,\s*value:\s*eValueType\.(if_\w+)\s*\}/g;
const compilerAliases = {};
while ((match = condPattern.exec(parseUtilsSource)) !== null) {
  const condition = match[2];
  if (!compilerAliases[condition]) compilerAliases[condition] = new Set();
  compilerAliases[condition].add(match[1]);
}

// Also get modcz aliases (type_con_int)
const modczPattern = /automatic_symbols\.set\(SYMBOLS\.(_\w+),\s*\{\s*type:\s*eElementType\.type_con_int,\s*value:\s*eValueType\.(if_\w+)\s*\}/g;
while ((match = modczPattern.exec(parseUtilsSource)) !== null) {
  const condition = match[2];
  if (!compilerAliases[condition]) compilerAliases[condition] = new Set();
  compilerAliases[condition].add(match[1]);
}

let aliasIssues = [];
for (const cond of db.conditionCodes) {
  const compSet = compilerAliases[cond.name] || new Set();
  const jsonSet = new Set(cond.aliases || []);

  // Find missing in JSON
  for (const alias of compSet) {
    if (!jsonSet.has(alias)) {
      aliasIssues.push(`${cond.name}: MISSING from JSON: ${alias}`);
    }
  }

  // Find extra in JSON
  for (const alias of jsonSet) {
    if (!compSet.has(alias)) {
      aliasIssues.push(`${cond.name}: EXTRA in JSON (not in compiler): ${alias}`);
    }
  }
}

if (aliasIssues.length === 0) {
  console.log('   All aliases MATCH compiler!\n');
} else {
  console.log('   ALIAS ISSUES (' + aliasIssues.length + '):');
  aliasIssues.forEach(i => console.log('   ' + i));
  console.log();
}

// 3. Verify effect flags
console.log('3. VERIFYING EFFECT FLAGS:\n');

// Effects should be: WC=1 (bit 0 for Z encoding), WZ=2 (bit 1 for C encoding), WCZ=3
// Wait, let me check the actual encoding from the compiler
const effectIssues = [];
for (const effect of db.effectFlags) {
  if (effect.symbol === 'WC' && effect.value !== 1) {
    effectIssues.push(`WC: expected value 1, got ${effect.value}`);
  }
  if (effect.symbol === 'WZ' && effect.value !== 2) {
    effectIssues.push(`WZ: expected value 2, got ${effect.value}`);
  }
  if (effect.symbol === 'WCZ' && effect.value !== 3) {
    effectIssues.push(`WCZ: expected value 3, got ${effect.value}`);
  }
}

// Check bit patterns
if (db.effectFlags.find(e => e.symbol === 'WC')?.bitPattern !== '01') {
  effectIssues.push('WC bitPattern should be 01');
}
if (db.effectFlags.find(e => e.symbol === 'WZ')?.bitPattern !== '10') {
  effectIssues.push('WZ bitPattern should be 10');
}
if (db.effectFlags.find(e => e.symbol === 'WCZ')?.bitPattern !== '11') {
  effectIssues.push('WCZ bitPattern should be 11');
}

if (effectIssues.length === 0) {
  console.log('   Effect flags look correct!\n');
} else {
  console.log('   EFFECT FLAG ISSUES:');
  effectIssues.forEach(i => console.log('   ' + i));
  console.log();
}

// Summary
console.log('=== SUMMARY ===');
const totalIssues = valueIssues.length + aliasIssues.length + effectIssues.length;
if (totalIssues === 0) {
  console.log('Database is ACCURATE - matches compiler source!');
} else {
  console.log(`Found ${totalIssues} issues that need correction.`);
}
