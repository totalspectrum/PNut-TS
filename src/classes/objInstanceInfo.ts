/** @format */
'use strict';

// src/classes/objInstanceInfo.ts
// Stores object instance information for map file generation

import { SymbolEntry } from './symbolTable';

/**
 * ConstantOverride - A single constant override value
 */
export interface ConstantOverride {
  name: string;
  value: bigint | string;
  isFloat: boolean;
}

/**
 * ObjInstanceInfo - Information about a single object instance in the binary
 *
 * Tracks the relationship between:
 * - The instance name used in the OBJ declaration (e.g., "child1")
 * - The source file (e.g., "param_child.spin2")
 * - Any constant overrides applied (e.g., DEFAULT_VALUE = 20)
 * - The parent object that declared this instance
 */
export class ObjInstanceInfo {
  private _instanceName: string; // Name from OBJ declaration (e.g., "child1")
  private _sourceFileName: string; // Source .spin2 file (e.g., "param_child.spin2")
  private _parentIndex: number; // Index of parent object that declared this
  private _objectIndex: number; // Index of this object in memory layout
  private _overrides: ConstantOverride[] = [];

  constructor(instanceName: string, sourceFileName: string, parentIndex: number, objectIndex: number) {
    this._instanceName = instanceName;
    this._sourceFileName = sourceFileName;
    this._parentIndex = parentIndex;
    this._objectIndex = objectIndex;
  }

  get instanceName(): string {
    return this._instanceName;
  }

  get sourceFileName(): string {
    return this._sourceFileName;
  }

  get sourceFileBaseName(): string {
    // Remove .spin2 extension if present
    return this._sourceFileName.replace(/\.spin2$/i, '');
  }

  get parentIndex(): number {
    return this._parentIndex;
  }

  get objectIndex(): number {
    return this._objectIndex;
  }

  get overrides(): ConstantOverride[] {
    return this._overrides;
  }

  get hasOverrides(): boolean {
    return this._overrides.length > 0;
  }

  /**
   * Add a constant override
   */
  public addOverride(name: string, value: bigint | string, isFloat: boolean = false): void {
    this._overrides.push({ name, value, isFloat });
  }

  /**
   * Add overrides from a symbol table (used when extracting from ObjFile)
   */
  public addOverridesFromSymbols(symbols: SymbolEntry[]): void {
    for (const symbol of symbols) {
      const isFloat = symbol.type.toString().includes('float');
      this._overrides.push({
        name: symbol.name,
        value: symbol.value,
        isFloat
      });
    }
  }

  /**
   * Format overrides as a string for display
   * e.g., "DEFAULT_VALUE=20, MULTIPLIER=5"
   */
  public formatOverrides(): string {
    if (this._overrides.length === 0) {
      return '';
    }
    return this._overrides
      .map((o) => {
        const valueStr = typeof o.value === 'bigint' ? o.value.toString() : o.value;
        return `${o.name}=${valueStr}`;
      })
      .join(', ');
  }
}

/**
 * ObjInstanceStore - Collection of all object instances in the compiled program
 *
 * Indexed by object index (matching distiller record order)
 */
export class ObjInstanceStore {
  private _instances: Map<number, ObjInstanceInfo> = new Map();

  /**
   * Add an instance to the store
   */
  public addInstance(instance: ObjInstanceInfo): void {
    this._instances.set(instance.objectIndex, instance);
  }

  /**
   * Get instance info by object index
   */
  public getInstance(objectIndex: number): ObjInstanceInfo | undefined {
    return this._instances.get(objectIndex);
  }

  /**
   * Get all instances
   */
  public getAllInstances(): ObjInstanceInfo[] {
    return Array.from(this._instances.values()).sort((a, b) => a.objectIndex - b.objectIndex);
  }

  /**
   * Get instances declared by a specific parent
   */
  public getChildInstances(parentIndex: number): ObjInstanceInfo[] {
    return this.getAllInstances().filter((i) => i.parentIndex === parentIndex);
  }

  /**
   * Get the number of instances
   */
  public get count(): number {
    return this._instances.size;
  }

  /**
   * Clear all instances
   */
  public clear(): void {
    this._instances.clear();
  }
}
