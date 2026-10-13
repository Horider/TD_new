"""Render four tower-defense map variants from the supplied road layouts and art assets."""

from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets" / "watercolor-broad"
OUT = ROOT / "maps"
OUT.mkdir(exist_ok=True)
SIZE = (1920, 1296)
W, H = SIZE

CONFIGS = [
    ("forest", 1, 101),
    ("forest_edge", 2, 202),
    ("field", 3, 303),
    ("mountain_forest", 4, 404),
]


def smooth_noise(rng: np.random.Generator, grid: tuple[int, int]) -> np.ndarray:
    a = rng.integers(0, 256, grid, dtype=np.uint8)
    return np.asarray(Image.fromarray(a, "L").resize(SIZE, Image.Resampling.BICUBIC), dtype=np.float32) / 255 - .5


def ground(kind: str, rng: np.random.Generator) -> Image.Image:
    colors = {
        "forest": (126, 155, 91),
        "forest_edge": (156, 178, 99),
        "field": (185, 192, 105),
        "mountain_forest": (142, 155, 107),
    }
    base = np.array(colors[kind], dtype=np.float32)
    broad = smooth_noise(rng, (8, 12))
    mid = smooth_noise(rng, (48, 72))
    fine = rng.normal(0, 1, (H, W)).astype(np.float32)
    tone = broad * 41 + mid * 21 + fine * 4.8
    yy, xx = np.mgrid[:H, :W]
    light = (1 - xx / W) * 8 + (1 - yy / H) * 5
    arr = np.empty((H, W, 3), dtype=np.uint8)
    for c, factor in enumerate((.88, 1.0, .57)):
        arr[:, :, c] = np.clip(base[c] + tone * factor + light, 0, 255)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def layout(index: int) -> tuple[Image.Image, list[tuple[int, int]]]:
    src = Image.open(ROOT / "assets" / "map" / f"{index}.png").convert("RGB")
    a = np.asarray(src)
    # The near-black road and burgundy tower markers are separate in the sketches.
    road = np.uint8((a[:, :, 0] < 50) & (a[:, :, 1] < 50) & (a[:, :, 2] < 50)) * 255
    red = (a[:, :, 0] > 75) & (a[:, :, 0] > a[:, :, 1] * 2) & (a[:, :, 1] < 80)
    # Scan connected marker blobs on a small grid, preserving all points.
    small = np.asarray(Image.fromarray(red.astype(np.uint8) * 255).resize((260, 176), Image.Resampling.NEAREST)) > 0
    seen = np.zeros_like(small)
    centers = []
    for sy in range(small.shape[0]):
        for sx in range(small.shape[1]):
            if not small[sy, sx] or seen[sy, sx]:
                continue
            stack = [(sx, sy)]
            seen[sy, sx] = True
            pixels = []
            while stack:
                x, y = stack.pop()
                pixels.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < small.shape[1] and 0 <= ny < small.shape[0] and small[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((nx, ny))
            if len(pixels) > 10:
                cx = sum(p[0] for p in pixels) / len(pixels)
                cy = sum(p[1] for p in pixels) / len(pixels)
                centers.append((round(cx * W / 260), round(cy * H / 176)))
    centers.sort(key=lambda p: (p[1], p[0]))
    mask = Image.fromarray(road, "L").resize(SIZE, Image.Resampling.LANCZOS)
    return mask, centers


def road_texture(rng: np.random.Generator) -> Image.Image:
    broad = smooth_noise(rng, (22, 32))
    mid = smooth_noise(rng, (100, 150))
    fine = rng.normal(0, 1, (H, W)).astype(np.float32)
    tone = broad * 39 + mid * 18 + fine * 5
    arr = np.empty((H, W, 3), dtype=np.uint8)
    for c, base in enumerate((219, 177, 104)):
        arr[:, :, c] = np.clip(base + tone * (1, .85, .7)[c], 0, 255)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def paint_road(canvas: Image.Image, mask: Image.Image, rng: np.random.Generator, py: random.Random) -> None:
    rim = mask.filter(ImageFilter.MaxFilter(19)).filter(ImageFilter.GaussianBlur(2))
    canvas.paste((93, 104, 62, 255), (0, 0, W, H), rim)
    canvas.paste(road_texture(rng), (0, 0), mask)
    inner = mask.filter(ImageFilter.MinFilter(23)).filter(ImageFilter.GaussianBlur(5))
    canvas.paste((239, 200, 127, 40), (0, 0, W, H), inner)
    draw = ImageDraw.Draw(canvas, "RGBA")
    mask_a = np.asarray(mask)
    for _ in range(8300):
        x, y = py.randrange(W), py.randrange(H)
        if mask_a[y, x] < 230:
            continue
        r = py.choice((1, 1, 2, 2, 3, 4))
        col = py.choice(((120, 94, 64, 75), (255, 232, 173, 110), (131, 111, 83, 60)))
        draw.ellipse((x-r, y-r//2, x+r, y+r//2+1), fill=col)


def paint_mountain(canvas: Image.Image, py: random.Random) -> None:
    """A rocky upper slope, kept behind the traversable road and forest."""
    layer = Image.new("RGBA", SIZE)
    d = ImageDraw.Draw(layer, "RGBA")
    d.polygon([(0, 0), (1210, 0), (1030, 105), (850, 165), (775, 275),
               (540, 298), (355, 440), (0, 410)], fill=(88, 107, 104, 225))
    d.polygon([(0, 0), (1000, 0), (864, 99), (706, 120), (582, 230),
               (385, 280), (180, 390), (0, 350)], fill=(125, 137, 131, 225))
    d.polygon([(0, 0), (800, 0), (595, 105), (460, 147), (240, 265), (0, 260)],
              fill=(174, 176, 160, 220))
    for _ in range(125):
        x = py.randrange(0, 1050)
        y = py.randrange(0, 420)
        if layer.getpixel((x, y))[3] == 0:
            continue
        r = py.randrange(3, 15)
        d.polygon([(x-r, y+r//2), (x-r//3, y-r), (x+r, y-r//2), (x+r//2, y+r)],
                  fill=py.choice(((218, 213, 181, 68), (38, 65, 71, 53), (225, 227, 207, 55))))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(1.3)))


SPRITES: dict[str, Image.Image] = {}


def sprite(name: str, width: int) -> Image.Image:
    key = f"{name}:{width}"
    if key not in SPRITES:
        source = Image.open(ASSETS / f"{name}.png").convert("RGBA")
        height = round(source.height * width / source.width)
        SPRITES[key] = source.resize((width, height), Image.Resampling.LANCZOS)
    return SPRITES[key]


def place(canvas: Image.Image, name: str, x: int, y: int, width: int) -> None:
    s = sprite(name, width)
    canvas.alpha_composite(s, (x - s.width // 2, y - s.height // 2))


def paint_decor(canvas: Image.Image, kind: str, mask: Image.Image,
                pads: list[tuple[int, int]], py: random.Random) -> None:
    road_a = np.asarray(mask)

    def clear(x: int, y: int, radius: int) -> bool:
        if not (radius < x < W - radius and radius < y < H - radius):
            return False
        if any((x-px)**2 + (y-py)**2 < (radius+67)**2 for px, py in pads):
            return False
        return all(road_a[yy, xx] < 50 for xx, yy in
                   ((x, y), (x-radius, y), (x+radius, y), (x, y-radius), (x, y+radius)))

    def forest_prob(x: int, y: int) -> float:
        u, v = x/W, y/H
        if kind == "forest":
            return .9 if u < .25 or u > .78 or v < .2 or v > .82 else .43
        if kind == "forest_edge":
            return .94 if u < .38 or (v < .12 and u < .68) else .025
        if kind == "field":
            return .65 if u < .12 or u > .89 or v < .13 else .035
        if u < .53 and v < .3:
            return .13
        return .78 if v < .47 or u < .2 or u > .82 else .27

    # Small plants go below trees, helping the empty terrain read as watercolor.
    brush_names = ["bush-low", "bush-round", "bush-bright", "flowers-white",
                   "flowers-yellow", "flowers-pink"]
    count = {"forest": 260, "forest_edge": 280, "field": 390, "mountain_forest": 265}[kind]
    placed = 0
    for _ in range(count * 9):
        if placed >= count:
            break
        x, y = py.randrange(28, W-28), py.randrange(28, H-28)
        if not clear(x, y, 26):
            continue
        name = py.choice(brush_names if kind != "field" else brush_names[3:] * 2 + brush_names[:3])
        place(canvas, name, x, y, py.randrange(34, 83))
        placed += 1

    if kind == "field":
        for name, x, y, w in [
            ("house-farm", 150, 188, 185), ("windmill", 1685, 181, 160),
            ("hay-bale-round", 1655, 1078, 95), ("hay-bale-rectangular", 248, 1110, 88),
            ("cow-spotted", 1450, 980, 86), ("goat-cream", 365, 205, 75),
        ]:
            if clear(x, y, 75):
                place(canvas, name, x, y, w)
    elif kind == "forest_edge":
        for name, x, y, w in [
            ("fallen-trunk", 210, 225, 205), ("stump-axe", 1500, 1130, 90),
            ("log-stack", 1710, 1050, 110), ("rock-mossy", 218, 1090, 120),
        ]:
            if clear(x, y, 80):
                place(canvas, name, x, y, w)
    elif kind == "mountain_forest":
        for name, x, y, w in [
            ("rock-cluster", 165, 130, 270), ("rock-mossy", 520, 190, 220),
            ("rock-cluster", 820, 85, 250), ("rock-single", 1050, 160, 165),
            ("fallen-trunk", 1700, 1180, 170),
        ]:
            if clear(x, y, 70):
                place(canvas, name, x, y, w)

    tree_names = ["tree-broadleaf-round", "tree-broadleaf-dark", "tree-broadleaf-light",
                  "tree-broadleaf-bright", "tree-conifer-tall", "tree-conifer-small"]
    target = {"forest": 178, "forest_edge": 98, "field": 36, "mountain_forest": 140}[kind]
    trees = []
    for _ in range(target * 32):
        if len(trees) >= target:
            break
        x, y = py.randrange(55, W-55), py.randrange(55, H-55)
        if py.random() > forest_prob(x, y):
            continue
        width = py.randrange(100, 155) if kind != "field" else py.randrange(95, 135)
        if not clear(x, y, width // 2 + 17):
            continue
        if any((x-tx)**2 + (y-ty)**2 < 68**2 for tx, ty, _ in trees):
            continue
        name = py.choice(tree_names if kind != "mountain_forest" else tree_names + tree_names[4:])
        trees.append((x, y, (name, width)))
    for x, y, (name, width) in sorted(trees, key=lambda t: t[1]):
        place(canvas, name, x, y, width)

    rocks = {"forest": 36, "forest_edge": 29, "field": 24, "mountain_forest": 87}[kind]
    for _ in range(rocks * 12):
        if rocks <= 0:
            break
        x, y = py.randrange(40, W-40), py.randrange(35, H-35)
        if clear(x, y, 38):
            place(canvas, py.choice(("rock-single", "rock-mossy", "rock-cluster")),
                  x, y, py.randrange(48, 95))
            rocks -= 1


def paint_pads(canvas: Image.Image, pads: list[tuple[int, int]], py: random.Random) -> None:
    draw = ImageDraw.Draw(canvas, "RGBA")
    for x, y in pads:
        rx, ry = 60, 44
        draw.ellipse((x-rx-9, y-ry-7, x+rx+9, y+ry+8), fill=(74, 83, 56, 90))
        draw.ellipse((x-rx, y-ry, x+rx, y+ry), fill=(96, 91, 70, 235))
        draw.ellipse((x-rx+8, y-ry+7, x+rx-8, y+ry-7), fill=(218, 181, 112, 255))
        draw.ellipse((x-rx+14, y-ry+12, x+rx-14, y+ry-12), fill=(231, 194, 121, 255))
        for i in range(17):
            a = 2 * math.pi * i / 17 + .13
            sx = x + math.cos(a) * (rx-2)
            sy = y + math.sin(a) * (ry-1)
            r = py.randrange(5, 9)
            draw.ellipse((sx-r, sy-r*.65, sx+r, sy+r*.65),
                         fill=py.choice(((176, 165, 128, 255), (201, 190, 151, 255),
                                         (117, 119, 99, 255))), outline=(90, 97, 78, 190), width=1)
        for _ in range(16):
            px, py_ = x + py.randrange(-40, 41), y + py.randrange(-27, 28)
            draw.ellipse((px, py_, px+2, py_+2), fill=(147, 112, 72, 85))


def render(kind: str, template: int, seed: int) -> None:
    rng = np.random.default_rng(seed)
    py = random.Random(seed)
    canvas = ground(kind, rng)
    if kind == "mountain_forest":
        paint_mountain(canvas, py)
    road, pads = layout(template)
    paint_road(canvas, road, rng, py)
    paint_decor(canvas, kind, road, pads, py)
    paint_pads(canvas, pads, py)
    canvas.convert("RGB").save(OUT / f"{kind}.png", optimize=True)
    print(f"{kind}: {len(pads)} tower pads -> {OUT / (kind + '.png')}")


if __name__ == "__main__":
    for config in CONFIGS:
        render(*config)
