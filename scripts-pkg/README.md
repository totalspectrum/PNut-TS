# NOTES for /PropV2-Shared/Projects/PNutTS-work/DIST/

Many things are supported from this directory. One of the more important is the Packaging of PNut TS for each release.

## Executable Naming Convention

Starting with v2.0 of the packaging scripts:

| Name | Type | Description |
|------|------|-------------|
| `pnut-ts` | Primary | Main executable (hyphenated, matches project name) |
| `pnut_ts` | Alias | Backward compatibility symlink/copy |

- **macOS/Linux**: `pnut_ts` is a symlink pointing to `pnut-ts`
- **Windows**: `pnut_ts.exe` is a copy of `pnut-ts.exe` (symlinks require admin privileges)

Both names work identically. Use `pnut-ts` for new scripts and documentation.

## Packaging PNut_TS

The cs_* scripts in this folder are run in sequence to package a new release of PNut_TS.

## The Packaging Scripts

| Script | Actions | Inputs
| --- | --- | --- | 
| cs_dmg.sh | Codesigns the .dmg files in `./_unsipped/macos/` | none
| cs_fixUploadNames.sh | expects .zip files in `_UPLOAD/` to not have version suffix. backs up the current files to `_UPLOAD/PRIOR_ZIPS/`, renames .zip files with new version suffix | {buildVersion}
| cs\_not_dmgarm64.sh | runs the command to notarize (w/Apple) the `_unzipped/macos/macos-arm64.dmg` file | none
| cs\_not_dmgx64.sh | runs the command to notarize (w/Apple) the `_unzipped/macos/macos-x64.dmg` file | none
| cs_onetime.sh | run this one time to create the local credential store (each time the credentials change) | none
| cs_pack.sh | creates the machine-specific folders by moving raw files into into place in order to compress and sign them | none
| cs\_zip_dmgs.sh | zips are two macOS .dmg files and places them in the `_UPLOADs/` folder | none
| cs_zip.sh | compresses our 6 OS folders found in `_unzipped` and places the new .zip files in `_UPLOAD` | {buildVersion}


**NOTE:** *where ${BUILD_VERSION} looks like 014303 for v1.43.03*

### Preparation for packaging 

Two folders `_dist` and `_pkgs` are first updated to the very latest files from the working repository folder.  We simply copy these files into place replacing what's in the target folders.

In vscode build environment:

- Buld distribution files with: `npm run bld-dist`

From Finder copy files into place:

- Copy `./pkgs/` content to `./PropV2-Shared/Projects/PNutTS-work/DIST/_pkgs`
- Copy `./out/pnut-ts.js` to `./PropV2-Shared/Projects/PNutTS-work/DIST/_pkgs/pnut_ts`
  - cs_pack.sh will use this for macOS images for now.. (NOT .dmg files)
- Copy `./out/ext/` to `./PropV2-Shared/Projects/PNutTS-work/DIST/_pkgs/`
  - cs_pack.sh will use this for macOS images for now.. (NOT .dmg files)
- Ensure content of `./PropV2-Shared/Projects/PNutTS-work/DIST/_dist/` is current (has latest stuff)

### Actual Packaging (macOS has no .dmg's)

Then we run the scripts to build the .zip files for upload:

- Run `./cs_pack.sh` to fill `_unzipped/` with correctly shaped folders with signed macOS exe's
- Prepare _UPLOAD
	- Duplicate `_UPLOAD/` folder and rename to `UPLOAD_v99.99.99/`
	- Now, from original `_UPLOAD/`, remove *.zip and PRIOR_ZIPS/*.zip
- Run `./cs_zip.sh 014305` for v01.43.05, put initial .zip files in _UPLOAD
- UPLOAD all the `_UPLOAD/.zip's` to the releases page for the given release


### Actual Packaging (with .dmg's for macOS)

Then we run the scripts to build the .zip files for upload:

- Run `./cs_pack.sh` to fill `_unzipped/` with correctly shaped folders with signed macOS exe's
- Run `./cs_zip.sh` put initial .zip files in _UPLOAD
- Run, manually, DropDMG to build dmg's for each of two macOS arch's
	- VALIDATE that content of .dmg is correct for each ARCH
- Run `./cs_dmg.sh` to sign the new DMGs
- Run `./cs_not_dmgarm64.sh to notarize the arm64 DMG
	- at end run do `xcrun stapler staple _unzipped/macos/macos-arm64.dmg` to complete the DMG
- Run `./cs_not_dmgx64.sh` to notarize the x64 DMG
	- at end run `xcrun stapler staple _unzipped/macos/macos-x64.dmg` to complete the DMG
- Prepare _UPLOAD
	- Duplicate `_UPLOAD/` folder and rename to `UPLOAD_v99.99.99/`
	- Nw from original `_UPLOAD/` remove *.zip and PRIOR_ZIPS/*.zip
- Run `./cs_zip_dmgs.sh`  to zip the .dmg files and place the .zips in _UPLOAD
- Run `./cs_fixUploadNames.sh` to formally name the .zip files before uploading to repo as assets
	- Ex: run `cs_fixUploadNames.sh 014305` for v01.43.05
- UPLOAD all the `_UPLOAD/.zip's` to the releases page for the given release

