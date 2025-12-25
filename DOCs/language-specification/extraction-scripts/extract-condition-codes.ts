#!/usr/bin/env npx tsx

/**
 * PASM2 Condition Codes and Effect Flags Extractor
 *
 * Extracts complete condition codes and effect flags from PNut-TS compiler
 * as per PASM2-SPIN2-Language-Specification-Extraction-Roadmap.md Phase 2.2
 *
 * Adds condition codes and effect flag specifications to PASM2 database
 */

import * as fs from 'fs';
import * as path from 'path';

// Import types from the compiler
import { eValueType } from '../src/classes/types';

interface ConditionCode {
  name: string;
  symbol: string;
  value: number;
  description: string;
  aliases: string[];
  binaryPattern: string;
  category: string;
}

interface EffectFlag {
  name: string;
  symbol: string;
  value: number;
  description: string;
  bitPattern: string;
}

interface ConditionCodeDatabase {
  metadata: {
    version: string;
    extractedFrom: string;
    extractedAt: string;
    description: string;
    totalConditionCodes: number;
    totalEffectFlags: number;
  };
  conditionCodes: ConditionCode[];
  effectFlags: EffectFlag[];
  conditionCategories: string[];
}

// Base condition codes from eValueType enum with detailed descriptions
const BASE_CONDITIONS: { [key: string]: { value: number; description: string; category: string } } = {
  'if_ret': { value: 0, description: 'Never execute (return/clear condition)', category: 'Special' },
  'if_nc_and_nz': { value: 1, description: 'Execute if not carry AND not zero (greater than)', category: 'Comparison' },
  'if_nc_and_z': { value: 2, description: 'Execute if not carry AND zero', category: 'Logical' },
  'if_nc': { value: 3, description: 'Execute if not carry (greater or equal)', category: 'Comparison' },
  'if_c_and_nz': { value: 4, description: 'Execute if carry AND not zero', category: 'Logical' },
  'if_nz': { value: 5, description: 'Execute if not zero (not equal)', category: 'Comparison' },
  'if_c_ne_z': { value: 6, description: 'Execute if carry not equal to zero', category: 'Logical' },
  'if_nc_or_nz': { value: 7, description: 'Execute if not carry OR not zero', category: 'Logical' },
  'if_c_and_z': { value: 8, description: 'Execute if carry AND zero', category: 'Logical' },
  'if_c_eq_z': { value: 9, description: 'Execute if carry equal to zero', category: 'Logical' },
  'if_z': { value: 10, description: 'Execute if zero (equal)', category: 'Comparison' },
  'if_nc_or_z': { value: 11, description: 'Execute if not carry OR zero (less or equal)', category: 'Comparison' },
  'if_c': { value: 12, description: 'Execute if carry (less than)', category: 'Comparison' },
  'if_c_or_nz': { value: 13, description: 'Execute if carry OR not zero', category: 'Logical' },
  'if_c_or_z': { value: 14, description: 'Execute if carry OR zero (less or equal)', category: 'Comparison' },
  'if_always': { value: 15, description: 'Always execute (unconditional)', category: 'Special' }
};

// Condition code aliases and symbols mapping
const CONDITION_ALIASES: { [symbol: string]: string } = {
  // Assembly condition prefixes
  'IF_NC_AND_NZ': 'if_nc_and_nz',
  'IF_NZ_AND_NC': 'if_nc_and_nz',
  'IF_GT': 'if_nc_and_nz',
  'IF_A': 'if_nc_and_nz',
  'IF_NC_AND_Z': 'if_nc_and_z',
  'IF_Z_AND_NC': 'if_nc_and_z',
  'IF_NC': 'if_nc',
  'IF_GE': 'if_nc',
  'IF_AE': 'if_nc',
  'IF_C_AND_NZ': 'if_c_and_nz',
  'IF_NZ_AND_C': 'if_c_and_nz',
  'IF_NZ': 'if_nz',
  'IF_NE': 'if_nz',
  'IF_C_NE_Z': 'if_c_ne_z',
  'IF_Z_NE_C': 'if_c_ne_z',
  'IF_NC_OR_NZ': 'if_nc_or_nz',
  'IF_NZ_OR_NC': 'if_nc_or_nz',
  'IF_C_AND_Z': 'if_c_and_z',
  'IF_Z_AND_C': 'if_c_and_z',
  'IF_C_EQ_Z': 'if_c_eq_z',
  'IF_Z_EQ_C': 'if_c_eq_z',
  'IF_Z': 'if_z',
  'IF_E': 'if_z',
  'IF_NC_OR_Z': 'if_nc_or_z',
  'IF_Z_OR_NC': 'if_nc_or_z',
  'IF_C': 'if_c',
  'IF_LT': 'if_c',
  'IF_B': 'if_c',
  'IF_C_OR_NZ': 'if_c_or_nz',
  'IF_NZ_OR_C': 'if_c_or_nz',
  'IF_C_OR_Z': 'if_c_or_z',
  'IF_Z_OR_C': 'if_c_or_z',
  'IF_LE': 'if_c_or_z',
  'IF_BE': 'if_c_or_z',
  'IF_ALWAYS': 'if_always',

  // Binary pattern aliases
  'IF_00': 'if_nc_and_nz',
  'IF_01': 'if_nc_and_z',
  'IF_10': 'if_c_and_nz',
  'IF_11': 'if_c_and_z',
  'IF_X0': 'if_nz',
  'IF_X1': 'if_z',
  'IF_0X': 'if_nc',
  'IF_1X': 'if_c',
  'IF_NOT_00': 'if_c_or_z',
  'IF_NOT_01': 'if_c_or_nz',
  'IF_NOT_10': 'if_nc_or_z',
  'IF_NOT_11': 'if_nc_or_nz',
  'IF_SAME': 'if_c_eq_z',
  'IF_DIFF': 'if_c_ne_z',

  // MODCZ constant prefixes (without IF_)
  '_CLR': 'if_ret',
  '_NC_AND_NZ': 'if_nc_and_nz',
  '_NZ_AND_NC': 'if_nc_and_nz',
  '_GT': 'if_nc_and_nz',
  '_NC_AND_Z': 'if_nc_and_z',
  '_Z_AND_NC': 'if_nc_and_z',
  '_NC': 'if_nc',
  '_GE': 'if_nc',
  '_C_AND_NZ': 'if_c_and_nz',
  '_NZ_AND_C': 'if_c_and_nz',
  '_NZ': 'if_nz',
  '_NE': 'if_nz',
  '_C_NE_Z': 'if_c_ne_z',
  '_Z_NE_C': 'if_c_ne_z',
  '_NC_OR_NZ': 'if_nc_or_nz',
  '_NZ_OR_NC': 'if_nc_or_nz',
  '_C_AND_Z': 'if_c_and_z',
  '_Z_AND_C': 'if_c_and_z',
  '_C_EQ_Z': 'if_c_eq_z',
  '_Z_EQ_C': 'if_c_eq_z',
  '_Z': 'if_z',
  '_E': 'if_z',
  '_NC_OR_Z': 'if_nc_or_z',
  '_Z_OR_NC': 'if_nc_or_z',
  '_C': 'if_c',
  '_LT': 'if_c',
  '_C_OR_NZ': 'if_c_or_nz',
  '_NZ_OR_C': 'if_c_or_nz',
  '_C_OR_Z': 'if_c_or_z',
  '_Z_OR_C': 'if_c_or_z',
  '_LE': 'if_c_or_z',
  '_SET': 'if_always'
};

// Effect flags from automatic_symbols
const EFFECT_FLAGS: EffectFlag[] = [
  {
    name: 'none',
    symbol: '',
    value: 0b00,
    description: 'No effect flags - instruction does not modify flags',
    bitPattern: '00'
  },
  {
    name: 'wz',
    symbol: 'WZ',
    value: 0b10,
    description: 'Write Zero flag - update Z flag based on result',
    bitPattern: '10'
  },
  {
    name: 'wc',
    symbol: 'WC',
    value: 0b01,
    description: 'Write Carry flag - update C flag based on result',
    bitPattern: '01'
  },
  {
    name: 'wcz',
    symbol: 'WCZ',
    value: 0b11,
    description: 'Write Carry and Zero flags - update both C and Z flags',
    bitPattern: '11'
  }
];

function generateBinaryPattern(value: number): string {
  return value.toString(2).padStart(2, '0');
}

function buildConditionCodeDatabase(): ConditionCodeDatabase {
  console.log('🔍 Building condition codes and effect flags database...');

  const conditionCodes: ConditionCode[] = [];

  // Build condition codes from base conditions and aliases
  for (const [baseName, baseData] of Object.entries(BASE_CONDITIONS)) {
    const aliases: string[] = [];

    // Find all aliases that map to this base condition
    for (const [alias, target] of Object.entries(CONDITION_ALIASES)) {
      if (target === baseName) {
        aliases.push(alias);
      }
    }

    // Create the primary symbol (first alias or derived from base name)
    const primarySymbol = aliases.find(a => a.startsWith('IF_')) ||
                         baseName.toUpperCase();

    const conditionCode: ConditionCode = {
      name: baseName,
      symbol: primarySymbol || baseName.toUpperCase(),
      value: baseData.value,
      description: baseData.description,
      aliases: aliases.sort(),
      binaryPattern: generateBinaryPattern(baseData.value),
      category: baseData.category
    };

    conditionCodes.push(conditionCode);
  }

  // Sort by value for consistent ordering
  conditionCodes.sort((a, b) => a.value - b.value);

  // Get unique categories
  const categories = Array.from(new Set(conditionCodes.map(cc => cc.category))).sort();

  const database: ConditionCodeDatabase = {
    metadata: {
      version: '1.0.0',
      extractedFrom: 'PNut-TS Compiler parseUtils.ts and types.ts',
      extractedAt: new Date().toISOString(),
      description: 'Complete PASM2 condition codes and effect flags extracted from PNut-TS compiler',
      totalConditionCodes: conditionCodes.length,
      totalEffectFlags: EFFECT_FLAGS.length
    },
    conditionCodes,
    effectFlags: EFFECT_FLAGS,
    conditionCategories: categories
  };

  return database;
}

async function updatePASM2Database(conditionDatabase: ConditionCodeDatabase): Promise<void> {
  console.log('🔄 Updating PASM2 instruction database with condition codes...');

  const pasm2DbPath = path.join(__dirname, '../DOCs/internals/PASM2-Instruction-Database.json');

  if (!fs.existsSync(pasm2DbPath)) {
    throw new Error('PASM2 instruction database not found. Run extract-pasm2-database.ts first.');
  }

  // Read existing PASM2 database
  const pasm2Data = JSON.parse(fs.readFileSync(pasm2DbPath, 'utf-8'));

  // Update with condition codes and effect flags
  pasm2Data.conditionCodes = conditionDatabase.conditionCodes;
  pasm2Data.effectFlags = conditionDatabase.effectFlags;
  pasm2Data.conditionCategories = conditionDatabase.conditionCategories;

  // Update metadata
  pasm2Data.metadata.lastUpdated = new Date().toISOString();
  pasm2Data.metadata.totalConditionCodes = conditionDatabase.conditionCodes.length;
  pasm2Data.metadata.totalEffectFlags = conditionDatabase.effectFlags.length;

  // Write updated database
  fs.writeFileSync(pasm2DbPath, JSON.stringify(pasm2Data, null, 2));

  console.log(`✅ Updated PASM2 database with ${conditionDatabase.conditionCodes.length} condition codes and ${conditionDatabase.effectFlags.length} effect flags`);
}

async function main() {
  try {
    console.log('🚀 PASM2 Condition Codes and Effect Flags Extraction Started');
    console.log('📋 Following PASM2-SPIN2-Language-Specification-Extraction-Roadmap.md Phase 2.2');
    console.log('');

    const conditionDatabase = buildConditionCodeDatabase();

    // Save standalone condition codes database
    const outputPath = path.join(__dirname, '../databases/PASM2-Condition-Codes.json');
    fs.writeFileSync(outputPath, JSON.stringify(conditionDatabase, null, 2));

    // Update main PASM2 database
    await updatePASM2Database(conditionDatabase);

    console.log('');
    console.log('📊 Extraction Summary:');
    console.log(`   🎯 Condition Codes: ${conditionDatabase.conditionCodes.length}`);
    console.log(`   🔧 Effect Flags: ${conditionDatabase.effectFlags.length}`);
    console.log(`   🏷️  Categories: ${conditionDatabase.conditionCategories.length}`);
    console.log(`   💾 Standalone Output: ${outputPath}`);
    console.log(`   🔄 Updated: PASM2-Instruction-Database.json`);
    console.log('');
    console.log('✅ Condition codes and effect flags extraction completed successfully!');

  } catch (error) {
    console.error('❌ Extraction failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}