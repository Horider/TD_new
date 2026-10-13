from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image

root = Path(__file__).resolve().parent
preview = Image.new('RGBA', (1536, 512), (31, 38, 40, 255))
for index, color in enumerate(['red', 'violet', 'blue']):
    image = Image.open(root / f'tower-selector-{color}-selected.png')
    assert image.mode == 'RGBA' and image.size == (1254, 1254)
    alpha = image.getchannel('A')
    assert alpha.getpixel((0, 0)) == 0 and alpha.getpixel((627, 627)) == 0
    small = image.resize((512, 512), Image.Resampling.LANCZOS)
    small.save(root / f'tower-selector-{color}-selected-512.png', optimize=True)
    preview.alpha_composite(small, (index * 512, 0))
    print(color, '1254 and 512 px, RGBA, transparent centre and corners')
preview.convert('RGB').save(root / 'tower-selector-hover-preview.png', optimize=True)
with ZipFile(root / 'tower-selector-all-states.zip', 'w', ZIP_DEFLATED) as archive:
    for state in ['idle', 'yellow-selected', 'red-selected', 'violet-selected', 'blue-selected']:
        for suffix in ['', '-512']:
            path = root / f'tower-selector-{state}{suffix}.png'
            archive.write(path, path.name)
