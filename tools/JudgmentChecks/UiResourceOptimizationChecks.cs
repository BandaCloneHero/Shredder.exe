using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

internal static class UiResourceOptimizationChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        var impact = File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Judgments/JudgmentImpactGraphic.cs"));
        var preview = File.ReadAllText(Path.Combine(root, "Assets/Script/Helpers/CameraPreviewTexture.cs"))
            .Replace("private void Awake()", "public void Awake()").Replace("private void OnDestroy()", "public void OnDestroy()");
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Visuals/TrackMaterial.cs")));
        string cleanup = string.Join("\n", tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Where(m => new[] { "SetTextures", "SetDefaultTextures", "ReleaseCustomTextures", "OnDestroy" }.Contains(m.Identifier.Text))
            .Select(m => m.ToFullString().Replace("private ", "public ")));
        string source = "using System; using System.Linq; using System.Collections.Generic; using System.IO; using UnityEngine; using UnityEngine.Rendering;\n" + Shims +
            "\npublic class TrackProbe {\n" + TrackFields + cleanup + "\n}\n" + Probe;
        var references = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator).Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("UiResourceProbe", new[] { CSharpSyntaxTree.ParseText(source),
            CSharpSyntaxTree.ParseText(impact), CSharpSyntaxTree.ParseText(preview) }, references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var output = new MemoryStream();
        var emitted = compilation.Emit(output);
        if (!emitted.Success) throw new InvalidOperationException(string.Join("\n", emitted.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        dynamic probe = Assembly.Load(output.ToArray()).CreateInstance("Probe");
        foreach (var dimensions in new[] { (250f, 65f), (100f, 100f), (1920f, 1080f) })
        {
            float[] positions = probe.Mesh(dimensions.Item1, dimensions.Item2);
            var expected = new List<float>();
            void Point(float angle, float radius) {
                expected.Add(MathF.Cos(angle) * (dimensions.Item1 / 2) * radius);
                expected.Add(MathF.Sin(angle) * (dimensions.Item2 / 2) * radius);
            }
            for (int i = 0; i < 32; i++) {
                float a = i * MathF.PI * 2 / 32, b = (i + 1) * MathF.PI * 2 / 32;
                Point(a, .91f); Point(a, 1); Point(b, 1); Point(b, .91f);
            }
            for (int i = 0; i < 4; i++) {
                float a = i * MathF.PI / 2;
                Point(a - .025f, 1.06f); Point(a, 1.3f); Point(a + .025f, 1.06f); Point(a, .98f);
            }
            check(positions.Length == 288 && positions.Zip(expected).All(p => Math.Abs(p.First - p.Second) < .0002f),
                "Cached impact vertices preserve the original ring/rays at each tested size");
            check(probe.Triangles() == 72 && probe.ColorsCorrect(), "Impact topology and fade color remain intact");
        }
        int trigonometry = probe.TrigCalls();
        for (int i = 0; i < 100; i++) probe.Mesh(250, 65);
        check(probe.TrigCalls() == trigonometry, "Repeated impact redraws perform no new sine/cosine calculations");

        string directory = Path.Combine(Path.GetTempPath(), "track-texture-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try {
            string basePath = Path.Combine(directory, "base.png"), sidePath = Path.Combine(directory, "side.png");
            File.WriteAllBytes(basePath, new byte[] { 1 }); File.WriteAllBytes(sidePath, new byte[] { 1 });
            probe.StartTrack(basePath, sidePath);
            for (int i = 0; i < 20; i++) {
                probe.ReloadTrack();
                check(probe.Live() == 5, "Changing a highway theme retains only three cloned materials and two custom textures");
            }
            File.WriteAllBytes(basePath, new byte[] { 0 });
            probe.ReloadTrack();
            check(probe.Live() == 3 && probe.DefaultsRestored(), "Failed texture decoding releases temporary textures and restores shared defaults");
            probe.CloseTrack(); probe.CloseTrack();
            check(probe.Live() == 0, "Closing the highway destroys private materials and custom textures exactly once");
        } finally { Directory.Delete(directory, true); }
        probe.StartPreviews();
        check(probe.Live() == 1 && probe.PreviewsShareTexture(), "Preview cameras share one render texture");
        int created = probe.Created();
        for (int i = 0; i < 100; i++) probe.RefreshPreviews();
        check(probe.Created() == created && probe.Live() == 1, "Unchanged preview dimensions allocate no replacement texture");
        probe.ResizePreviews();
        check(probe.Live() == 1 && probe.PreviewsShareTexture(), "Resizing replaces the old preview texture without losing camera references");
        probe.CloseFirstPreview();
        check(probe.Live() == 1, "Remaining preview keeps its shared texture alive");
        probe.CloseLastPreview();
        check(probe.Live() == 0, "Last preview frees the shared runtime render texture");
    }

    private const string TrackFields = """
        public class Preset { public FileInfo BaseTexture, SidePattern; }
        public Preset _normalPreset = new();
        public Material _material = new Material();
        public List<Material> _trimMaterials = new() { new Material(), new Material() };
        public Texture2D _baseTexture, _sidePattern;
        public Texture2D _originalBaseTexture = new Texture2D(true), _originalSidePattern = new Texture2D(true);
        public float _originalBaseParallax, _originalSideParallax;
        public const int _baseTextureProperty = 1, _sidePatternProperty = 2, _baseParallaxProperty = 3, _sideParallaxProperty = 4;
        """;
    private const string Probe = """
public class Probe {
    private YARG.Gameplay.Judgments.JudgmentImpactGraphic graphic = new();
    private UnityEngine.UI.VertexHelper vh = new();
    private TrackProbe track;
    private YARG.Helpers.CameraPreviewTexture first, last;
    public float[] Mesh(float width, float height) {
        graphic.rectTransform.rect = new UnityEngine.Rect { size = new Vector2(width, height) };
        graphic.color = new Color(.2f, .3f, .4f, .5f); graphic.Rebuild(vh);
        return vh.Positions.ToArray();
    }
    public int Triangles() => vh.Triangles;
    public bool ColorsCorrect() => vh.Colors.All(c => c.r == .2f && c.a == .5f);
    public int TrigCalls() => Mathf.Calls;
    public void StartTrack(string a, string b) { track = new TrackProbe(); track._normalPreset.BaseTexture = new FileInfo(a); track._normalPreset.SidePattern = new FileInfo(b); }
    public void ReloadTrack() => track.SetTextures();
    public bool DefaultsRestored() => track._material.Textures[1] == track._originalBaseTexture && track._material.Textures[2] == track._originalSidePattern;
    public void CloseTrack() => track.OnDestroy();
    public int Live() => Resource.Live;
    public int Created() => Resource.Created;
    public void StartPreviews() { first = new(); last = new(); first.Awake(); last.Awake(); RefreshPreviews(); }
    public void RefreshPreviews() => YARG.Helpers.CameraPreviewTexture.SetAllPreviews();
    public void ResizePreviews() { Screen.width = 1280; RefreshPreviews(); }
    public bool PreviewsShareTexture() => first.Camera.targetTexture == YARG.Helpers.CameraPreviewTexture.PreviewTexture && last.Camera.targetTexture == first.Camera.targetTexture;
    public void CloseFirstPreview() => first.OnDestroy();
    public void CloseLastPreview() => last.OnDestroy();
}
""";
    private const string Shims = """
namespace UnityEngine {
    public class Resource { public static int Live, Created; public bool Shared, Destroyed;
        public Resource(bool shared = false) { Shared = shared; if (!shared) { Live++; Created++; } } }
    public class Texture : Resource { public Texture(bool shared = false) : base(shared) { } }
    public class Texture2D : Texture {
        public Texture2D(bool shared) : base(shared) { } public Texture2D(int w, int h) { }
        public bool LoadImage(byte[] bytes) => bytes[0] == 1;
    }
    public class Material : Resource {
        public Dictionary<int, Texture> Textures = new();
        public void SetTexture(int id, Texture t) => Textures[id] = t;
        public void SetFloat(int id, float value) { }
    }
    public class MonoBehaviour {
        public Camera Camera = new();
        public T GetComponent<T>() where T : class => Camera as T;
    }
    public class Camera { public RenderTexture targetTexture; }
    public class RenderTexture : Texture {
        public int width, height;
        public RenderTexture(RenderTextureDescriptor d) { width = d.width; height = d.height; }
        public void Release() { if (Destroyed) throw new Exception("Releasing destroyed texture"); }
    }
    public struct RenderTextureDescriptor {
        public int width, height, mipCount;
        public RenderTextureDescriptor(int w, int h, RenderTextureFormat f, int depth) { width = w; height = h; mipCount = 0; }
    }
    public enum RenderTextureFormat { ARGBHalf }
    public static class Screen { public static int width = 1920, height = 1080; }
    public struct Vector2 {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => default;
        public static Vector2 operator *(Vector2 v, float scale) => new(v.x * scale, v.y * scale);
    }
    public struct Color { public float r, g, b, a; public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; } }
    public struct Rect { public Vector2 size; }
    public class RectTransform { public Rect rect; }
    public static class Mathf {
        public const float PI = MathF.PI; public static int Calls;
        public static float Sin(float a) { Calls++; return MathF.Sin(a); }
        public static float Cos(float a) { Calls++; return MathF.Cos(a); }
        public static int Max(int a, int b) => Math.Max(a, b);
    }
}
namespace UnityEngine.Rendering {
    public static class CoreUtils {
        public static void Destroy(Resource resource) {
            if (resource == null) return;
            if (resource.Shared || resource.Destroyed) throw new Exception("Destroying shared/already-destroyed asset");
            resource.Destroyed = true; Resource.Live--;
        }
    }
}
namespace UnityEngine.UI {
    public class MaskableGraphic {
        public RectTransform rectTransform = new(); public Color color;
        protected virtual void OnPopulateMesh(VertexHelper helper) { }
        public void Rebuild(VertexHelper helper) => OnPopulateMesh(helper);
    }
    public class VertexHelper {
        public List<float> Positions = new(); public List<Color> Colors = new(); public int Triangles;
        public int currentVertCount => Positions.Count / 2;
        public void Clear() { Positions.Clear(); Colors.Clear(); Triangles = 0; }
        public void AddVert(Vector2 v, Color color, Vector2 uv) { Positions.Add(v.x); Positions.Add(v.y); Colors.Add(color); }
        public void AddTriangle(int a, int b, int c) { Triangles++; }
    }
}
""";
}
