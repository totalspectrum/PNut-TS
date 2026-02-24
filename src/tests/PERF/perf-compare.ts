/* eslint-disable no-console */
'use strict';

import fs from 'fs';

// ─── Interfaces ──────────────────────────────────────────────────────

interface FileResult {
  file: string;
  timeMs: number;
  sizeBytes: number;
  error?: string;
}

interface CategoryResult {
  files: number;
  totalMs: number;
  avgMs: number;
  results: FileResult[];
}

interface BenchmarkResults {
  timestamp: string;
  version: string;
  nodeVersion: string;
  totalFiles: number;
  totalTimeMs: number;
  categories: Record<string, CategoryResult>;
}

// ─── Formatting Helpers ──────────────────────────────────────────────

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}ms`;
}

function formatPercent(before: number, after: number): string {
  if (before === 0) return 'N/A';
  const pct = ((after - before) / before) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Comparison Logic ────────────────────────────────────────────────

function compare(beforePath: string, afterPath: string): void {
  const before: BenchmarkResults = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const after: BenchmarkResults = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

  console.log('PNut-TS Performance Comparison');
  console.log(`Before: ${before.timestamp} (v${before.version}, ${before.nodeVersion})`);
  console.log(`After:  ${after.timestamp} (v${after.version}, ${after.nodeVersion})`);
  console.log('');

  // Build per-file lookup for before results
  const beforeMap = new Map<string, number>();
  for (const [cat, catResult] of Object.entries(before.categories)) {
    for (const result of catResult.results) {
      beforeMap.set(`${cat}/${result.file}`, result.timeMs);
    }
  }

  // Per-file comparison
  const fileHeader = `${padRight('File', 44)} ${padLeft('Before(ms)', 11)} ${padLeft('After(ms)', 11)} ${padLeft('Delta', 11)} ${padLeft('%Change', 9)}`;
  const fileSeparator = '─'.repeat(fileHeader.length);

  console.log('Per-File Results:');
  console.log(fileHeader);
  console.log(fileSeparator);

  // Collect all categories from both runs
  const allCategories = new Set([...Object.keys(before.categories), ...Object.keys(after.categories)]);
  const sortedCategories = [...allCategories].sort();

  interface CategoryDelta {
    beforeTotal: number;
    afterTotal: number;
  }
  const categoryDeltas: Record<string, CategoryDelta> = {};

  // Show top movers (biggest absolute delta)
  interface FileDelta {
    key: string;
    beforeMs: number;
    afterMs: number;
    delta: number;
  }
  const fileDeltas: FileDelta[] = [];

  for (const cat of sortedCategories) {
    const afterCat = after.categories[cat];
    const beforeCat = before.categories[cat];

    categoryDeltas[cat] = {
      beforeTotal: beforeCat?.totalMs ?? 0,
      afterTotal: afterCat?.totalMs ?? 0
    };

    if (!afterCat) continue;

    for (const result of afterCat.results) {
      const key = `${cat}/${result.file}`;
      const beforeMs = beforeMap.get(key) ?? -1;
      const afterMs = result.timeMs;

      if (beforeMs >= 0 && afterMs >= 0) {
        fileDeltas.push({ key, beforeMs, afterMs, delta: afterMs - beforeMs });
      }
    }
  }

  // Sort by absolute delta (biggest changes first)
  fileDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Show top 20 movers
  const topMovers = fileDeltas.slice(0, 20);
  for (const fd of topMovers) {
    console.log(
      `${padRight(fd.key, 44)} ${padLeft(fd.beforeMs.toFixed(1), 11)} ${padLeft(fd.afterMs.toFixed(1), 11)} ${padLeft(formatDelta(fd.delta), 11)} ${padLeft(formatPercent(fd.beforeMs, fd.afterMs), 9)}`
    );
  }

  if (fileDeltas.length > 20) {
    console.log(`  ... and ${fileDeltas.length - 20} more files`);
  }

  // Category totals
  console.log('');
  console.log(fileSeparator);
  console.log('Category Totals:');

  const catHeader = `${padRight('Category', 24)} ${padLeft('Before(ms)', 11)} ${padLeft('After(ms)', 11)} ${padLeft('Delta', 11)} ${padLeft('%Change', 9)}`;
  console.log(catHeader);
  console.log('─'.repeat(catHeader.length));

  let overallBefore = 0;
  let overallAfter = 0;

  for (const cat of sortedCategories) {
    const cd = categoryDeltas[cat];
    overallBefore += cd.beforeTotal;
    overallAfter += cd.afterTotal;
    const delta = cd.afterTotal - cd.beforeTotal;

    console.log(
      `${padRight(cat, 24)} ${padLeft(cd.beforeTotal.toFixed(1), 11)} ${padLeft(cd.afterTotal.toFixed(1), 11)} ${padLeft(formatDelta(delta), 11)} ${padLeft(formatPercent(cd.beforeTotal, cd.afterTotal), 9)}`
    );
  }

  console.log('─'.repeat(catHeader.length));
  const overallDelta = overallAfter - overallBefore;
  console.log(
    `${padRight('OVERALL', 24)} ${padLeft(overallBefore.toFixed(1), 11)} ${padLeft(overallAfter.toFixed(1), 11)} ${padLeft(formatDelta(overallDelta), 11)} ${padLeft(formatPercent(overallBefore, overallAfter), 9)}`
  );
  console.log('');
}

// ─── Main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node perf-compare.js <before.json> <after.json>');
  process.exit(1);
}

const [beforePath, afterPath] = args;

if (!fs.existsSync(beforePath)) {
  console.error(`File not found: ${beforePath}`);
  process.exit(1);
}
if (!fs.existsSync(afterPath)) {
  console.error(`File not found: ${afterPath}`);
  process.exit(1);
}

compare(beforePath, afterPath);
