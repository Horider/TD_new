"""Package the imagegen cutout and six alignment-preserving PNG crops."""
from pathlib import Path
import shutil
import sys
import json
import zipfile
from PIL import Image

folder=Path(__file__).resolve().parent
shutil.copy2(sys.argv[1],folder/'pad.png')
shutil.copy2(sys.argv[2],folder/'pad-sheet.png')
sheet=Image.open(sys.argv[2]).convert('RGBA')
assert abs(sheet.width/sheet.height-1.5)<.02
frames=[]
for index in range(6):
    col,row=index%3,index//3
    frame=sheet.crop((round(col*sheet.width/3),round(row*sheet.height/2),round((col+1)*sheet.width/3),round((row+1)*sheet.height/2))).resize((512,512),Image.Resampling.LANCZOS)
    assert frame.getchannel('A').getextrema()[0]==0
    frame.save(folder/f'pad-{index+1:02d}.png');frames.append(frame)
frames[0].save(folder/'pad-animation.webp',save_all=True,append_images=frames[1:],duration=150,loop=1,lossless=True)
previews=[]
for frame in frames:
    matte=Image.new('RGBA',frame.size,'#233c31');matte.alpha_composite(frame)
    previews.append(matte.convert('RGB').quantize(colors=256))
previews[0].save(folder/'pad-preview.gif',save_all=True,append_images=previews[1:],duration=150,disposal=2)
(folder/'pad-animation.json').write_text(json.dumps({'frames':[f'pad-{i+1:02d}.png' for i in range(6)],'frameWidth':512,'frameHeight':512,'anchor':{'x':256,'y':256},'durationMs':900,'playOnce':True,'trigger':'pointer enter or keyboard/touch focus','static':'pad.png'},indent=2),encoding='utf-8')
with zipfile.ZipFile(folder/'pad-assets.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(folder.iterdir()):
        if file.suffix in {'.png','.json','.gif','.webp'}:archive.write(file,file.name)
print('Saved standalone pad PNG, six transparent 512x512 frames, single-pass previews, manifest and ZIP')
