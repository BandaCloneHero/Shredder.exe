using System;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using UnityEngine;

int checks = 0;
void Check(bool value, string message)
{
    checks++;
    if (!value) throw new Exception(message);
}
void Reject(Action action, string message)
{
    try { action(); } catch (ArgumentException) { checks++; return; }
    throw new Exception(message);
}
const int size = 32;
var atlas = new Texture2D(size * 8, size * 12, TextureFormat.RGBA32, false) { name = "Sentinel atlas" };
for (int row = 0; row < 12; row++)
for (int col = 0; col < 8; col++)
for (int y = 0; y < size; y++)
for (int x = 0; x < size; x++)
    atlas.Pixels[((11-row)*size+y)*atlas.width+col*size+x] = new Color32((byte)(row*8+col+1), (byte)x, (byte)y, 255);
Texture2D previous = null;
for (int row = 0; row < 12; row++)
for (int col = 0; col < 8; col++)
{
    var sprite = BossSpriteAtlas.Cell(atlas, row, col);
    var texture = sprite.texture;
    Check(!ReferenceEquals(texture, atlas) && !ReferenceEquals(texture, previous), "Frames must not share sampling textures");
    previous = texture;
    Check(sprite.rect.width == size && sprite.rect.height == size && sprite.pivot.x == .5f
        && sprite.pivot.y == .5f && sprite.pixelsPerUnit == 100, "All actions retain identical geometry and pivot");
    Check(!texture.mipmaps && !texture.isReadable && texture.wrapMode == TextureWrapMode.Clamp,
        "Uploaded isolated texture has no mipmaps, clamps edges, and releases its CPU copy");
    int pad = BossSpriteAtlas.Padding;
    for (int y = 0; y < texture.height; y++)
    for (int x = 0; x < texture.width; x++)
    {
        var pixel = texture.Pixels[y*texture.width+x];
        bool inside = x >= pad && y >= pad && x < pad+size && y < pad+size;
        Check(inside ? pixel.r == row*8+col+1 && pixel.g == x-pad && pixel.b == y-pad && pixel.a == 255 : pixel.a == 0,
            "Wrong neighbour sampled, wrong row order, cropped edge, or missing transparent padding");
    }
}
var alpha = new byte[size*size];
for (int y=8;y<25;y++) for (int x=8;x<24;x++) alpha[y*size+x]=255; // Main robot.
for (int y=12;y<17;y++) for (int x=0;x<3;x++) alpha[y*size+x]=255; // Detached neighbouring arm.
alpha[9*size+28]=255; // Interior detached attack particle: should remain.
alpha[13*size+3]=64; // Antialiased fringe of neighbouring arm.
var foreign = BossFrameIsolation.FindForeignEdgePixels(alpha,size);
Check(foreign[13*size+1] && foreign[13*size+3], "Detached edge fragment and its soft fringe must be removed");
Check(!foreign[16*size+16] && !foreign[9*size+28], "Body and interior effects must remain intact");
for (int x=0;x<12;x++) alpha[20*size+x]=255; // Own connected arm reaches the edge.
foreign = BossFrameIsolation.FindForeignEdgePixels(alpha,size);
Check(!foreign[20*size], "Do not trim the robot's connected arm when it reaches the cell edge");
// A wide detached projectile at the right boundary is intentional, not a stray arm.
var attackAlpha = new byte[size*size];
for (int y=8;y<25;y++) for (int x=4;x<17;x++) attackAlpha[y*size+x]=255;
for (int y=10;y<22;y++) for (int x=22;x<size;x++) attackAlpha[y*size+x]=255;
var attackMask = BossFrameIsolation.FindForeignEdgePixels(attackAlpha,size);
Check(!attackMask[16*size+30], "Large detached attack at the boundary must remain");
Reject(()=>BossSpriteAtlas.Cell(atlas,-1,0),"Negative row accepted");
Reject(()=>BossSpriteAtlas.Cell(atlas,12,0),"Row beyond sheet accepted");
Reject(()=>BossSpriteAtlas.Cell(atlas,0,8),"Column beyond sheet accepted");
Reject(()=>BossSpriteAtlas.Cell(null,0,0),"Null sheet accepted");
var invalid = new Texture2D(128,128,TextureFormat.RGBA32,false);
Reject(()=>BossSpriteAtlas.Cell(invalid,0,0),"Non-square cell layout accepted");
atlas.isReadable=false;
Reject(()=>BossSpriteAtlas.Cell(atlas,0,0),"Unreadable source accepted");
foreach (var value in new[] { new Vector3(2,.5f,1), new Vector3(-.9f,1.3f,1), new Vector3(0,0,1) })
{
    var scale = CharacterSpriteSizing.UniformScale(value);
    Check(scale.x == scale.y && scale.y == scale.z && scale.x > 0, "Boss can be stretched by a nonuniform scale");
}
var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
foreach (string file in new[] { "BossEmblemAnimator.cs", "GepetoVisualAnimator.cs", "BossSpriteAtlas.cs", "BossFrameIsolation.cs", "CharacterSpriteSizing.cs" })
{
    var source = File.ReadAllText(Path.Combine(root,"Assets/Script",file));
    var errors = CSharpSyntaxTree.ParseText(source,new CSharpParseOptions(LanguageVersion.CSharp9))
        .GetDiagnostics().Where(d=>d.Severity==DiagnosticSeverity.Error).ToArray();
    Check(errors.Length==0,"Invalid C#9 syntax in "+file);
}
if (args.Length > 0)
{
    int cleaned = 0;
    foreach (string name in new[] { "Gepeto", "Geminias", "Claudio" })
    {
        byte[] bytes = File.ReadAllBytes(Path.Combine(args[0],name+".rgba"));
        int width = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(0,4));
        int height = System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(4,4));
        var source = new Texture2D(width,height,TextureFormat.RGBA32,false) { name = name };
        for (int y=0;y<height;y++) for (int x=0;x<width;x++)
        {
            int offset = 8+(y*width+x)*4;
            source.Pixels[(height-1-y)*width+x] = new Color32(bytes[offset],bytes[offset+1],bytes[offset+2],bytes[offset+3]);
        }
        for (int row=0;row<12;row++) for (int col=0;col<8;col++)
        {
            var frame = BossSpriteAtlas.Cell(source,row,col);
            int opaqueBefore=0,opaqueAfter=0,cell=width/8,pad=BossSpriteAtlas.Padding;
            for (int y=0;y<cell;y++) for (int x=0;x<cell;x++)
            {
                if (source.Pixels[((11-row)*cell+y)*width+col*cell+x].a>=128) opaqueBefore++;
                if (frame.texture.Pixels[(y+pad)*frame.texture.width+x+pad].a>=128) opaqueAfter++;
            }
            // A partial neighbouring arm/effect can be removed, but never most of the actual robot.
            if (row<11) Check(opaqueAfter >= opaqueBefore*.8f, name+" lost robot pixels in row "+row+" col "+col);
            if (opaqueAfter<opaqueBefore) cleaned++;
            for (int y=0;y<frame.texture.height;y++) for (int x=0;x<frame.texture.width;x++)
                if (x<pad || y<pad || x>=pad+cell || y>=pad+cell)
                    Check(frame.texture.Pixels[y*frame.texture.width+x].a==0,"Real frame has unsafe padding");
        }
    }
    Console.WriteLine($"PASS: all 288 real frames isolated; detached edge fragments cleaned in {cleaned} frames.");
}
Console.WriteLine($"PASS: {checks} pixel/geometry assertions covering all 96 frame positions, edge-fragment removal and uniform scale.");
