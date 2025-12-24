#!/usr/bin/env node
/**
 * Script to update missing effects in PASM2-Instruction-Database.json
 * Based on: DOCs/language-specification/REQUESTS/PNUT-TS-MISSING-EFFECTS.md
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../databases/PASM2-Instruction-Database.json');

// Standard effect objects
const WC_EFFECT = {
  name: "wc",
  symbol: "WC",
  value: 1,
  description: "Write Carry flag"
};

const WZ_EFFECT = {
  name: "wz",
  symbol: "WZ",
  value: 2,
  description: "Write Zero flag"
};

const WCZ_EFFECT = {
  name: "wcz",
  symbol: "WCZ",
  value: 3,
  description: "Write Carry and Zero flags"
};

// Instructions that need all effects (WC, WZ, WCZ) - currently have empty effects
const NEED_ALL_EFFECTS = [
  // BIT instructions
  'BITC', 'BITH', 'BITL', 'BITNC', 'BITNOT', 'BITNZ', 'BITRND', 'BITZ',
  // DIR instructions
  'DIRC', 'DIRH', 'DIRL', 'DIRNC', 'DIRNOT', 'DIRNZ', 'DIRRND', 'DIRZ',
  // DRV instructions
  'DRVC', 'DRVH', 'DRVL', 'DRVNC', 'DRVNOT', 'DRVNZ', 'DRVRND', 'DRVZ',
  // FLT instructions
  'FLTC', 'FLTH', 'FLTL', 'FLTNC', 'FLTNOT', 'FLTNZ', 'FLTRND', 'FLTZ',
  // OUT instructions
  'OUTC', 'OUTH', 'OUTL', 'OUTNC', 'OUTNOT', 'OUTNZ', 'OUTRND', 'OUTZ',
  // Branch instructions
  'CALL', 'CALLA', 'CALLB', 'CALLD', 'JMP'
];

// Instructions that have WZ but need to ADD WC (result: WC, WZ, WCZ)
const HAS_WZ_NEED_WC = [
  'COGID', 'COGINIT', 'GETCT', 'LOCKNEW', 'LOCKREL', 'LOCKTRY', 'MODC', 'RDPIN', 'RQPIN'
];

// Instructions that have WC but need to ADD WZ (result: WC, WZ, WCZ)
const HAS_WC_NEED_WZ = [
  'MODZ', 'MUL', 'MULS', 'SCA', 'SCAS'
];

// Note: TESTP, TESTPN, TESTB, TESTBN use extended effects (ANDC/ANDZ/ORC/ORZ/XORC/XORZ)
// These require special handling - they don't use standard WC/WZ/WCZ
// The CSV shows {WCZ} in syntax but they actually use extended effect mechanism
// We'll add them for documentation completeness but note the special handling
const EXTENDED_EFFECT_INSTRUCTIONS = [
  'TESTP', 'TESTPN', 'TESTB', 'TESTBN'
];

function loadDatabase() {
  const content = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(content);
}

function saveDatabase(db) {
  const content = JSON.stringify(db, null, 2);
  fs.writeFileSync(DB_PATH, content, 'utf8');
}

function findInstruction(db, mnemonic) {
  return db.instructions.find(i => i.mnemonic === mnemonic);
}

function setAllEffects(instruction) {
  instruction.effects = [
    { ...WC_EFFECT },
    { ...WZ_EFFECT },
    { ...WCZ_EFFECT }
  ];
  instruction.encoding.effects = 3; // 0b11
}

function addWcEffect(instruction) {
  // Check if WC already exists
  const hasWc = instruction.effects.some(e => e.symbol === 'WC');
  if (!hasWc) {
    instruction.effects.unshift({ ...WC_EFFECT }); // Add WC at beginning
  }
  // Add WCZ if not present
  const hasWcz = instruction.effects.some(e => e.symbol === 'WCZ');
  if (!hasWcz) {
    instruction.effects.push({ ...WCZ_EFFECT });
  }
  instruction.encoding.effects = 3; // 0b11
}

function addWzEffect(instruction) {
  // Check if WZ already exists
  const hasWz = instruction.effects.some(e => e.symbol === 'WZ');
  if (!hasWz) {
    // Insert WZ after WC (if present) or at beginning
    const wcIndex = instruction.effects.findIndex(e => e.symbol === 'WC');
    if (wcIndex >= 0) {
      instruction.effects.splice(wcIndex + 1, 0, { ...WZ_EFFECT });
    } else {
      instruction.effects.unshift({ ...WZ_EFFECT });
    }
  }
  // Add WCZ if not present
  const hasWcz = instruction.effects.some(e => e.symbol === 'WCZ');
  if (!hasWcz) {
    instruction.effects.push({ ...WCZ_EFFECT });
  }
  instruction.encoding.effects = 3; // 0b11
}

function main() {
  console.log('Loading PASM2 Instruction Database...');
  const db = loadDatabase();

  let updatedCount = 0;
  let notFoundCount = 0;
  const notFound = [];

  // Process instructions needing all effects
  console.log('\nAdding WC/WZ/WCZ to instructions with empty effects...');
  for (const mnemonic of NEED_ALL_EFFECTS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setAllEffects(instruction);
      console.log(`  Updated: ${mnemonic}`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // Process instructions with WZ that need WC
  console.log('\nAdding WC to instructions that only have WZ...');
  for (const mnemonic of HAS_WZ_NEED_WC) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      addWcEffect(instruction);
      console.log(`  Updated: ${mnemonic}`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // Process instructions with WC that need WZ
  console.log('\nAdding WZ to instructions that only have WC...');
  for (const mnemonic of HAS_WC_NEED_WZ) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      addWzEffect(instruction);
      console.log(`  Updated: ${mnemonic}`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // Handle extended effect instructions (TESTP, etc.)
  // Note: These use extended effects mechanism, but we add standard effects for completeness
  console.log('\nHandling extended effect instructions (TESTP, TESTB, etc.)...');
  console.log('  NOTE: These instructions use extended effects (ANDC/ANDZ/ORC/ORZ/XORC/XORZ)');
  console.log('  Adding standard effects for documentation completeness...');
  for (const mnemonic of EXTENDED_EFFECT_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setAllEffects(instruction);
      console.log(`  Updated: ${mnemonic}`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // Update metadata
  db.metadata.lastModified = new Date().toISOString();
  db.metadata.modificationNote = 'Updated effect flags per PNUT-TS-MISSING-EFFECTS.md analysis';

  // Save the updated database
  console.log('\nSaving updated database...');
  saveDatabase(db);

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Updated: ${updatedCount} instructions`);
  console.log(`Not found: ${notFoundCount} instructions`);
  if (notFound.length > 0) {
    console.log(`Missing: ${notFound.join(', ')}`);
  }
  console.log('\nDatabase updated successfully!');
}

main();
