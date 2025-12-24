#!/usr/bin/env node
/**
 * Extract full instruction encodings from PNut-TS compiler source
 * Source: src/classes/parseUtils.ts
 */

const fs = require('fs');
const path = require('path');

const PARSEUTILS_PATH = path.join(__dirname, '../../../src/classes/parseUtils.ts');
const DB_PATH = path.join(__dirname, '../databases/PASM2-Instruction-Database.json');

// Read parseUtils.ts
const parseUtilsSource = fs.readFileSync(PARSEUTILS_PATH, 'utf8');

// Extract all setAsmcodeValue calls
// Pattern: this.asmcodeValues.set(eAsmcode.ac_XXX, setAsmcodeValue(...)); // comment
const asmcodePattern = /this\.asmcodeValues\.set\(eAsmcode\.(ac_\w+),\s*setAsmcodeValue\(([^,]+),\s*([^,]+),\s*eValueType\.(\w+)\)\);\s*\/\/\s*(.+)/g;

// Known enum values for special opcodes (from compiler source)
const specialOpcodes = {
  'eValueType.pp_pusha': { value: 0, description: 'PUSHA alias - expands to WRLONG D/#,PTRA++' },
  'eValueType.pp_pushb': { value: 1, description: 'PUSHB alias - expands to WRLONG D/#,PTRB++' },
  'eValueType.pp_popa': { value: 2, description: 'POPA alias - expands to RDLONG D,--PTRA' },
  'eValueType.pp_popb': { value: 3, description: 'POPB alias - expands to RDLONG D,--PTRB' }
};

const instructions = {};
let match;

while ((match = asmcodePattern.exec(parseUtilsSource)) !== null) {
  const enumName = match[1];
  const opcodeStr = match[2].trim();
  const effectsStr = match[3].trim();
  const operandType = match[4];
  const comment = match[5].trim();

  // Parse opcode (handle binary, decimal, or enum reference)
  let opcode;
  let isAlias = false;
  let aliasInfo = null;

  if (opcodeStr.startsWith('0b')) {
    opcode = parseInt(opcodeStr.slice(2), 2);
  } else if (opcodeStr.startsWith('eValueType.')) {
    isAlias = true;
    aliasInfo = specialOpcodes[opcodeStr] || { value: -1, description: 'Alias instruction' };
    opcode = aliasInfo.value;
  } else {
    opcode = parseInt(opcodeStr);
  }

  // Parse effects
  const effects = effectsStr.startsWith('0b') ? parseInt(effectsStr.slice(2), 2) : parseInt(effectsStr);

  // Extract mnemonic from comment (first word, clean up special cases)
  let mnemonic = comment.split(/\s+/)[0];
  // Handle WMLONG_ -> WMLONG (underscore was just notation)
  if (mnemonic.endsWith('_') && mnemonic !== '_RET_') {
    mnemonic = mnemonic.slice(0, -1);
  }
  // Handle DEBUG() -> DEBUG (parentheses in comment)
  if (mnemonic.endsWith('()')) {
    mnemonic = mnemonic.slice(0, -2);
  }

  instructions[mnemonic] = {
    enumName,
    opcode,
    opcodeBinary: isAlias ? 'alias' : opcode.toString(2).padStart(9, '0'),
    allowedEffects: effects,
    allowedEffectsBinary: effects.toString(2).padStart(2, '0'),
    operandType,
    comment,
    isAlias,
    aliasInfo
  };
}

console.log(`Extracted ${Object.keys(instructions).length} instruction encodings from compiler source\n`);

// Load existing database
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

// Update each instruction with full encoding
let updated = 0;
let notFound = [];

for (const instr of db.instructions) {
  const compilerData = instructions[instr.mnemonic];

  if (compilerData) {
    // Add comprehensive encoding information
    instr.encoding = {
      // Instruction format: EEEE OOOOOOOOO CZ I DDDDDDDDD SSSSSSSSS
      format: "EEEE_OOOOOOOOO_CZ_I_DDDDDDDDD_SSSSSSSSS",
      bitFields: {
        condition: { bits: "31:28", width: 4, description: "Execution condition (EEEE)" },
        opcode: { bits: "27:19", width: 9, description: "Instruction opcode" },
        effectC: { bit: 20, description: "Write C flag when set" },
        effectZ: { bit: 19, description: "Write Z flag when set" },
        immediate: { bit: 18, description: "S is immediate value when set (I)" },
        destination: { bits: "17:9", width: 9, description: "Destination register (D)" },
        source: { bits: "8:0", width: 9, description: "Source register or immediate (S)" }
      },
      opcode: compilerData.isAlias ? {
        isAlias: true,
        aliasDescription: compilerData.aliasInfo?.description || 'Alias instruction',
        aliasIndex: compilerData.opcode
      } : {
        decimal: compilerData.opcode,
        binary: compilerData.opcodeBinary,
        hex: "0x" + compilerData.opcode.toString(16).toUpperCase().padStart(3, '0')
      },
      allowedEffects: {
        value: compilerData.allowedEffects,
        binary: compilerData.allowedEffectsBinary,
        canWriteC: (compilerData.allowedEffects & 0b10) !== 0,
        canWriteZ: (compilerData.allowedEffects & 0b01) !== 0,
        canWriteCZ: compilerData.allowedEffects === 0b11
      },
      operandType: compilerData.operandType,
      compilerEnum: compilerData.enumName,
      syntaxFromCompiler: compilerData.comment
    };
    updated++;
  } else {
    notFound.push(instr.mnemonic);
  }
}

// Update metadata
db.metadata.lastModified = new Date().toISOString();
db.metadata.modificationNote = 'Added full instruction encodings extracted from compiler source (parseUtils.ts)';
db.metadata.encodingSource = 'PNut-TS compiler src/classes/parseUtils.ts';

// Save updated database
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

console.log(`Updated ${updated} instructions with full encoding data`);
if (notFound.length > 0) {
  console.log(`\nNot found in compiler source (${notFound.length}):`);
  console.log(notFound.join(', '));
}

// Show sample output
console.log('\n=== Sample Encoding (ADD) ===');
const addInstr = db.instructions.find(i => i.mnemonic === 'ADD');
if (addInstr) {
  console.log(JSON.stringify(addInstr.encoding, null, 2));
}

console.log('\nDatabase updated successfully!');
