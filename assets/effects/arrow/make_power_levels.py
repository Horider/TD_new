"""Build weaker, aligned watercolor-arrow sprite levels from the level-3 frames."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "watercolor-frames"
SIZE = (512, 384)
GRID = (6, 2)


@dataclass(frozen=True)
class Level:
    number: int
    scale: float
    opacity: float
    alpha_gamma: float
    alpha_floor: int
    color_mix: float
    particle_fraction: float


LEVELS = (
    Level(1, 0.70, 0.81, 1.35, 18, 0.63, 0.31),
    Level(2, 0.85, 0.92, 1.12, 10, 0.84, 0.63),
)


def component_particle_mask(alpha: np.ndarray, level: Level, frame: int) -> np.ndarray:
    """Drop a repeatable portion of small detached motes, keeping major strokes."""
    height, width = alpha.shape
    solid = alpha >= 48
    visited = np.zeros((height, width), dtype=bool)
    keep = np.ones((height, width), dtype=bool)
    rng = np.random.default_rng(9173 + level.number * 101 + frame)
    ys, xs = np.nonzero(solid)
    for start_y, start_x in zip(ys, xs):
        if visited[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        visited[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while stack:
            y, x = stack.pop()
            component.append((y, x))
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and solid[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    stack.append((ny, nx))
        # Important shards in the collision get to stay, but detached sparks thin out.
        if len(component) < 65 and rng.random() > level.particle_fraction:
            for y, x in component:
                keep[y, x] = False
    return keep


def make_frame(source: Image.Image, level: Level, index: int) -> Image.Image:
    source = source.convert("RGBA")
    resized = source.resize((round(SIZE[0] * level.scale), round(SIZE[1] * level.scale)), Image.Resampling.LANCZOS)
    image = Image.new("RGBA", SIZE)
    image.alpha_composite(resized, ((SIZE[0] - resized.width) // 2, (SIZE[1] - resized.height) // 2))
    pixels = np.array(image, dtype=np.float32)
    alpha = pixels[:, :, 3]
    kept = component_particle_mask(alpha, level, index)
    # Lighter, diffuse pixels form the broad glimmer; the compact versions retain
    # their watercolor core and lose most of this surrounding glitter.
    alpha = np.clip((alpha / 255) ** level.alpha_gamma * 255 * level.opacity, 0, 255)
    alpha = np.where(alpha < level.alpha_floor, 0, alpha)
    alpha = np.where(kept, alpha, 0)
    # A little local pooling keeps the rice-paper granulation after shrinking.
    target = np.array([161, 113, 68], dtype=np.float32)
    pixels[:, :, :3] = pixels[:, :, :3] * level.color_mix + target * (1 - level.color_mix)
    pixels[:, :, 3] = alpha
    return Image.fromarray(np.uint8(np.rint(pixels)), "RGBA")


def main() -> None:
    source_paths = [SOURCE / f"arrow-{i:02d}.png" for i in range(1, 12)]
    if not all(path.exists() for path in source_paths):
        raise FileNotFoundError("Expected all 11 level-3 watercolor frames")
    for level in LEVELS:
        output = ROOT / f"level-{level.number}-frames"
        output.mkdir(exist_ok=True)
        sheet = Image.new("RGBA", (SIZE[0] * GRID[0], SIZE[1] * GRID[1]))
        zip_path = ROOT / f"arrow-level-{level.number}-frames.zip"
        animation_frames = []
        with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
            for index, source_path in enumerate(source_paths, 1):
                frame = make_frame(Image.open(source_path), level, index)
                destination = output / f"arrow-{index:02d}.png"
                frame.save(destination, optimize=True)
                archive.write(destination, destination.name)
                matte = Image.new("RGBA", SIZE, (25, 29, 37, 255))
                matte.alpha_composite(frame)
                animation_frames.append(matte.convert("RGB"))
                col = index - 1 if index <= 6 else index - 7
                row = 0 if index <= 6 else 1
                sheet.alpha_composite(frame, (col * SIZE[0], row * SIZE[1]))
        sheet.save(ROOT / f"arrow-level-{level.number}-sheet.png", optimize=True)
        preview = Image.new("RGBA", sheet.size, (25, 29, 37, 255))
        preview.alpha_composite(sheet)
        preview.convert("RGB").save(ROOT / f"arrow-level-{level.number}-preview.png", optimize=True)
        animation_frames[0].save(
            ROOT / f"arrow-level-{level.number}-preview.gif",
            save_all=True,
            append_images=animation_frames[1:],
            duration=[110, 105, 90, 85, 80, 80, 75, 90, 115, 125, 180],
            loop=0,
            optimize=True,
        )
        print(f"Level {level.number}: 11 RGBA frames, {SIZE[0]}x{SIZE[1]}; sheet {sheet.width}x{sheet.height}")


if __name__ == "__main__":
    main()
