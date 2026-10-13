from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image

ROOT = Path(__file__).resolve().parent
GEN = Path(r'C:\Users\Aleks\.codex\generated_images\01a12ff7-792f-76d0-9555-7166e6dfa3c1')
SOURCES = {
    'yellow': 'exec-2a350793-7de9-49bb-b4f0-324c9106a779.png',
    'blue': 'exec-e9026829-0b7f-48bd-be3a-73fed90e3c97.png',
    'red': 'exec-213edc15-cf19-4591-beb8-62ed24848c83.png',
    'violet': 'exec-6f003efb-ba93-4477-aa08-0664f69a06dc.png',
}
preview = Image.new('RGBA', (1536, 768), (31, 38, 40, 255))
with ZipFile(ROOT / 'tower-actions-all-colors.zip', 'w', ZIP_DEFLATED) as archive:
    for column, (color, source_name) in enumerate(SOURCES.items()):
        source_path = GEN / source_name
        copyfile(source_path, ROOT / f'tower-actions-{color}-sheet.png')
        sheet = Image.open(source_path)
        assert sheet.mode == 'RGBA' and sheet.width == sheet.height * 2
        for row, level in enumerate((2, 3)):
            side = sheet.height
            frame = sheet.crop((row * side, 0, (row + 1) * side, side))
            alpha = frame.getchannel('A')
            assert alpha.getpixel((0, 0)) == 0
            assert alpha.getpixel((side // 2, side // 2)) == 0
            name = f'tower-actions-{color}-to-level-{level}'
            full_path = ROOT / f'{name}.png'
            frame.save(full_path, optimize=True)
            archive.write(full_path, full_path.name)
            small_path = ROOT / f'{name}-512.png'
            frame.resize((512, 512), Image.Resampling.LANCZOS).save(small_path, optimize=True)
            archive.write(small_path, small_path.name)
            preview.alpha_composite(frame.resize((384, 384), Image.Resampling.LANCZOS), (column * 384, row * 384))
            print(color, level, frame.size, 'RGBA, left=remove right=upgrade, transparent centre')
preview.convert('RGB').save(ROOT / 'tower-actions-preview.png', optimize=True)
with ZipFile(ROOT / 'tower-actions-all-colors.zip') as archive:
    assert len(archive.namelist()) == 16 and archive.testzip() is None
