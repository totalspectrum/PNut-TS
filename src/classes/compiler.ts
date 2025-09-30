// this is our common logging mechanism
//  TODO: make it context/runtime option aware

'use strict';

import { Context } from '../utils/context';
import { SpinDocument } from './spinDocument';
import { Spin2Parser } from './spin2Parser';
import { RegressionReporter } from './regression';
import { DatFile, ObjFile, SpinFiles } from './spinFiles';
import { SymbolTable } from './symbolTable';
import { ChildObjectsImage } from './childObjectsImage';
import { loadFileAsUint8Array, loadUint8ArrayFailed } from '../utils/files';
import { ObjectImage } from './objectImage';
import path from 'path';
import { OBJ_LIMIT } from './spinResolver';

// src/classes/compiler.ts

const OBJ_STACK_LIMIT: number = 16;

export class Compiler {
  private context: Context;
  private isLogging: boolean;
  private isLoggingOutline: boolean;
  private srcFile: SpinDocument | undefined;
  private spin2Parser: Spin2Parser;
  private objectFileCount: number = 0; // from pascal EditUnit.pas ObjFileCount
  // references to our global data
  private objectData: ChildObjectsImage; // pascal P2.ObjData
  private datFileData: ChildObjectsImage; // pascal P2.DatData
  private objImage: ObjectImage; // pascal P2.Obj
  private spinFiles: SpinFiles;

  // our pascal global equivalents
  private childImages: ChildObjectsImage; // pascal ObjFileBuff
  private objectFileOffset: number = 0; // pascal ObjFilePtr

  private countByFilename = new Map<string, number>();
  private readonly obj_limit: number = OBJ_LIMIT; // max object size (2MB) PNut obj_limit as of v49

  // Early deduplication memory statistics
  private memoryStats = {
    totalObjectsCompiled: 0,
    duplicatesDetected: 0,
    memoryBytesSaved: 0,
    duplicatesBySize: new Map<number, number>()
  };

  // Global storage and mapping for early deduplication
  private globalChildObjectIndexMap: Map<number, number> = new Map(); // globalLogicalIndex -> physicalIndex
  private globalLogicalIndexCounter: number = 0; // Global unique counter for deduplication

  constructor(ctx: Context) {
    this.context = ctx;
    this.isLogging = ctx.logOptions.logCompile;
    this.isLoggingOutline = ctx.logOptions.logOutline;
    this.spin2Parser = new Spin2Parser(ctx);
    // get references to the single global data
    this.objectData = ctx.compileData.objectData;
    this.objectData.refreshLogging();
    this.datFileData = ctx.compileData.datFileData;
    this.datFileData.refreshLogging();
    this.objImage = ctx.compileData.objImage;
    this.objImage.refreshLogging();
    this.spinFiles = ctx.compileData.spinFiles;
    this.spinFiles.enableLogging(this.isLogging);
    // allocate our local data
    this.childImages = new ChildObjectsImage(ctx, 'childImages');
    // Reset memory statistics for this compilation
    this.resetMemoryStats();
  }

  private resetMemoryStats(): void {
    this.memoryStats = {
      totalObjectsCompiled: 0,
      duplicatesDetected: 0,
      memoryBytesSaved: 0,
      duplicatesBySize: new Map<number, number>()
    };
    // Reset global index mapping
    this.globalChildObjectIndexMap.clear();
    this.globalLogicalIndexCounter = 0;
  }

  public getEarlyDeduplicationSavings(): number {
    return this.memoryStats.memoryBytesSaved;
  }

  public Compile() {
    //logContextState(this.context, 'Compiler');
    this.logMessage(`* Compiler LOGGING is enabled!`);

    this.srcFile = this.context.sourceFiles.getTopFile();
    // TESTING: if requested, run our internal-tables regression report generator
    if (this.context.reportOptions.writeTablesReport) {
      const reporter: RegressionReporter = new RegressionReporter(this.context);
      reporter.writeTableReport(this.srcFile.dirName, this.srcFile.fileName);
    }

    // TESTING: if requested, run our resolver regression test report generator
    if (this.context.reportOptions.writeResolverReport) {
      const reporter: RegressionReporter = new RegressionReporter(this.context);
      reporter.runResolverRegression(this.srcFile.dirName, this.srcFile.fileName);
    }

    // if we have a valid file then let's parse it and generate code
    if (this.srcFile.validFile) {
      // here we make calls to the P2* methods (e.g., this.spin2Parser.P2Compile1(), , etc.)
      try {
        this.objectFileCount = 0; // pascal ObjFileCount
        this.objectFileOffset = 0; // pascal ObjFilePtr
        // thinking: pass context:fileIndex instead of fileName??
        this.compileRecursively(0, this.srcFile);

        // Validate index mapping after all child objects are processed
        if (this.globalChildObjectIndexMap.size > 0) {
          this.validateIndexMapping();
        }

        // Log deduplication statistics if any duplicates were found
        this.logDuplicationStats();

        // Pass early deduplication savings to spin2Parser for list file reporting
        this.spin2Parser.setEarlyDeduplicationSavings(this.memoryStats.memoryBytesSaved);

        this.spin2Parser.P2List();
        const needFLash: boolean = this.context.compileOptions.writeFlash;
        const ramDownload: boolean = this.context.compileOptions.writeRAM || needFLash; // we need download when flashing too!
        this.spin2Parser.ComposeRam(needFLash, ramDownload);
      } catch (error: unknown) {
        if (error instanceof Error) {
          const sourceFileID: number = this.spin2Parser.failingFileID;
          const srcDocument: SpinDocument | undefined = this.context.sourceFiles.getFileHavingID(sourceFileID);
          const filename: string = srcDocument !== undefined ? srcDocument.fileSpec : this.srcFile.fileSpec;
          const sourceLineNumber: number = this.spin2Parser.sourceLineNumber;
          const compilerErrorText: string = `${filename}:${sourceLineNumber}:error:${error.message}`;
          //this.context.logger.logMessage(`EEEE: About to report:   ${compilerErrorText}`);
          this.context.logger.logMessage(`${compilerErrorText}`);
          //this.context.logger.logMessage(` DBG filename=[${filename}], sourceLineNumber=(${sourceLineNumber}), errTxt=[${compilerErrorText}]`);
          const underTestStatus: boolean = this.context.reportOptions.regressionTesting;
          this.context.logger.compilerErrorMsg(compilerErrorText, underTestStatus);
          //if (error.stack !== undefined && !underTestStatus) {
          //  this.context.logger.errorMsg(error.stack);
          //}
        } else {
          // If it's not an Error object, it could be a string, null, etc.
          this.context.logger.errorMsg(error);
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private compileRecursively(depth: number, srcFile: SpinDocument, overrideParameters: SymbolTable | undefined = undefined) {
    this.logMessageOutline(`++ compileRecursly(${depth}, [${srcFile.fileName}]) - ENTRY ---------------------------------------`);
    if (this.spin2Parser !== undefined) {
      if (depth > OBJ_STACK_LIMIT) {
        throw new Error(`Object nesting exceeds ${OBJ_STACK_LIMIT} levels - illegal circular reference may exist`);
      }

      // local variables
      let objectFiles: number = 0; // pascal ObjFiles
      let dataFiles: number = 0; // pascal DatFiles
      const objectCountsPerChild: number[] = [];

      // load source file and perform first pass of compilation
      this.spin2Parser.setSourceFile(srcFile);

      // NOTE TODO: we need to request collapse_debug_data from compile2 if depth = 2
      if (this.context.passOptions.afterPreprocess == false) {
        if (this.context.passOptions.afterElementize == false) {
          this.logMessage(`  -- compRecur(${depth}) - compile1 - pass 1 ----------------------------------------`);
          this.spin2Parser.P2Compile1(overrideParameters);

          const objFileList: ObjFile[] = [...this.spinFiles.objFiles];
          const datFileList: DatFile[] = [...this.spinFiles.datFiles];
          objectFiles = objFileList.length;
          dataFiles = datFileList.length;

          if (this.spinFiles.pasmMode && depth > 0) {
            throw new Error(`${srcFile.fileName} is a PASM file and cannot be used as a Spin2 object`);
          }
          if (objectFiles > 0) {
            // do compile1 pass each child for this object
            //const objFileList: ObjFile[] = this.spinFiles.objFiles;
            for (let index = 0; index < objFileList.length; index++) {
              const objFile = objFileList[index];
              const fileSpec: string = objFile.fileSpec;
              // reuse existing document if present
              let childObjSourceFile = this.context.sourceFiles.getFile(fileSpec);
              if (childObjSourceFile === undefined) {
                this.logMessageOutline(`--- load child object [${path.basename(fileSpec)}]`);
                childObjSourceFile = new SpinDocument(this.context, fileSpec);
                this.context.sourceFiles.addFile(childObjSourceFile);
              }
              objFile.setSpinSourceFileId(childObjSourceFile.fileId);
              const overrideSymbolTable: SymbolTable | undefined = objFile.parameterSymbolTable;
              this.compileRecursively(depth + 1, childObjSourceFile, overrideSymbolTable);
              // Track this child's index in the parent's list
              // This gets incremented whether it's a duplicate or not
              objectCountsPerChild.push(this.globalLogicalIndexCounter - 1);
            }
          }

          this.logMessageOutline(`  -- compRecur(${depth}) - compile1 - pass 2 ----------------------------------------`);
          this.spin2Parser.setSourceFile(srcFile);
          this.spin2Parser.P2Compile1(overrideParameters);
          //
          // load sub-objects' .obj files
          //  move  ObjFileBuff (this.childImages) into P2.ObjData (this.objectData)
          this.logMessageOutline(`* compRecur(${depth}) processing ${objectFiles} OBJ file(s)`);
          if (objectFiles > 0) {
            let objDataOffset: number = 0; // pascal p
            this.objectData.clear();
            // for each child...
            for (let childIdx = 0; childIdx < objectFiles; childIdx++) {
              const logicalFileIdx = objectCountsPerChild[childIdx]; // Now contains logical index
              // Translate logical to physical index
              const physicalFileIdx = this.globalChildObjectIndexMap.get(logicalFileIdx);
              if (physicalFileIdx === undefined) {
                throw new Error(`Internal error: missing index mapping for logical index ${logicalFileIdx} at childIdx ${childIdx}`);
              }
              // pascal inline       s
              const [objOffset, objLength] = this.childImages.getOffsetAndLengthForFile(physicalFileIdx);
              this.logMessageOutline(
                `  -- compRecur(${depth}) obj loop childIdx=(${childIdx}), logicalIdx=(${logicalFileIdx}), physicalIdx=(${physicalFileIdx}), objOffset=(${objOffset}), objLength=(${objLength})`
              );
              // for this child, append child image to objectData
              this.childImages.setOffset(objOffset); // set read start
              this.objectData.setOffset(objDataOffset); // set write start

              this.objectData.ensureFits(objDataOffset, objLength); // throws exception if bad!
              this.objectData.rawUint8Array.set(this.childImages.rawUint8Array.subarray(objOffset, objOffset + objLength), objDataOffset);
              // Record using childIdx (position in parent's child list), not physical file index
              this.objectData.recordLengthOffsetForFile(childIdx, objDataOffset, objLength);
              objDataOffset += objLength;
              // DEBUG dump into .obj file for inspection
              //const newObjFileSpec = this.uniqueObjectName(depth, srcFile.dirName, srcFile.fileName, 'Data'); // REMOVE BEFORE FLIGHT
              //dumpUniqueChildObjectFile(this.objectData, objDataOffset, newObjFileSpec, this.context); // REMOVE BEFORE FLIGHT
              // DEBUG dump object records for inspection
              if (this.isLoggingOutline) {
                this.logMessageOutline(`* - -------------------------------`);
                for (let objFileIndex = 0; objFileIndex < this.objectData.objectFileCount; objFileIndex++) {
                  const [objOffset, objLength] = this.objectData.getOffsetAndLengthForFile(objFileIndex);
                  this.logMessageOutline(`  -- compRecur() fileIdx=[${objFileIndex}], objOffset=(${objOffset}), objLength(${objLength})`);
                }
                this.logMessageOutline(`* - -------------------------------`);
              }
            }
          }
          //
          // load any data files
          this.logMessageOutline(`* compRecur(${depth}) processing ${dataFiles} DAT file(s)`);
          if (dataFiles > 0) {
            let fileDataOffset: number = 0; // pascal p
            //const datFileList: DatFile[] = this.spinFiles.datFiles;
            this.logMessageOutline(`++ DAT FILE Compiler have (${dataFiles}) data files listLen=(${datFileList.length})`);
            for (let datFileIdx = 0; datFileIdx < datFileList.length; datFileIdx++) {
              const datFile: DatFile = datFileList[datFileIdx];
              const datImage: Uint8Array = loadFileAsUint8Array(datFile.fileSpec, this.context);
              const filename: string = path.basename(datFile.fileSpec);
              const failedToLoad: boolean = loadUint8ArrayFailed(datImage) ? true : false;
              if (failedToLoad == false) {
                this.logMessageOutline(
                  `++ DAT FILE Compiler [dfd=${this.datFileData.id}]  [${filename}], idx=(${datFileIdx}) len=(${datImage.length})`
                );
                // ensure fits
                this.datFileData.ensureFits(fileDataOffset, datImage.length);
                // place file content into image
                this.datFileData.rawUint8Array.set(datImage, fileDataOffset);
                // record new arrival
                this.datFileData.recordLengthOffsetForFilename(filename, fileDataOffset, datImage.length);
                fileDataOffset += datImage.length;
              }
            }
          }
          //
          // perform second pass of compilation
          this.logMessageOutline(`  -- compRecur(${depth}).compile2 ENTRY`);
          this.spin2Parser.P2Compile2(depth == 0); // NOTE: if at zero  (see above note...)

          const objectLength: number = this.objImage.offset;
          // Track this compilation for statistics
          this.memoryStats.totalObjectsCompiled++;

          // determine if we need this child copy
          const childImage: Uint8Array = this.objImage.rawUint8Array.subarray(0, 0 + objectLength);
          // Check if binary already exists in list using new method
          const duplicateInfo = this.childImages.findDuplicateChild(childImage);
          let physicalFileIndex: number;

          if (duplicateInfo.exists) {
            // Reuse existing object - this is a duplicate!
            physicalFileIndex = duplicateInfo.fileIndex;
            this.logMessageOutline(
              `  -- REUSE DUPE -- logicalIdx=(${this.globalLogicalIndexCounter}), physicalIdx=(${physicalFileIndex}), objLen=(${objectLength})`
            );
            // Track memory statistics
            this.memoryStats.duplicatesDetected++;
            this.memoryStats.memoryBytesSaved += objectLength;
            const sizeCount = this.memoryStats.duplicatesBySize.get(objectLength) || 0;
            this.memoryStats.duplicatesBySize.set(objectLength, sizeCount + 1);
          } else {
            // Store new object - not a duplicate
            physicalFileIndex = this.objectFileCount;

            // save obj file into memory if a copy doesn't already exist
            // now copy obj data to output
            if (this.objectFileOffset + objectLength > this.obj_limit) {
              throw new Error(`OBJ data exceeds ${this.obj_limit / 1024}k limit`);
            }
            // Save obj file into memory
            //  move P2.OBJ (this.objImage) into ObjFileBuff (this.childImages)
            this.childImages.setOffset(this.objectFileOffset);
            this.childImages.ensureFits(this.objectFileOffset, objectLength); // throws exception if bad!
            this.childImages.rawUint8Array.set(childImage, this.objectFileOffset);

            this.childImages.recordLengthOffsetForFile(this.objectFileCount, this.objectFileOffset, objectLength);
            this.objectFileOffset += objectLength;
            this.objectFileCount++;
            // DEBUG dump into .obj file for inspection
            //const newObjFileSpec = this.uniqueObjectName(depth, srcFile.dirName, srcFile.fileName, 'Child'); // REMOVE BEFORE FLIGHT
            //dumpUniqueChildObjectFile(this.childImages, this.objectFileOffset, newObjFileSpec, this.context); // REMOVE BEFORE FLIGHT
            this.logMessageOutline(
              `  -- NEW OBJECT -- logicalIdx=(${this.globalLogicalIndexCounter}), physicalIdx=(${physicalFileIndex}), objFiCnt=(${this.objectFileCount}), objLen=(${objectLength}), new objEndOffset=(${this.objectFileOffset})`
            );
          }

          // Map logical index to physical index
          this.globalChildObjectIndexMap.set(this.globalLogicalIndexCounter, physicalFileIndex);
          // Always increment logical index (even for duplicates)
          this.globalLogicalIndexCounter++;
          this.logMessageOutline(`  -- compRecur(${depth}).compile2 EXIT`);
        }
      }
    }
    this.logMessageOutline(`++ compileRecursly(${depth}, [${srcFile.fileName}]) - EXIT ----------------------------------------`);
    this.logMessageOutline(``);
  }

  private uniqueObjectName(depth: number, dirSpec: string, filename: string, structId: string): string {
    let uniqCount: number = 1;
    if (this.countByFilename.has(filename)) {
      const fileSeenCount = this.countByFilename.get(filename);
      if (fileSeenCount !== undefined) {
        uniqCount = fileSeenCount + 1;
      }
    }
    this.countByFilename.set(filename, uniqCount);
    const sourceType = path.extname(filename);
    const newFileSpec = path.join(dirSpec, `${structId}-${depth}-${filename}`.replace(sourceType, '.obj'));
    return newFileSpec;
  }

  private logMessage(message: string): void {
    if (this.isLogging) {
      this.context.logger.logMessage(message);
    }
  }

  private logMessageOutline(message: string): void {
    if (this.isLoggingOutline) {
      this.context.logger.logMessage(message);
    }
  }

  private validateIndexMapping(): void {
    // Validate all index mappings are consistent
    const objectCount = this.childImages.objectFileCount;

    // Check all physical indices are valid
    for (const [logical, physical] of this.globalChildObjectIndexMap) {
      if (physical < 0 || physical >= objectCount) {
        throw new Error(
          `Index mapping error: Logical index ${logical} maps to invalid physical index ${physical} (valid range: 0-${objectCount - 1})`
        );
      }
    }

    // Check for gaps in logical indices
    const logicalIndices = Array.from(this.globalChildObjectIndexMap.keys()).sort((a, b) => a - b);
    for (let i = 0; i < logicalIndices.length; i++) {
      if (logicalIndices[i] !== i) {
        throw new Error(`Index mapping error: Gap detected in logical indices at position ${i}. Expected ${i}, found ${logicalIndices[i]}`);
      }
    }

    // Check that we have mappings for all expected logical indices
    if (logicalIndices.length !== this.globalLogicalIndexCounter) {
      throw new Error(
        `Index mapping error: Mismatch between number of mappings (${logicalIndices.length}) and next logical index (${this.globalLogicalIndexCounter})`
      );
    }

    this.logMessageOutline(`Index mapping validation passed: ${logicalIndices.length} logical indices mapped to ${objectCount} physical objects`);
  }

  private logDuplicationStats(): void {
    // Only log if we have duplicates and outline logging is enabled
    if (this.memoryStats.duplicatesDetected > 0 && this.isLoggingOutline) {
      this.logMessageOutline('');
      this.logMessageOutline('=== Early Object Deduplication Statistics ===');
      this.logMessageOutline(`Total objects compiled: ${this.memoryStats.totalObjectsCompiled}`);
      this.logMessageOutline(`Duplicate objects detected: ${this.memoryStats.duplicatesDetected}`);
      this.logMessageOutline(`Memory saved: ${this.memoryStats.memoryBytesSaved} bytes`);

      const deduplicationRatio = (this.memoryStats.duplicatesDetected / this.memoryStats.totalObjectsCompiled) * 100;
      this.logMessageOutline(`Deduplication ratio: ${deduplicationRatio.toFixed(1)}%`);

      // Log breakdown by object size
      if (this.memoryStats.duplicatesBySize.size > 0) {
        this.logMessageOutline('');
        this.logMessageOutline('Duplicates by size:');
        const sortedSizes = Array.from(this.memoryStats.duplicatesBySize.entries()).sort((a, b) => b[0] - a[0]);
        for (const [size, count] of sortedSizes) {
          const sizeKB = (size / 1024).toFixed(2);
          const savedKB = ((size * count) / 1024).toFixed(2);
          this.logMessageOutline(`  ${sizeKB} KB objects: ${count} duplicates (saved ${savedKB} KB)`);
        }
      }

      this.logMessageOutline('==============================================');
      this.logMessageOutline('');
    }
  }
}
