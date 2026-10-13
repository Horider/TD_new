"""Crop generated in-between sprites and package the ten-frame game sequences."""
from pathlib import Path
import json
import shutil
import sys
import zipfile
from PIL import Image

root = Path(__file__).resolve().parent
sequence = ['01','extra-01','02','extra-02','03','extra-03','04','05','extra-04','06']
weights = [70,70,85,85,85,85,190,90,90,250]
for kind, source, total in [('construction',sys.argv[1],2000),('upgrade',sys.argv[2],3000)]:
    folder = root / kind
    source = Path(source)
    shutil.copy2(source, folder / f'{kind}-extra-sheet.png')
    image = Image.open(source).convert('RGBA')
    assert abs(image.width-image.height)<=2, image.size
    for index in range(4):
        col, row = index%2,index//2
        cell = image.crop((round(col*image.width/2),round(row*image.height/2),
                           round((col+1)*image.width/2),round((row+1)*image.height/2)))
        cell = cell.resize((512,512),Image.Resampling.LANCZOS)
        assert cell.getchannel('A').getextrema()[0]==0
        cell.save(folder / f'{kind}-extra-{index+1:02d}.png')
    frames = [Image.open(folder / f'{kind}-{frame}.png').convert('RGBA') for frame in sequence]
    sheet = Image.new('RGBA',(2560,1024))
    for index, frame in enumerate(frames):
        sheet.paste(frame,(index%5*512,index//5*512))
    sheet.save(folder / f'{kind}-sheet-10.png')
    durations = [round(weight*total/sum(weights)/10)*10 for weight in weights]
    durations[-1] += total-sum(durations)
    frames[0].save(folder / f'{kind}-animation-10.webp',save_all=True,append_images=frames[1:],duration=durations,loop=0,lossless=True)
    previews=[]
    for frame in frames:
        matte=Image.new('RGBA',frame.size,'#233c31');matte.alpha_composite(frame)
        previews.append(matte.convert('RGB').quantize(colors=256))
    previews[0].save(folder / f'{kind}-preview-10.gif',save_all=True,append_images=previews[1:],duration=durations,loop=0,disposal=2)
    metadata={'sheet':f'{kind}-sheet-10.png','columns':5,'rows':2,'frameWidth':512,'frameHeight':512,
              'anchor':{'x':256,'y':460},'durationMs':total,'playOnce':True,
              'frames':[{'file':f'{kind}-{frame}.png','durationMs':duration} for frame,duration in zip(sequence,durations)]}
    manifest=folder / f'{kind}-animation-10.json'
    manifest.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    names=[f'{kind}-{frame}.png' for frame in sequence]+[f'{kind}-sheet-10.png',f'{kind}-animation-10.webp',f'{kind}-preview-10.gif',manifest.name,f'{kind}-extra-prompt.json',f'{kind}-extra-repair-prompt.json']
    with zipfile.ZipFile(folder / f'{kind}-assets-10.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in names: archive.write(folder / name,name)
    with Image.open(folder / f'{kind}-preview-10.gif') as preview:
        assert preview.n_frames==10
        encoded_duration=0
        for index in range(preview.n_frames):
            preview.seek(index); encoded_duration+=preview.info['duration']
        assert encoded_duration==total
    print(f'{kind}: 10 aligned transparent frames, {total} ms, previews, manifest and ZIP saved')
