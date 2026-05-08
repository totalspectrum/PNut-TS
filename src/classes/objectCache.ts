/** @format */

// Persistent object cache for avoiding recompilation of identical child objects.
// Content-addressed storage: SHA-256(preprocessed_source + overrides + compiler_version
//                                    + enable_debug + cache_format_version)
//
// On-disk layout per entry (key = SHA-256 hex):
//   <key>.bin  — compiled child binary (load-bearing)
//   <key>.sym  — serialized user symbols for map file generation (load-bearing,
//                read only when writeMapFile is enabled)
//   <key>.dbg  — serialized debug records this child references + the in-binary
//                brkCode write sites that need relocation on hit (load-bearing
//                whenever the cached .bin contains BRK opcodes; only ever
//                produced when --debug was on at store time)
//   <key>.meta — human-readable JSON diagnostic (optional, never required by
//                the hit path)
//
// Why .dbg exists: each debug() call bakes a brkCode (an index into the
// compile's shared DebugData table) into the child's binary. The actual
// records — format strings + on-device debugger commands — live only in that
// table, which is rebuilt from scratch every compile.
//
// Two failure modes the .dbg sidecar guards against:
//   1. Records assumed-but-missing. A cached child's brkCode bytes point at
//      indices that, in a fresh compile, hold whatever records the new
//      compile happened to emit. Without restoring this child's records,
//      runtime debug() reads the wrong format string.
//   2. Records present but at different indices. Even when records replay on
//      hit, the shared table state at replay time differs from the original
//      compile (different siblings preceded this child), so injectRecord
//      assigns different absolute indices than the brkCodes baked in the
//      cached .bin reference. v1.54.3 missed this — assumed indices would
//      line up because dedup walks match. They only line up when the same
//      siblings precede in the same order.
//
// .dbg therefore captures BOTH:
//   - For every unique brkCode this child references in its binary, the raw
//     record bytes from the original compile. (Includes records this child
//     dedup'd against siblings — those bytes are needed to re-derive the
//     "right" index in the new compile.)
//   - The exact byte/bit positions in the cached .bin where each brkCode
//     value was baked, so we can patch them to the new index injectRecord
//     returns at replay time.
//
// IMPORTANT: any compile option that can change a child object's bytes MUST be
// folded into computeKey(). Today that means enableDebug and defSymbols (the
// propagated `#pragma exportdef` + CLI `-D` symbol set). If you add a new flag
// that affects code generation (e.g. an optimization level), add it to
// CacheKeyInputs and hash it in computeKey, AND bump CACHE_FORMAT_VERSION.
//
// Why defSymbols matters: a child's own `preprocessedLines` is post-#ifdef
// expansion, so it captures the effect of any preprocessor symbol the CHILD's
// source gates on. But the child's compiled binary also embeds its
// grandchildren's bytes (compile_obj_blocks), and those grandchildren's
// preprocessedLines depend on whatever symbols the parent exportdef'd. A
// child whose source has no #ifdef on the propagated symbols will have
// identical preprocessedLines across two different parent contexts — but
// different embedded grandchild bytes. Without defSymbols in the key, the
// cache returns one parent's binary into another parent's compile, with
// silently wrong embedded grandchildren. v1.54.4 missed this case.

'use strict';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SymbolEntry, SymbolTable } from './symbolTable';
import { eElementType } from './types';
import { TextLine } from './textLine';
import { BrkSite } from './objectImage';

/**
 * Cache format version. Bump whenever:
 *  - the on-disk layout changes (new sidecar file, removed field, etc.)
 *  - the symbol serialization shape changes
 *  - a new compile option is folded into the key
 *
 * Bumping this invalidates every existing cache entry by changing every key.
 * Old <key>.bin files become unreachable and are cleaned by --cache-clear.
 */
export const CACHE_FORMAT_VERSION = 5;

export interface CacheStats {
  hits: number;
  misses: number;
}

export interface CacheMetadata {
  source: string;
  overrides: string;
  compilerVersion: string;
  enableDebug: boolean;
  cacheFormatVersion: number;
  timestamp: number;
  binarySize: number;
  symbolCount: number;
}

export interface CacheKeyInputs {
  preprocessedLines: TextLine[];
  overrides: SymbolTable | undefined;
  compilerVersion: string;
  enableDebug: boolean;
  /**
   * Snapshot of `context.preProcessorOptions.defSymbols` at the moment this
   * child's cache lookup happens. Captures CLI `-D` flags AND any symbols
   * propagated to descendants via the parent's `#pragma exportdef`. Hashed
   * sorted+deduped so order/duplication doesn't perturb the key.
   */
  defSymbols: string[];
}

export interface CacheStoreOptions {
  metadata?: CacheMetadata;
  symbols?: SymbolEntry[];
  /**
   * Debug-record/brkSite payload for the .dbg sidecar. Pass `undefined` to
   * skip writing .dbg (e.g. non-debug compiles). Pass an empty `records` and
   * empty `brkSites` to write a sidecar that records "this child has no debug
   * footprint" — that's the unambiguous-not-corrupted signal on later hits.
   */
  debugInfo?: DebugInfo;
}

/**
 * Debug payload for one cached child object.
 *
 * `records` lists every DebugData record the child's binary references — both
 * records the child contributed and records it dedup'd against (e.g. an
 * earlier sibling in the original compile placed the same content). Each
 * entry pairs the original index baked in the binary with the raw record
 * bytes; the bytes get re-injected into the shared table on a cache hit and
 * the original index becomes the lookup key in the brkCode remap.
 *
 * `brkSites` lists every byte/bit position in the cached .bin where a
 * non-zero brkCode value was baked. On hit, each site's brkCode field is
 * patched to the new index injectRecord returned for that site's origIndex.
 */
export interface DebugInfo {
  records: { origIndex: number; bytes: Uint8Array }[];
  brkSites: BrkSite[];
}

/** Compact serialized form of a SymbolEntry. Field names kept short to
 *  minimize on-disk size; bigint values are tagged so round-trip is lossless. */
interface SerializedSymbol {
  n: string; // name
  t: number; // type (eElementType)
  v: string | { $b: string }; // value: plain string OR bigint-as-decimal-string
  i?: 1; // isInline (omitted when false)
}

interface SerializedSymFile {
  cacheFormatVersion: number;
  symbols: SerializedSymbol[];
}

interface SerializedDbgRecord {
  i: number; // origIndex (1-based DebugData entry index from original compile)
  b: string; // base64-encoded record bytes (including trailing 0 terminator)
}

interface SerializedBrkSite {
  o: number; // offset in the cached .bin
  k: 0 | 1; // 0 = spin (1 byte), 1 = pasm (9-bit field at bits 9-16 of long)
  i: number; // origIndex baked into the binary
}

interface SerializedDbgFile {
  cacheFormatVersion: number;
  records: SerializedDbgRecord[];
  brkSites: SerializedBrkSite[];
}

export class ObjectCache {
  private cacheDir: string;
  private enabled: boolean;
  private _hits: number = 0;
  private _misses: number = 0;

  constructor(enabled: boolean, cacheDir: string = '.pnut-cache') {
    this.enabled = enabled;
    this.cacheDir = path.resolve(cacheDir);
    if (enabled && !fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /** Compute cache key from all inputs that affect the compiled binary. */
  computeKey(inputs: CacheKeyInputs): string {
    const hash = crypto.createHash('sha256');
    // Preprocessed source lines (transitively captures all #include content)
    for (const line of inputs.preprocessedLines) {
      hash.update(line.text);
      hash.update('\n');
    }
    // Sorted parameter overrides
    if (inputs.overrides) {
      const entries = inputs.overrides.allSymbols.slice().sort((a, b) => a.name.localeCompare(b.name));
      for (const sym of entries) {
        hash.update(`${sym.name}:${sym.type}:${sym.value}`);
      }
    }
    // Compile inputs that change generated bytecode
    hash.update(`v:${inputs.compilerVersion}`);
    hash.update(`d:${inputs.enableDebug ? 1 : 0}`);
    hash.update(`f:${CACHE_FORMAT_VERSION}`);
    // Active preprocessor symbol set. Sorted+deduped: order in defSymbols is
    // an artifact of insertion sequence and shouldn't perturb the key, but
    // membership absolutely must. Without this, a child whose own source has
    // no #ifdef on a propagated symbol would key-collide across parents that
    // exportdef different symbols, even though the child's grandchildren may
    // have compiled to different bytes under those propagated symbols and
    // gotten embedded into the cached child binary.
    const sortedDefs = [...new Set(inputs.defSymbols.map((s) => s.toUpperCase()))].sort();
    for (const sym of sortedDefs) {
      hash.update(`D:${sym}`);
    }
    return hash.digest('hex');
  }

  /** Retrieve a cached binary by key. Returns undefined on miss. */
  get(key: string): Uint8Array | undefined {
    if (!this.enabled) return undefined;
    const binPath = this.binPath(key);
    if (fs.existsSync(binPath)) {
      this._hits++;
      return new Uint8Array(fs.readFileSync(binPath));
    }
    this._misses++;
    return undefined;
  }

  /** Retrieve cached user symbols for a key. Returns undefined if the .sym
   *  sidecar is missing, malformed, or has a mismatched format version. */
  getSymbols(key: string): SymbolEntry[] | undefined {
    if (!this.enabled) return undefined;
    const symPath = this.symPath(key);
    if (!fs.existsSync(symPath)) return undefined;
    try {
      const raw = fs.readFileSync(symPath, 'utf8');
      const parsed = JSON.parse(raw) as SerializedSymFile;
      if (parsed.cacheFormatVersion !== CACHE_FORMAT_VERSION) return undefined;
      if (!Array.isArray(parsed.symbols)) return undefined;
      return deserializeSymbols(parsed.symbols);
    } catch {
      return undefined;
    }
  }

  /** Retrieve cached debug info for a key. Returns undefined if the .dbg
   *  sidecar is missing, malformed, or has a mismatched format version.
   *  Returns a `DebugInfo` with empty `records` and empty `brkSites` when the
   *  child has no debug footprint (e.g. it contained no debug() calls). */
  getDebugInfo(key: string): DebugInfo | undefined {
    if (!this.enabled) return undefined;
    const dbgPath = this.dbgPath(key);
    if (!fs.existsSync(dbgPath)) return undefined;
    try {
      const raw = fs.readFileSync(dbgPath, 'utf8');
      const parsed = JSON.parse(raw) as SerializedDbgFile;
      if (parsed.cacheFormatVersion !== CACHE_FORMAT_VERSION) return undefined;
      if (!Array.isArray(parsed.records) || !Array.isArray(parsed.brkSites)) return undefined;
      const records = parsed.records.map((r) => ({
        origIndex: r.i,
        bytes: new Uint8Array(Buffer.from(r.b, 'base64'))
      }));
      const brkSites: BrkSite[] = parsed.brkSites.map((s) => ({
        offset: s.o,
        kind: s.k === 1 ? 'pasm' : 'spin',
        origIndex: s.i
      }));
      return { records, brkSites };
    } catch {
      return undefined;
    }
  }

  /** Store a compiled object in the cache. Writes sidecars first, binary
   *  last, so an interrupted run never leaves a `.bin` without companions. */
  set(key: string, binary: Uint8Array, options: CacheStoreOptions = {}): void {
    if (!this.enabled) return;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (options.symbols !== undefined) {
      const payload: SerializedSymFile = {
        cacheFormatVersion: CACHE_FORMAT_VERSION,
        symbols: serializeSymbols(options.symbols)
      };
      fs.writeFileSync(this.symPath(key), JSON.stringify(payload));
    }
    if (options.debugInfo !== undefined) {
      const payload: SerializedDbgFile = {
        cacheFormatVersion: CACHE_FORMAT_VERSION,
        records: options.debugInfo.records.map((r) => ({
          i: r.origIndex,
          b: Buffer.from(r.bytes).toString('base64')
        })),
        brkSites: options.debugInfo.brkSites.map((s) => ({
          o: s.offset,
          k: s.kind === 'pasm' ? 1 : 0,
          i: s.origIndex
        }))
      };
      fs.writeFileSync(this.dbgPath(key), JSON.stringify(payload));
    }
    if (options.metadata !== undefined) {
      fs.writeFileSync(this.metaPath(key), JSON.stringify(options.metadata, null, 2));
    }
    // Binary last — its presence is the cache-hit gate.
    fs.writeFileSync(this.binPath(key), binary);
  }

  /** Remove all cache entries for this directory. */
  clear(): void {
    ObjectCache.clearCacheDir(this.cacheDir);
  }

  /** Remove a given cache directory if it exists. Returns true when removed. */
  static clearCacheDir(cacheDir: string): boolean {
    const resolved = path.resolve(cacheDir);
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true });
      return true;
    }
    return false;
  }

  get stats(): CacheStats {
    return { hits: this._hits, misses: this._misses };
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get cachePath(): string {
    return this.cacheDir;
  }

  private binPath(key: string): string {
    return path.join(this.cacheDir, `${key}.bin`);
  }

  private symPath(key: string): string {
    return path.join(this.cacheDir, `${key}.sym`);
  }

  private dbgPath(key: string): string {
    return path.join(this.cacheDir, `${key}.dbg`);
  }

  private metaPath(key: string): string {
    return path.join(this.cacheDir, `${key}.meta`);
  }
}

// --- Symbol serialization helpers --------------------------------------------
// SymbolEntry.instanceNumber is a process-global counter used only for sort
// order at construction time and is intentionally NOT preserved across runs.
// MapGenerator does not consult it.

export function serializeSymbols(symbols: SymbolEntry[]): SerializedSymbol[] {
  const out: SerializedSymbol[] = new Array(symbols.length);
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i];
    const v: SerializedSymbol['v'] = typeof s.value === 'bigint' ? { $b: s.value.toString() } : s.value;
    const entry: SerializedSymbol = { n: s.name, t: s.type, v };
    if (s.isInline) entry.i = 1;
    out[i] = entry;
  }
  return out;
}

export function deserializeSymbols(serialized: SerializedSymbol[]): SymbolEntry[] {
  const out: SymbolEntry[] = new Array(serialized.length);
  for (let i = 0; i < serialized.length; i++) {
    const s = serialized[i];
    const value: bigint | string = typeof s.v === 'string' ? s.v : BigInt(s.v.$b);
    out[i] = new SymbolEntry(s.n, s.t as eElementType, value, s.i === 1);
  }
  return out;
}

// --- brkCode patching --------------------------------------------------------

/**
 * Rewrite the brkCode value at a single site in a cached child binary.
 *
 * On a cache hit the child's records are replayed into the freshly-built
 * shared DebugData table, but injectRecord assigns indices based on whatever
 * earlier siblings have already placed — so the new index typically differs
 * from the original. The cached .bin still holds the original brkCode bytes,
 * so we patch each site in place before the binary is spliced into childImages.
 *
 * Encoding details:
 *   - kind 'spin': brkCode is a single byte at `offset` (the third byte of
 *     a `bc_debug, stack_depth, brkCode` triple emitted by enterDebug).
 *   - kind 'pasm': brkCode is a 9-bit field at bits 9-16 of the 4-byte
 *     little-endian long at `offset` (BRK instruction's S immediate). High bit
 *     of the field is always 0 because brkCode is 0-255. Bits 0-8 (cond/I/D/...)
 *     and bits 17-31 (cond, effects) are preserved.
 */
/**
 * Rewrite the 1-byte checksum of a Spin child object binary so that the sum
 * of all bytes (mod 256) is zero, which is what spinResolver validates on
 * load. Patching brkCode fields in a cached binary changes byte values, so
 * the checksum recorded at original-compile time no longer holds — without
 * this fixup the loader would reject the patched object as corrupt.
 *
 * Layout (Spin OBJ): bytes 0-3 = vsize (LE long), bytes 4-7 = psize (LE long,
 * the byte count of the code section), byte at offset 8+psize = checksum,
 * bytes (8+psize+1)..end = pubConList. We sum all bytes with the checksum
 * placeholder zeroed, then store the negation.
 */
export function recomputeChildChecksum(bin: Uint8Array): void {
  if (bin.length < 9) {
    throw new Error(`recomputeChildChecksum: binary too short (${bin.length} bytes) to contain a Spin object header`);
  }
  const psize = bin[4] | (bin[5] << 8) | (bin[6] << 16) | (bin[7] << 24);
  const checksumOffset = 8 + psize;
  if (checksumOffset >= bin.length) {
    throw new Error(`recomputeChildChecksum: checksum offset ${checksumOffset} >= binary length ${bin.length} (psize=${psize})`);
  }
  bin[checksumOffset] = 0;
  let sum = 0;
  for (let i = 0; i < bin.length; i++) {
    sum -= bin[i];
  }
  bin[checksumOffset] = sum & 0xff;
}

export function patchBrkSite(bin: Uint8Array, site: BrkSite, newBrkCode: number): void {
  if (newBrkCode < 0 || newBrkCode > 0xff) {
    throw new Error(`patchBrkSite: brkCode ${newBrkCode} out of range (0-255)`);
  }
  if (site.kind === 'spin') {
    if (site.offset >= bin.length) {
      throw new Error(`patchBrkSite: spin offset ${site.offset} >= bin length ${bin.length}`);
    }
    bin[site.offset] = newBrkCode & 0xff;
  } else {
    if (site.offset + 3 >= bin.length) {
      throw new Error(`patchBrkSite: pasm offset ${site.offset}+3 >= bin length ${bin.length}`);
    }
    // newBrkCode << 9 spans byte 1 (bits 9-15) and byte 2 (bit 16).
    bin[site.offset + 1] = (bin[site.offset + 1] & 0x01) | ((newBrkCode & 0x7f) << 1);
    bin[site.offset + 2] = (bin[site.offset + 2] & 0xfe) | ((newBrkCode >> 7) & 0x01);
  }
}
