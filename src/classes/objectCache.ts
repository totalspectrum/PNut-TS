/** @format */

// Persistent object cache for avoiding recompilation of identical child objects.
// Uses content-addressed storage: SHA-256(preprocessed_source + overrides + compiler_version)

'use strict';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SymbolTable } from './symbolTable';
import { TextLine } from './textLine';

export interface CacheStats {
  hits: number;
  misses: number;
}

export interface CacheMetadata {
  source: string;
  overrides: string;
  compilerVersion: string;
  timestamp: number;
  binarySize: number;
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

  /** Compute cache key from preprocessed source + overrides + version */
  computeKey(preprocessedLines: TextLine[], overrides: SymbolTable | undefined, compilerVersion: string): string {
    const hash = crypto.createHash('sha256');
    // Hash all preprocessed source lines
    for (const line of preprocessedLines) {
      hash.update(line.text);
      hash.update('\n');
    }
    // Hash sorted overrides
    if (overrides) {
      const entries = overrides.allSymbols.sort((a, b) => a.name.localeCompare(b.name));
      for (const sym of entries) {
        hash.update(`${sym.name}:${sym.type}:${sym.value}`);
      }
    }
    // Hash compiler version
    hash.update(`v:${compilerVersion}`);
    return hash.digest('hex');
  }

  /** Check cache for a compiled object */
  get(key: string): Uint8Array | undefined {
    if (!this.enabled) return undefined;
    const binPath = path.join(this.cacheDir, `${key}.bin`);
    if (fs.existsSync(binPath)) {
      this._hits++;
      return new Uint8Array(fs.readFileSync(binPath));
    }
    this._misses++;
    return undefined;
  }

  /** Store a compiled object in cache */
  set(key: string, binary: Uint8Array, metadata?: CacheMetadata): void {
    if (!this.enabled) return;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    const binPath = path.join(this.cacheDir, `${key}.bin`);
    fs.writeFileSync(binPath, binary);
    if (metadata) {
      const metaPath = path.join(this.cacheDir, `${key}.meta`);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    }
  }

  /** Clear all cache entries */
  clear(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true });
    }
  }

  /** Report cache statistics */
  get stats(): CacheStats {
    return { hits: this._hits, misses: this._misses };
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get cachePath(): string {
    return this.cacheDir;
  }
}
