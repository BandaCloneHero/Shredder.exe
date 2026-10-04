$ErrorActionPreference='Stop'
$utf8=[Text.UTF8Encoding]::new($false)
$dest='Assets/Sprites/Personagens/Comandos/Baterista_Combinacoes22.png'
$sources=@('Assets/Sprites/Personagens/Comandos/Baterista_Comandos_000_015.png','Assets/Sprites/Personagens/Comandos/Baterista_Comandos_016_031.png')
$padMasks=@(0,1,2,3,4,5,6,8,9,10,12)
Add-Type -AssemblyName System.Drawing
$atlas=[Drawing.Bitmap]::new(1536,1024,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[Drawing.Graphics]::FromImage($atlas)
try {
 $graphics.Clear([Drawing.Color]::Transparent)
 $graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
 for($pedal=0;$pedal -lt 2;$pedal++) {
  $source=[Drawing.Bitmap]::new((Join-Path $PWD $sources[$pedal]))
  try {
   for($pose=0;$pose -lt $padMasks.Count;$pose++) {
    $mask=$padMasks[$pose];$index=$pedal*11+$pose
    # Preserve the original 208x208 Unity cut, fitting it to a 256x256 cell.
    $src=[Drawing.Rectangle]::new(($mask%4)*256+24,[int][Math]::Floor($mask/4)*256+24,208,208)
    $target=[Drawing.Rectangle]::new(($index%6)*256,[int][Math]::Floor($index/6)*256,256,256)
    $graphics.DrawImage($source,$target,$src,[Drawing.GraphicsUnit]::Pixel)
   }
  } finally {$source.Dispose()}
 }
 # Replace only the resting arm in single-pad poses. Paired hits retain original art.
 $arms=[Drawing.Bitmap]::new((Join-Path $PWD 'Assets/Art/Reference/Personagens/Baterista_Maos_Individuais.png'))
 try {
  $graphics.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy
  foreach($index in @(1,2,4,7,12,13,15,18)) {
   $right=$index -in @(1,2,12,13)
   $x=12;$width=83
   if($right){$x=156;$width=90}
   # The kick variant uses the identical blue resting arm from its non-kick pose.
   $sourceIndex=$index
   if($index -eq 15){$sourceIndex=4}
   $src=[Drawing.Rectangle]::new(($sourceIndex%6)*256+$x,[int][Math]::Floor($sourceIndex/6)*256+15,$width,128)
   $target=[Drawing.Rectangle]::new(($index%6)*256+$x,[int][Math]::Floor($index/6)*256+15,$width,128)
   $graphics.DrawImage($arms,$target,$src,[Drawing.GraphicsUnit]::Pixel)
  }
 } finally {$arms.Dispose()}
 $atlas.Save((Join-Path $PWD $dest),[Drawing.Imaging.ImageFormat]::Png)
} finally {$graphics.Dispose();$atlas.Dispose()}

$template=[IO.File]::ReadAllText((Join-Path $PWD 'Assets/Art/Reference/Personagens/Roland_Palhetada_Base.png.meta'))
$guid=[guid]::NewGuid().ToString('N')
if(Test-Path ($dest+'.meta')){$guid=[regex]::Match((Get-Content ($dest+'.meta') -Raw),'guid: (\w+)').Groups[1].Value}
$prefix=$template.Substring(0,$template.IndexOf('  spriteSheet:'))
$prefix=[regex]::Replace($prefix,'(?m)^guid: .*','guid: '+$guid)
$prefix=[regex]::Replace($prefix,'(?m)^    textureCompression: .*','    textureCompression: 0')
$entry=[regex]::Match($template,'(?s)    - serializedVersion: 2\r?\n      name:.*?(?=    - serializedVersion: 2)').Value
$names='';$sprites='';$table='';$refs="  drumsCommandPoses:`n"
$md5=[Security.Cryptography.MD5]::Create()
try {
 for($i=0;$i -lt 22;$i++) {
  $mask=$padMasks[$i%11]+16*[int][Math]::Floor($i/11)
  $name='Baterista_Mascara_{0:D2}' -f $mask;$id=21300101+$i
  $names+="  - first:`n      213: $id`n    second: $name`n"
  $table+="      ${name}: $id`n"
  $part=[regex]::Replace($entry,'(?m)^      name: .*','      name: '+$name)
  $part=[regex]::Replace($part,'(?m)^        x: .*','        x: '+(($i%6)*256))
  $part=[regex]::Replace($part,'(?m)^        y: .*','        y: '+(1024-([Math]::Floor($i/6)+1)*256))
  $part=[regex]::Replace($part,'(?m)^        width: .*','        width: 256')
  $part=[regex]::Replace($part,'(?m)^        height: .*','        height: 256')
  $spriteId=([BitConverter]::ToString($md5.ComputeHash([Text.Encoding]::UTF8.GetBytes($guid+$name)))).Replace('-','').ToLowerInvariant()
  $part=[regex]::Replace($part,'(?m)^      spriteID: .*','      spriteID: '+$spriteId)
  $part=[regex]::Replace($part,'(?m)^      internalID: .*','      internalID: '+$id)
  $sprites+=$part
  $refs+='  - {fileID: '+$id+', guid: '+$guid+", type: 3}`n"
 }
} finally {$md5.Dispose()}
$prefix=[regex]::Replace($prefix,'(?s)  internalIDToNameTable:.*?(?=  externalObjects:)',"  internalIDToNameTable:`n"+$names)
$suffix=$template.Substring($template.IndexOf('    spriteID: 5e97'))
$suffix=[regex]::Replace($suffix,'(?s)    nameFileIdTable:.*?(?=  mipmapLimitGroupName:)',"    nameFileIdTable:`n"+$table)
[IO.File]::WriteAllText((Join-Path $PWD ($dest+'.meta')),$prefix+"  spriteSheet:`n    serializedVersion: 2`n    sprites:`n"+$sprites+$suffix,$utf8)
$prefab=Join-Path $PWD 'Assets/Prefabs/Gameplay/HUD/TrackView.prefab'
$text=[IO.File]::ReadAllText($prefab)
$textureRef='  drumsCommandTexture: {fileID: 2800000, guid: '+$guid+', type: 3}'
if($text.Contains('  drumsCommandTexture:')) {
 $text=[regex]::Replace($text,'(?m)^  drumsCommandTexture: [^\r\n]+',$textureRef)
} else {
 $text=$text.Replace('  drumsCommandPoses:', $textureRef+"`n  drumsCommandPoses:")
}
$text=[regex]::Replace($text,'(?m)^  drumsCommandPoses:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$refs)
$idle="  drumsIdleFrames:`n  - {fileID: 21300101, guid: "+$guid+", type: 3}`n"
$text=[regex]::Replace($text,'(?m)^  drumsIdleFrames:\r?\n(?:  - \{[^\r\n]+\r?\n)+',$idle)
[IO.File]::WriteAllText($prefab,$text,$utf8)
Write-Output 'Exported 22 drum poses, 1536x1024 atlas, sprite cuts and TrackView references.'
