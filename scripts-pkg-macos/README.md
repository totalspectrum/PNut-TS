# macOS DMG Packaging Scripts for PNut-TS

Scripts for creating signed and notarized DMG installers for macOS distribution.

## Prerequisites

1. **Apple Developer Account** with Developer ID Application certificate
2. **Keychain Profile** named `pnut-ts-notary` for notarization credentials
3. **Package directories** with format: `pnut-ts-macos-{arch}-{version}/pnut_ts/pnut_ts`

## Workflow

Run these scripts in order on macOS:

```
1. create-icns.sh               # Convert PNG icons to ICNS format (one-time)
2. create-dmg-background.sh     # Generate background image (one-time)
3. SIGN-BINARY.command          # Sign the pkg binary with hardened runtime
4. CREATE-STANDARD-DMGS.command # Create DMG installers with drag-to-install UI
5. SIGN-DMGS.command            # Sign the DMG files
6. NOTARIZE-AND-STAPLE.command  # Submit to Apple for notarization
```

## Setting Up Notarization Credentials

Before first use, store your credentials in the keychain:

```bash
xcrun notarytool store-credentials "pnut-ts-notary" \
    --apple-id "your-apple-id@example.com" \
    --team-id "YOUR_TEAM_ID" \
    --password "app-specific-password"
```

## Included Assets

| File | Description |
|------|-------------|
| `app-icon.png` | 800x800 PNut-TS app icon (green) |
| `volume-icon.png` | 800x800 ISP disk image icon |

These PNG files are converted to ICNS format by `create-icns.sh`.

## Script Details

| Script | Description |
|--------|-------------|
| `create-icns.sh` | Converts PNG icons to ICNS format using macOS iconutil |
| `create-dmg-background.sh` | Generates 500x300 background image for DMG |
| `SIGN-BINARY.command` | Signs binaries with Developer ID + hardened runtime |
| `CREATE-STANDARD-DMGS.command` | Creates DMG with Applications symlink and styling |
| `SIGN-DMGS.command` | Signs the DMG files themselves |
| `NOTARIZE-AND-STAPLE.command` | Submits to Apple and staples the ticket |
| `entitlements.plist` | Entitlements for hardened runtime (JIT, memory) |

## Package Structure

Expected input structure:
```
scripts-pkg-macos/
├── pnut-ts-macos-x64-XXXXXX/
│   └── pnut_ts/
│       ├── pnut_ts          # Standalone binary
│       ├── LICENSE.txt
│       ├── README.md
│       └── ... (doc files)
└── pnut-ts-macos-arm64-XXXXXX/
    └── pnut_ts/
        └── ...
```

Output DMGs:
- `pnut-ts-macos-x64-XXXXXX.dmg`
- `pnut-ts-macos-arm64-XXXXXX.dmg`

## Troubleshooting

**No Developer ID found**: Install your certificate from developer.apple.com

**Notarization Invalid**: Check entitlements and hardened runtime settings

**DMG styling not applied**: Ensure `dmg-background.png` exists in this directory
