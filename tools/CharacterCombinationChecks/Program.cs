using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../"));
var text=File.ReadAllText(Path.Combine(root,"Assets/Script/ReactionController.CommandPoses.cs"));
var tree=CSharpSyntaxTree.ParseText(text,new CSharpParseOptions(LanguageVersion.CSharp9));
if(tree.GetDiagnostics().Any(d=>d.Severity==DiagnosticSeverity.Error))throw new Exception("Invalid runtime syntax");
string Method(string name)=>tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>().Single(m=>m.Identifier.Text==name).ToFullString();
string source=@"
using System;
public enum SpriteMeshType { FullRect }
public struct Vector2 { public float x,y; public Vector2(float x,float y){this.x=x;this.y=y;} }
public struct Rect { public float x,y,width,height; public Rect(float x,float y,float w,float h){this.x=x;this.y=y;width=w;height=h;} }
public sealed class Texture2D { public int width,height; }
public static class Debug { public static void LogError(string s,object context){} }
public sealed class Sprite {
 public string name;public Rect rect;
 public static Sprite Create(Texture2D t,Rect r,Vector2 pivot,float ppu,uint extrude,SpriteMeshType type)=>new Sprite{rect=r};
}
public class Probe {
 private static readonly int[] DrumPadMasks={0,1,2,3,4,5,6,8,9,10,12};
 private Texture2D drumsCommandTexture;
 private Sprite[] runtimeDrumsCommandPoses,drumsCommandPoses,drumsIdleFrames,currentCommandPoses;
 private readonly double[] drumPoseUntil=new double[5];
 public Sprite[] Build(int w,int h) { runtimeDrumsCommandPoses=null;drumsCommandTexture=new Texture2D{width=w,height=h};CreateDrumCommandPoses();currentCommandPoses=runtimeDrumsCommandPoses;return runtimeDrumsCommandPoses; }
 public int Mask(int count,int mask,double now) {currentCommandPoses=new Sprite[count];for(int i=0;i<5;i++)drumPoseUntil[i]=(mask&(1<<i))!=0?1d:0d;return GetDrumCommandMask(now);}
 public int Overlap(int count) {currentCommandPoses=new Sprite[count];for(int i=0;i<5;i++)drumPoseUntil[i]=.5+i*.1;return GetDrumCommandMask(.1);}
"+Method("CreateDrumCommandPoses")+Method("GetDrumCommandMask")+"}";
var references=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator).Select(p=>MetadataReference.CreateFromFile(p));
var compilation=CSharpCompilation.Create("CharacterCombinationProbe",new[]{CSharpSyntaxTree.ParseText(source,new CSharpParseOptions(LanguageVersion.CSharp9))},references,new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
using var stream=new MemoryStream();var emitted=compilation.Emit(stream);
if(!emitted.Success)throw new Exception(string.Join("\n",emitted.Diagnostics.Where(d=>d.Severity==DiagnosticSeverity.Error)));
var assembly=Assembly.Load(stream.ToArray());var type=assembly.GetType("Probe");object probe=Activator.CreateInstance(type);
int checks=0;
void Check(bool pass,string message){checks++;if(!pass)throw new Exception(message);}
object Invoke(string name,params object[] args)=>type.GetMethod(name).Invoke(probe,args);
Array sprites=(Array)Invoke("Build",2048,1024);Check(sprites.Length==32,"Complete drum sheet must create 32 poses");
for(int i=0;i<32;i++){
 object sprite=sprites.GetValue(i),rect=sprite.GetType().GetField("rect").GetValue(sprite);
 float Value(string name)=>(float)rect.GetType().GetField(name).GetValue(rect);
 Check((string)sprite.GetType().GetField("name").GetValue(sprite)==$"Baterista_Mascara_{i:D2}","Wrong drum mask order");
 Check(Value("x")==i%8*256 && Value("y")== (3-i/8)*256 && Value("width")==256 && Value("height")==256,"Wrong drum cell geometry");
 int expected=i&16,picked=0;
 for(int bit=0;bit<4 && picked<2;bit++)if((i&(1<<bit))!=0){expected|=1<<bit;picked++;}
 Check((int)Invoke("Mask",32,i,.99d)==expected,"Visual mask exceeds two sticks or loses kick");
 Check((int)Invoke("Mask",32,i,1d)==0,"Expired hits remain active");
}
Check((int)Invoke("Overlap",32)==28,"Even a 32-frame legacy atlas must respect the two-stick visual limit");
Check(((Array)Invoke("Build",1536,1024)).Length==22,"Legacy drum sheets must remain compatible");
Check((int)Invoke("Overlap",22)==28,"Legacy two newest pads and kick changed");
Check(Invoke("Build",2048,2048)==null,"Invalid non-square cells must be rejected");
Console.WriteLine($"PASS: {checks} checks against production drum sprite factory and input-mask method, checking the two-stick limit against every possible input state.");
