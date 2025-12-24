/**
 * Map File Verification Script
 *
 * Cross-references map files against listing files and expected.json
 * to verify symbol counts, offsets, and object hierarchy.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExpectedMethod {
  name: string;
  visibility: 'PUB' | 'PRI';
  params: number;
  returns: number;
  locals: number;
}

interface ExpectedVar {
  name: string;
  type: 'LONG' | 'WORD' | 'BYTE';
  count: number;
}

interface ExpectedDat {
  name: string;
  type: 'LONG' | 'WORD' | 'BYTE';
  count: number;
}

interface ExpectedPasmLabel {
  name: string;
}

interface ExpectedObject {
  name: string;
  file: string;
  methods: ExpectedMethod[];
  vars: ExpectedVar[];
  dat: ExpectedDat[];
  pasm_labels: ExpectedPasmLabel[];
}

interface ExpectedJson {
  description: string;
  top_file: string;
  objects: ExpectedObject[];
  totals: {
    object_count: number;
    method_count: number;
    var_symbols: number;
    dat_symbols: number;
    pasm_labels: number;
  };
}

interface ListingSymbol {
  type: string;
  value: string;
  name: string;
}

interface ListingSummary {
  symbols: ListingSymbol[];
  objBytes: number;
  varBytes: number;
}

interface MapObjectEntry {
  index: number;
  name: string;
  methods: number;
  subObjs: number;
  size: number;
}

interface MapVarEntry {
  offset: string;
  type: string;
  name: string;
}

interface MapMethodEntry {
  entry: string;
  name: string;
}

interface MapPasmEntry {
  cogAddr: string;
  hubOffset: string;
  name: string;
}

interface MapSummary {
  objects: MapObjectEntry[];
  vars: MapVarEntry[];
  methods: MapMethodEntry[];
  pasmLabels: MapPasmEntry[];
  datSymbols: number;
  varSymbols: number;
  executableBytes: number;
  variableBytes: number;
}

interface VerificationResult {
  testName: string;
  passed: boolean;
  checks: CheckResult[];
}

interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  message?: string;
}

export function parseListing(content: string): ListingSummary {
  const lines = content.split('\n');
  const symbols: ListingSymbol[] = [];
  let objBytes = 0;
  let varBytes = 0;

  for (const line of lines) {
    // Parse symbol table lines: TYPE: xxx  VALUE: xxx  NAME: xxx
    const symbolMatch = line.match(/^TYPE:\s+(\S+)\s+VALUE:\s+([0-9A-Fa-f]+)\s+NAME:\s+(.+)$/);
    if (symbolMatch) {
      symbols.push({
        type: symbolMatch[1],
        value: symbolMatch[2],
        name: symbolMatch[3].trim()
      });
    }

    // Parse OBJ bytes
    const objMatch = line.match(/^OBJ bytes:\s+(\d+)/);
    if (objMatch) {
      objBytes = parseInt(objMatch[1], 10);
    }

    // Parse VAR bytes
    const varMatch = line.match(/^VAR bytes:\s+(\d+)/);
    if (varMatch) {
      varBytes = parseInt(varMatch[1], 10);
    }
  }

  return { symbols, objBytes, varBytes };
}

export function parseMap(content: string): MapSummary {
  const lines = content.split('\n');
  const objects: MapObjectEntry[] = [];
  const vars: MapVarEntry[] = [];
  const methods: MapMethodEntry[] = [];
  const pasmLabels: MapPasmEntry[] = [];
  let datSymbols = 0;
  let varSymbols = 0;
  let executableBytes = 0;
  let variableBytes = 0;

  let section = '';

  for (const line of lines) {
    // Detect section headers
    if (line.startsWith('=== Object Layout ===')) {
      section = 'objects';
      continue;
    }
    if (line.startsWith('=== DAT Sections ===')) {
      section = 'dat';
      continue;
    }
    if (line.startsWith('=== VAR Sections ===')) {
      section = 'var';
      continue;
    }
    if (line.startsWith('=== Methods ===')) {
      section = 'methods';
      continue;
    }
    if (line.startsWith('=== Runtime Addresses ===')) {
      section = 'runtime';
      continue;
    }
    if (line.startsWith('=== PASM Labels ===')) {
      section = 'pasm';
      continue;
    }
    if (line.startsWith('=== Address Cross-Reference ===')) {
      section = 'xref';
      continue;
    }

    // Parse objects (format: Idx   Object   Methods  SubObjs   Size)
    if (section === 'objects') {
      const objMatch = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)/);
      if (objMatch) {
        objects.push({
          index: parseInt(objMatch[1], 10),
          name: objMatch[2],
          methods: parseInt(objMatch[3], 10),
          subObjs: parseInt(objMatch[4], 10),
          size: parseInt(objMatch[5], 10)
        });
      }
    }

    // Parse VAR entries (format: $offset  TYPE  NAME)
    if (section === 'var') {
      const varMatch = line.match(/^\$([0-9A-Fa-f]+)\s+(\S+)\s+(\S+)/);
      if (varMatch) {
        vars.push({
          offset: varMatch[1],
          type: varMatch[2],
          name: varMatch[3]
        });
      }
      // Get total count
      const countMatch = line.match(/^VAR Symbols:\s*(\d+)/);
      if (countMatch) {
        varSymbols = parseInt(countMatch[1], 10);
      }
    }

    // Parse DAT symbol count
    if (section === 'dat') {
      const countMatch = line.match(/^DAT Symbols:\s*(\d+)/);
      if (countMatch) {
        datSymbols = parseInt(countMatch[1], 10);
      }
    }

    // Parse method entries (format: $entry  NAME)
    if (section === 'methods') {
      const methodMatch = line.match(/^\$([0-9A-Fa-f]+)\s+(\S+)/);
      if (methodMatch) {
        methods.push({
          entry: methodMatch[1],
          name: methodMatch[2]
        });
      }
    }

    // Parse PASM labels (format: $cogAddr  $hubOffset  NAME)
    if (section === 'pasm') {
      const pasmMatch = line.match(/^\$([0-9A-Fa-f]+)\s+\$([0-9A-Fa-f]+)\s+(\S+)/);
      if (pasmMatch) {
        pasmLabels.push({
          cogAddr: pasmMatch[1],
          hubOffset: pasmMatch[2],
          name: pasmMatch[3]
        });
      }
    }

    // Parse memory summary
    if (section === 'runtime') {
      const execMatch = line.match(/Executable \(Code\+DAT\):\s*(\d+)/);
      if (execMatch) {
        executableBytes = parseInt(execMatch[1], 10);
      }
      const varMatch = line.match(/Variables \(VAR\):\s*(\d+)/);
      if (varMatch) {
        variableBytes = parseInt(varMatch[1], 10);
      }
    }
  }

  return {
    objects,
    vars,
    methods,
    pasmLabels,
    datSymbols,
    varSymbols,
    executableBytes,
    variableBytes
  };
}

export function verifyMapAgainstExpected(testDir: string): VerificationResult {
  const testName = path.basename(testDir);
  const checks: CheckResult[] = [];

  // Load expected.json
  const expectedPath = path.join(testDir, 'expected.json');
  if (!fs.existsSync(expectedPath)) {
    return {
      testName,
      passed: false,
      checks: [
        {
          name: 'Load expected.json',
          passed: false,
          expected: 'File exists',
          actual: 'File not found'
        }
      ]
    };
  }

  const expected: ExpectedJson = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  checks.push({
    name: 'Load expected.json',
    passed: true,
    expected: `${expected.totals.object_count} objects`,
    actual: `${expected.totals.object_count} objects`
  });

  // Find and load the listing file
  const topFile = expected.top_file;
  const lstPath = path.join(testDir, topFile.replace('.spin2', '.lst'));
  const mapPath = path.join(testDir, topFile.replace('.spin2', '.map'));

  if (!fs.existsSync(lstPath)) {
    checks.push({
      name: 'Load listing file',
      passed: false,
      expected: 'File exists',
      actual: `${lstPath} not found - compile with -l flag first`
    });
    return { testName, passed: false, checks };
  }

  if (!fs.existsSync(mapPath)) {
    checks.push({
      name: 'Load map file',
      passed: false,
      expected: 'File exists',
      actual: `${mapPath} not found - compile with -m flag first`
    });
    return { testName, passed: false, checks };
  }

  const listing = parseListing(fs.readFileSync(lstPath, 'utf8'));
  const map = parseMap(fs.readFileSync(mapPath, 'utf8'));

  checks.push({
    name: 'Parse listing file',
    passed: true,
    expected: 'Parsed',
    actual: `${listing.symbols.length} symbols, ${listing.objBytes} OBJ bytes`
  });

  checks.push({
    name: 'Parse map file',
    passed: true,
    expected: 'Parsed',
    actual: `${map.objects.length} objects, ${map.methods.length} methods`
  });

  // Verify object count
  const objectCountMatch = map.objects.length === expected.totals.object_count;
  checks.push({
    name: 'Object count',
    passed: objectCountMatch,
    expected: String(expected.totals.object_count),
    actual: String(map.objects.length)
  });

  // Verify VAR symbol count (from top object only in listing)
  const lstVarSymbols = listing.symbols.filter((s) => s.type.startsWith('VAR_')).length;
  const topObjVarCount = expected.objects[0].vars.length;
  const varCountMatch = lstVarSymbols === topObjVarCount;
  checks.push({
    name: 'VAR symbol count (top object)',
    passed: varCountMatch,
    expected: String(topObjVarCount),
    actual: `lst=${lstVarSymbols}, map=${map.varSymbols}`
  });

  // Verify method count (from top object in listing)
  const lstMethods = listing.symbols.filter((s) => s.type === 'METHOD').length;
  const topObjMethodCount = expected.objects[0].methods.length;
  const methodCountMatch = lstMethods === topObjMethodCount;
  checks.push({
    name: 'Method count (top object)',
    passed: methodCountMatch,
    expected: String(topObjMethodCount),
    actual: `lst=${lstMethods}, map=${map.methods.length}`
  });

  // Verify specific VAR symbols exist and have correct offsets
  for (const expectedVar of expected.objects[0].vars) {
    const lstVar = listing.symbols.find((s) => s.type.startsWith('VAR_') && s.name.toUpperCase() === expectedVar.name.toUpperCase());
    const mapVar = map.vars.find((v) => v.name.toUpperCase() === expectedVar.name.toUpperCase());

    if (!lstVar) {
      checks.push({
        name: `VAR '${expectedVar.name}' in listing`,
        passed: false,
        expected: 'Present',
        actual: 'Not found'
      });
    } else if (!mapVar) {
      checks.push({
        name: `VAR '${expectedVar.name}' in map`,
        passed: false,
        expected: 'Present',
        actual: 'Not found'
      });
    } else {
      // Check offset matches
      const lstOffset = parseInt(lstVar.value, 16);
      const mapOffset = parseInt(mapVar.offset, 16);
      const offsetMatch = lstOffset === mapOffset;
      checks.push({
        name: `VAR '${expectedVar.name}' offset`,
        passed: offsetMatch,
        expected: `$${lstVar.value}`,
        actual: `$${mapVar.offset}`
      });

      // Check type matches
      const lstType = lstVar.type.replace('VAR_', '');
      const typeMatch = lstType === mapVar.type;
      checks.push({
        name: `VAR '${expectedVar.name}' type`,
        passed: typeMatch,
        expected: lstType,
        actual: mapVar.type
      });
    }
  }

  // Verify methods exist and have correct entry points
  for (const expectedMethod of expected.objects[0].methods) {
    const lstMethod = listing.symbols.find((s) => s.type === 'METHOD' && s.name.toUpperCase() === expectedMethod.name.toUpperCase());
    const mapMethod = map.methods.find((m) => m.name.toUpperCase() === expectedMethod.name.toUpperCase());

    if (!lstMethod) {
      checks.push({
        name: `Method '${expectedMethod.name}' in listing`,
        passed: false,
        expected: 'Present',
        actual: 'Not found'
      });
    } else if (!mapMethod) {
      checks.push({
        name: `Method '${expectedMethod.name}' in map`,
        passed: false,
        expected: 'Present',
        actual: 'Not found'
      });
    } else {
      // Extract lower bits of entry point (ignore upper flags)
      const lstEntry = parseInt(lstMethod.value, 16) & 0x0000ffff;
      const mapEntry = parseInt(mapMethod.entry, 16);
      const entryMatch = lstEntry === mapEntry;
      checks.push({
        name: `Method '${expectedMethod.name}' entry`,
        passed: entryMatch,
        expected: `$${lstEntry.toString(16).padStart(5, '0')}`,
        actual: `$${mapEntry.toString(16).padStart(5, '0')}`
      });
    }
  }

  // Verify size totals match
  const objBytesMatch = listing.objBytes === map.executableBytes;
  checks.push({
    name: 'OBJ bytes match',
    passed: objBytesMatch,
    expected: String(listing.objBytes),
    actual: String(map.executableBytes)
  });

  const varBytesMatch = listing.varBytes === map.variableBytes;
  checks.push({
    name: 'VAR bytes match',
    passed: varBytesMatch,
    expected: String(listing.varBytes),
    actual: String(map.variableBytes)
  });

  // Check if all passed
  const passed = checks.every((c) => c.passed);

  return { testName, passed, checks };
}

export function formatResults(result: VerificationResult): string {
  const lines: string[] = [];
  lines.push(`=== Map Verification: ${result.testName} ===`);
  lines.push('');

  for (const check of result.checks) {
    const status = check.passed ? '[PASS]' : '[FAIL]';
    lines.push(`  ${status} ${check.name}`);
    if (!check.passed) {
      lines.push(`         Expected: ${check.expected}`);
      lines.push(`         Actual:   ${check.actual}`);
    }
  }

  lines.push('');
  lines.push(result.passed ? 'All checks passed!' : 'Some checks FAILED');
  return lines.join('\n');
}

// Main entry for running standalone
if (require.main === module) {
  const testDirs = [path.join(__dirname, 'test1-simple'), path.join(__dirname, 'test2-deep'), path.join(__dirname, 'test3-wide')];

  let allPassed = true;
  for (const testDir of testDirs) {
    if (fs.existsSync(testDir)) {
      const result = verifyMapAgainstExpected(testDir);
      console.log(formatResults(result));
      console.log('');
      if (!result.passed) {
        allPassed = false;
      }
    }
  }

  process.exit(allPassed ? 0 : 1);
}
