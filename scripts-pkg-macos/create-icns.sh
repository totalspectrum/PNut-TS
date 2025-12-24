#!/bin/bash
# Convert PNG images to ICNS format for macOS
# Requires: macOS with iconutil command

set -e

SCRIPT_VERSION="1.0.0"

echo "🎨 PNut-TS ICNS Icon Creation v${SCRIPT_VERSION}"
echo "============================================"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script must be run on macOS"
    echo "   iconutil is only available on macOS"
    exit 1
fi

# Function to create ICNS from image (handles JPEG disguised as PNG)
create_icns() {
    local SOURCE_FILE=$1
    local ICNS_NAME=$2
    local ICONSET_DIR="${ICNS_NAME}.iconset"
    local TEMP_PNG="${ICNS_NAME}_temp.png"

    if [ ! -f "$SOURCE_FILE" ]; then
        echo "⚠️  Source file not found: $SOURCE_FILE"
        return 1
    fi

    echo "📦 Creating ${ICNS_NAME}.icns from ${SOURCE_FILE}..."

    # First, convert to proper PNG format (handles JPEG with .png extension)
    echo "   🔄 Converting to PNG format..."
    sips -s format png "$SOURCE_FILE" --out "$TEMP_PNG" >/dev/null 2>&1

    if [ ! -f "$TEMP_PNG" ]; then
        echo "   ❌ Failed to convert to PNG"
        return 1
    fi

    # Create iconset directory
    rm -rf "$ICONSET_DIR"
    mkdir -p "$ICONSET_DIR"

    # Generate all required sizes
    # Standard sizes: 16, 32, 128, 256, 512
    # Retina sizes: 32 (16@2x), 64 (32@2x), 256 (128@2x), 512 (256@2x), 1024 (512@2x)

    echo "   📐 Generating icon sizes..."
    sips -z 16 16     "$TEMP_PNG" --out "${ICONSET_DIR}/icon_16x16.png" >/dev/null 2>&1
    sips -z 32 32     "$TEMP_PNG" --out "${ICONSET_DIR}/icon_16x16@2x.png" >/dev/null 2>&1
    sips -z 32 32     "$TEMP_PNG" --out "${ICONSET_DIR}/icon_32x32.png" >/dev/null 2>&1
    sips -z 64 64     "$TEMP_PNG" --out "${ICONSET_DIR}/icon_32x32@2x.png" >/dev/null 2>&1
    sips -z 128 128   "$TEMP_PNG" --out "${ICONSET_DIR}/icon_128x128.png" >/dev/null 2>&1
    sips -z 256 256   "$TEMP_PNG" --out "${ICONSET_DIR}/icon_128x128@2x.png" >/dev/null 2>&1
    sips -z 256 256   "$TEMP_PNG" --out "${ICONSET_DIR}/icon_256x256.png" >/dev/null 2>&1
    sips -z 512 512   "$TEMP_PNG" --out "${ICONSET_DIR}/icon_256x256@2x.png" >/dev/null 2>&1
    sips -z 512 512   "$TEMP_PNG" --out "${ICONSET_DIR}/icon_512x512.png" >/dev/null 2>&1
    sips -z 1024 1024 "$TEMP_PNG" --out "${ICONSET_DIR}/icon_512x512@2x.png" >/dev/null 2>&1

    # Clean up temp PNG
    rm -f "$TEMP_PNG"

    # Convert iconset to icns
    echo "   🔨 Building ICNS..."
    iconutil -c icns "$ICONSET_DIR"

    # Clean up iconset directory
    rm -rf "$ICONSET_DIR"

    if [ -f "${ICNS_NAME}.icns" ]; then
        echo "   ✅ Created ${ICNS_NAME}.icns"
        return 0
    else
        echo "   ❌ Failed to create ${ICNS_NAME}.icns"
        return 1
    fi
}

# Create app icon
if [ -f "app-icon.png" ]; then
    create_icns "app-icon.png" "app-icon"
else
    echo "⚠️  app-icon.png not found"
fi

echo ""

# Create volume icon
if [ -f "volume-icon.png" ]; then
    create_icns "volume-icon.png" "volume-icon"
else
    echo "⚠️  volume-icon.png not found"
fi

echo ""
echo "=========================================="
echo "✅ ICNS Icon Creation Complete!"
echo "=========================================="
echo ""

if [ -f "app-icon.icns" ]; then
    echo "📦 App icon:    app-icon.icns ($(du -h app-icon.icns | cut -f1))"
fi

if [ -f "volume-icon.icns" ]; then
    echo "📦 Volume icon: volume-icon.icns ($(du -h volume-icon.icns | cut -f1))"
fi

echo ""
echo "🎯 Next step: Run CREATE-STANDARD-DMGS.command"
echo "   The script will automatically use these icons"
echo ""
echo "Press any key to exit..."
read -n 1 -s
