using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using YARG.Core.Game;
using YARG.Gameplay.Judgments;

int checks = 0;
void Check(bool value, string message)
{
    checks++;
    if (!value) throw new InvalidOperationException(message);
}
var settings = new RhythmJudgmentSettings();
foreach (double sign in new[] { -1d, 1d })
{
    foreach (double ms in new[] { 0d, 8, 10, 15, 25 })
        Check(settings.Classify(sign * ms) == RhythmJudgment.Perfect, $"Perfect {sign * ms}");
    foreach (double ms in new[] { 25.001, 26, 42, 50, 60 })
        Check(settings.Classify(sign * ms) == RhythmJudgment.Great, $"Great {sign * ms}");
    foreach (double ms in new[] { 60.001, 61, 87, 100 })
        Check(settings.Classify(sign * ms) == RhythmJudgment.Good, $"Good {sign * ms}");
    Check(settings.Classify(sign * 100.001) == RhythmJudgment.Miss, "Outside window");
}
var original = new EnginePreset.HitWindowPreset { IsDynamic = true, MinWindow = .04, MaxWindow = .14 };
var configured = settings.Configure(original);
var window = configured.Create();
Check(!configured.IsDynamic && configured.MinWindow == .2 && configured.MaxWindow == .2, "Full window conversion");
Check(original.IsDynamic && original.MinWindow == .04, "Must not mutate shared preset");
Check(Math.Abs(window.GetFrontEnd(.2) + .1) < 1e-9 && Math.Abs(window.GetBackEnd(.2) - .1) < 1e-9, "Symmetric window");
settings.UseMillisecondWindow = false;
var legacy = settings.Configure(original);
Check(legacy.IsDynamic && legacy.MinWindow == .04 && legacy.MaxWindow == .14, "Legacy opt-out");
settings.PerfectMs = 80;
settings.GreatMs = 20;
settings.GoodMs = -1;
settings.Validate();
Check(settings.GreatMs == 80 && settings.GoodMs == 80, "Ordered Inspector thresholds");

string root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
string[] sources = Directory.GetFiles(Path.Combine(root, "Assets/Script/Gameplay/Judgments"), "*.cs")
    .Concat(new[] { "HUD/TrackView.cs", "Player/TrackPlayer.cs", "Player/FiveFretGuitarPlayer.cs",
        "Player/FiveLaneKeysPlayer.cs", "Player/ProKeysPlayer.cs", "Player/DrumsPlayer.cs" }
        .Select(f => Path.Combine(root, "Assets/Script/Gameplay", f))).ToArray();
foreach (string file in sources)
{
    var errors = CSharpSyntaxTree.ParseText(File.ReadAllText(file), new CSharpParseOptions(LanguageVersion.CSharp9))
        .GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
    Check(errors.Length == 0, $"Syntax: {file}: {string.Join<Diagnostic>(", ", errors)}");
}
Console.WriteLine($"PASS: {checks} checks of real classification/settings and C# 9 syntax. Unity rendering was not tested.");
