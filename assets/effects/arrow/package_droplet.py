"""Crop and package ImageGen's five-stage light-droplet assets in three levels."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'droplet'
GEN = Path(r'C:\Users\Aleks\.codex\generated_images\01a12ff7-792f-76d0-9555-7166e6dfa3c1')
SIZE = (512, 384)
SOURCES = [
    'exec-5a9f9a8f-0e61-45f7-9203-922d6fa8bcd6.png',
    'exec-e7b60108-48a0-4999-b6ae-c4d7837304e0.png',
    'exec-f3954e45-3d7f-41db-a215-bc8d9b2b0c07.png',
    'exec-023a431e-93b7-40a1-8289-9ec1e80c9fb3.png',
    'exec-c768538b-9cd6-4e58-a67f-049bc5a3fb56.png',
]
SHEETS = {
    2: ('exec-0a01d70c-5e72-4271-9541-836b4d0372ea.png', [
        (12, 20, 580, 430), (600, 20, 1170, 430), (1188, 20, 1768, 430),
        (12, 452, 590, 875), (610, 452, 1165, 875)]),
    3: ('exec-f20f47ac-fcb0-48ff-9562-f70b39acfbed.png', [
        (12, 20, 580, 430), (590, 20, 1077, 430), (1077, 20, 1774, 430),
        (12, 452, 610, 875), (620, 452, 1170, 875)]),
}
WIDTHS = {1: [65, 175, 280, 235, 70], 2: [85, 215, 330, 275, 90], 3: [105, 255, 380, 315, 115]}
DURATIONS = [130, 110, 180, 100, 210]


def fit_frame(image, width, stage):
    # Crop empty margins, preserve all generated translucent paint in the crop.
    bounds = image.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bounds is None:
        raise ValueError('Empty generated stage')
    left, top, right, bottom = bounds
    image = image.crop((max(0, left-6), max(0, top-6), min(image.width, right+6), min(image.height, bottom+6)))
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    if stage == 1:
        x = 256 - width//2
    elif stage == 2:
        x = 360 - width
    elif stage == 3:
        x = 420 - width
    elif stage == 4:
        x = 458 - width
    else:
        x = 405 - width//2
    y = 192 - height//2
    result = Image.new('RGBA', SIZE)
    result.alpha_composite(image, (x, y))
    return result


def main():
    ROOT.mkdir(exist_ok=True)
    comparison = Image.new('RGB', (1536, 432), (29, 34, 43))
    comparison_draw = ImageDraw.Draw(comparison)
    archives = []
    with ZipFile(ROOT/'droplet-three-levels.zip', 'w', ZIP_DEFLATED) as combined:
        for level in (1,2,3):
            folder = ROOT/f'level-{level}-frames'
            folder.mkdir(exist_ok=True)
            if level == 1:
                inputs = [Image.open(GEN/name).convert('RGBA') for name in SOURCES]
            else:
                filename, crops = SHEETS[level]
                source = Image.open(GEN/filename).convert('RGBA')
                inputs = [source.crop(crop) for crop in crops]
            frames = [fit_frame(im, width, stage) for stage,(im,width) in enumerate(zip(inputs,WIDTHS[level]),1)]
            sheet = Image.new('RGBA', (1536,768))
            animation=[]
            archive_path=ROOT/f'droplet-level-{level}-frames.zip'
            with ZipFile(archive_path,'w',ZIP_DEFLATED) as archive:
                for stage,frame in enumerate(frames,1):
                    path=folder/f'droplet-{stage:02d}.png'
                    frame.save(path,optimize=True)
                    archive.write(path,path.name)
                    combined.write(path,f'level-{level}/{path.name}')
                    cell=stage-1
                    sheet.alpha_composite(frame,((cell%3)*512,(cell//3)*384))
                    matte=Image.new('RGBA',SIZE,(29,34,43,255))
                    matte.alpha_composite(frame)
                    animation.append(matte.convert('RGB'))
            sheet.save(ROOT/f'droplet-level-{level}-sheet.png',optimize=True)
            matte=Image.new('RGBA',sheet.size,(29,34,43,255))
            matte.alpha_composite(sheet)
            matte.convert('RGB').save(ROOT/f'droplet-level-{level}-preview.png',optimize=True)
            animation[0].save(ROOT/f'droplet-level-{level}-preview.gif',save_all=True,append_images=animation[1:],duration=DURATIONS,loop=0,optimize=True)
            flight=Image.new('RGBA',SIZE,(29,34,43,255))
            flight.alpha_composite(frames[2])
            comparison.paste(flight.convert('RGB'),((level-1)*512,48))
            comparison_draw.text(((level-1)*512+24,20),f'LEVEL {level}',fill=(226,211,182))
            print(f'Level {level}: five RGBA PNGs {SIZE}, sheet, GIF preview, ZIP')
    comparison.save(ROOT/'droplet-levels-comparison.png',optimize=True)
    (ROOT/'animation.json').write_text(json.dumps({'frame_size':SIZE,'frame_count':5,'stages':['formation','stretch','flight','impact','fade'],'duration_ms':DURATIONS,'sheet_columns':3,'sheet_rows':2,'flight_head_anchor':[420,192],'levels':[1,2,3]},indent=2),encoding='utf-8')


if __name__=='__main__':
    main()
