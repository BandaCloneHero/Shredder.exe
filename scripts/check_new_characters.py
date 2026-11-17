#!/usr/bin/env python3
"""Validate character identity pack, exact command lights and preserved Unity references."""
import hashlib
import math
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/personagens-novos'
DEST=ROOT/'Assets/Sprites/Personagens'
manifest=json.loads((OUT/'manifest.json').read_text())
colors=[(51,255,38),(255,31,26),(255,230,13),(31,115,255),(255,115,10),(0,240,255),(225,45,255)]
counts={'guitar':64,'bass':64,'drums':22,'keys':128}
checks=0
import importlib.util
spec=importlib.util.spec_from_file_location('character_export',ROOT/'scripts/export_new_characters.py')
export=importlib.util.module_from_spec(spec);spec.loader.exec_module(export)
keyboard_source=export.rgba(export.SOURCE/'Teclado_Anterior.png')
key_regions=export.keyboard_key_masks(keyboard_source)
visible_key_regions=[]
for region in key_regions:
    placed=Image.new('L',(512,512));placed.paste(region,(0,51))
    placed=placed.resize((240,240),Image.Resampling.LANCZOS)
    final=Image.new('L',(256,256));final.paste(placed,(8,8))
    visible_key_regions.append([(x,y) for y in range(190,215) for x in range(256) if final.getpixel((x,y))>220])


def colored_key_pixels(image,region,color):
    count=0
    for x,y in region:
        rgb=image.getpixel((x,y))[:3];value=max(rgb)
        if value>90 and max(abs(rgb[c]*255/value-color[c]) for c in range(3))<28:count+=1
    return count

def check(value,message):
    global checks
    checks+=1
    if not value:raise AssertionError(message)


def rgba(path):return Image.open(path).convert('RGBA')


def frame(kind,index):
    part=index//64 if kind=='keys' else 0
    name=manifest['characters'][kind]['outputs'][part]
    im=images[name]
    n=index%64 if kind=='keys' else index
    cols=6 if kind=='drums' else 8
    x,y=n%cols*256,n//cols*256
    return im.crop((x,y,x+256,y+256))


def sample(im,x,y):
    px,py=round(8+x*240),round(8+y*240)
    pixels=[im.getpixel((px+dx,py+dy))[:3] for dx in (-1,0,1) for dy in (-1,0,1)]
    return tuple(sorted(p[c] for p in pixels)[4] for c in range(3))


def expected(actual,color,message):
    check(max(abs(a-b) for a,b in zip(actual,color))<=16,message+f' actual={actual} expected={color}')

images={}
for kind,count in counts.items():
    pack=manifest['characters'][kind]
    check(pack['frames']==count,kind+' changed command count')
    for name in pack['outputs']:
        path=DEST/'Comandos'/name;im=rgba(path);images[name]=im
        check(im.size==((1536,1024) if kind=='drums' else (2048,2048)),name+' changed layout')
        check(im.getchannel('A').getextrema()==(0,255),name+' missing transparency/opaque content')
    identity=None;decoded_masks=[]
    for i in range(count):
        im=frame(kind,i);mask=pack['masks'][i];a=im.getchannel('A')
        for box in [(0,0,256,8),(0,248,256,256),(0,0,8,256),(248,0,256,256)]:
            check(a.crop(box).getextrema()==(0,0),f'{kind}/{i} has unsafe edge pixels')
        check(a.getbbox() is not None,f'{kind}/{i} is empty')
        decoded=0
        if kind in ('guitar','bass'):
            for bit,(x,y) in enumerate(pack['centers']):
                c=colors[bit] if mask&(1<<bit) else tuple(v//6 for v in colors[bit])
                actual=sample(im,x,y)
                expected(actual,c,f'{kind}/{i} incorrect fret {bit}')
                off=tuple(v//6 for v in colors[bit])
                if sum((a-b)**2 for a,b in zip(actual,colors[bit])) < sum((a-b)**2 for a,b in zip(actual,off)):decoded|=1<<bit
            if mask:
                notes=[b for b in range(5) if mask&(1<<b)]
                first,last=pack['centers'][notes[0]],pack['centers'][notes[-1]]
                wanted=((first[0]+last[0])/2,(first[1]+last[1])/2)
                vx,vy=pack['centers'][-1][0]-pack['centers'][0][0],pack['centers'][-1][1]-pack['centers'][0][1]
                length=math.hypot(vx,vy);vx/=length;vy/=length
                tx,ty=pack['hand_targets'][i]
                check(abs((tx-wanted[0])*vx+(ty-wanted[1])*vy)<1e-6,f'{kind}/{i} hand does not target the geometric middle')
                px,py=8+tx*240,8+ty*240;skin=[]
                for yy in range(max(0,round(py)-16),min(256,round(py)+17)):
                    for xx in range(max(0,round(px)-16),min(256,round(px)+17)):
                        r,g,b,a=im.getpixel((xx,yy))
                        if a>96 and r>100 and g>65 and b>50 and r>g*1.12 and r>b*1.05 and g>b*.75:skin.append((xx,yy))
                check(len(skin)>20,f'{kind}/{i} fretting hand is not visibly present at its target')
                # A natural gripping hand wraps the neck: test contact, not the palm centroid.
                check(min(math.hypot(x-px,y-py) for x,y in skin)<6,f'{kind}/{i} no visible finger contact near the selected position')
                check(pack['pose_indices'][i]==(i//32)*9+notes[0]+notes[-1],f'{kind}/{i} wrong fully drawn midpoint pose')
            crop=im.crop((75,28,165,120) if kind=='guitar' else (65,25,185,130)).tobytes()
        elif kind=='drums':
            for bit,(x,y) in enumerate(pack['centers']):
                c=[colors[1],colors[2],colors[3],colors[0]][bit] if mask&(1<<bit) else (12,15,22)
                actual=sample(im,x,y);expected(actual,c,f'drums/{i} incorrect pad {bit}')
                on=[colors[1],colors[2],colors[3],colors[0]][bit]
                if sum((a-b)**2 for a,b in zip(actual,on)) < sum((a-b)**2 for a,b in zip(actual,(12,15,22))):decoded|=1<<bit
            c=colors[4] if mask&16 else tuple(v//6 for v in colors[4])
            actual=sample(im,*pack['kick_center']);expected(actual,c,f'drums/{i} incorrect kick')
            if actual[0]>120:decoded|=16
            crop=im.crop((95,25,160,125)).tobytes()
        else:
            for bit,region in enumerate(visible_key_regions):
                colored=colored_key_pixels(im,region,colors[bit])
                on=colored>75
                check(on==bool(mask&(1<<bit)),f'keys/{i} full key {bit} incorrect visible color ({colored} pixels)')
                if on:decoded|=1<<bit
            hands=pack['hand_groups'][i]
            check(sorted(hands[0]+hands[1])==[b for b in range(7) if mask&(1<<b)],'Keyboard hand grouping lost or added notes')
            crop=im.crop((65,20,190,130)).tobytes()
        decoded_masks.append(decoded)
        expected_mask=([m for m in range(32) if (m&15).bit_count()<=2][i] if kind=='drums' else i%32 if kind in ('guitar','bass') else i)
        check(decoded==expected_mask,f'{kind}/{i} decoded pixels do not match the binary mask')
        if identity is None:identity=crop
        check(crop==identity,f'{kind}/{i} face/body registration changed across command masks')
    if kind in ('guitar','bass'):
        check(set(decoded_masks[:32])==set(range(32)) and set(decoded_masks[32:])==set(range(32)),kind+' lacks one or more masks in a strum state')
    elif kind=='drums':check(set(decoded_masks)=={m for m in range(32) if (m&15).bit_count()<=2},'Drums exceed the two-stick limit or miss a supported pattern')
    else:check(set(decoded_masks)==set(range(count)),kind+' lacks combinations')
    print(kind,count,'poses: complete pixel-decoded combinations, transparent margins and identity stable')

for name,digest in manifest['metadata_sha256'].items():
    path=ROOT/name;meta=Path(str(path)+'.meta')
    check(hashlib.sha256(meta.read_bytes()).hexdigest()==digest,'Unity sprite IDs or cuts changed: '+name)
    if name in manifest.get('created',[]):continue
    backup=OUT/'anteriores'/name
    check(path.exists() and backup.exists(),'Missing artifact or original backup: '+name)
    check(rgba(path).size==rgba(backup).size,'Auxiliary sheet layout changed: '+name)
    check(meta.read_bytes()==Path(str(backup)+'.meta').read_bytes(),'Original metadata was not retained: '+name)

# Limb artwork must be selected intact, never warped into a thin ribbon.
source=(ROOT/'scripts/export_new_characters.py').read_text()
check('Image.Transform.AFFINE' not in source,'Arm deformation reintroduced')
check('map_segment' not in source and 'elbow_for' not in source,'Split-limb rig reintroduced')
for kind,prefix in [('guitar','Guitarrista'),('bass','Baixista')]:
    art=rgba(export.SOURCE/manifest['characters'][kind]['source'])
    check(abs(art.height/art.width-2)<.02,kind+' natural pose grid is not square-celled 3x6')
    check(len(set(manifest['characters'][kind]['pose_indices']))==18,kind+' misses a full natural arm pose')

# Inspect the SOURCE contours as well as atlas padding: padding cannot repair cropped art.
guitar_source=rgba(export.SOURCE/manifest['characters']['guitar']['source'])
for index in range(18):
    pose=export.cell(guitar_source,index,3,6)
    opaque=pose.getchannel('A').point(lambda v:255 if v>96 else 0)
    for rectangle in [(0,0,512,12),(0,500,512,512),(0,0,12,512),(500,0,512,512)]:
        check(opaque.crop(rectangle).getbbox() is None,f'guitar/{index} source touches a cell border')
    armor=[(x,y) for y in range(300,512) for x in range(512)
           if (lambda c:c[3]>180 and min(c[:3])>140 and max(c[:3])-min(c[:3])<75)(pose.getpixel((x,y)))]
    check(len(armor)>150,f'guitar/{index} missing the ivory X-plorer body')
    check(max(y for x,y in armor)<round(.92*512),f'guitar/{index} body has no complete bottom contour/waist clearance')
    check(min(x for x,y in armor)>round(.06*512) and max(x for x,y in armor)<round(.94*512),f'guitar/{index} wing contour touches the source edge')

# No button may overlap the original hand; all drawn fingers remain foreground.
for kind in ('guitar','bass'):
    pack=manifest['characters'][kind]
    sheet=rgba(export.SOURCE/pack['source']);layout=pack['button_layout']
    button_mask=Image.new('L',(512,512));draw=ImageDraw.Draw(button_mask)
    for x,y in pack['centers']:draw.polygon(export.button_shape(x,y,layout['width'],layout['height'],layout['angle']),fill=255)
    for index in range(18):
        original=export.cell(sheet,index,3,6);skin,_=export.fretting_skin(original,kind)
        check(ImageChops.multiply(button_mask,skin.filter(ImageFilter.MaxFilter(3))).getbbox() is None,f'{kind}/{index} buttons overlap fingers')
        # Compare opaque interior pixels after the same uniform cell downsample.
        reference=export.fit(original)
        interior=skin.filter(ImageFilter.MinFilter(7)).resize((240,240),Image.Resampling.LANCZOS)
        test_mask=Image.new('L',(256,256));test_mask.paste(interior,(8,8))
        test_mask=test_mask.point(lambda v:255 if v>250 else 0)
        actual_index=next(i for i,pose in enumerate(pack['pose_indices']) if pose==index)
        difference=ImageChops.difference(frame(kind,actual_index).convert('RGB'),reference.convert('RGB'))
        check(ImageChops.multiply(difference,Image.merge('RGB',(test_mask,test_mask,test_mask))).getbbox() is None,f'{kind}/{index} original hand pixels painted over')

# Sticks beside the face must remain exactly as in their own pose, never copied from idle.
drum_sheet=rgba(export.SOURCE/manifest['characters']['drums']['source'])
for index in range(11):
    reference=export.fit(export.cell(drum_sheet,index,4,3))
    for rectangle in [(69,28,84,80),(175,28,190,80)]:
        check(frame('drums',index).crop(rectangle).tobytes()==reference.crop(rectangle).tobytes(),f'drums/{index} copied a stray stick near the face')
    for kick in range(2):
        actual=frame('drums',index+kick*11)
        check(actual.getpixel((128,232))[3]>200,f'drums/{index} missing the physical kick drum head')
        # The round shell and chrome rim remain visible even when the pedal is idle.
        rim=actual.crop((98,209,159,246))
        check(sum(1 for r,g,b,a in rim.get_flattened_data() if a>180 and r>80)>250,f'drums/{index} kick has no visible shell/rim')
for kind in ('guitar','bass'):
    layout=manifest['characters'][kind]['button_layout']
    check(layout['placement']=='calibrated_to_physical_neck',kind+' frets follow hands instead of the instrument')

# Full-key tint follows original contours and leaves every other instrument pixel intact.
union=Image.new('L',(512,512))
for region in key_regions:union=ImageChops.lighter(union,region)
outside=ImageChops.invert(union)
for mask in range(128):
    lit=export.color_keyboard(keyboard_source,key_regions,mask)
    difference=ImageChops.difference(lit.convert('RGB'),keyboard_source.convert('RGB'))
    check(ImageChops.multiply(difference,Image.merge('RGB',(outside,outside,outside))).getbbox() is None,f'keys/{mask} tint spills outside the actual keys')
    for bit,(upper_x,lower_x) in enumerate(zip([108,156,205,255,305,355,405],[86,142,197,256,315,370,426])):
        for x,y in [(upper_x,350),(lower_x,367)]:
            check(key_regions[bit].getpixel((x,y))==255,f'key {bit} does not include the whole physical key')
            if mask&(1<<bit):
                rgb=lit.getpixel((x,y))[:3];brightness=max(rgb)
                check(max(abs(rgb[c]*255/brightness-colors[bit][c]) for c in range(3))<3,f'keys/{mask} key {bit} is not colored from back to front')

keyboard_canvas=Image.new('RGBA',(512,512));keyboard_canvas.alpha_composite(keyboard_source,(0,51))
reference_keyboard=export.fit(keyboard_canvas)
case_rect=(45,217,210,225);case_pixels=reference_keyboard.crop(case_rect).tobytes()
for index in range(128):check(frame('keys',index).crop(case_rect).tobytes()==case_pixels,f'keys/{index} changed the previous keyboard casing')

prefab=(ROOT/'Assets/Prefabs/Gameplay/HUD/TrackView.prefab').read_text(encoding='utf-8-sig')
before=(OUT/'anteriores/Assets/Prefabs/Gameplay/HUD/TrackView.prefab').read_text(encoding='utf-8-sig')
for field in ['guitarCommandPoses','bassCommandPoses','keysCommandPoses']:
    pattern=rf'^  {field}:\n((?:  - \{{[^\n]+\}}\n)+)'
    old=re.search(pattern,before,re.M);new=re.search(pattern,prefab,re.M)
    check(old is not None and new is not None and old[1]==new[1],field+' references or order changed')
for field in ['bassCommandTexture','commandStrikeDuration','enableMissReaction']:
    pattern=rf'^  {field}: [^\n]+'
    check(re.search(pattern,before,re.M)[0]==re.search(pattern,prefab,re.M)[0],field+' behavior changed')
drum_meta=Path(str(DEST/'Comandos/Baterista_Combinacoes22.png')+'.meta').read_text()
g=re.search(r'^guid: (\w+)',drum_meta,re.M)[1]
refs=re.search(r'^  drumsCommandPoses:\n((?:  - \{[^\n]+\}\n)+)',prefab,re.M)[1]
check(refs==''.join(f'  - {{fileID: {21300101+i}, guid: {g}, type: 3}}\n' for i in range(22)),'Drum pose references not in supported two-stick order')
check(f'drumsCommandTexture: {{fileID: 2800000, guid: {g}, type: 3}}' in prefab,'22-state drum texture not connected')
check(len(re.findall(r'^      name: Baterista_Mascara_',drum_meta,re.M))==22,'Missing imported drum sprites')
inactive_guid=re.search(r'^guid: (\w+)',Path(str(DEST/'Comandos/Baterista_Combinacoes32.png')+'.meta').read_text(),re.M)[1]
check(inactive_guid not in prefab,'Inactive 32-state drum sheet still used by game')
print(f'PASS: {checks} assertions across all 278 poses; all lights, identities, supported combinations and Unity references valid.')
