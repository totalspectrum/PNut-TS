# PNut-TS Packaging Requirements

This document describes the packaging system for the PNut-TS compiler, targeting 6 platform/architecture combinations.

## Overview

PNut-TS is distributed as **standalone executables** with the Node.js 18 runtime embedded. Users do not need Node.js installed - the compiler is a single self-contained binary per platform.

## Current State Summary

| Aspect | Current Implementation |
|--------|----------------------|
| Distribution Type | Standalone executable (Node.js embedded) |
| Build Tool | TypeScript → esbuild → pkg |
| Embedded Runtime | Node.js 18 |
| Platforms | 6 (Windows, Linux, macOS × 2 architectures each) |
| Runtime Dependencies | None (Commander.js bundled) |
| Code Signing | macOS only (Apple Developer ID) |
| Notarization | macOS DMGs only |
| Current Version | 1.51.5 |

---

## Target Platforms

### Platform Matrix

| Platform | Architecture | Binary Name | Size (approx) |
|----------|-------------|-------------|---------------|
| Windows | x64 | `pnut_ts.exe` | 39 MB |
| Windows | ARM64 | `pnut_ts.exe` | 29 MB |
| Linux | x64 | `pnut_ts` | 47 MB |
| Linux | ARM64 | `pnut_ts` | 45 MB |
| macOS | x64 (Intel) | `pnut_ts` | 52 MB |
| macOS | ARM64 (Apple Silicon) | `pnut_ts` | 47 MB |

### pkg Target Strings

```json
"targets": [
  "node18-win-x64",
  "node18-win-arm64",
  "node18-linux-x64",
  "node18-linux-arm64",
  "node18-macos-x64",
  "node18-macos-arm64"
]
```

---

## Build Pipeline

### Stage 1: TypeScript Compilation

```
npm run build
```

- **Input**: `src/**/*.ts`
- **Output**: `dist/` directory
- **Compiler**: tsc (TypeScript 5.7.2)
- **Pre-step**: Copies `src/ext/*.obj` → `dist/ext/`
- **Post-step**: Makes `dist/pnut-ts.js` executable

### Stage 2: ESBuild Bundling

```
npm run esbuild
```

- **Input**: `src/pnut-ts.ts` (entry point)
- **Output**: `out/pnut-ts.js` (single bundled file)
- **Bundler**: esbuild 0.21.5
- **Format**: CommonJS
- **Pre-step**: Copies `src/ext/*.obj` → `out/ext/`
- **Post-step**: Injects build date via `scripts/insertBuildDate.js`
- **For Distribution**: Adds `--minify` flag

### Stage 3: Binary Packaging

```
pkg .
```

- **Tool**: pkg 5.8.1
- **Input**: `out/pnut-ts.js` + `out/ext/*`
- **Output**: 6 standalone executables in `pkgs/`
- **What pkg does**: Combines Node.js 18 runtime + bundled application + assets into a single executable
- **Assets**: External `.obj` files embedded in the executable

### Full Distribution Build

```
npm run bld-dist
```

Executes: `build` → `esbuild` → `npm pack` → `pkg .`

---

## External Assets (Bundled)

Four compiled object files are included in every platform package:

| File | Purpose | Size |
|------|---------|------|
| `Spin2_interpreter.obj` | P2 Spin2 interpreter bytecode | 6,184 bytes |
| `Spin2_debugger.obj` | P2 debug support | 2,932 bytes |
| `flash_loader.obj` | Flash programming support | 496 bytes |
| `clock_setter.obj` | Clock configuration | 64 bytes |

**Location in source**: `src/ext/`
**Location in bundle**: `out/ext/` → embedded via pkg

---

## Package Contents

### ZIP Naming Convention

```
pnut-ts-{platform}-{arch}-{version}.zip
```

Examples:
- `pnut-ts-linux-arm64-015106.zip`
- `pnut-ts-linux-x64-015106.zip`
- `pnut-ts-win-arm64-015106.zip`
- `pnut-ts-win-x64-015106.zip`
- `pnut-ts-macos-arm64-015106.dmg` (Apple Silicon)
- `pnut-ts-macos-x64-015106.dmg` (Intel)

### Windows & Linux Package Shape (ZIP)

All ZIPs unpack to a folder named `pnut_ts/`:

```
pnut_ts/
├── pnut_ts          (Linux) or pnut_ts.exe (Windows)
├── AUTHORS
├── CHANGELOG.md
├── CommandLine.md
├── copyright
├── LICENSE
├── Preprocessor.md
└── README.md
```

**Key Points:**
- Standalone executable with Node.js embedded (~29-47 MB)
- External `.obj` files embedded in executable (no `ext/` folder)
- Flat structure (no subdirectories)
- 7 documentation files + 1 executable = 8 files total

**Note:** `Goals.md` appeared in some packages but is internal documentation - NOT intended for distribution.

### macOS Package Shape (DMG)

macOS is distributed as a **signed and notarized DMG** containing:

```
pnut_ts.dmg
└── pnut_ts/
    ├── pnut_ts      ← standalone executable (NOT JS file)
    ├── AUTHORS
    ├── CHANGELOG.md
    ├── CommandLine.md
    ├── copyright
    ├── LICENSE
    ├── Preprocessor.md
    └── README.md
```

**Key Points:**
- Same structure as Windows/Linux (standalone binary, no `ext/` folder)
- Distributed as DMG (not ZIP)
- DMG must be code-signed and notarized
- Users do NOT need Node.js installed

**Note:** PNut-TS is a CLI tool (pkg-generated binary), NOT an Electron app like PNut-Term-TS. This means:
- Simpler signing (just the binary, not nested .app bundle)
- No .app bundle structure required
- DMG contains `pnut_ts/` folder directly

**Icon Limitation:** Custom icons cannot be set directly on the standalone binary because macOS code signing with hardened runtime rejects resource forks ("resource fork, Finder information, or similar detritus not allowed"). The icon is instead set on the containing `pnut_ts/` folder in the DMG.

---

## Required Visual Assets (macOS)

| Asset | Format | Dimensions | Purpose |
|-------|--------|------------|---------|
| DMG Background | PNG | 500×300 | Installer window background with arrow |
| App Icon | ICNS | multiple sizes | Icon for the standalone executable |
| Volume Icon | ICNS | multiple sizes | Icon shown when DMG is mounted |

**DMG Background Content:**
- Product name: "PNut-TS"
- Company: "Iron Sheep Productions, LLC"
- Arrow pointing from app to Applications folder
- Text: "Drag to Applications Folder to Install"

**Icon Requirements:**
- ICNS files must contain multiple sizes (16, 32, 128, 256, 512, 1024)
- Can be generated from a 1024×1024 PNG source

**TODO - Assets to Create:**
- [ ] DMG background image (adapt `create-dmg-background.sh` from PNut-Term-TS)
- [ ] App icon for standalone executable
- [ ] Volume icon for mounted DMG

---

## Code Signing Requirements

### macOS Code Signing (Required)

| Requirement | Details |
|-------------|---------|
| Certificate | Developer ID Application |
| Identity | `Iron Sheep Productions, LLC (T67FW2JCJW)` |
| Options | `--options=runtime` (hardened runtime) |
| Tool | `codesign` |
| Timestamp | `--timestamp` (required for notarization) |

**Signing Command**:
```bash
codesign --force --sign "$IDENTITY" \
    --options runtime \
    --timestamp \
    pnut_ts
```

### macOS DMG Creation

**Required Assets**:
| Asset | Dimensions | Purpose |
|-------|------------|---------|
| `dmg-background.png` | 500x300 | Installer window background |
| App icon (`.icns`) | various | Icon for the executable |
| Volume icon (`.icns`) | various | Icon when DMG is mounted |

**DMG Structure** (when mounted):
```
/Volumes/PNut-TS/
├── pnut_ts/              ← folder with app + docs
│   ├── pnut_ts           ← signed standalone binary
│   ├── AUTHORS
│   ├── CHANGELOG.md
│   └── ... (other docs)
├── Applications          ← symlink to /Applications
└── .background/
    └── background.png    ← hidden background image
```

**DMG Creation Process**:
1. Create staging directory with `pnut_ts/` folder contents
2. Create `Applications` symlink → `/Applications`
3. Create `.background/` folder with background image
4. Create temp read-write DMG: `hdiutil create -format UDRW`
5. Mount and apply AppleScript styling (window size, icon positions)
6. Convert to compressed: `hdiutil convert -format UDZO`

**AppleScript Window Styling**:
```applescript
tell application "Finder"
    tell disk "PNut-TS"
        set bounds of container window to {400, 100, 900, 400}
        set icon size of theViewOptions to 72
        set background picture of theViewOptions to file ".background:background.png"
        set position of item "pnut_ts" to {125, 150}
        set position of item "Applications" to {375, 150}
    end tell
end tell
```

### macOS Notarization (Required)

| Step | Command |
|------|---------|
| Submit | `xcrun notarytool submit <dmg> --keychain-profile "pnut-ts-notary" --wait` |
| Staple | `xcrun stapler staple <dmg>` |
| Validate | `xcrun stapler validate <dmg>` |

**Keychain Profile Setup** (one-time):
```bash
xcrun notarytool store-credentials "pnut-ts-notary" \
    --apple-id "your-apple-id@example.com" \
    --team-id "T67FW2JCJW" \
    --password "app-specific-password"
```

### Windows

No code signing currently implemented.

### Linux

No code signing required.

---

## Current Manual Workflow

The current packaging process is **manual** and runs on a macOS host.

### Phase 1: Build (in dev container)

```bash
npm run bld-dist
```

This produces:
- `pkgs/` - 6 platform binaries
- `out/pnut-ts.js` - bundled JS file (for macOS)
- `out/ext/` - external .obj files (for macOS)
- `p2-pnut-ts-*.tgz` - npm package

### Phase 2: Copy to Packaging Directory (Finder/manual)

```bash
# All paths relative to Dropbox/.../DIST/
pkgs/*           → _pkgs/           # All 6 platform binaries
out/pnut-ts.js   → _pkgs/           # JS file for macOS
out/ext/         → _pkgs/ext/       # External assets for macOS
prebuilds/       → _pkgs/prebuilds/ # Native modules (if any)
```

Also ensure `_dist/` has current documentation files.

### Phase 3: Package and Sign

```bash
cd DIST/
./cs_pack.sh                    # Organize into platform folders + sign macOS
./cs_zip.sh 015106              # Create versioned ZIPs (e.g., v1.51.06)
```

### Phase 4: macOS DMG Creation (Manual GUI Tool)

```bash
# 1. Run DropDMG (GUI app) to create DMGs for each macOS architecture
#    - Validate content of each DMG is correct

# 2. Sign the DMGs
./cs_dmg.sh

# 3. Notarize ARM64 DMG
./cs_not_dmgarm64.sh
xcrun stapler staple _unzipped/macos/macos-arm64.dmg

# 4. Notarize x64 DMG
./cs_not_dmgx64.sh
xcrun stapler staple _unzipped/macos/macos-x64.dmg

# 5. Zip the DMGs
./cs_zip_dmgs.sh
```

### Phase 5: Upload to GitHub

```bash
# Upload all ZIPs from _UPLOAD/ to GitHub Releases page
```

### Phase 6: Git Tagging

```bash
git tag -a v1.51.6 -m "Tag message"
git push origin --tags
```

---

## Script Inventory

| Script | Purpose | Inputs |
|--------|---------|--------|
| `cs_pack.sh` | Organize binaries + sign macOS | Reads from `_pkgs/`, `_dist/` |
| `cs_zip.sh` | Create platform ZIPs | `{version}` e.g., `015106` |
| `cs_dmg.sh` | Sign DMG files | DMGs in `_unzipped/macos/` |
| `cs_not_dmgarm64.sh` | Notarize ARM64 DMG | Uses keychain profile |
| `cs_not_dmgx64.sh` | Notarize x64 DMG | Uses keychain profile |
| `cs_zip_dmgs.sh` | Zip DMGs for upload | DMGs in `_unzipped/macos/` |
| `cs_fixUploadNames.sh` | Rename ZIPs with version | `{version}` (has bug - unused) |
| `cs_cln.sh` | Clean output directories | Interactive confirmation |

---

## Issues to Fix in New Workflow

### 1. macOS must use standalone binary

**Current:** macOS ships raw JS file (requires Node.js)
**Required:** macOS should ship standalone executable (same as Windows/Linux)

The pkg binaries ARE being signed in `cs_pack.sh` (lines 21-22) but then NOT used (lines 31, 40 are commented out). The new workflow must use the signed pkg binary.

### 2. Goals.md incorrectly included

`Goals.md` is internal documentation that was accidentally distributed. Must be excluded from packages.

### 3. Documentation source files

Ensure `_dist/` or equivalent contains exactly these 7 files:
- AUTHORS
- CHANGELOG.md
- CommandLine.md
- copyright
- LICENSE
- Preprocessor.md
- README.md

### 4. Bug in `cs_fixUploadNames.sh`

Line 44 uses undefined `${version_suffix}` instead of `${BUILD_VERSION}`. (May not matter if script is replaced by GitHub Actions.)

---

## Version Numbering

| Format | Example | Usage |
|--------|---------|-------|
| Semantic | `1.51.5` | package.json, display |
| Packed | `015105` | ZIP file naming |

**ZIP Naming**: `pnut-ts-{platform}-{arch}-{version}.zip`

Example: `pnut-ts-linux-x64-015105.zip`

---

## Design Decisions

| Decision | Choice |
|----------|--------|
| Windows code signing | No |
| macOS DMGs | Yes, automate creation |
| npm publish | No |
| Package structure | Consistent across platforms (macOS may differ slightly) |

---

## Automation Requirements

### GitHub Actions Capabilities

| Task | Tool | Available on Runner |
|------|------|---------------------|
| Build binaries | pkg | Yes (via npm) |
| Create DMG | `hdiutil` | Yes (macOS native) |
| Code sign | `codesign` | Yes (macOS native) |
| Notarize | `xcrun notarytool` | Yes (macOS native) |
| Staple | `xcrun stapler` | Yes (macOS native) |
| Create ZIP | `zip` / `ditto` | Yes (all platforms) |
| Upload release | `gh` / actions | Yes |

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `APPLE_DEVELOPER_ID_CERT` | Base64-encoded .p12 certificate |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD` | Password for .p12 |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_ID_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID (T67FW2JCJW) |

### DMG Creation Command

```bash
hdiutil create -volname "PNut_TS" \
  -srcfolder ./pnut_ts \
  -ov -format UDZO \
  pnut-ts-macos-arm64.dmg
```

---

## Dependencies

### Build Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | 5.7.2 | Compilation |
| esbuild | 0.21.5 | Bundling |
| pkg | 5.8.1 | Binary packaging |

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| commander | 12.1.0 | CLI parsing |

---

## File Locations

| Path | Purpose |
|------|---------|
| `package.json` | Build config, pkg targets |
| `scripts/prepExt` | Copy .obj files |
| `scripts/insertBuildDate.js` | Inject build date |
| `scripts-pkg/` | Post-build packaging scripts |
| `scripts-pkg/_dist/` | Documentation for packages |
| `scripts-pkg/_pkgs/` | Staging for binaries |
| `scripts-pkg/_unzipped/` | Organized platform folders |
| `scripts-pkg/_UPLOAD/` | Final ZIPs for release |

---

---

## Required Upgrade: Node.js and pkg

### Current State (DO NOT REMOVE - fallback recipe)

| Component | Version | Status |
|-----------|---------|--------|
| pkg | `5.8.1` (vercel/pkg) | Unmaintained (3 years) |
| Node Target | `node18` | **END OF LIFE** (April 30, 2025) |

### Node.js LTS Timeline

| Version | Active LTS Ends | End of Life | Status |
|---------|-----------------|-------------|--------|
| Node 18 | Oct 2023 | Apr 2025 | **EOL - unsupported** |
| Node 20 | Oct 2024 | Apr 2026 | Maintenance |
| Node 22 | Oct 2025 | Apr 2027 | **Active LTS** ✓ |
| Node 24 | Oct 2026 | Apr 2028 | Active LTS (newest) |

### Upgrade Path

The original `vercel/pkg` does not support Node 20 or 22.

**Solution**: Switch to [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) - actively maintained fork (v6.11.0) that supports `node20` and `node22` targets.

**Changes Required**:

```json
// package.json - CURRENT (keep until tested)
"devDependencies": {
  "pkg": "^5.8.1"
}
"pkg": {
  "targets": [
    "node18-win-arm64",
    "node18-win-x64",
    "node18-linux-x64",
    "node18-linux-arm64",
    "node18-macos-x64",
    "node18-macos-arm64"
  ]
}

// package.json - UPGRADE TO (after testing)
"devDependencies": {
  "@yao-pkg/pkg": "^6.11.0"
}
"pkg": {
  "targets": [
    "node22-win-arm64",
    "node22-win-x64",
    "node22-linux-x64",
    "node22-linux-arm64",
    "node22-macos-x64",
    "node22-macos-arm64"
  ]
}
```

**Testing Required**: Build all 6 platforms and verify binaries work before committing upgrade.

---

## GitHub Actions Workflow

### Automated Release Process

The release process is automated via GitHub Actions (`.github/workflows/release.yml`):

```
Trigger: Push tag v*
    ↓
Build Job (ubuntu-latest)
    ├── npm ci
    ├── npm run build
    ├── npm run esbuild
    ├── npm test
    ├── npx @yao-pkg/pkg . --out-path pkgs
    ├── Package with docs → ZIP (Windows/Linux)
    └── Upload artifacts
    ↓
macOS Sign Job (macos-latest)
    ├── Download macOS package artifacts
    ├── Import signing certificate
    ├── Sign binaries (codesign)
    ├── Create DMGs (hdiutil)
    ├── Sign DMGs (codesign)
    ├── Notarize DMGs (notarytool)
    ├── Staple tickets (stapler)
    └── Upload DMG artifacts
    ↓
Release Job (ubuntu-latest)
    ├── Download all artifacts
    ├── Generate checksums
    └── Create GitHub Release
```

### Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 certificate |
| `MACOS_CERTIFICATE_PWD` | Password for the .p12 certificate |
| `KEYCHAIN_PWD` | Password for temporary keychain |
| `APPLE_TEAM_ID` | Apple Developer Team ID (e.g., T67FW2JCJW) |
| `APPLE_DEVELOPER_NAME` | Developer name for signing identity |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_ID_PASSWORD` | App-specific password for notarization |

### CI Workflow

The CI workflow (`.github/workflows/ci.yml`) runs on every push/PR to main:

1. **Lint** - ESLint check
2. **Test** - Jest test suite
3. **Build Check** - Verify TypeScript and pkg build

---

## Local macOS Testing Scripts

For local testing on macOS before committing changes, use the scripts in `scripts-pkg-macos/`:

### Workflow

```bash
# 1. Generate background image (one-time)
./create-dmg-background.sh

# 2. Sign the standalone binary
./SIGN-BINARY.command

# 3. Create DMG installers
./CREATE-STANDARD-DMGS.command

# 4. Sign the DMG files
./SIGN-DMGS.command

# 5. Notarize with Apple
./NOTARIZE-AND-STAPLE.command
```

### Script Inventory

| Script | Purpose |
|--------|---------|
| `entitlements.plist` | Entitlements for hardened runtime (JIT, memory) |
| `create-dmg-background.sh` | Generate PNut-TS branded background image |
| `SIGN-BINARY.command` | Sign pkg binary with Developer ID |
| `CREATE-STANDARD-DMGS.command` | Create DMG with drag-to-install UI |
| `SIGN-DMGS.command` | Sign the DMG files |
| `NOTARIZE-AND-STAPLE.command` | Submit to Apple and staple ticket |

### Prerequisites

1. **Apple Developer ID Application certificate** installed in Keychain
2. **Keychain profile** named `pnut-ts-notary` configured:

```bash
xcrun notarytool store-credentials "pnut-ts-notary" \
    --apple-id "your-apple-id@example.com" \
    --team-id "YOUR_TEAM_ID" \
    --password "app-specific-password"
```

3. **Package directories** with format: `pnut-ts-macos-{arch}-{version}/pnut_ts/pnut_ts`

---

## Release Checklist

### Before Release

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] Run full test suite: `npm run test-full`
- [ ] Commit changes

### Release

```bash
# Create and push tag
git tag -a v1.51.6 -m "Release v1.51.6"
git push origin v1.51.6

# GitHub Actions will automatically:
# - Build all 6 platform packages
# - Sign and notarize macOS DMGs
# - Create GitHub Release with all artifacts
```

### Post-Release Verification

- [ ] Download and test each platform package
- [ ] Verify macOS DMG opens without Gatekeeper warning
- [ ] Verify `pnut_ts --version` shows correct version

---

## Future Consideration: App Bundle Wrapper

### The Problem

macOS code signing with hardened runtime does not allow resource forks on binaries. This means custom icons cannot be set directly on the `pnut_ts` executable - the codesign tool rejects them with "resource fork, Finder information, or similar detritus not allowed".

The `vercel/pkg` tool (now archived) never implemented `--icon` support for macOS binaries.

### Current Workaround

Set the custom icon on the `pnut_ts/` folder instead of the binary. Users see the icon in the DMG when dragging to Applications.

### Future Alternative: Minimal App Bundle

Wrap the CLI binary in a minimal `.app` bundle structure. App bundles can have icons via `Info.plist` (stored in `Contents/Resources/`) without breaking code signatures.

**Structure:**
```
PNut-TS.app/
├── Contents/
│   ├── Info.plist          ← references the icon
│   ├── MacOS/
│   │   └── pnut_ts         ← the signed binary
│   └── Resources/
│       └── app-icon.icns   ← the icon file
```

**Minimal Info.plist:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>pnut_ts</string>
    <key>CFBundleIconFile</key>
    <string>app-icon</string>
    <key>CFBundleIdentifier</key>
    <string>com.ironsheep.pnut-ts</string>
    <key>CFBundleName</key>
    <string>PNut-TS</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>1.51.5</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
</dict>
</plist>
```

**Pros:**
- Icon displays properly on the app
- Proper macOS application experience
- Could add file associations in the future

**Cons:**
- More complex packaging
- Users install `.app` instead of raw binary
- CLI usage requires adding to PATH or creating symlink

**References:**
- [The Eclectic Light Company: How to add a custom icon without breaking signature](https://eclecticlight.co/2019/07/20/how-to-add-a-custom-icon-to-an-app-without-breaking-its-signature/)
- [Apple QA1940: Resource fork not allowed](https://developer.apple.com/library/archive/qa/qa1940/_index.html)
