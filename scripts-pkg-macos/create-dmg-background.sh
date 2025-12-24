#!/bin/bash
# Create DMG background image using native macOS tools (no browser)

set -e

SCRIPT_VERSION="1.4.0"

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

# Find company logo PNG
LOGO_PNG=""
SCRIPT_PARENT="$(dirname "$SCRIPT_DIR")"

# Look for company logo PNG (preferred) or SVG
if [ -f "$SCRIPT_PARENT/REF-INSTALL/Images/SteveFinalLogoV5-m-200x269.png" ]; then
    LOGO_PNG="$SCRIPT_PARENT/REF-INSTALL/Images/SteveFinalLogoV5-m-200x269.png"
    echo "Found company logo: $LOGO_PNG"
elif [ -f "$SCRIPT_PARENT/REF-INSTALL/Images/SteveFinalLogoV5-m.svg" ]; then
    echo "Found SVG logo but PNG preferred - using text fallback"
else
    echo "Company logo not found, will use text"
fi
echo ""

# Create Python script to generate the image using PIL
cat > create_bg.py << 'PYTHON_EOF'
#!/usr/bin/env python3
"""Generate DMG background image for PNut-TS"""
import sys
import os

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: PIL/Pillow not available")
    print("Install with: pip3 install Pillow")
    sys.exit(1)

# Check for logo path argument
logo_path = sys.argv[1] if len(sys.argv) > 1 else None
has_logo = logo_path and os.path.exists(logo_path)

if has_logo:
    print(f"Using company logo: {logo_path}")
else:
    print("Using text fallback for company name")

# Image dimensions
width, height = 500, 300

# Create image with white background
img = Image.new('RGB', (width, height), color='white')
draw = ImageDraw.Draw(img)

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

# Title (maroon to match logo)
title = "PNut-TS"
title_color = (128, 0, 0)  # maroon
bbox = draw.textbbox((0, 0), title, font=font_title)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 25), title, fill=title_color, font=font_title)

# Subtitle (dark gray on white background)
subtitle = "Propeller 2 Spin2/PASM2 Compiler"
bbox = draw.textbbox((0, 0), subtitle, font=font_subtitle)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 58), subtitle, fill=(80, 80, 80), font=font_subtitle)

# Company logo or text
if has_logo:
    # Load and composite the logo
    try:
        logo = Image.open(logo_path)
        # Convert to RGBA if needed for transparency
        if logo.mode != 'RGBA':
            logo = logo.convert('RGBA')
        # Scale logo to fit nicely - max 50px height for header area
        logo_w, logo_h = logo.size
        target_h = 45
        scale = target_h / logo_h
        new_w = int(logo_w * scale)
        new_h = int(logo_h * scale)
        logo = logo.resize((new_w, new_h), Image.LANCZOS)
        # Position to right side, vertically centered in header area
        x = width - new_w - 20  # 20px from right edge
        y = 25  # Align with title area
        # Paste with transparency
        img.paste(logo, (x, y), logo)
        print(f"Logo composited at ({x}, {y}), size {logo.size}")
    except Exception as e:
        print(f"Warning: Could not load logo: {e}")
else:
    # No logo - that's fine, just title and subtitle
    pass

# Draw arrow (maroon to match title/logo)
arrow_y = 150
arrow_left = 200
arrow_right = 290
arrow_thickness = 4
arrow_head_size = 12
arrow_color = (128, 0, 0)  # maroon

# Arrow shaft
draw.rectangle([(arrow_left, arrow_y - arrow_thickness//2),
                (arrow_right - arrow_head_size, arrow_y + arrow_thickness//2)],
               fill=arrow_color)

# Arrow head
draw.polygon([
    (arrow_right, arrow_y),  # tip
    (arrow_right - arrow_head_size, arrow_y - arrow_head_size),  # top
    (arrow_right - arrow_head_size, arrow_y + arrow_head_size),  # bottom
], fill=arrow_color)

# Instruction text (dark gray on white)
instruction = "Drag to Applications Folder to Install"
bbox = draw.textbbox((0, 0), instruction, font=font_instruction)
x = (width - (bbox[2] - bbox[0])) // 2
draw.text((x, 255), instruction, fill=(80, 80, 80), font=font_instruction)

# Save
img.save('dmg-background.png')
print("Background created: dmg-background.png (500x300)")
PYTHON_EOF

echo "Generating background with Python PIL..."
echo ""

# Pass logo path if available
if [ -n "$LOGO_PNG" ] && [ -f "$LOGO_PNG" ]; then
    LOGO_ARG="$LOGO_PNG"
else
    LOGO_ARG=""
fi

if python3 create_bg.py $LOGO_ARG; then
    rm -f create_bg.py
    # Clean up temporary logo PNG
    [ -f "$LOGO_PNG" ] && rm -f "$LOGO_PNG"
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
    # Clean up temporary logo PNG
    [ -f "$LOGO_PNG" ] && rm -f "$LOGO_PNG"
    echo ""
    echo "ERROR: Python PIL generation failed"
    echo ""
    echo "To fix, install Pillow:"
    echo "  pip3 install Pillow"
    echo ""
    echo "Or use the existing dmg-background.png if available"
    exit 1
fi
