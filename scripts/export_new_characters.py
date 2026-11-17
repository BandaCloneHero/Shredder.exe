#!/usr/bin/env python3
"""Assemble exact command masks from image-generated poses; preserve Unity sprite IDs."""
import argparse
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'Assets/Art/Reference/Personagens/Novos2026'
DEST = ROOT / 'Assets/Sprites/Personagens'
OUT = ROOT / 'output/personagens-novos'
PREFAB = ROOT / 'Assets/Prefabs/Gameplay/HUD/TrackView.prefab'
SIZE, WORK, PAD = 256, 512, 8
COLORS = [(51,255,38),(255,31,26),(255,230,13),(31,115,255),(255,115,10),(0,240,255),(225,45,255)]
DRUM_COLORS = [COLORS[1],COLORS[2],COLORS[3],COLORS[0],COLORS[4]]
PAD_MASKS = [0,1,2,3,4,5,6,8,9,10,12]
KEY_X = [.1673,.2776,.3847,.4991,.6145,.7231,.8320]
KEY_Y = .817
DRUM_CENTERS = [(.216,.783),(.403,.741),(.598,.741),(.787,.783)]
DRUM_KICK = (.5,.910)
NECK_BOARDS = {
    "guitar": {"first":(.549,.619),"last":(.679,.518),"width":.026,"height":.020},
    "bass": {"first":(.569,.743),"last":(.788,.615),"width":.040,"height":.026},
}
SOURCES = {'guitar':'Guitarrista_XplorerCyberpunk18.png','bass':'Baixista_EscalaAlinhada18.png','drums':'Baterista_Bumbo11.png'}
COMMANDS = {'guitar':['Roland_Combinacoes64.png'],'bass':['Baixista_Combinacoes64.png'],
            'drums':['Baterista_Combinacoes22.png'],'keys':['Tecladista_Combinacoes_000_063.png','Tecladista_Combinacoes_064_127.png']}
AUX = {'guitar':['Roland_IdleGuitarra.png','Roland_Guitarra.png','Defesas/Roland_Defesa.png'],
       'bass':['Baixista.png','Defesas/Baixista_Defesa.png'],
       'drums':['Baterista.png','Defesas/Baterista_Defesa.png'],
       'keys':['Tecladista.png','Defesas/Tecladista_Defesa.png']}
STRING_LAYOUT = {}
CENTERS = {'guitar':[(.580,.829),(.638,.790),(.695,.751),(.753,.712),(.811,.673)],
           'bass':[(.569,.774),(.629,.739),(.689,.704),(.749,.669),(.809,.634)]}


def rgba(path):
    return Image.open(path).convert('RGBA')


def cell(sheet, index, cols, rows):
    x,y=index%cols,index//cols
    cut=sheet.crop((round(x*sheet.width/cols),round(y*sheet.height/rows),
                    round((x+1)*sheet.width/cols),round((y+1)*sheet.height/rows)))
    result=Image.new('RGBA',(WORK,WORK))
    cut=ImageOps.contain(cut,(WORK,WORK),Image.Resampling.LANCZOS)
    result.alpha_composite(cut,((WORK-cut.width)//2,(WORK-cut.height)//2))
    return result


def fit(frame, size=SIZE, pad=PAD):
    result=Image.new('RGBA',(size,size))
    frame=ImageOps.contain(frame,(size-pad*2,size-pad*2),Image.Resampling.LANCZOS)
    result.alpha_composite(frame,((size-frame.width)//2,(size-frame.height)//2))
    return result


def groups(mask):
    notes=[i for i in range(7) if mask&(1<<i)]
    if not notes:return [[],[]]
    if len(notes)<=2 and notes[-1]-notes[0]<=2:
        result=[[],[]];result[0 if notes[0]+notes[-1]<=6 else 1]=notes;return result
    def cost(split):
        a,b=notes[split-1]-notes[0],notes[-1]-notes[split]
        return 10*max(a,b)+a+b+.4*abs(split-(len(notes)-split))
    split=min(range(1,len(notes)),key=cost)
    return [notes[:split],notes[split:]]


def button_shape(x,y,w=.047,h=.044,angle=-34):
    co,si=math.cos(math.radians(angle)),math.sin(math.radians(angle))
    return [(round((x+dx*w*co-dy*h*si)*WORK),round((y+dx*w*si+dy*h*co)*WORK))
            for dx,dy in [(-.5,-.5),(-.5,.5),(.5,.5),(.5,-.5)]]


def hand_target(kind,mask,hand=0):
    notes=[i for i in range(5) if mask&(1<<i)]
    if not notes:return (.73,.90) if kind=='guitar' else (.72,.90)
    first,last=CENTERS[kind][notes[0]],CENTERS[kind][notes[-1]]
    dx,dy=CENTERS[kind][-1][0]-CENTERS[kind][0][0],CENTERS[kind][-1][1]-CENTERS[kind][0][1]
    length=math.hypot(dx,dy)
    # Palm sits just below the fretboard; its projection lands exactly on the middle button.
    layout=STRING_LAYOUT.get(kind,{})
    offset=layout['hand_clearances'][string_pose_index(mask,hand)] if 'hand_clearances' in layout else layout.get('clearance',.06)
    return ((first[0]+last[0])/2-dy/length*offset,(first[1]+last[1])/2+dx/length*offset)


def skin_pixel(pixel):
    r,g,b,a=pixel
    return a>96 and r>100 and g>65 and b>50 and r>g*1.12 and r>b*1.05 and g>b*.75


def string_pose_index(mask, hand=0):
    """Nine fully drawn positions: buttons and the four halfway positions."""
    notes=[i for i in range(5) if mask&(1<<i)]
    return hand*9+(notes[0]+notes[-1] if notes else 0)


def fretting_skin(frame,kind=None):
    """Visible fretting skin only; exclude the face and the picking hand."""
    remaining={(x,y) for y in range(round((.54 if kind=='guitar' else .60)*WORK),round(.94*WORK))
               for x in range(round(.555*WORK),round(.92*WORK)) if skin_pixel(frame.getpixel((x,y)))}
    components=[]
    while remaining:
        stack=[remaining.pop()];component=[]
        while stack:
            x,y=stack.pop();component.append((x,y))
            for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                point=(x+dx,y+dy)
                if point in remaining:remaining.remove(point);stack.append(point)
        if len(component)>25:components.append(component)
    region=max(components,key=len)
    mask=Image.new('L',(WORK,WORK))
    for point in region:mask.putpixel(point,255)
    return mask,(sum(x for x,y in region)/len(region)/WORK,sum(y for x,y in region)/len(region)/WORK)


def string_layout(kind,poses):
    """Author the rail on the instrument itself; hands never determine fret placement."""
    board=NECK_BOARDS[kind];first,last=board['first'],board['last']
    centers=[(first[0]+(last[0]-first[0])*i/4,first[1]+(last[1]-first[1])*i/4) for i in range(5)]
    width,height=board['width'],board['height']
    buttons=Image.new('L',(WORK,WORK));draw=ImageDraw.Draw(buttons)
    angle=math.degrees(math.atan2(last[1]-first[1],last[0]-first[0]))
    for x,y in centers:draw.polygon(button_shape(x,y,width,height,angle),fill=255)
    dx,dy=last[0]-first[0],last[1]-first[1];length=math.hypot(dx,dy)
    nx,ny=-dy/length,dx/length;clearances=[]
    for index,pose in enumerate(poses):
        skin,contact=fretting_skin(pose,kind)
        if ImageChops.multiply(buttons,skin.filter(ImageFilter.MaxFilter(3))).getbbox() is not None:
            raise ValueError(f'{kind}/{index}: fixed instrument frets overlap the hand')
        clearances.append((contact[0]-first[0])*nx+(contact[1]-first[1])*ny)
    return centers,width,height,angle,clearances


def string_frames(kind):
    sheet=rgba(SOURCE/SOURCES[kind]);poses=[cell(sheet,i,3,6) for i in range(18)]
    centers,width,height,angle,clearances=string_layout(kind,poses)
    # Record the actual generated instrument layout for export and verification.
    CENTERS[kind]=centers
    STRING_LAYOUT[kind]={'clearance':sum(clearances)/len(clearances),'hand_clearances':clearances,'width':width,'height':height,'angle':angle,'placement':'calibrated_to_physical_neck'}
    frames=[]
    head_rect=(0,0,WORK,round(.50*WORK)) if kind=='guitar' else (0,0,WORK,round(.57*WORK))
    head=poses[0].crop(head_rect)
    for hand in range(2):
        for mask in range(32):
            frame=poses[string_pose_index(mask,hand)].copy();frame.paste(head,head_rect[:2])
            original=frame.copy();skin,_=fretting_skin(frame,kind)
            first,last=centers[0],centers[-1]
            dx,dy=last[0]-first[0],last[1]-first[1];length=math.hypot(dx,dy)
            tx,ty=dx/length,dy/length;nx,ny=-ty,tx
            strip=[]
            for center,along,across in [(first,-width*.65,-height*.65),(first,-width*.65,height*.65),
                                       (last,width*.65,height*.65),(last,width*.65,-height*.65)]:
                strip.append((round((center[0]+along*tx+across*nx)*WORK),round((center[1]+along*ty+across*ny)*WORK)))
            draw=ImageDraw.Draw(frame)
            draw.polygon(strip,fill=(18,22,30,255),outline=(90,95,108,255),width=1)
            for bit,(x,y) in enumerate(centers):
                c=COLORS[bit];on=bool(mask&(1<<bit));color=c if on else tuple(v//6 for v in c)
                draw.polygon(button_shape(x,y,width,height,angle),fill=(*color,255),outline=(235,235,245,255) if on else (45,49,58,255),width=1)
            # Hands are in the foreground. The preflight clearance keeps all LEDs unobstructed.
            frame=Image.composite(original,frame,skin)
            frames.append(fit(frame))
    return frames


def drum_frames():
    sheet=rgba(SOURCE/SOURCES['drums']);poses=[cell(sheet,i,4,3) for i in range(11)]
    # Exclude the raised sticks beside the head: copying them caused floating tips.
    face_rect=(round(.34*WORK),0,round(.66*WORK),round(.56*WORK))
    face=poses[0].crop(face_rect);result=[]
    for kick in range(2):
        for index,mask in enumerate(PAD_MASKS):
            frame=poses[index].copy();frame.paste(face,face_rect[:2]);draw=ImageDraw.Draw(frame)
            for bit,(x,y) in enumerate(DRUM_CENTERS):
                on=bool(mask&(1<<bit));c=DRUM_COLORS[bit];rim=c if on else tuple(v//6 for v in c)
                box=((x-.084)*WORK,(y-.030)*WORK,(x+.084)*WORK,(y+.030)*WORK)
                draw.ellipse(box,fill=(12,15,22,255),outline=(*rim,255),width=4 if on else 3)
                if on:draw.ellipse(((x-.020)*WORK,(y-.008)*WORK,(x+.020)*WORK,(y+.008)*WORK),fill=(*c,255))
            # The pedal hit lights the physical kick drum's front head, not a floating dot.
            kx,ky=DRUM_KICK
            if kick:
                glow=Image.new('RGBA',(WORK,WORK));gd=ImageDraw.Draw(glow)
                gd.ellipse(((kx-.079)*WORK,(ky-.079)*WORK,(kx+.079)*WORK,(ky+.079)*WORK),fill=(*COLORS[4],35),outline=(*COLORS[4],210),width=3)
                frame.alpha_composite(glow);draw=ImageDraw.Draw(frame)
            c=COLORS[4] if kick else tuple(v//6 for v in COLORS[4])
            draw.ellipse(((kx-.016)*WORK,(ky-.016)*WORK,(kx+.016)*WORK,(ky+.016)*WORK),fill=(*c,255))
            result.append(fit(frame))
    return result


def keyboard_key_masks(keyboard):
    """Follow the real perspective and black-key cutouts of all seven white keys."""
    import colorsys
    top=[90,139,188,237,287,336,386,424]
    bottom=[56,124,181,239,297,354,411,454]
    masks=[]
    for bit in range(7):
        boundary=Image.new('L',(WORK,WORK))
        ImageDraw.Draw(boundary).polygon([(top[bit],342),(top[bit+1],342),
                                         (bottom[bit+1],374),(bottom[bit],374)],fill=255)
        mask=Image.new('L',(WORK,WORK))
        target_hue=colorsys.rgb_to_hsv(*(v/255 for v in COLORS[bit]))[0]
        for y in range(342,375):
            for x in range(min(top[bit],bottom[bit]),max(top[bit+1],bottom[bit+1])+1):
                if not boundary.getpixel((x,y)):continue
                r,g,b,a=keyboard.getpixel((x,y));h,saturation,value=colorsys.rgb_to_hsv(r/255,g/255,b/255)
                distance=min(abs(h-target_hue),1-abs(h-target_hue))
                white=min(r,g,b)>105 and max(r,g,b)-min(r,g,b)<80
                old_cap=saturation>.28 and value>.32 and distance<.13
                if a>128 and (white or old_cap):mask.putpixel((x,y),255)
        masks.append(mask)
    return masks


def color_keyboard(keyboard,key_masks,mask):
    # Tint existing pixels: keep bevels, highlights, shadows and original key contours.
    r,g,b,a=keyboard.split();brightness=ImageChops.lighter(ImageChops.lighter(r,g),b)
    result=keyboard.copy()
    for bit,region in enumerate(key_masks):
        color=COLORS[bit] if mask&(1<<bit) else (245,245,248)
        channels=[brightness.point(lambda v,c=c:round(v*c/255)) for c in color]
        tinted=Image.merge('RGBA',(*channels,a))
        result=Image.composite(tinted,result,region)
    return result


def keys_frames():
    base=rgba(SOURCE/'Tecladista_Base.png').resize((WORK,WORK),Image.Resampling.LANCZOS)
    # Preserve the earlier keyboard's actual artwork, shifted down to match the new torso.
    base.paste((0,0,0,0),(0,round(.73*WORK),WORK,WORK))
    keyboard=rgba(SOURCE/'Teclado_Anterior.png')
    key_masks=keyboard_key_masks(keyboard)
    sheet=rgba(SOURCE/'Tecladista_PosesNaturais20.png')
    arms=[cell(sheet,i,4,5) for i in range(20)]
    slots=[[0,1,2,3,4,5,6,7,8],[3,5,6,7,8,9,10,11,12]]
    frames=[];arm_layers={}
    for mask in range(128):
        behind=Image.new('RGBA',(WORK,WORK));front=Image.new('RGBA',(WORK,WORK))
        for side,notes in enumerate(groups(mask)):
            index=side*10+(0 if not notes else 1+slots[side].index(notes[0]+notes[-1]))
            pose=arms[index]
            target=(.17 if side==0 else .83) if not notes else (KEY_X[notes[0]]+KEY_X[notes[-1]])/2
            if index not in arm_layers:
                # Extract the whole drawn arm without changing its scale, angle or anatomy.
                extent=max(.40,(target if side==0 else 1-target)+.09)
                polygon=[(0,.52),(.35,.52),(.40,.65),(extent,.70),(extent,.84),(0,.84)]
                if side:polygon=[(1-x,y) for x,y in polygon]
                region=Image.new('L',(WORK,WORK));ImageDraw.Draw(region).polygon([(round(x*WORK),round(y*WORK)) for x,y in polygon],fill=255)
                layer=Image.new('RGBA',(WORK,WORK))
                layer.paste(pose,(0,0),region)
                # Below the back edge only retain fingers, never the generated instrument.
                for y in range(round(.765*WORK),WORK):
                    for x in range(WORK):
                        if not skin_pixel(layer.getpixel((x,y))):layer.putpixel((x,y),(0,0,0,0))
                arm_layers[index]=layer
            layer=arm_layers[index]
            behind.alpha_composite(layer)
            # Complete pre-drawn limbs keep their volume and original proportions.
            cut=round(.65*WORK);front.alpha_composite(layer.crop((0,cut,WORK,WORK)),(0,cut))
        lit_base=base.copy()
        lit_base.alpha_composite(color_keyboard(keyboard,key_masks,mask),(0,round(.10*WORK)))
        behind.alpha_composite(lit_base);behind.alpha_composite(front)
        head_rect=(0,0,WORK,round(.55*WORK))
        behind.paste(base.crop(head_rect),head_rect[:2])
        frames.append(fit(behind))
    return frames


def pack(frames,cols,rows):
    result=Image.new('RGBA',(cols*SIZE,rows*SIZE))
    for i,frame in enumerate(frames):result.alpha_composite(frame,((i%cols)*SIZE,(i//cols)*SIZE))
    return result


def guid(path):
    return re.search(r'^guid: (\w+)',Path(str(path)+'.meta').read_text(),re.M)[1]


def backup(paths):
    root=OUT/'anteriores'
    for path in paths:
        for f in [path,Path(str(path)+'.meta')]:
            if f.exists():
                target=root/f.relative_to(ROOT)
                if not target.exists():target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,target)


def sprite_rects(path):
    text=Path(str(path)+'.meta').read_text();text=text[text.index('  spriteSheet:'):]
    return [tuple(round(float(v)) for v in m) for m in re.findall(
        r'      rect:\n        serializedVersion: \d+\n        x: ([\d.]+)\n        y: ([\d.]+)\n        width: ([\d.]+)\n        height: ([\d.]+)',text)]


def auxiliary(path,basis):
    size=Image.open(path).size;atlas=Image.new('RGBA',size)
    rects=sprite_rects(path)
    for i,(x,y,w,h) in enumerate(rects):
        frame=fit(basis,min(w,h),6)
        # Keep the old frame counts and a restrained idle/reaction motion for fallback modes.
        bob=round(math.sin(i*2*math.pi/len(rects)))
        strength = .18*math.sin(math.pi*(i % 16)/15) if path.parent.name=='Defesas' else .14*math.sin(math.pi*(i-16)/15) if i>=16 else 0
        if strength>0:
            tint=Image.new('RGBA',frame.size,(70,245,180,255) if path.parent.name=='Defesas' else (255,75,95,255))
            tint.putalpha(frame.getchannel('A'));frame=Image.blend(frame,tint,strength)
        atlas.alpha_composite(frame,(x+(w-frame.width)//2,size[1]-y-h+(h-frame.height)//2+bob))
    atlas.save(path)


def ensure_drum_metadata():
    if COMMANDS['drums'][0]=='Baterista_Combinacoes22.png':return
    import uuid
    path=DEST/'Comandos'/'Baterista_Combinacoes32.png.meta'
    if path.exists():return
    template=(DEST/'Comandos'/'Baterista_Combinacoes22.png.meta').read_text()
    g=uuid.uuid4().hex
    prefix=template[:template.index('  spriteSheet:')]
    prefix=re.sub(r'(?m)^guid: .*','guid: '+g,prefix)
    names=''.join(f'  - first:\n      213: {21300101+i}\n    second: Baterista_Mascara_{i:02d}\n' for i in range(32))
    prefix=re.sub(r'(?s)  internalIDToNameTable:.*?(?=  externalObjects:)', '  internalIDToNameTable:\n'+names,prefix)
    entry=re.search(r'    - serializedVersion: 2\n      name:.*?(?=    - serializedVersion: 2)',template,re.S)[0]
    entries=[]
    for i in range(32):
        part=re.sub(r'(?m)^      name: .*',f'      name: Baterista_Mascara_{i:02d}',entry)
        for key,value in [('x',i%8*256),('y',(3-i//8)*256),('width',256),('height',256)]:
            part=re.sub(rf'(?m)^        {key}: .*',f'        {key}: {value}',part)
        part=re.sub(r'(?m)^      internalID: .*',f'      internalID: {21300101+i}',part)
        part=re.sub(r'(?m)^      spriteID: .*','      spriteID: '+hashlib.md5((g+str(i)).encode()).hexdigest(),part)
        entries.append(part)
    suffix=template[re.search(r'(?m)^    spriteID:',template).start():]
    table=''.join(f'      Baterista_Mascara_{i:02d}: {21300101+i}\n' for i in range(32))
    suffix=re.sub(r'(?s)    nameFileIdTable:.*?(?=  mipmapLimitGroupName:)', '    nameFileIdTable:\n'+table,suffix)
    path.write_text(prefix+'  spriteSheet:\n    serializedVersion: 2\n    sprites:\n'+''.join(entries)+suffix)


def update_prefab(kinds,changed_paths):
    text=PREFAB.read_text(encoding='utf-8-sig')
    new_guids={guid(p) for p in changed_paths}
    def sizing(match):
        return match[1]+'    scale: 1.00000\n    offset: {x: 0.00000, y: 0.00000}' if match[2] in new_guids else match[0]
    text=re.sub(r'(  - sprite: \{fileID: -?\d+, guid: (\w+), type: 3\}\n)    scale: [^\n]+\n    offset: \{[^\n]+\}',sizing,text)
    if 'drums' in kinds:
        g=guid(DEST/'Comandos'/COMMANDS['drums'][0])
        text=re.sub(r'(?m)^  drumsCommandTexture: .*$',f'  drumsCommandTexture: {{fileID: 2800000, guid: {g}, type: 3}}',text)
        refs='  drumsCommandPoses:\n'+''.join(f'  - {{fileID: {21300101+i}, guid: {g}, type: 3}}\n' for i in range(22))
        text=re.sub(r'(?m)^  drumsCommandPoses:\n(?:  - \{[^\n]+\}\n)+',refs,text)
        text=re.sub(r'(?m)^  drumsIdleFrames:\n(?:  - \{[^\n]+\}\n)+',f'  drumsIdleFrames:\n  - {{fileID: 21300101, guid: {g}, type: 3}}\n',text)
    if 'guitar' in kinds:
        g=guid(DEST/'Comandos'/COMMANDS['guitar'][0])
        text=text.replace('  m_Sprite: {fileID: 1172433110, guid: 298d198c2ada10d4098ac3518d1af069, type: 3}',
                          f'  m_Sprite: {{fileID: 21300101, guid: {g}, type: 3}}')
        # Imported command frame 0 is also a valid new-character idle/generic portrait.
        text=re.sub(r'(?m)^  normalSprite: .*$',f'  normalSprite: {{fileID: 21300101, guid: {g}, type: 3}}',text)
        text=re.sub(r'(?m)^  missSprite: .*$',f'  missSprite: {{fileID: 21300101, guid: {g}, type: 3}}',text)
    PREFAB.write_text(text,encoding='utf-8')


def combination_proofs(all_frames):
    from PIL import ImageFont
    font=ImageFont.load_default(size=16)
    names={'guitar':'guitarra','bass':'baixo','drums':'bateria','keys':'teclado'}
    for kind,frames in all_frames.items():
        cols=4 if kind=='drums' else 8;rows=math.ceil(len(frames)/cols)
        proof=Image.new('RGBA',(cols*256,rows*320),(22,23,30,255));d=ImageDraw.Draw(proof)
        for index,frame in enumerate(frames):
            x,y=index%cols*256,index//cols*320
            mask=(PAD_MASKS[index%11]+16*(index//11)) if kind=='drums' else index%32 if kind in ('guitar','bass') else index
            bits=7 if kind=='keys' else 5
            bit_string=''.join(str((mask>>b)&1) for b in range(bits))
            label=f'{index:03d} | {bit_string}'
            if kind in ('guitar','bass'):label+=f' | P{index//32}'
            d.text((x+8,y+5),label,font=font,fill='white')
            palette=DRUM_COLORS if kind=='drums' else COLORS
            for bit in range(bits):
                c=palette[bit] if mask&(1<<bit) else (42,44,52)
                d.ellipse((x+10+bit*24,y+30,x+24+bit*24,y+44),fill=(*c,255))
            proof.alpha_composite(frame,(x,y+56))
        proof.save(OUT/f'combinacoes-{names[kind]}-todas.png')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=list(COMMANDS))
    args=parser.parse_args();kinds=[args.only] if args.only else list(COMMANDS)
    OUT.mkdir(parents=True,exist_ok=True)
    if 'drums' in kinds:ensure_drum_metadata()
    paths=[DEST/'Comandos'/name for kind in kinds for name in COMMANDS[kind]]
    paths += [DEST/name for kind in kinds for name in AUX[kind]]
    created=[str(p.relative_to(ROOT)) for p in paths if not p.exists()]
    backup(paths+[PREFAB])
    meta_before={str(p.relative_to(ROOT)):hashlib.sha256(Path(str(p)+'.meta').read_bytes()).hexdigest() for p in paths}
    previous=json.loads((OUT/'manifest.json').read_text()) if (OUT/'manifest.json').exists() else {}
    all_frames={};manifest=previous.get('characters',{}) if args.only else {}
    meta_before={**previous.get('metadata_sha256',{}),**meta_before}
    for kind in kinds:
        frames=string_frames(kind) if kind in ('guitar','bass') else drum_frames() if kind=='drums' else keys_frames()
        all_frames[kind]=frames
        if kind=='keys':
            for part,name in enumerate(COMMANDS[kind]):pack(frames[part*64:(part+1)*64],8,8).save(DEST/'Comandos'/name)
        else:pack(frames,6 if kind=='drums' else 8,4 if kind=='drums' else 8).save(DEST/'Comandos'/COMMANDS[kind][0])
        for name in AUX[kind]:auxiliary(DEST/name,frames[0])
        mask_order=[m+16*k for k in range(2) for m in PAD_MASKS] if kind=='drums' else [i%32 for i in range(64)] if kind in ('guitar','bass') else list(range(len(frames)))
        manifest[kind]={'frames':len(frames),'masks':mask_order,'outputs':COMMANDS[kind],
                        'centers':DRUM_CENTERS if kind=='drums' else CENTERS.get(kind),'kick_center':DRUM_KICK if kind=='drums' else None,'button_layout':STRING_LAYOUT.get(kind),'source':SOURCES.get(kind),'hand_targets':[hand_target(kind,i%32,i//32) for i in range(64)] if kind in ('guitar','bass') else None,'hand_rule':'two_sticks_and_kick' if kind=='drums' else 'midpoint_of_extreme_active_buttons','pose_indices':[string_pose_index(i%32,i//32) for i in range(64)] if kind in ('guitar','bass') else None,'hand_groups':[groups(i) for i in range(128)] if kind=='keys' else None}
        print(kind,len(frames),'command poses exported')
    update_prefab(kinds,paths)
    for p in paths:assert hashlib.sha256(Path(str(p)+'.meta').read_bytes()).hexdigest()==meta_before[str(p.relative_to(ROOT))], 'Unity IDs changed'
    # A single-instrument rebuild keeps the complete band preview available.
    for other in COMMANDS:
        if other in all_frames:continue
        existing=[]
        for name in COMMANDS[other]:
            image=rgba(DEST/'Comandos'/name);cols=6 if other=='drums' else 8
            count=22 if other=='drums' else 64
            for index in range(count):
                x,y=index%cols*SIZE,index//cols*SIZE
                existing.append(image.crop((x,y,x+SIZE,y+SIZE)))
        all_frames[other]=existing
    samples={'guitar':[0,3,5,15,31,63],'bass':[0,3,5,15,31,63],'drums':[0,1,3,10,11,21],'keys':[0,3,21,65,85,127]}
    preview=Image.new('RGBA',(1536,4*288),(22,23,30,255));draw=ImageDraw.Draw(preview)
    for row,kind in enumerate(COMMANDS):
        if kind not in all_frames:continue
        for col,index in enumerate(samples[kind]):preview.alpha_composite(all_frames[kind][index],(col*256,row*288+26));draw.text((col*256+8,row*288+7),f'{kind} | {index}',fill='white')
    preview.save(OUT/'combinacoes-preview.png')
    combination_proofs(all_frames)
    (OUT/'manifest.json').write_text(json.dumps({'characters':manifest,'metadata_sha256':meta_before,'padding':PAD,'created':sorted(set(previous.get('created',[])+created))},indent=2),encoding='utf-8')

if __name__=='__main__':main()
