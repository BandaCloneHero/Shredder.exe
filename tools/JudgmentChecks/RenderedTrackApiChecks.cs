using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

// Compile the actual compatibility API. Projection/scene dependencies are controlled doubles;
// actual rendering and the user's local BossHudLayoutSolver still require Unity.
internal static class RenderedTrackApiChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Visuals/HighwayCameraRendering.cs")));
        string members = string.Join("\n", tree.GetRoot().DescendantNodes().OfType<MemberDeclarationSyntax>()
            .Where(m => m is PropertyDeclarationSyntax p && p.Identifier.Text == "RenderedTrackCount" ||
                m is MethodDeclarationSyntax f && f.Identifier.Text == "GetRenderedTrackBoundsScreenSpace")
            .Select(m => m.ToFullString()));
        string source = "using System; using System.Collections.Generic;\n" + Shims + "\npublic class Probe {\n" + members + Fields + "\n}";
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator)
            .Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("RenderedTrackApiProbe", new[] { CSharpSyntaxTree.ParseText(source,
            new CSharpParseOptions(LanguageVersion.CSharp9)) }, refs,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var stream = new MemoryStream();
        var emitted = compilation.Emit(stream);
        if (!emitted.Success) throw new InvalidOperationException(string.Join("\n", emitted.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        dynamic probe = Assembly.Load(stream.ToArray()).CreateInstance("Probe");
        check(probe.RenderedTrackCount == 0 && probe.ReadBounds(0) == null, "Boss layout waits for registered tracks");
        probe.AddTrack();
        check(probe.RenderedTrackCount == 1 && probe.ReadBounds(0) == null, "Pending projection exposes no premature bounds");
        probe._needsCameraReset = false;
        check(probe.ReadBounds(-1) == null && probe.ReadBounds(1) == null && probe.ProjectionCalls == 0,
            "Invalid indices return null without invoking projection");
        dynamic bounds = probe.ReadBounds(0);
        check(bounds.x == 100 && bounds.y == 200 && bounds.width == 300 && bounds.height == 400 && probe.ProjectionCalls == 1,
            "Existing highway projection supplies bounds, with no raised-camera replacement");
        probe.AddVocalTrack();
        bounds = probe.ReadBounds(1);
        check(probe.RenderedTrackCount == 2 && Math.Abs((float)bounds.x - 192) < .001 &&
            Math.Abs((float)bounds.y - 756) < .001 && Math.Abs((float)bounds.width - 1536) < .001 &&
            Math.Abs((float)bounds.height - 216) < .001 && probe.ProjectionCalls == 1,
            "Vocals count as a rendered obstacle and use their finite orthographic UI rectangle");
        probe.isActiveAndEnabled = false;
        check(probe.ReadBounds(0) == null, "Disabled renderer exposes no stale bounds");
    }

    private const string Fields = """
        public bool isActiveAndEnabled = true, _needsCameraReset = true;
        public const int MAX_MATRICES = 32;
        public List<Camera> _cameras = new List<Camera>();
        public VocalTrack _vocalTrack;
        public int ProjectionCalls;
        public Rect? GetTrackBoundsScreenSpace(int index) { ProjectionCalls++; return new Rect(100, 200, 300, 400); }
        public void AddTrack() => _cameras.Add(new Camera());
        public void AddVocalTrack() { _vocalTrack = new VocalTrack(); _cameras.Add(_vocalTrack.GetTrackCamera()); }
        // Same contract consumed by BossResponsiveLayout: int count and nullable Rect bounds.
        public object ReadBounds(int index) { int count = RenderedTrackCount; Rect? bounds = GetRenderedTrackBoundsScreenSpace(index); return bounds; }
        """;
    private const string Shims = """
        public struct Rect {
            public float x, y, width, height;
            public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; }
        }
        public class Camera { }
        public class VocalTrack {
            private readonly Camera camera = new Camera();
            public Camera GetTrackCamera() => camera;
            public Rect GetVocalLayoutRect() => new Rect(.1f, .7f, .8f, .2f);
        }
        public static class Screen { public const int width = 1920, height = 1080; }
        """;
}
