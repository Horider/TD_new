"""Extract the eleven arrow storyboard stages as transparent watercolor PNGs."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "arrow-storyboard-11-frames.png"
OUT = ROOT / "watercolor-frames"
FRAME_SIZE = (512, 384)


def watercolor_frame(panel: Image.Image, index: int) -> Image.Image:
    rgb = np.asarray(panel.convert("RGB"), dtype=np.float32)
    red, green, blue = rgb.transpose(2, 0, 1)
    gold = (red > 65) & ((red - green) > 8) & ((green - blue) > 12)
    nearby = Image.fromarray((gold.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(21))
    bright = (red > 135) & (green > 120) & (blue > 95) & (np.asarray(nearby) > 0)
    selected = gold | bright

    warmth = np.clip((red - blue - 8) / 95, 0, 1)
    luminance = np.clip((red - 60) / 165, 0, 1)
    bright_strength = np.clip((np.minimum(red, green) - 110) / 125, 0, 1)
    opacity = np.where(gold, .72 * warmth + .28 * luminance, bright_strength)
    opacity = np.where(selected, np.power(np.clip(opacity, 0, 1), 1.38), 0)
    opacity = np.where(opacity < .12, 0, opacity)

    # Deterministic fibers and pigment granulation are painted only inside the alpha.
    rng = np.random.default_rng(20261013 + index)
    height, width = red.shape
    fine = rng.normal(0, 1, (height, width))
    coarse_noise = rng.integers(0, 256, (height, width), dtype=np.uint8)
    coarse = np.asarray(Image.fromarray(coarse_noise, "L").filter(ImageFilter.GaussianBlur(5)), dtype=np.float32)
    coarse = (coarse - 127) / 8
    fibers = np.asarray(Image.fromarray(rng.integers(0, 256, (height, width), dtype=np.uint8), "L").filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32)
    fibers = (fibers - 127) / 10
    texture = fine * 5 + coarse * 4 + fibers * 3

    energy = np.clip((red + green + blue - 165) / 585, 0, 1)
    # Keep the original detailed arrow silhouette; replace electronic glow with pigment.
    paint = np.empty((height, width, 4), dtype=np.uint8)
    paint[:, :, 0] = np.clip(166 + energy * 80 + texture, 0, 255)
    paint[:, :, 1] = np.clip(105 + energy * 120 + texture * .82, 0, 255)
    paint[:, :, 2] = np.clip(49 + energy * 135 + texture * .67, 0, 255)
    paint[:, :, 3] = np.rint(opacity * 255).astype(np.uint8)

    image = Image.fromarray(paint, "RGBA")
    scale = 1.38 if index <= 6 else 1.15
    image = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", FRAME_SIZE, (0, 0, 0, 0))
    x = (FRAME_SIZE[0] - image.width) // 2
    y = (FRAME_SIZE[1] - image.height) // 2
    result.paste(image, (x, y))
    return result


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    sprite = Image.new("RGBA", (FRAME_SIZE[0] * 6, FRAME_SIZE[1] * 2), (0, 0, 0, 0))
    frames = []
    for index in range(1, 12):
        if index <= 6:
            col = index - 1
            x0, x1 = round(col * sheet.width / 6), round((col + 1) * sheet.width / 6)
            y0, y1 = 0, round(sheet.height / 2)
            panel = sheet.crop((x0 + 2, y0 + 77, x1 - 2, y1 - 18))
        else:
            col = index - 7
            x0, x1 = round(col * sheet.width / 5), round((col + 1) * sheet.width / 5)
            y0, y1 = round(sheet.height / 2), sheet.height
            panel = sheet.crop((x0 + 2, y0 + 64, x1 - 2, y1 - 14))
        frame = watercolor_frame(panel, index)
        frame.save(OUT / f"arrow-{index:02d}.png", optimize=True)
        frames.append(frame)
        column = (index - 1) if index <= 6 else (index - 7)
        row = 0 if index <= 6 else 1
        sprite.alpha_composite(frame, (column * FRAME_SIZE[0], row * FRAME_SIZE[1]))

    sprite.save(ROOT / "arrow-watercolor-11-frames.png", optimize=True)
    # A dark preview makes the transparent watercolor strokes easy to inspect.
    preview = Image.new("RGBA", sprite.size, (25, 29, 37, 255))
    preview.alpha_composite(sprite)
    preview.convert("RGB").save(ROOT / "arrow-watercolor-preview.png", optimize=True)
    print(f"Saved {len(frames)} frames, each {FRAME_SIZE[0]}x{FRAME_SIZE[1]} RGBA")


if __name__ == "__main__":
    main()
