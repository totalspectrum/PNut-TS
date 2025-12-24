#!/usr/bin/env node
/**
 * Script to CORRECT effects in PASM2-Instruction-Database.json
 * Based on: Actual PNut-TS compiler implementation in spinResolver.ts and parseUtils.ts
 *
 * This script corrects the previous update that incorrectly added all effects (WC, WZ, WCZ)
 * to instructions that don't support all three.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../databases/PASM2-Instruction-Database.json');

// Standard effect objects
const WC_EFFECT = {
  name: "wc",
  symbol: "WC",
  value: 2,  // 0b10
  description: "Write Carry flag"
};

const WZ_EFFECT = {
  name: "wz",
  symbol: "WZ",
  value: 1,  // 0b01
  description: "Write Zero flag"
};

const WCZ_EFFECT = {
  name: "wcz",
  symbol: "WCZ",
  value: 3,  // 0b11
  description: "Write Carry and Zero flags"
};

// Extended effects for TEST* instructions
const ANDC_EFFECT = {
  name: "andc",
  symbol: "ANDC",
  value: 4,  // 0b0100
  description: "AND into Carry flag"
};

const ANDZ_EFFECT = {
  name: "andz",
  symbol: "ANDZ",
  value: 5,  // 0b0101
  description: "AND into Zero flag"
};

const ORC_EFFECT = {
  name: "orc",
  symbol: "ORC",
  value: 8,  // 0b1000
  description: "OR into Carry flag"
};

const ORZ_EFFECT = {
  name: "orz",
  symbol: "ORZ",
  value: 9,  // 0b1001
  description: "OR into Zero flag"
};

const XORC_EFFECT = {
  name: "xorc",
  symbol: "XORC",
  value: 12,  // 0b1100
  description: "XOR into Carry flag"
};

const XORZ_EFFECT = {
  name: "xorz",
  symbol: "XORZ",
  value: 13,  // 0b1101
  description: "XOR into Zero flag"
};

// Instructions that use tryWCZ() - ONLY support WCZ (not WC or WZ individually)
// From spinResolver.ts: operand_bitx and operand_pinop call tryWCZ()
// tryWCZ() only accepts value == 0b11 (WCZ)
const WCZ_ONLY_INSTRUCTIONS = [
  // BIT instructions (operand_bitx)
  'BITC', 'BITH', 'BITL', 'BITNC', 'BITNOT', 'BITNZ', 'BITRND', 'BITZ',
  // DIR instructions (operand_pinop)
  'DIRC', 'DIRH', 'DIRL', 'DIRNC', 'DIRNOT', 'DIRNZ', 'DIRRND', 'DIRZ',
  // DRV instructions (operand_pinop)
  'DRVC', 'DRVH', 'DRVL', 'DRVNC', 'DRVNOT', 'DRVNZ', 'DRVRND', 'DRVZ',
  // FLT instructions (operand_pinop)
  'FLTC', 'FLTH', 'FLTL', 'FLTNC', 'FLTNOT', 'FLTNZ', 'FLTRND', 'FLTZ',
  // OUT instructions (operand_pinop)
  'OUTC', 'OUTH', 'OUTL', 'OUTNC', 'OUTNOT', 'OUTNZ', 'OUTRND', 'OUTZ'
];

// Instructions with allowedEffects = 0b10 (WC only)
// From parseUtils.ts: these have 0b10 as their effects field
const WC_ONLY_INSTRUCTIONS = [
  'COGID',      // setAsmcodeValue(0b000000001, 0b10, ...)
  'COGINIT',    // setAsmcodeValue(0b110011100, 0b10, ...)
  'GETCT',      // setAsmcodeValue(0b000011010, 0b10, ...)
  'LOCKNEW',    // setAsmcodeValue(0b000000100, 0b10, ...)
  'LOCKREL',    // setAsmcodeValue(0b000000111, 0b10, ...)
  'LOCKTRY',    // setAsmcodeValue(0b000000110, 0b10, ...)
  'MODC',       // setAsmcodeValue(0b110001011, 0b10, ...)
  'RDPIN',      // setAsmcodeValue(0b101010110, 0b10, ...)
  'RQPIN'       // setAsmcodeValue(0b101010100, 0b10, ...)
];

// Instructions with allowedEffects = 0b01 (WZ only)
// From parseUtils.ts: these have 0b01 as their effects field
const WZ_ONLY_INSTRUCTIONS = [
  'MODZ',       // setAsmcodeValue(0b110001011, 0b01, ...)
  'MUL',        // setAsmcodeValue(0b101000000, 0b01, ...)
  'MULS',       // setAsmcodeValue(0b101000010, 0b01, ...)
  'SCA',        // setAsmcodeValue(0b101000100, 0b01, ...)
  'SCAS'        // setAsmcodeValue(0b101000110, 0b01, ...)
];

// Branch instructions that support WC, WZ, WCZ in register mode
// From spinResolver.ts: operand_call and operand_jmp set allowedEffects = 0b11 in reg mode
const BRANCH_WCZ_INSTRUCTIONS = [
  'CALL', 'CALLA', 'CALLB', 'CALLD', 'JMP'
];

// TEST* instructions use getCorZ() which supports extended effects but NOT WCZ
// From spinResolver.ts line 2841: (Number(this.currElement.value) != 0b11)
// Throws: "Expected WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, or XORZ"
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

function setWczOnly(instruction) {
  instruction.effects = [
    { ...WCZ_EFFECT }
  ];
  instruction.encoding.effects = 3; // 0b11 - but only WCZ is valid
}

function setWcOnly(instruction) {
  instruction.effects = [
    { ...WC_EFFECT }
  ];
  instruction.encoding.effects = 2; // 0b10
}

function setWzOnly(instruction) {
  instruction.effects = [
    { ...WZ_EFFECT }
  ];
  instruction.encoding.effects = 1; // 0b01
}

function setAllEffects(instruction) {
  instruction.effects = [
    { ...WC_EFFECT },
    { ...WZ_EFFECT },
    { ...WCZ_EFFECT }
  ];
  instruction.encoding.effects = 3; // 0b11
}

function setExtendedEffects(instruction) {
  // WC, WZ, plus ANDC, ANDZ, ORC, ORZ, XORC, XORZ - but NOT WCZ
  instruction.effects = [
    { ...WC_EFFECT },
    { ...WZ_EFFECT },
    { ...ANDC_EFFECT },
    { ...ANDZ_EFFECT },
    { ...ORC_EFFECT },
    { ...ORZ_EFFECT },
    { ...XORC_EFFECT },
    { ...XORZ_EFFECT }
  ];
  instruction.encoding.effects = 3; // Encoding supports both C and Z bits
}

function main() {
  console.log('Loading PASM2 Instruction Database...');
  const db = loadDatabase();

  let updatedCount = 0;
  let notFoundCount = 0;
  const notFound = [];

  // 1. Fix WCZ-only instructions (BIT*, DIR*, DRV*, FLT*, OUT*)
  console.log('\n=== Setting WCZ-ONLY effects (tryWCZ() instructions) ===');
  console.log('These use tryWCZ() which only accepts WCZ, not WC or WZ individually\n');
  for (const mnemonic of WCZ_ONLY_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setWczOnly(instruction);
      console.log(`  Corrected: ${mnemonic} -> WCZ only`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // 2. Fix WC-only instructions
  console.log('\n=== Setting WC-ONLY effects (allowedEffects = 0b10) ===');
  for (const mnemonic of WC_ONLY_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setWcOnly(instruction);
      console.log(`  Corrected: ${mnemonic} -> WC only`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // 3. Fix WZ-only instructions
  console.log('\n=== Setting WZ-ONLY effects (allowedEffects = 0b01) ===');
  for (const mnemonic of WZ_ONLY_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setWzOnly(instruction);
      console.log(`  Corrected: ${mnemonic} -> WZ only`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // 4. Branch instructions - these are correct with WC, WZ, WCZ (reg mode)
  console.log('\n=== Verifying branch instructions (WC, WZ, WCZ in reg mode) ===');
  for (const mnemonic of BRANCH_WCZ_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setAllEffects(instruction);
      console.log(`  Verified: ${mnemonic} -> WC, WZ, WCZ (register mode)`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // 5. Fix TEST* instructions - extended effects but NOT WCZ
  console.log('\n=== Setting extended effects for TEST* instructions ===');
  console.log('These use getCorZ() which supports WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ');
  console.log('But explicitly rejects WCZ (value 0b11)\n');
  for (const mnemonic of EXTENDED_EFFECT_INSTRUCTIONS) {
    const instruction = findInstruction(db, mnemonic);
    if (instruction) {
      setExtendedEffects(instruction);
      console.log(`  Corrected: ${mnemonic} -> WC, WZ, ANDC, ANDZ, ORC, ORZ, XORC, XORZ (no WCZ)`);
      updatedCount++;
    } else {
      console.log(`  NOT FOUND: ${mnemonic}`);
      notFound.push(mnemonic);
      notFoundCount++;
    }
  }

  // Update metadata
  db.metadata.lastModified = new Date().toISOString();
  db.metadata.modificationNote = 'CORRECTED effects based on actual PNut-TS compiler implementation (spinResolver.ts/parseUtils.ts)';

  // Save the updated database
  console.log('\nSaving corrected database...');
  saveDatabase(db);

  // Summary
  console.log('\n========================================');
  console.log('=== CORRECTION SUMMARY ===');
  console.log('========================================');
  console.log(`Total corrected: ${updatedCount} instructions`);
  console.log(`Not found: ${notFoundCount} instructions`);
  if (notFound.length > 0) {
    console.log(`Missing: ${notFound.join(', ')}`);
  }

  console.log('\n=== EFFECT CATEGORIES ===');
  console.log(`WCZ-only (40 instructions): BIT*, DIR*, DRV*, FLT*, OUT*`);
  console.log(`WC-only (9 instructions): COGID, COGINIT, GETCT, LOCKNEW, LOCKREL, LOCKTRY, MODC, RDPIN, RQPIN`);
  console.log(`WZ-only (5 instructions): MODZ, MUL, MULS, SCA, SCAS`);
  console.log(`WC/WZ/WCZ (5 instructions): CALL, CALLA, CALLB, CALLD, JMP (register mode)`);
  console.log(`Extended (4 instructions): TESTP, TESTPN, TESTB, TESTBN (WC, WZ + ANDC/Z, ORC/Z, XORC/Z)`);

  console.log('\nDatabase corrected successfully!');
}

main();
