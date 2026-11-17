using System.Reflection;
using YARG;
using YARG.Gameplay.Judgments;
int checks=0;
var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));
void Check(bool ok,string message){checks++;if(!ok)throw new Exception(message);}
BossHealthBar Start(int total){var boss=new BossHealthBar();typeof(BossHealthBar).GetMethod("Start",BindingFlags.NonPublic|BindingFlags.Instance)!.Invoke(boss,null);boss.SetExpectedNoteCount(total);return boss;}
for(int players=1;players<=4;players++){
 foreach(var scenario in new[]{(hit:70,quality:1f),(hit:85,quality:.7f)}){
  int count=1000*players;var boss=Start(count);int deaths=0;boss.Defeated+=()=>deaths++;
  for(int i=0;i<count;i++){
   if(i%100<scenario.hit)boss.RegisterNoteHit(new RhythmJudgmentResult(scenario.quality),i%100<25?.85f:1f);else boss.RegisterNoteMiss();
   if(i==count/4||i==count/2||i==3*count/4)boss.RecoverHealth(boss.MaxHealth*.005f);
  }
  Check(boss.IsDefeated,$"Winnable scenario for {players} players");Check(deaths==1,"One defeat event");
  Check(boss.RecoverHealth(10)==0,"Defeated boss cannot recover");
 }
 var idle=Start(1000*players);for(int i=0;i<1000*players;i++)idle.RegisterNoteMiss();Check(!idle.IsDefeated&&idle.CurrentHealth==idle.MaxHealth,"No passive win");
}
Check(File.ReadAllText(Path.Combine(root,"Assets/Scenes/Gameplay.unity")).Contains("  soloTargetHitRate: 0.5\n"), "The actual scene uses the accessible target, not an old serialized value");
var uninitialized=Start(0);uninitialized.RegisterNoteHit(new RhythmJudgmentResult(1));Check(!uninitialized.IsDefeated,"Waits for a valid note count");
foreach (var file in new[] { "BossHealthBar.cs", "BossAttackController.cs" }) {
 var syntax = Microsoft.CodeAnalysis.CSharp.CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root,"Assets/Script",file)), new Microsoft.CodeAnalysis.CSharp.CSharpParseOptions(Microsoft.CodeAnalysis.CSharp.LanguageVersion.CSharp9));
 Check(!syntax.GetDiagnostics().Any(d => d.Severity == Microsoft.CodeAnalysis.DiagnosticSeverity.Error), "C#9 syntax: " + file);
}
Console.WriteLine($"PASS: {checks} checks using the actual BossHealthBar implementation, with Unity stand-ins; no rendering or live gameplay.");
