from pathlib import Path
from PIL import Image
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
preview = Image.new('RGBA', (1024, 512), (31, 38, 40, 255))
names = ['tower-selector-idle', 'tower-selector-yellow-selected']
files = []
for i, name in enumerate(names):
    image = Image.open(root / f'{name}.png')
    assert image.mode == 'RGBA'
    alpha = image.getchannel('A')
    assert alpha.getpixel((0, 0)) == 0
    assert alpha.getpixel((image.width // 2, image.height // 2)) == 0
    small = image.resize((512, 512), Image.Resampling.LANCZOS)
    small_path = root / f'{name}-512.png'
    small.save(small_path, optimize=True)
    preview.alpha_composite(small, (i * 512, 0))
    files.extend([root / f'{name}.png', small_path])
    print(name, image.size, 'RGBA, transparent centre and corners')
preview.convert('RGB').save(root / 'tower-selector-preview.png', optimize=True)
with ZipFile(root / 'tower-selector-pngs.zip', 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.name)
