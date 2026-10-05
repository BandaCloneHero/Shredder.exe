"""Build small WebP assets for the profile UI, preserving original PNGs.

Requires Pillow: python -m pip install Pillow
Run from any directory: python scripts/optimize-profile-images.py
"""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1] / "docs"


def optimize(files, size):
    before = after = 0
    count = 0
    for source in sorted(files):
        with Image.open(source) as image:
            thumbnail = ImageOps.exif_transpose(image).convert("RGBA")
            thumbnail.thumbnail((size, size), Image.Resampling.LANCZOS)
            destination = source.with_suffix(".webp")
            thumbnail.save(destination, "WEBP", quality=82, method=6)
        before += source.stat().st_size
        after += destination.stat().st_size
        count += 1
    print(f"{count} images: {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB ({100 * (1 - after / before):.1f}% smaller)")


if __name__ == "__main__":
    optimize((ROOT / "assets/achievements").glob("*.png"), 256)
    optimize((ROOT / "images/avatars").glob("*.png"), 256)
    optimize([ROOT / "images/moldura-cyberpunk-musical.png"], 256)
