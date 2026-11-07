using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using YARG.Core.Game;
using YARG.Core.Replays;
using YARG.Core.Song;
using YARG.Gameplay.Judgments;

// Exercise the score screen's real analysis/diagnostic methods against real weighted engines.
// Only the scene globals, disk loader and dialog/navigation UI are controlled substitutes.
internal static class ScoreScreenReplayChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root, "Assets/Script/Menu/ScoreScreen/ScoreScreenMenu.cs")),
            new CSharpParseOptions(LanguageVersion.CSharp9, preprocessorSymbols: new[] { "UNITY_EDITOR" }));
        var onEnable = tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>().Single(m => m.Identifier.Text == "OnEnable");
        var calls = onEnable.DescendantNodes().OfType<InvocationExpressionSyntax>().Select(c => c.Expression.ToString()).ToList();
        check(calls.LastIndexOf("ValidateReplayResults") > calls.LastIndexOf("UpdateNavigationScheme") &&
            calls.LastIndexOf("UpdateNavigationScheme") > calls.LastIndexOf("SetNavigationScheme"),
            "Replay diagnostic runs after the final results navigation scheme is installed");
        string methods = string.Join("\n", tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Where(m => m.Identifier.Text is "AnalyzeReplay" or "ValidateReplayResults")
            .Select(m => m.ToFullString().Replace("private ", "public ")));
        string source = "using System; using System.Linq; using YARG.Core.Chart; using YARG.Core.Game; using YARG.Core.Logging; " +
            "using YARG.Core.Replays; using YARG.Gameplay.Judgments; using ReplayIO = ReplayLoader;\n" + Shims + "\npublic class Probe {\n" + Fields + methods + "\n}";
        var references = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator)
            .Append(typeof(RhythmJudgmentSettings).Assembly.Location).Append(typeof(ReplayInfo).Assembly.Location)
            .Distinct().Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("ScoreScreenReplayProbe", new[] { CSharpSyntaxTree.ParseText(source,
            new CSharpParseOptions(LanguageVersion.CSharp9, preprocessorSymbols: new[] { "UNITY_EDITOR" })) }, references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var output = new MemoryStream();
        var emitted = compilation.Emit(output);
        if (!emitted.Success) throw new InvalidOperationException(string.Join("\n", emitted.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        dynamic probe = Assembly.Load(output.ToArray()).CreateInstance("Probe");
        string directory = Path.Combine(Path.GetTempPath(), "score-screen-replay-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            foreach (bool weighted in new[] { true, false })
            {
                var scenario = EarlyHitChecks.Create("AllTaps", -.05, new RhythmJudgmentSettings(), weighted);
                WeightedJudgmentChecks.Simulate(scenario.Engine, scenario.Inputs, 60);
                var frame = new ReplayFrame(scenario.Profile, scenario.Engine.BaseParameters, scenario.Engine.BaseStats, scenario.Inputs.ToArray());
                var data = new ReplayData(new(), new(), new[] { frame }, Array.Empty<double>());
                var info = new ReplayInfo(Path.Combine(directory, weighted + ".replay"), "solo", 12, 1,
                    HashWrapper.Hash(data.Serialize()), "test", "test", "test", default, DateTime.UtcNow, 1, 4,
                    scenario.Engine.BaseStats.TotalScore, StarAmount.None, Array.Empty<PauseInfo>(), Array.Empty<ReplayStats>());
                if (weighted) new JudgmentReplayMetadata { Players = new[] { scenario.Profile.Id }, Policies = new[] { scenario.Session.Policy.Copy() } }.Save(info);
                probe.Prepare(scenario.Song, data, scenario.Profile);
                probe.Validate(info);
                check(probe.Dialogs() == 0 && !probe.Analyzing && probe.Top() == "Results",
                    "Solo GREAT weighted/legacy run validates through the score screen without a false warning");

                // A real mismatch remains visible and dismissible rather than being silently disabled.
                frame.Stats.CommittedScore += 17;
                probe.Validate(info);
                check(probe.Dialogs() == 1 && !probe.Analyzing && probe.Top() == "Dialog", "Real replay mismatch opens a diagnostic above results");
                probe.CloseDialog();
                check(probe.Top() == "Results", "Closing the warning restores results navigation");
                frame.Stats.CommittedScore -= 17;

                probe.SetLoadError(true);
                probe.Validate(info);
                check(!probe.Analyzing && probe.Top() == "Dialog", "Replay-load exception clears the Continue lock before showing the error");
                probe.CloseDialog();
                check(probe.Top() == "Results", "Closing an analysis error returns to Continue/Restart");
                probe.SetLoadError(false);
                probe.Validate(null);
                check(!probe.Analyzing && probe.Top() == "Results", "Missing replay does not leave Continue locked");
            }
        }
        finally { Directory.Delete(directory, true); }
    }

    private const string Fields = """
        private bool _analyzingReplay;
        private SongEntry song;
        public bool Analyzing => _analyzingReplay;
        public void Prepare(SongChart chart, ReplayData data, YargProfile profile) {
            song = new SongEntry { Chart = chart };
            ReplayLoader.Data = data; ReplayLoader.ThrowOnLoad = false;
            GlobalVariables.State.ScoreScreenStats = new ScreenStats { PlayerScores = new[] { new Card { Player = new Player { Profile = profile } } } };
            DialogManager.Instance = new DialogManager();
            Navigation.Stack.Clear(); Navigation.Stack.Push("Results");
        }
        public void Validate(ReplayInfo info) => ValidateReplayResults(song, info);
        public int Dialogs() => DialogManager.Instance.Messages;
        public string Top() => Navigation.Stack.Peek();
        public void CloseDialog() => DialogManager.Instance.Close();
        public void SetLoadError(bool value) => ReplayLoader.ThrowOnLoad = value;
        """;
    private const string Shims = """
        public class SongEntry { public SongChart Chart; public string Hash => "fixture"; public SongChart LoadChart() => Chart; }
        public static class GlobalVariables { public static State State = new State(); public static bool VerboseReplays = false; }
        public class State { public ScreenStats? ScoreScreenStats; }
        public struct ScreenStats { public Card[] PlayerScores; }
        public class Card { public Player Player; }
        public class Player { public YargProfile Profile; }
        public static class ReplayLoader {
            public static ReplayData Data; public static bool ThrowOnLoad;
            public static (ReplayReadResult, ReplayData) TryLoadData(ReplayInfo info, ReplayReadOptions options) {
                if (ThrowOnLoad) throw new System.IO.IOException("Forced load error");
                return (ReplayReadResult.Valid, Data);
            }
        }
        public static class Navigation { public static System.Collections.Generic.Stack<string> Stack = new System.Collections.Generic.Stack<string>(); }
        public class DialogManager {
            public static DialogManager Instance = new DialogManager(); public int Messages;
            public void ShowMessage(string title, string body) { Messages++; Navigation.Stack.Push("Dialog"); }
            public void Close() { if (Navigation.Stack.Pop() != "Dialog") throw new Exception("Wrong navigation owner popped"); }
        }
        """;
}
