"""Crop the generated sheet without altering its art or alpha, and encode previews."""
from pathlib import Path
import json
import shutil
import sys
import zipfile
from PIL import Image

folder = Path(__file__).resolve().parent
source = Path(sys.argv[1])
sheet_path = folder / 'construction-sheet.png'
shutil.copy2(source, sheet_path)
sheet = Image.open(sheet_path).convert('RGBA')
assert sheet.size == (1536, 1024)
frames = []
durations = [140, 170, 170, 190, 180, 250]
for index in range(6):
    x, y = index % 3 * 512, index // 3 * 512
    frame = sheet.crop((x, y, x + 512, y + 512))
    assert frame.getchannel('A').getextrema()[0] == 0
    frame.save(folder / f'construction-{index + 1:02d}.png')
    frames.append(frame)

# WebP retains semitransparent dust. GIF uses a forest-colored matte for preview.
frames[0].save(folder / 'construction-animation.webp', save_all=True,
               append_images=frames[1:], duration=durations, loop=0, lossless=True)
previews = []
for frame in frames:
    matte = Image.new('RGBA', frame.size, '#233c31')
    matte.alpha_composite(frame)
    previews.append(matte.convert('RGB').quantize(colors=256))
previews[0].save(folder / 'construction-preview.gif', save_all=True,
                 append_images=previews[1:], duration=durations, loop=0, disposal=2)

metadata = {
    'sheet': sheet_path.name,
    'columns': 3, 'rows': 2, 'frameWidth': 512, 'frameHeight': 512,
    'anchor': {'x': 256, 'y': 460},
    'playOnce': True, 'durationMs': sum(durations),
    'usage': 'Overlay centered on the tower base during construction. Reveal the finished tower as the dust settles. Remove the effect after frame 6.',
    'frames': [{'file': f'construction-{i+1:02d}.png', 'durationMs': duration}
               for i, duration in enumerate(durations)],
    'previews': {'webp': 'Transparent; loops for review only', 'gif': 'Forest matte; loops for review only'},
}
(folder / 'construction-animation.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
with zipfile.ZipFile(folder / 'construction-assets.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(folder.iterdir()):
        if file.suffix in {'.png', '.webp', '.gif', '.json'}:
            archive.write(file, file.name)
with Image.open(folder / 'construction-preview.gif') as preview:
    assert preview.n_frames == 6
print(f'Saved 6 transparent 512x512 frames, sheet, animated WebP, GIF, manifest and ZIP in {folder}')
