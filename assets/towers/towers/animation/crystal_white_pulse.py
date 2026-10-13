"""Create reusable white crystal pulse masks and GIF previews.

Run without arguments to rebuild the three supplied levels. To animate another
aligned tower image, use --tower IMAGE --mask MASK --output GIF.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent
LAYOUT = {
    1: ("yellow-crystals.png", 0.4415, 243, 41),
    2: ("yellow-crystals-2.png", 0.3955, 282, 9),
    3: ("yellow-crystals-3.png", 0.4800, 153, 9),
}
STRENGTHS = [0, .02, .06, .15, .30, .50, .72, .90, 1, .94, .80, .60, .38, .19, .07, 0]
DURATIONS = [220] + [95] * 14 + [220]
BACKDROP = (24, 29, 40)


def build_mask(level: int, tower: Image.Image) -> Image.Image:
    source_name, scale, x, y = LAYOUT[level]
    source = Image.open(ROOT / "crystal-variants" / source_name).convert("RGBA")
    scaled = source.resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )
    registered = Image.new("RGBA", tower.size, (0, 0, 0, 0))
    registered.alpha_composite(scaled, (x, y))

    candidate = np.asarray(registered)
    target = np.asarray(tower.convert("RGBA"))
    difference = np.abs(candidate[:, :, :3].astype(np.int16) - target[:, :, :3].astype(np.int16)).mean(axis=2)
    similar = (difference < 45) & (target[:, :, 3] > 16) & (candidate[:, :, 3] > 0)
    # Fill isolated comparison misses caused by antialiasing, then retain source edges.
    filled = Image.fromarray((similar.astype(np.uint8) * 255), "L").filter(ImageFilter.MaxFilter(3))
    alpha = np.minimum(np.asarray(filled), candidate[:, :, 3]).astype(np.uint8)
    return Image.fromarray(alpha, "L")


def render_frame(tower: Image.Image, mask: Image.Image, strength: float) -> Image.Image:
    base = tower.convert("RGBA")
    if strength == 0:
        return base
    halo = mask.filter(ImageFilter.GaussianBlur(14))
    halo_alpha = halo.point(lambda value: round(value * strength * .24))
    core_alpha = mask.point(lambda value: round(value * strength * .96))
    glow = Image.new("RGBA", base.size, (255, 255, 255, 0))
    glow.putalpha(halo_alpha)
    base = Image.alpha_composite(base, glow)
    glow.putalpha(core_alpha)
    return Image.alpha_composite(base, glow)


def gif_frames(tower: Image.Image, mask: Image.Image, *, scale: float = 1) -> list[Image.Image]:
    result = []
    for strength in STRENGTHS:
        rgba = render_frame(tower, mask, strength)
        if scale != 1:
            rgba = rgba.resize(
                (round(rgba.width * scale), round(rgba.height * scale)),
                Image.Resampling.LANCZOS,
            )
        background = Image.new("RGBA", rgba.size, (*BACKDROP, 255))
        result.append(Image.alpha_composite(background, rgba).convert("RGB"))
    return result


def save_gif(frames: list[Image.Image], path: Path) -> None:
    # One shared palette avoids color flicker between frames.
    palette_source = Image.new("RGB", (frames[0].width * 2, frames[0].height))
    palette_source.paste(frames[0], (0, 0))
    palette_source.paste(frames[8], (frames[0].width, 0))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(
        path,
        save_all=True,
        append_images=indexed[1:],
        duration=DURATIONS,
        loop=0,
        disposal=2,
        optimize=True,
    )


def combined_frames(level_frames: dict[int, list[Image.Image]]) -> list[Image.Image]:
    scale = .33
    labels = {1: "LEVEL 1", 2: "LEVEL 2", 3: "LEVEL 3"}
    columns = {}
    for level in (1, 2, 3):
        columns[level] = [frame.resize((round(frame.width * scale), round(frame.height * scale)), Image.Resampling.LANCZOS) for frame in level_frames[level]]
    width = sum(columns[level][0].width for level in (1, 2, 3)) + 4 * 24
    height = max(columns[level][0].height for level in (1, 2, 3)) + 70
    font = ImageFont.load_default()
    result = []
    for index in range(len(STRENGTHS)):
        canvas = Image.new("RGB", (width, height), BACKDROP)
        draw = ImageDraw.Draw(canvas)
        cursor = 24
        for level in (1, 2, 3):
            frame = columns[level][index]
            canvas.paste(frame, (cursor, height - 24 - frame.height))
            draw.text((cursor + frame.width // 2 - 22, 22), labels[level], fill=(230, 236, 244), font=font)
            cursor += frame.width + 24
        result.append(canvas)
    return result


def save_atlas(masks: dict[int, Image.Image]) -> None:
    width = sum(masks[level].width for level in (1, 2, 3))
    height = max(masks[level].height for level in (1, 2, 3))
    atlas = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    regions = {}
    x = 0
    for level in (1, 2, 3):
        white = Image.new("RGBA", masks[level].size, (255, 255, 255, 0))
        white.putalpha(masks[level])
        atlas.alpha_composite(white, (x, 0))
        regions[str(level)] = {"x": x, "y": 0, "width": masks[level].width, "height": masks[level].height}
        x += masks[level].width
    atlas.save(OUT / "universal-crystal-mask-atlas.png")
    (OUT / "universal-crystal-mask-atlas.json").write_text(
        json.dumps({"image": "universal-crystal-mask-atlas.png", "levels": regions}, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tower", type=Path, help="Another aligned tower PNG")
    parser.add_argument("--mask", type=Path, help="Matching full-size crystal mask PNG")
    parser.add_argument("--output", type=Path, help="Output GIF path")
    args = parser.parse_args()

    if args.tower or args.mask or args.output:
        if not (args.tower and args.mask and args.output):
            parser.error("--tower, --mask and --output must be provided together")
        tower = Image.open(args.tower).convert("RGBA")
        mask = Image.open(args.mask).convert("L")
        if mask.size != tower.size:
            parser.error("tower and mask dimensions must match")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        save_gif(gif_frames(tower, mask), args.output)
        print(args.output)
        return

    OUT.mkdir(parents=True, exist_ok=True)
    all_frames = {}
    all_masks = {}
    for level in (1, 2, 3):
        tower = Image.open(ROOT / "towers" / f"tower-level-{level}.png").convert("RGBA")
        mask = build_mask(level, tower)
        all_masks[level] = mask
        mask_path = OUT / f"crystal-mask-level-{level}.png"
        mask.save(mask_path)
        frames = gif_frames(tower, mask)
        all_frames[level] = frames
        gif_path = OUT / f"tower-level-{level}-white-pulse.gif"
        save_gif(frames, gif_path)
        render_frame(tower, mask, 1).save(OUT / f"tower-level-{level}-peak.png")
        print(mask_path, gif_path)
    save_gif(combined_frames(all_frames), OUT / "white-pulse-all-levels.gif")
    save_atlas(all_masks)


if __name__ == "__main__":
    main()
