#!/bin/bash
# Create DMG background image using native macOS tools (no browser)

set -e

SCRIPT_VERSION="1.1.0"

echo "PNut-TS DMG Background Creation v${SCRIPT_VERSION}"
echo "=============================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if background already exists
if [ -f "dmg-background.png" ]; then
    echo "Existing background found: dmg-background.png"
    if command -v sips &> /dev/null; then
        sips -g pixelWidth -g pixelHeight dmg-background.png 2>/dev/null | grep pixel || true
    fi
    echo ""
    read -p "Regenerate? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing background."
        exit 0
    fi
fi

# Create Python script to generate the image using PIL
cat > create_bg.py << 'PYTHON_EOF'
#!/usr/bin/env python3
"""Generate DMG background image for PNut-TS"""
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: PIL/Pillow not available")
    print("Install with: pip3 install Pillow")
    sys.exit(1)

# Image dimensions
width, height = 500, 300

# Create image
img = Image.new('RGB', (width, height), color='white')
draw = ImageDraw.Draw(img)

# Create gradient background (dark blue theme)
# Top: #1e3a5f, Bottom: #0d1f33
for y in range(height):
    r = int(30 + (13 - 30) * y / height)
    g = int(58 + (31 - 58) * y / height)
    b = int(95 + (51 - 95) * y / height)
    draw.rectangle([(0, y), (width, y+1)], fill=(r, g, b))

# Try to use system fonts
try:
    font_title = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
    font_subtitle = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
    font_company = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11)
    font_instruction = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
except:
    # Fallback to default font
    font_title = ImageFont.load_default()
    font_subtitle = font_title
    font_company = font_title
    font_instruction = font_title

# Title (orange)
title = "PNut-TS"
title_color = (255, 107, 53)  # #ff6b35
bbox = draw.textbbox((0, 0), title, font=font_title)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 25), title, fill=title_color, font=font_title)

# Subtitle
subtitle = "Propeller 2 Spin2/PASM2 Compiler"
subtitle_color = (255, 255, 255, 230)
bbox = draw.textbbox((0, 0), subtitle, font=font_subtitle)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 58), subtitle, fill=(255, 255, 255), font=font_subtitle)

# Company
company = "Iron Sheep Productions, LLC"
bbox = draw.textbbox((0, 0), company, font=font_company)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 78), company, fill=(180, 180, 180), font=font_company)

# Draw arrow (white, pointing right)
arrow_y = 150
arrow_left = 200
arrow_right = 290
arrow_thickness = 4
arrow_head_size = 12

# Arrow shaft
draw.rectangle([(arrow_left, arrow_y - arrow_thickness//2),
                (arrow_right - arrow_head_size, arrow_y + arrow_thickness//2)],
               fill='white')

# Arrow head
draw.polygon([
    (arrow_right, arrow_y),  # tip
    (arrow_right - arrow_head_size, arrow_y - arrow_head_size),  # top
    (arrow_right - arrow_head_size, arrow_y + arrow_head_size),  # bottom
], fill='white')

# Instruction text
instruction = "Drag to Applications Folder to Install"
bbox = draw.textbbox((0, 0), instruction, font=font_instruction)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 255), instruction, fill='white', font=font_instruction)

# Save
img.save('dmg-background.png')
print("Background created: dmg-background.png (500x300)")
PYTHON_EOF

echo "Generating background with Python PIL..."
echo ""

if python3 create_bg.py; then
    rm -f create_bg.py
    echo ""
    echo "=========================================="
    echo "DMG Background Creation Complete!"
    echo "=========================================="
    echo ""

    # Show image info using sips
    if command -v sips &> /dev/null; then
        echo "Image info:"
        sips -g pixelWidth -g pixelHeight -g format dmg-background.png 2>/dev/null | grep -E "(pixel|format)" || true
    fi
    echo ""
    echo "Next step: Run CREATE-STANDARD-DMGS.command"
else
    rm -f create_bg.py
    echo ""
    echo "ERROR: Python PIL generation failed"
    echo ""
    echo "To fix, install Pillow:"
    echo "  pip3 install Pillow"
    echo ""
    echo "Or use the existing dmg-background.png if available"
    exit 1
fi
