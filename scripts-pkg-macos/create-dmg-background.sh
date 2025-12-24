#!/bin/bash
# Create DMG background image with drag arrow instructions for PNut-TS

set -e

SCRIPT_VERSION="1.0.0"

echo "🎨 PNut-TS DMG Background Creation v${SCRIPT_VERSION}"
echo "=============================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create HTML file to generate the background
cat > dmg-background.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 0;
            width: 500px;
            height: 300px;
            background: linear-gradient(135deg, #1e3a5f 0%, #0d1f33 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
        }

        /* Subtle pattern overlay */
        body::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image:
                repeating-linear-gradient(45deg,
                    transparent,
                    transparent 35px,
                    rgba(255,255,255,0.02) 35px,
                    rgba(255,255,255,0.02) 70px);
            pointer-events: none;
        }

        .arrow {
            width: 100px;
            height: 60px;
            position: relative;
        }

        .arrow-line {
            position: absolute;
            top: 50%;
            left: 10px;
            width: 60px;
            height: 4px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 2px;
            transform: translateY(-50%);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .arrow-head {
            position: absolute;
            top: 50%;
            right: 10px;
            width: 0;
            height: 0;
            border-style: solid;
            border-width: 12px 0 12px 20px;
            border-color: transparent transparent transparent rgba(255, 255, 255, 0.9);
            transform: translateY(-50%);
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));
        }

        .instruction {
            position: absolute;
            bottom: 40px;
            color: white;
            font-size: 18px;
            font-weight: 600;
            text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            letter-spacing: 0.5px;
        }

        .app-name {
            position: absolute;
            top: 30px;
            left: 50%;
            transform: translateX(-50%);
            color: #ff6b35;
            font-size: 28px;
            font-weight: 700;
            text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
            letter-spacing: 1px;
        }

        .subtitle {
            position: absolute;
            top: 62px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.9);
            font-size: 14px;
            font-weight: 500;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
            letter-spacing: 0.5px;
        }

        .company {
            position: absolute;
            top: 82px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.6);
            font-size: 11px;
            font-weight: 400;
            text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="app-name">PNut-TS</div>
    <div class="subtitle">Propeller 2 Spin2/PASM2 Compiler</div>
    <div class="company">Iron Sheep Productions, LLC</div>

    <div class="arrow">
        <div class="arrow-line"></div>
        <div class="arrow-head"></div>
    </div>

    <div class="instruction">Drag to Applications Folder to Install</div>
</body>
</html>
EOF

echo "📄 Created dmg-background.html"
echo ""

# Check for required tools
if ! command -v wkhtmltoimage &> /dev/null; then
    echo "⚠️  wkhtmltoimage not found. Trying alternative method..."
    echo ""

    # Try using Safari/Chrome to capture
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🔄 Using screencapture method on macOS..."

        # Open in Safari in the background
        open -g dmg-background.html

        echo "⏳ Waiting for browser to render..."
        sleep 3

        # Use AppleScript to capture the specific window
        osascript << 'APPLESCRIPT'
tell application "Safari"
    set allWindows to every window
    repeat with aWindow in allWindows
        set currentURL to URL of current tab of aWindow
        if currentURL contains "dmg-background.html" then
            set bounds of aWindow to {100, 100, 600, 400}
            activate
            delay 1
        end if
    end repeat
end tell

do shell script "screencapture -w -x dmg-background-raw.png"
APPLESCRIPT

        echo "✅ Screenshot captured"

        # Check if ImageMagick is available for cropping
        if command -v convert &> /dev/null; then
            echo "🔄 Cropping image to 500x300..."
            convert dmg-background-raw.png -crop 500x300+0+0 dmg-background.png
            rm dmg-background-raw.png
            echo "✅ Background image created: dmg-background.png"
        else
            echo "⚠️  ImageMagick not found. Manual cropping required."
            mv dmg-background-raw.png dmg-background.png
            echo "✅ Background image created: dmg-background.png (needs cropping to 500x300)"
        fi

        # Close the Safari tab
        osascript -e 'tell application "Safari" to close (every tab of every window whose URL contains "dmg-background.html")'

    else
        echo "❌ Not on macOS and wkhtmltoimage not available"
        echo ""
        echo "Options:"
        echo "1. Install wkhtmltoimage:"
        echo "   brew install --cask wkhtmltopdf"
        echo ""
        echo "2. Or open dmg-background.html in a browser and:"
        echo "   - Take a screenshot"
        echo "   - Crop to 500x300 pixels"
        echo "   - Save as dmg-background.png"
    fi
else
    echo "🔄 Converting HTML to PNG using wkhtmltoimage..."
    wkhtmltoimage --width 500 --height 300 dmg-background.html dmg-background.png
    echo "✅ Background image created: dmg-background.png"
fi

# Create a simpler alternative if the above fails
if [ ! -f "dmg-background.png" ]; then
    echo ""
    echo "🎨 Creating simple SVG alternative..."

    cat > dmg-background.svg << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="300" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a5f;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d1f33;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="500" height="300" fill="url(#bg)"/>

  <!-- Title -->
  <text x="250" y="40" font-family="Helvetica, Arial" font-size="28" font-weight="bold" fill="#ff6b35" text-anchor="middle">PNut-TS</text>

  <!-- Subtitle -->
  <text x="250" y="62" font-family="Helvetica, Arial" font-size="14" font-weight="500" fill="white" opacity="0.9" text-anchor="middle">Propeller 2 Spin2/PASM2 Compiler</text>

  <!-- Company -->
  <text x="250" y="82" font-family="Helvetica, Arial" font-size="11" fill="white" opacity="0.6" text-anchor="middle">Iron Sheep Productions, LLC</text>

  <!-- Arrow only (no icon placeholders) -->
  <line x1="210" y1="150" x2="270" y2="150" stroke="white" stroke-width="4" opacity="0.9"/>
  <polygon points="290,150 270,140 270,160" fill="white" opacity="0.9"/>

  <!-- Instruction text -->
  <text x="250" y="260" font-family="Helvetica, Arial" font-size="18" font-weight="600" fill="white" text-anchor="middle">Drag to Applications Folder to Install</text>
</svg>
EOF

    echo "✅ Created dmg-background.svg"
    echo ""
    echo "📝 Note: You'll need to convert the SVG to PNG"
    echo "   You can use an online converter or ImageMagick:"
    echo "   convert dmg-background.svg dmg-background.png"
fi

echo ""
echo "=========================================="
echo "✅ DMG Background Creation Complete!"
echo "=========================================="
echo ""

if [ -f "dmg-background.png" ]; then
    echo "📦 Background image ready: dmg-background.png"
    echo "   Dimensions: 500x300 pixels"
    echo ""
    echo "🎯 Next step: Run CREATE-STANDARD-DMGS.command"
    echo "   The script will automatically use this background"
else
    echo "📝 Manual steps required:"
    echo "1. Open dmg-background.html in a browser"
    echo "2. Take a screenshot of the content"
    echo "3. Crop to exactly 500x300 pixels"
    echo "4. Save as dmg-background.png in this directory"
    echo ""
    echo "Or convert the SVG:"
    echo "   convert dmg-background.svg dmg-background.png"
fi

echo ""
echo "Press any key to exit..."
read -n 1 -s
