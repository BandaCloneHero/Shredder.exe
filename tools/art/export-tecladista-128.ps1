$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class KeysPoseExport {
 static readonly Dictionary<string,float[]> Anchors=new Dictionary<string,float[]>();
 static readonly float[] X={.163f,.273f,.377f,.489f,.605f,.710f,.820f};
 static readonly Color[] Colors={Color.Lime,Color.Red,Color.Gold,Color.DodgerBlue,Color.Orange,Color.Cyan,Color.Magenta};
 static List<int>[] Groups(int mask) {
  var notes=new List<int>();for(int k=0;k<7;k++)if((mask&(1<<k))!=0)notes.Add(k);
  var result=new[]{new List<int>(),new List<int>()};
  if(notes.Count==0)return result;
  if(notes.Count<=2 && notes[notes.Count-1]-notes[0]<=2) {
   result[(notes[0]+notes[notes.Count-1])<=6?0:1].AddRange(notes);return result;
  }
  int split=1;double best=double.MaxValue;
  for(int s=1;s<notes.Count;s++) {
   int a=notes[s-1]-notes[0],b=notes[notes.Count-1]-notes[s];
   double cost=10*Math.Max(a,b)+a+b+.4*Math.Abs(s-(notes.Count-s));
   if(cost<best){best=cost;split=s;}
  }
  result[0].AddRange(notes.GetRange(0,split));result[1].AddRange(notes.GetRange(split,notes.Count-split));return result;
 }
 static Bitmap Cell(Bitmap sheet,int index) {
  int w=sheet.Width/4,h=sheet.Height/2;
  return sheet.Clone(new Rectangle(index%4*w,index/4*h,w,h),PixelFormat.Format32bppArgb);
 }
 static void Arm(Graphics g,Bitmap sheet,int side,List<int> notes) {
  float center=side==0?.18f:.82f;int cell=0;
  if(notes.Count>0){center=(X[notes[(notes.Count-1)/2]]+X[notes[notes.Count/2]])*.5f;cell=1+notes[notes.Count/2];}
  using(var arm=Cell(sheet,cell)) {
   string cacheKey=sheet.GetHashCode()+":"+cell;
   float[] anchors;
   if(!Anchors.TryGetValue(cacheKey,out anchors)) {
   int top=arm.Height,bottom=0;
   for(int y=0;y<arm.Height;y++)for(int x=0;x<arm.Width;x++)if(arm.GetPixel(x,y).A>40){top=Math.Min(top,y);bottom=Math.Max(bottom,y);}
   double sx=0,fx=0;int sn=0,fn=0;
   for(int y=top;y<=bottom;y++)for(int x=0;x<arm.Width;x++)if(arm.GetPixel(x,y).A>80){
    if(y<top+25){sx+=x;sn++;}if(y>bottom-28){fx+=x;fn++;}
   }
   float shoulder=(float)(sx/Math.Max(1,sn)),finger=(float)(fx/Math.Max(1,fn));
   anchors=new[]{(float)top,(float)bottom,shoulder,finger};Anchors.Add(cacheKey,anchors);
   }
   float topY=anchors[0],bottomY=anchors[1],shoulderX=anchors[2],fingerX=anchors[3];
   float anchorX=(side==0?.265f:.735f)*512,anchorY=.51f*512;
   float targetX=center*512,targetY=(notes.Count==0?.608f:.682f)*512;
   float yScale=(targetY-anchorY)/(bottomY-topY);
   float xScale=.37f*(1+.18f*Math.Max(0,notes.Count-1));
   float shear=(targetX-anchorX-xScale*(fingerX-shoulderX))/(bottomY-topY);
   using(var m=new Matrix(xScale,0,shear,yScale,anchorX-xScale*shoulderX-shear*topY,anchorY-yScale*topY)) {
    g.Transform=m;g.DrawImageUnscaled(arm,0,0);g.ResetTransform();
   }
  }
 }
 static void Lights(Graphics g,int mask) {
  for(int k=0;k<7;k++) {
   float x=X[k]*512,y=.694f*512,w=.062f*512,h=.021f*512;
   bool on=(mask&(1<<k))!=0;
   Color c=Colors[k];if(!on)c=Color.FromArgb(255,c.R/5,c.G/5,c.B/5);
   using(var p=new GraphicsPath()) {
    p.AddPolygon(new[]{new PointF(x-w/2+2,y),new PointF(x+w/2-2,y),new PointF(x+w/2+2,y+h),new PointF(x-w/2-2,y+h)});
    using(var b=new SolidBrush(c))g.FillPath(b,p);
    using(var pen=new Pen(on?Color.FromArgb(240,255,255,255):Color.FromArgb(255,32,35,42),on?1.3f:1f))g.DrawPath(pen,p);
   }
  }
 }
 public static void Export(string basePath,string leftPath,string rightPath,string dest0,string dest1,string preview) {
  Anchors.Clear();
  using(var basis=new Bitmap(basePath))using(var left=new Bitmap(leftPath))using(var right=new Bitmap(rightPath))
  using(var atlas0=new Bitmap(2048,2048,PixelFormat.Format32bppArgb))using(var atlas1=new Bitmap(2048,2048,PixelFormat.Format32bppArgb))
  using(var sample=new Bitmap(1536,512,PixelFormat.Format32bppArgb)) {
   int[] samples={0,1,3,65,14,127};
   for(int mask=0;mask<128;mask++)using(var frame=new Bitmap(512,512,PixelFormat.Format32bppArgb)) {
    using(var g=Graphics.FromImage(frame)) {
     g.Clear(Color.Transparent);g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.SmoothingMode=SmoothingMode.AntiAlias;
     g.DrawImage(basis,new Rectangle(0,0,512,512));var groups=Groups(mask);
     Arm(g,left,0,groups[0]);Arm(g,right,1,groups[1]);Lights(g,mask);
    }
    using(var g=Graphics.FromImage(mask<64?atlas0:atlas1)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(frame,new Rectangle(mask%8*256,(mask%64)/8*256,256,256));}
    int index=Array.IndexOf(samples,mask);if(index>=0)using(var g=Graphics.FromImage(sample))g.DrawImage(frame,new Rectangle(index*256,128,256,256));
   }
   atlas0.Save(dest0,ImageFormat.Png);atlas1.Save(dest1,ImageFormat.Png);sample.Save(preview,ImageFormat.Png);
  }
 }
}
'@
$ref='Assets/Art/Reference/Personagens/'
$destinations=@('Assets/Sprites/Personagens/Comandos/Tecladista_Combinacoes_000_063.png','Assets/Sprites/Personagens/Comandos/Tecladista_Combinacoes_064_127.png')
$preview=Join-Path $PWD 'tmp/personagens/tecladista-combinacoes-preview.png'
[KeysPoseExport]::Export((Join-Path $PWD ($ref+'Tecladista_Base_Comandos.png')),(Join-Path $PWD ($ref+'Tecladista_Braco_Esquerda.png')),(Join-Path $PWD ($ref+'Tecladista_Braco_Direita.png')),(Join-Path $PWD $destinations[0]),(Join-Path $PWD $destinations[1]),$preview)
$template=[IO.File]::ReadAllText((Join-Path $PWD ($ref+'Roland_Palhetada_Base.png.meta')))
$entry=[regex]::Match($template,'(?s)    - serializedVersion: 2\r?\n      name:.*?(?=    - serializedVersion: 2)').Value
$refs="  keysCommandPoses:`n";$idle=''
$md5=[Security.Cryptography.MD5]::Create()
try {
 for($page=0;$page -lt 2;$page++) {
  $dest=$destinations[$page];$guid=[guid]::NewGuid().ToString('N')
  if(Test-Path ($dest+'.meta')){$guid=[regex]::Match((Get-Content ($dest+'.meta') -Raw),'guid: (\w+)').Groups[1].Value}
  $prefix=$template.Substring(0,$template.IndexOf('  spriteSheet:'))
  $prefix=[regex]::Replace($prefix,'(?m)^guid: .*','guid: '+$guid)
  $prefix=[regex]::Replace($prefix,'(?m)^    textureCompression: .*','    textureCompression: 0')
  $names='';$sprites='';$table=''
  for($i=0;$i -lt 64;$i++) {
   $mask=$page*64+$i;$name='Tecladista_Mascara_{0:D3}' -f $mask;$id=21300101+$i
   $names+="  - first:`n      213: $id`n    second: $name`n";$table+="      ${name}: $id`n"
   $part=[regex]::Replace($entry,'(?m)^      name: .*','      name: '+$name)
   foreach($pair in @(@('x',(($i%8)*256)),@('y',(1792-[Math]::Floor($i/8)*256)),@('width',256),@('height',256))){$part=[regex]::Replace($part,'(?m)^        '+$pair[0]+': .*','        '+$pair[0]+': '+$pair[1])}
   $spriteId=([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($guid+$name)))).Replace('-','').ToLowerInvariant()
   $part=[regex]::Replace($part,'(?m)^      spriteID: .*','      spriteID: '+$spriteId)
   $part=[regex]::Replace($part,'(?m)^      internalID: .*','      internalID: '+$id);$sprites+=$part
   $refs+='  - {fileID: '+$id+', guid: '+$guid+", type: 3}`n"
  }
  if($page -eq 0){$idle="  keysIdleFrames:`n  - {fileID: 21300101, guid: "+$guid+", type: 3}`n"}
  $prefix=[regex]::Replace($prefix,'(?s)  internalIDToNameTable:.*?(?=  externalObjects:)',"  internalIDToNameTable:`n"+$names)
  $suffix=$template.Substring($template.IndexOf('    spriteID: 5e97'))
  $suffix=[regex]::Replace($suffix,'(?s)    nameFileIdTable:.*?(?=  mipmapLimitGroupName:)',"    nameFileIdTable:`n"+$table)
  [IO.File]::WriteAllText((Join-Path $PWD ($dest+'.meta')),$prefix+"  spriteSheet:`n    serializedVersion: 2`n    sprites:`n"+$sprites+$suffix,$utf8)
 }
} finally {$md5.Dispose()}
$prefab=Join-Path $PWD 'Assets/Prefabs/Gameplay/HUD/TrackView.prefab'
$text=[IO.File]::ReadAllText($prefab)
$text=[regex]::Replace($text,'(?m)^  keysCommandPoses:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$refs)
$text=[regex]::Replace($text,'(?m)^  keysIdleFrames:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$idle)
[IO.File]::WriteAllText($prefab,$text,$utf8)
Write-Output 'Exported 128 keyboard poses, two 2048x2048 sheets, cuts and TrackView references.'
