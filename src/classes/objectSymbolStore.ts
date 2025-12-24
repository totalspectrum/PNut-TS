/** @format */
'use strict';

// src/classes/objectSymbolStore.ts
// Stores symbol tables per compiled object for map file generation

import { SymbolEntry } from './symbolTable';

/**
 * ObjectSymbolStore - Stores symbol tables per compiled object
 *
 * During compilation, each object's symbols are saved here indexed by
 * their position in the sourceFiles array. The MapGenerator then uses
 * this to access symbols from all objects, not just the top level.
 */
export class ObjectSymbolStore {
  private _symbolsByObject: Map<number, SymbolEntry[]> = new Map();

  /**
   * Store symbols for a compiled object
   * @param fileIndex - Index in sourceFiles array
   * @param symbols - Array of symbol entries for this object
   */
  public storeSymbols(fileIndex: number, symbols: SymbolEntry[]): void {
    // Make a copy of the symbols array to avoid reference issues
    this._symbolsByObject.set(fileIndex, [...symbols]);
  }

  /**
   * Get symbols for a compiled object
   * @param fileIndex - Index in sourceFiles array
   * @returns Array of symbol entries, or empty array if not found
   */
  public getSymbols(fileIndex: number): SymbolEntry[] {
    return this._symbolsByObject.get(fileIndex) || [];
  }

  /**
   * Get all stored object symbols
   * @returns Map of file index to symbol entries
   */
  public getAllSymbols(): Map<number, SymbolEntry[]> {
    return this._symbolsByObject;
  }

  /**
   * Check if symbols exist for a given object
   * @param fileIndex - Index in sourceFiles array
   */
  public hasSymbols(fileIndex: number): boolean {
    return this._symbolsByObject.has(fileIndex);
  }

  /**
   * Get the number of objects with stored symbols
   */
  public get objectCount(): number {
    return this._symbolsByObject.size;
  }

  /**
   * Clear all stored symbols (useful for reset between compilations)
   */
  public clear(): void {
    this._symbolsByObject.clear();
  }
}
