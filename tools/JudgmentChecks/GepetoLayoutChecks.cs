using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

internal static class GepetoLayoutChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        foreach (var screen in new[] { (1920f, 1080f), (1280f, 720f), (2560f, 1080f), (1024f, 768f) })
        {
            var leftPanel = new GepetoHudLayout.Area(0, screen.Item2 * .72f, screen.Item1 * .30f, screen.Item2 * .28f);
            var solo = GepetoHudLayout.Calculate(screen.Item1, screen.Item2, 1, new[] { leftPanel });
            var duo = GepetoHudLayout.Calculate(screen.Item1, screen.Item2, 2, new[] { leftPanel });
            check(solo.Size > 0 && duo.Size >= solo.Size, "Two-player robot retains legible size instead of dividing by player count");
            foreach (int count in new[] { 1, 2, 3, 4 })
            {
                var percentage = new GepetoHudLayout.Area(screen.Item1 * .12f, screen.Item2 * .38f, screen.Item1 * .16f, screen.Item2 * .12f);
                var placed = GepetoHudLayout.Calculate(screen.Item1, screen.Item2, count, new[] {leftPanel, percentage});
                check(placed.Size > 0 && !placed.Reserved.Overlaps(leftPanel) && !placed.Reserved.Overlaps(percentage),
                    "Portrait and health-bar reservation avoid percentage/HUD regions");
                check(placed.Reserved.X >= 0 && placed.Reserved.Y >= 0 && placed.Reserved.X + placed.Reserved.Width <= screen.Item1
                    && placed.Reserved.Y + placed.Reserved.Height <= screen.Item2, "Robot remains within the canvas");
            }
        }
        check(GepetoHudLayout.Calculate(0, 1080, 2, null).Size == 0, "Layout waits for valid canvas dimensions");
        var source = File.ReadAllText(Path.Combine(root, "Assets/Editor/JudgmentArtworkSync.cs"));
        check(source.Contains("IPreprocessBuildWithReport") && source.Contains("ImportAssetOptions.ForceUpdate") && source.Contains("Images/Julgamentos"),
            "Build synchronizes the approved images into the actual Resources assets");
        var errors = CSharpSyntaxTree.ParseText(source, new CSharpParseOptions(LanguageVersion.CSharp9))
            .GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
        check(errors.Length == 0, "Judgment artwork build synchronization has valid C#9 syntax");
        var scene = File.ReadAllText(Path.Combine(root, "Assets/Scenes/Gameplay.unity"));
        check(scene.Contains("  responsiveLayout: 1"), "Gameplay explicitly enables the responsive robot layout");
    }
}
