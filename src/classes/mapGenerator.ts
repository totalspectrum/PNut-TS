/** @format */
'use strict';

// src/classes/mapGenerator.ts
// Memory map file generator for PNut-TS

import fs from 'fs';
import { Context } from '../utils/context';
import { SpinResolver } from './spinResolver';
import { DistillerRecord } from './distillerList';
import { eElementType } from './types';

/**
 * MapGenerator - Generates memory map files (.map) from compilation
 *
 * The map file provides a comprehensive view of the compiled object's
 * memory layout, including:
 * - Object layout summary (code, DAT, VAR sizes)
 * - DAT section symbols with offsets and sizes
 * - VAR section symbols with offsets and sizes
 * - Method entry points and stack frame layouts
 * - Runtime memory addresses
 * - PASM labels with COG addresses
 * - Address cross-reference for debugging
 */
export class MapGenerator {
  private context: Context;
  private resolver: SpinResolver;
  private stream: fs.WriteStream | undefined;

  constructor(context: Context, resolver: SpinResolver) {
    this.context = context;
    this.resolver = resolver;
  }

  /**
   * Generate the memory map file if enabled in compile options
   */
  public generate(): void {
    if (!this.context.compileOptions.writeMapFile) {
      return;
    }

    const mapFilename = this.context.compileOptions.mapFilename;
    this.logMessage(`* MapGenerator.generate() - writing map file to ${mapFilename}`);

    // Create output stream
    this.stream = fs.createWriteStream(mapFilename);

    try {
      // Emit all sections
      this.emitHeader();
      this.emitObjectLayout();
      this.emitDatSymbols();
      this.emitVarSymbols();
      this.emitMethods();
      this.emitRuntimeAddresses();
      this.emitPasmLabels();
      this.emitCrossReference();
    } finally {
      // Close the stream
      this.stream.end();
    }

    this.context.logger.progressMsg(`Wrote ${mapFilename}`);
  }

  /**
   * Emit the map file header with filename, version, and timestamp
   */
  private emitHeader(): void {
    const topFile = this.context.sourceFiles.getTopFile();
    const filename = topFile.fileName;
    const timestamp = new Date().toISOString();

    this.writeLine('================================================================================');
    this.writeLine(`PNut-TS Memory Map: ${filename}`);
    this.writeLine('Spin2_v44');
    this.writeLine(`Generated: ${timestamp}`);
    this.writeLine('================================================================================');
    this.writeLine('');
  }

  /**
   * Emit object layout summary table
   * Shows code, DAT, VAR sizes for each object
   */
  private emitObjectLayout(): void {
    this.writeLine('=== Object Layout ===');
    this.writeLine('');

    const distiller = this.resolver.distiller;
    const records = distiller.records;
    const recordCount = records.recordCount;

    if (recordCount === 0) {
      this.writeLine('No objects compiled.');
      this.writeLine('');
      return;
    }

    // Column headers
    this.writeLine('Idx   Object             Methods  SubObjs   Size');
    this.writeLine('---   ------             -------  -------   ----');

    let totalSize = 0;
    let totalMethods = 0;

    for (let i = 0; i < recordCount; i++) {
      const record: DistillerRecord | undefined = records.getRecordAt(i);
      if (record) {
        // Try to get the source file name for this object
        const objectName = this.getObjectName(record.objectId);
        const idx = i.toString().padStart(3);
        const name = objectName.padEnd(18);
        const methods = record.methodCount.toString().padStart(7);
        const subObjs = record.subObjectCount.toString().padStart(8);
        const size = record.objectSize.toString().padStart(6);

        this.writeLine(`${idx}   ${name} ${methods}  ${subObjs}  ${size}`);

        totalSize += record.objectSize;
        totalMethods += record.methodCount;
      }
    }

    this.writeLine('---   ------             -------  -------   ----');
    const totalMethodsStr = totalMethods.toString().padStart(7);
    const totalSizeStr = totalSize.toString().padStart(6);
    this.writeLine(`      TOTAL              ${totalMethodsStr}           ${totalSizeStr}`);
    this.writeLine('');
  }

  /**
   * Get the object name for a given object ID
   * Maps object IDs to source file names where possible
   */
  private getObjectName(objectId: number): string {
    // Try to find the source file with matching fileId
    const srcFile = this.context.sourceFiles.getFileHavingID(objectId);
    if (srcFile) {
      // Return just the base filename without path or extension
      const fileName = srcFile.fileName;
      return fileName.replace(/\.spin2$/i, '');
    }
    // Fallback to object ID if no file mapping found
    return `Object_${objectId}`;
  }

  /**
   * Emit DAT section symbols with offsets and sizes
   */
  private emitDatSymbols(): void {
    this.writeLine('=== DAT Sections ===');
    this.writeLine('');

    const userSymbols = this.resolver.userSymbolTable;

    // Filter for DAT symbol types
    const datSymbols = userSymbols.filter((symbol) => this.isDatSymbolType(symbol.type));

    if (datSymbols.length === 0) {
      this.writeLine('No DAT symbols defined.');
      this.writeLine('');
      return;
    }

    // Column headers
    this.writeLine('Offset      Type         Name');
    this.writeLine('------      ----         ----');

    for (const symbol of datSymbols) {
      const offset = this.extractDatOffset(symbol.value);
      const offsetStr = '$' + offset.toString(16).toUpperCase().padStart(5, '0');
      const typeStr = this.getDatTypeString(symbol.type).padEnd(12);
      const name = this.cleanSymbolName(symbol.name);

      this.writeLine(`${offsetStr}      ${typeStr} ${name}`);
    }

    this.writeLine('');
    this.writeLine(`DAT Symbols: ${datSymbols.length}`);
    this.writeLine('');
  }

  /**
   * Check if a symbol type is a DAT type
   */
  private isDatSymbolType(type: eElementType): boolean {
    return (
      type === eElementType.type_dat_byte ||
      type === eElementType.type_dat_word ||
      type === eElementType.type_dat_long ||
      type === eElementType.type_dat_struct ||
      type === eElementType.type_dat_long_res
    );
  }

  /**
   * Extract the offset from a DAT symbol value
   * DAT values encode offset in lower 20 bits with markers in upper bits
   */
  private extractDatOffset(value: bigint | string): number {
    if (typeof value === 'string') {
      return 0;
    }
    // Extract lower 20 bits (offset portion)
    return Number(value & 0xfffffn);
  }

  /**
   * Get a display string for a DAT symbol type
   */
  private getDatTypeString(type: eElementType): string {
    switch (type) {
      case eElementType.type_dat_byte:
        return 'BYTE';
      case eElementType.type_dat_word:
        return 'WORD';
      case eElementType.type_dat_long:
        return 'LONG';
      case eElementType.type_dat_struct:
        return 'STRUCT';
      case eElementType.type_dat_long_res:
        return 'LONG_RES';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Clean a symbol name by removing internal suffixes
   */
  private cleanSymbolName(name: string): string {
    // Remove the _$_N suffix used for duplicate handling
    const parts = name.split('_$_');
    let baseName = parts[0];
    // Remove trailing underscore if present (used for internal markers)
    if (baseName.endsWith('_')) {
      baseName = baseName.slice(0, -1);
    }
    return baseName;
  }

  /**
   * Emit VAR section symbols with offsets and sizes
   */
  private emitVarSymbols(): void {
    this.writeLine('=== VAR Sections ===');
    this.writeLine('');

    const userSymbols = this.resolver.userSymbolTable;

    // Filter for VAR symbol types
    const varSymbols = userSymbols.filter((symbol) => this.isVarSymbolType(symbol.type));

    if (varSymbols.length === 0) {
      this.writeLine('No VAR symbols defined.');
      this.writeLine('');
      return;
    }

    // Column headers
    this.writeLine('Offset      Type         Name');
    this.writeLine('------      ----         ----');

    for (const symbol of varSymbols) {
      const offset = this.extractVarOffset(symbol.value);
      const offsetStr = '$' + offset.toString(16).toUpperCase().padStart(5, '0');
      const typeStr = this.getVarTypeString(symbol.type).padEnd(12);
      const name = this.cleanSymbolName(symbol.name);

      this.writeLine(`${offsetStr}      ${typeStr} ${name}`);
    }

    this.writeLine('');
    this.writeLine(`VAR Symbols: ${varSymbols.length}`);
    this.writeLine('');
  }

  /**
   * Check if a symbol type is a VAR type
   */
  private isVarSymbolType(type: eElementType): boolean {
    return (
      type === eElementType.type_var_byte ||
      type === eElementType.type_var_word ||
      type === eElementType.type_var_long ||
      type === eElementType.type_var_struct ||
      type === eElementType.type_var_byte_ptr ||
      type === eElementType.type_var_word_ptr ||
      type === eElementType.type_var_long_ptr ||
      type === eElementType.type_var_struct_ptr
    );
  }

  /**
   * Extract the offset from a VAR symbol value
   */
  private extractVarOffset(value: bigint | string): number {
    if (typeof value === 'string') {
      return 0;
    }
    // VAR offsets are stored directly in lower bits
    return Number(value & 0xffffn);
  }

  /**
   * Get a display string for a VAR symbol type
   */
  private getVarTypeString(type: eElementType): string {
    switch (type) {
      case eElementType.type_var_byte:
        return 'BYTE';
      case eElementType.type_var_word:
        return 'WORD';
      case eElementType.type_var_long:
        return 'LONG';
      case eElementType.type_var_struct:
        return 'STRUCT';
      case eElementType.type_var_byte_ptr:
        return 'BYTE_PTR';
      case eElementType.type_var_word_ptr:
        return 'WORD_PTR';
      case eElementType.type_var_long_ptr:
        return 'LONG_PTR';
      case eElementType.type_var_struct_ptr:
        return 'STRUCT_PTR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Emit method entry points and stack frame layouts
   */
  private emitMethods(): void {
    this.writeLine('=== Methods ===');
    this.writeLine('');

    const userSymbols = this.resolver.userSymbolTable;

    // Filter for method symbols
    const methodSymbols = userSymbols.filter((symbol) => symbol.type === eElementType.type_method);

    if (methodSymbols.length === 0) {
      this.writeLine('No methods defined.');
      this.writeLine('');
      return;
    }

    // Column headers
    this.writeLine('Entry       Name');
    this.writeLine('-----       ----');

    for (const symbol of methodSymbols) {
      const entryPoint = this.extractMethodEntry(symbol.value);
      const entryStr = '$' + entryPoint.toString(16).toUpperCase().padStart(5, '0');
      const name = this.cleanSymbolName(symbol.name);

      this.writeLine(`${entryStr}      ${name}`);
    }

    this.writeLine('');
    this.writeLine(`Methods: ${methodSymbols.length}`);
    this.writeLine('');
  }

  /**
   * Extract the entry point from a method symbol value
   */
  private extractMethodEntry(value: bigint | string): number {
    if (typeof value === 'string') {
      return 0;
    }
    // Method entry points are typically encoded in the value
    return Number(value & 0xffffn);
  }

  /**
   * Emit runtime memory addresses for all sections
   * Shows absolute memory layout at runtime for debugging
   */
  private emitRuntimeAddresses(): void {
    this.writeLine('=== Runtime Addresses ===');
    this.writeLine('');

    const distiller = this.resolver.distiller;
    const records = distiller.records;
    const recordCount = records.recordCount;

    if (recordCount === 0) {
      this.writeLine('No objects compiled.');
      this.writeLine('');
      return;
    }

    // P2 programs typically load at $00000 in hub RAM
    // Code/DAT sections are contiguous
    // VAR sections are allocated at runtime after all code/DAT

    for (let i = 0; i < recordCount; i++) {
      const record: DistillerRecord | undefined = records.getRecordAt(i);
      if (record) {
        const objectName = this.getObjectName(record.objectId);
        const startAddr = record.objectOffset;
        const endAddr = startAddr + record.objectSize - 1;

        this.writeLine(`Object ${i}: ${objectName}`);
        this.writeLine(`  Code/DAT: $${this.hexAddr(startAddr)} - $${this.hexAddr(endAddr)} (${record.objectSize} bytes)`);
        this.writeLine(`  Methods:  ${record.methodCount}`);
        if (record.subObjectCount > 0) {
          this.writeLine(`  SubObjs:  ${record.subObjectCount}`);
        }
        this.writeLine('');
      }
    }

    // Show total executable size
    const execSize = this.resolver.executableSize;
    const varSize = this.resolver.variableSize;

    this.writeLine('Memory Summary:');
    this.writeLine(`  Executable (Code+DAT): ${execSize} bytes`);
    this.writeLine(`  Variables (VAR):       ${varSize} bytes`);
    this.writeLine(`  Total:                 ${execSize + varSize} bytes`);
    this.writeLine('');
  }

  /**
   * Format an address as a 5-digit hex string
   */
  private hexAddr(addr: number): string {
    return addr.toString(16).toUpperCase().padStart(5, '0');
  }

  /**
   * Emit PASM labels with DAT offsets and COG addresses
   * PASM labels are DAT symbols that are in cog mode (not hub mode)
   */
  private emitPasmLabels(): void {
    this.writeLine('=== PASM Labels ===');
    this.writeLine('');

    const userSymbols = this.resolver.userSymbolTable;

    // Filter for DAT symbols that are PASM labels (cog mode, not hub mode)
    // Hub mode symbols have 0xfff in upper 12 bits (0xfff00000)
    // Cog mode symbols have cog address in upper bits
    const pasmLabels = userSymbols.filter((symbol) => {
      if (!this.isDatSymbolType(symbol.type)) {
        return false;
      }
      if (typeof symbol.value === 'string') {
        return false;
      }
      // Check if it's cog mode (not hub mode)
      // Hub mode has 0xfff in upper 12 bits
      const upperBits = Number((symbol.value >> 20n) & 0xfffn);
      return upperBits !== 0xfff;
    });

    if (pasmLabels.length === 0) {
      this.writeLine('No PASM labels defined.');
      this.writeLine('');
      return;
    }

    // Column headers
    this.writeLine('DAT Offset  COG Addr  Type         Name');
    this.writeLine('----------  --------  ----         ----');

    for (const symbol of pasmLabels) {
      const value = symbol.value as bigint;
      const datOffset = Number(value & 0xfffffn);
      // COG address is stored in upper bits, shifted by 18
      // cogOrg is in bytes, COG address display is in longs (divide by 4)
      const cogOrg = Number((value >> 18n) & 0x3fffn);
      const cogAddr = cogOrg >> 2; // Convert byte offset to long address

      const datOffsetStr = '$' + datOffset.toString(16).toUpperCase().padStart(5, '0');
      const cogAddrStr = '$' + cogAddr.toString(16).toUpperCase().padStart(3, '0');
      const typeStr = this.getDatTypeString(symbol.type).padEnd(12);
      const name = this.cleanSymbolName(symbol.name);

      this.writeLine(`${datOffsetStr}     ${cogAddrStr}       ${typeStr} ${name}`);
    }

    this.writeLine('');
    this.writeLine(`PASM Labels: ${pasmLabels.length}`);
    this.writeLine('');
  }

  /**
   * Emit address cross-reference for reverse lookup
   * Aggregates all addressable symbols sorted by address
   */
  private emitCrossReference(): void {
    this.writeLine('=== Address Cross-Reference ===');
    this.writeLine('');

    // Build collection of address entries
    interface AddressEntry {
      address: number;
      type: string;
      name: string;
    }

    const entries: AddressEntry[] = [];

    // Add object code regions
    const distiller = this.resolver.distiller;
    const records = distiller.records;
    for (let i = 0; i < records.recordCount; i++) {
      const record = records.getRecordAt(i);
      if (record) {
        entries.push({
          address: record.objectOffset,
          type: 'CODE',
          name: this.getObjectName(record.objectId)
        });
      }
    }

    // Add DAT symbols
    const userSymbols = this.resolver.userSymbolTable;
    for (const symbol of userSymbols) {
      if (this.isDatSymbolType(symbol.type)) {
        const offset = this.extractDatOffset(symbol.value);
        entries.push({
          address: offset,
          type: 'DAT',
          name: this.cleanSymbolName(symbol.name)
        });
      }
    }

    // Add method symbols
    for (const symbol of userSymbols) {
      if (symbol.type === eElementType.type_method) {
        const entry = this.extractMethodEntry(symbol.value);
        entries.push({
          address: entry,
          type: 'METHOD',
          name: this.cleanSymbolName(symbol.name)
        });
      }
    }

    if (entries.length === 0) {
      this.writeLine('No addressable symbols.');
      this.writeLine('');
      return;
    }

    // Sort by address
    entries.sort((a, b) => a.address - b.address);

    // Column headers
    this.writeLine('Address     Type      Name');
    this.writeLine('-------     ----      ----');

    for (const entry of entries) {
      const addrStr = '$' + entry.address.toString(16).toUpperCase().padStart(5, '0');
      const typeStr = entry.type.padEnd(9);
      this.writeLine(`${addrStr}     ${typeStr} ${entry.name}`);
    }

    this.writeLine('');
    this.writeLine(`Cross-Reference Entries: ${entries.length}`);
    this.writeLine('');
  }

  /**
   * Write a line to the output stream
   */
  private writeLine(text: string): void {
    if (this.stream) {
      this.stream.write(text + '\n');
    }
  }

  /**
   * Log a message if logging is enabled
   */
  private logMessage(message: string): void {
    if (this.context.logOptions.logCompile) {
      this.context.logger.logMessage(message);
    }
  }
}
