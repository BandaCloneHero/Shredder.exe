$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($false)
$source='Assets/Sprites/Personagens/Comandos/Baixista_Palhetada.png'
if(-not(Test-Path $source)){$source='Assets/Art/Reference/Personagens/Baixista_Palhetada_Base.png'}
$dest='Assets/Sprites/Personagens/Comandos/Baixista_Combinacoes64.png'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class BassAtlasExport {
 static readonly double[,] Centers={
  {.60428,.37881},{.65051,.40755},{.71702,.44758},{.76663,.47745},{.80947,.50507},
  {.60428,.37881},{.65051,.40755},{.71702,.44758},{.76663,.47745},{.80947,.50507}
 };
 static readonly Color[] Colors={Color.FromArgb(51,255,38),Color.FromArgb(255,31,26),Color.FromArgb(255,230,13),Color.FromArgb(31,115,255),Color.FromArgb(255,115,10)};
 static PointF[] ButtonShape(int bit,int hand,bool halo) {
  double angle=-32*Math.PI/180,co=Math.Cos(angle),si=Math.Sin(angle);
  double w=(halo?.047:.031)*256,h=(halo?.048:.032)*256;
  float cx=(float)(Centers[hand*5+bit,0]*256),cy=(float)((1-Centers[hand*5+bit,1])*256);
  var points=new PointF[4];
  double[] xs={-.5,-.5,.5,.5},ys={-.5,.5,.5,-.5};
  for(int k=0;k<4;k++)points[k]=new PointF(cx+(float)(xs[k]*w*co-ys[k]*h*si),cy+(float)(xs[k]*w*si+ys[k]*h*co));
  return points;
 }
 static void Button(Graphics g,int bit,int hand,bool halo) {
  using(var brush=new SolidBrush(Color.FromArgb(halo?41:255,Colors[bit])))g.FillPolygon(brush,ButtonShape(bit,hand,halo));
 }
 public static int MedianSlot(int mask) {
  int[] active=new int[5];int count=0;
  for(int bit=0;bit<5;bit++)if((mask&(1<<bit))!=0)active[count++]=bit;
  return count==0?-1:active[(count-1)/2]+active[count/2];
 }
 public static void Export(string source,string destination,string[] positions) {
  using(var src=new Bitmap(source))using(var atlas=new Bitmap(2048,2048,PixelFormat.Format32bppArgb)) {
   for(int hand=0;hand<2;hand++)using(var basis=new Bitmap(256,256,PixelFormat.Format32bppArgb)) {
    using(var g=Graphics.FromImage(basis)) {
     g.Clear(Color.Transparent);g.InterpolationMode=InterpolationMode.HighQualityBicubic;
     g.DrawImage(src,new Rectangle(0,0,256,256),new Rectangle(hand*src.Width/2,0,src.Width/2,src.Height),GraphicsUnit.Pixel);
    }
    for(int mask=0;mask<32;mask++)using(var frame=new Bitmap(256,256,PixelFormat.Format32bppArgb)) {
     using(var g=Graphics.FromImage(frame)) {
      g.DrawImageUnscaled(basis,0,0);
      int median=MedianSlot(mask);
      if(median>=0)using(var edited=new Bitmap(positions[median])) {
       // Composite only the generated fretting hand/forearm. The approved
       // face, hair, picking hand, body and framing stay pixel-identical.
       using(var armRegion=new GraphicsPath()) {
        armRegion.AddPolygon(new[]{new PointF(146f,166f),new PointF(219f,119f),
          new PointF(226f,151f),new PointF(226f,193f),new PointF(188f,211f),
          new PointF(146f,207f)});
        g.SetClip(armRegion);
       }
       g.CompositingMode=CompositingMode.SourceCopy;
       g.InterpolationMode=InterpolationMode.HighQualityBicubic;
       g.DrawImage(edited,new Rectangle(0,0,256,256),new Rectangle(hand*edited.Width/2,0,edited.Width/2,edited.Height),GraphicsUnit.Pixel);
       g.ResetClip();
       // Keep every button face visible, including beneath a fingertip.
       for(int bit=0;bit<5;bit++)using(var shape=new GraphicsPath()) {
        shape.AddPolygon(ButtonShape(bit,hand,true));g.SetClip(shape);
        g.DrawImageUnscaled(basis,0,0);g.ResetClip();
       }
       g.CompositingMode=CompositingMode.SourceOver;
      }
      g.SmoothingMode=SmoothingMode.AntiAlias;
      for(int bit=0;bit<5;bit++)if((mask&(1<<bit))!=0){Button(g,bit,hand,true);Button(g,bit,hand,false);}
     }
     int index=hand*32+mask;
     using(var g=Graphics.FromImage(atlas))g.DrawImageUnscaled(frame,index%8*256,index/8*256);
    }
   }
   atlas.Save(destination,ImageFormat.Png);
  }
 }
}
'@
$positions=[string[]]@(0..8 | ForEach-Object {Join-Path $PWD ('Assets/Art/Reference/Personagens/BaixistaMediana/Baixista_Mediana_'+$_.ToString()+'.png')})
foreach($path in $positions){if(-not(Test-Path -LiteralPath $path)){throw ('Missing fretting pose: '+$path)}}
[BassAtlasExport]::Export((Join-Path $PWD $source),(Join-Path $PWD $dest),$positions)
$template=[IO.File]::ReadAllText((Join-Path $PWD ($source+'.meta')))
$guid=[guid]::NewGuid().ToString('N')
if(Test-Path ($dest+'.meta')){$guid=[regex]::Match((Get-Content ($dest+'.meta') -Raw),'guid: (\w+)').Groups[1].Value}
$prefix=$template.Substring(0,$template.IndexOf('  spriteSheet:'))
$prefix=[regex]::Replace($prefix,'(?m)^guid: .*','guid: '+$guid)
$prefix=[regex]::Replace($prefix,'(?m)^    textureCompression: .*','    textureCompression: 0')
$entry=[regex]::Match($template,'(?s)    - serializedVersion: 2\r?\n      name:.*?(?=    - serializedVersion: 2)').Value
$names='';$sprites='';$table='';$refs="  bassCommandPoses:`n"
$md5=[Security.Cryptography.MD5]::Create()
for($i=0;$i -lt 64;$i++) {
 $mask=$i%32;$hand=[int][Math]::Floor($i/32)
 $name='Baixista_{0}_{1:D2}' -f @('Cima','Baixo')[$hand],$mask
 $id=21300101+$i
 $names+="  - first:`n      213: $id`n    second: $name`n"
 $table+="      ${name}: $id`n"
 $part=[regex]::Replace($entry,'(?m)^      name: .*','      name: '+$name)
 $part=[regex]::Replace($part,'(?m)^        x: .*','        x: '+(($i%8)*256))
 $part=[regex]::Replace($part,'(?m)^        y: .*','        y: '+(2048-([Math]::Floor($i/8)+1)*256))
 $part=[regex]::Replace($part,'(?m)^        width: .*','        width: 256')
 $part=[regex]::Replace($part,'(?m)^        height: .*','        height: 256')
 $spriteId=([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($guid+$name)))).Replace('-','').ToLowerInvariant()
 $part=[regex]::Replace($part,'(?m)^      spriteID: .*','      spriteID: '+$spriteId)
 $part=[regex]::Replace($part,'(?m)^      internalID: .*','      internalID: '+$id)
 $sprites+=$part
 $refs+='  - {fileID: '+$id+', guid: '+$guid+", type: 3}`n"
}
$md5.Dispose()
$prefix=[regex]::Replace($prefix,'(?s)  internalIDToNameTable:.*?(?=  externalObjects:)',"  internalIDToNameTable:`n"+$names)
$suffix=$template.Substring($template.IndexOf('    spriteID: 5e97'))
$suffix=[regex]::Replace($suffix,'(?s)    nameFileIdTable:.*?(?=  mipmapLimitGroupName:)',"    nameFileIdTable:`n"+$table)
[IO.File]::WriteAllText((Join-Path $PWD ($dest+'.meta')),$prefix+"  spriteSheet:`n    serializedVersion: 2`n    sprites:`n"+$sprites+$suffix,$utf8)
$prefab='Assets/Prefabs/Gameplay/HUD/TrackView.prefab'
$text=[IO.File]::ReadAllText((Join-Path $PWD $prefab))
$text=[regex]::Replace($text,'(?m)^  bassCommandPoses:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$refs)
$textureRef='  bassCommandTexture: {fileID: 2800000, guid: '+$guid+', type: 3}'
if($text.Contains('  bassCommandTexture:')) {
 $text=[regex]::Replace($text,'(?m)^  bassCommandTexture: [^\r\n]+',$textureRef)
} else {
 $text=$text.Replace('  bassCommandPoses:', $textureRef+"`n  bassCommandPoses:")
}
$idle="  bassIdleFrames:`n  - {fileID: 21300101, guid: "+$guid+", type: 3}`n"
$text=[regex]::Replace($text,'(?m)^  bassIdleFrames:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$idle)
[IO.File]::WriteAllText((Join-Path $PWD $prefab),$text,$utf8)
Write-Output 'Exported 64 baked combinations, 2048x2048 atlas, 64 sprite cuts and prefab references.'
