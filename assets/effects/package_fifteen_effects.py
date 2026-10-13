"""Crop five generated in-betweens and package fifteen transparent frames."""
from pathlib import Path
import json
import shutil
import sys
import zipfile
from PIL import Image

root=Path(__file__).resolve().parent
sequence=['01','extra-01','extra-v2-01','02','extra-02','extra-v2-02','03','extra-03','extra-v2-03','04','05','extra-v2-04','extra-04','extra-v2-05','06']
weights=[70,35,35,85,42,43,85,42,43,190,45,45,45,45,250]
for kind,source,total in [('construction',sys.argv[1],2000),('upgrade',sys.argv[2],3000)]:
    folder=root/kind
    image=Image.open(source).convert('RGBA')
    assert abs(image.width/image.height-1.5)<.02,image.size
    shutil.copy2(source,folder/f'{kind}-extra-v2-sheet.png')
    for index in range(5):
        col,row=index%3,index//3
        cell=image.crop((round(col*image.width/3),round(row*image.height/2),round((col+1)*image.width/3),round((row+1)*image.height/2)))
        cell=cell.resize((512,512),Image.Resampling.LANCZOS)
        assert cell.getchannel('A').getextrema()[0]==0
        cell.save(folder/f'{kind}-extra-v2-{index+1:02d}.png')
    frames=[Image.open(folder/f'{kind}-{frame}.png').convert('RGBA') for frame in sequence]
    sheet=Image.new('RGBA',(2560,1536))
    for index,frame in enumerate(frames):sheet.paste(frame,(index%5*512,index//5*512))
    sheet.save(folder/f'{kind}-sheet-15.png')
    durations=[round(weight*total/sum(weights)/10)*10 for weight in weights]
    durations[-1]+=total-sum(durations)
    frames[0].save(folder/f'{kind}-animation-15.webp',save_all=True,append_images=frames[1:],duration=durations,loop=0,lossless=True)
    previews=[]
    for frame in frames:
        matte=Image.new('RGBA',frame.size,'#233c31');matte.alpha_composite(frame)
        previews.append(matte.convert('RGB').quantize(colors=256))
    previews[0].save(folder/f'{kind}-preview-15.gif',save_all=True,append_images=previews[1:],duration=durations,loop=0,disposal=2)
    manifest=folder/f'{kind}-animation-15.json'
    manifest.write_text(json.dumps({'sheet':f'{kind}-sheet-15.png','columns':5,'rows':3,'frameWidth':512,'frameHeight':512,'anchor':{'x':256,'y':460},'durationMs':total,'playOnce':True,'frames':[{'file':f'{kind}-{frame}.png','durationMs':duration} for frame,duration in zip(sequence,durations)]},indent=2),encoding='utf-8')
    names=[f'{kind}-{frame}.png' for frame in sequence]+[f'{kind}-sheet-15.png',f'{kind}-animation-15.webp',f'{kind}-preview-15.gif',manifest.name,f'{kind}-extra-v2-prompt.json']
    with zipfile.ZipFile(folder/f'{kind}-assets-15.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for name in names:archive.write(folder/name,name)
    with Image.open(folder/f'{kind}-preview-15.gif') as preview:
        assert preview.n_frames==15
        encoded_duration=0
        for index in range(preview.n_frames):preview.seek(index);encoded_duration+=preview.info['duration']
        assert encoded_duration==total
    print(f'{kind}: 15 transparent frames, {total} ms, sheet, WebP, GIF and ZIP saved')
