using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

// Execute the actual production allocation/cleanup methods with counted resource doubles.
// This checks ownership and missing-UI behavior; it does not emulate Unity/GPU rendering.
internal static class RenderTextureLifetimeChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/VenueCameraRenderer.cs")));
        string methods = string.Join("\n", tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Where(m => new[] { "TryFindOutput", "RecreateTextures", "ReleaseTextures" }.Contains(m.Identifier.Text))
            .Select(m => m.ToFullString().Replace("private ", "public ")));
        string source = "using System;\n" + Shims + "\npublic class Probe {\n" + Fields + methods + "\n}";
        var references = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator)
            .Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("RenderLifetimeProbe", new[] { CSharpSyntaxTree.ParseText(source,
            new CSharpParseOptions(LanguageVersion.CSharp9)) }, references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var output = new MemoryStream();
        var result = compilation.Emit(output);
        if (!result.Success) throw new InvalidOperationException(string.Join("\n", result.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        dynamic probe = Assembly.Load(output.ToArray()).CreateInstance("Probe");
        for (int frame = 0; frame < 1000; frame++)
        {
            probe.SetTime(frame / 60d);
            probe.RecreateTextures();
        }
        check(probe.LiveTextures() == 0 && probe.LiveHandles() == 0, "Missing venue UI allocates no render textures or handles");
        check(probe.SearchCount() <= 34, "Missing UI lookup is throttled, not repeated on every frame");
        probe.AddOutput();
        probe.SetTime(100);
        probe.RecreateTextures();
        check(probe.LiveTextures() == 2 && probe.LiveHandles() == 1 && probe.OutputWidth() == 1920,
            "Delayed UI arrival initializes output and trail resources");
        for (int resize = 0; resize < 200; resize++)
        {
            probe.SetWidth(800 + resize);
            probe.RecreateTextures();
            check(probe.LiveTextures() == 2 && probe.LiveHandles() == 1 && probe.OutputWidth() == 800 + resize,
                "Resizing replaces rather than accumulates native resource objects");
        }
        probe.Cleanup();
        probe.Cleanup();
        check(probe.LiveTextures() == 0 && probe.LiveHandles() == 0 && probe.OutputDetached(),
            "Repeated cleanup releases all ownership and detaches the output image");
    }

    private const string Fields = """
        public static RawImage _venueOutput;
        public static RenderTexture _venueTexture, _trailsTexture;
        public static RTHandle _trailsTextureHandle;
        public Camera _renderCamera = new Camera();
        public const int _trailsTextureId = 1;
        public float renderScale = 1;
        public double _nextOutputSearchTime;
        public void SetTime(double time) => Time.realtimeSinceStartupAsDouble = time;
        public int LiveTextures() => RenderTexture.Live;
        public int LiveHandles() => RTHandle.Live;
        public int SearchCount() => GameObject.Searches;
        public void AddOutput() => GameObject.Output = new GameObject();
        public void SetWidth(int width) => Screen.width = width;
        public int OutputWidth() => _venueTexture.width;
        public bool OutputDetached() => _venueOutput.texture == null;
        public void Cleanup() => ReleaseTextures();
        """;

    private const string Shims = """
        public class Texture { }
        public class Texture2D : Texture { public static Texture blackTexture = new Texture(); }
        public enum RenderTextureFormat { DefaultHDR }
        public enum FilterMode { Bilinear }
        public enum TextureWrapMode { Clamp }
        public struct RenderTextureDescriptor {
            public int width, height, depthBufferBits;
            public RenderTextureDescriptor(int w, int h, RenderTextureFormat f, int depth, int mips) {
                width = w; height = h; depthBufferBits = depth;
            }
        }
        public class RenderTexture : Texture {
            public static int Live;
            public bool Destroyed;
            public int width, height;
            public FilterMode filterMode;
            public TextureWrapMode wrapMode;
            public RenderTexture(RenderTextureDescriptor d) { width = d.width; height = d.height; Live++; }
            public void Create() { if (Destroyed) throw new Exception("Creating a destroyed texture"); }
            public void Release() { if (Destroyed) throw new Exception("Releasing a destroyed texture"); }
        }
        public static class CoreUtils {
            public static void Destroy(RenderTexture t) {
                if (t.Destroyed) throw new Exception("Double destruction");
                t.Destroyed = true; RenderTexture.Live--;
            }
        }
        public class RTHandle {
            public static int Live;
            private bool released;
            public RTHandle() { Live++; }
            public void Release() { if (released) throw new Exception("Double handle release"); released = true; Live--; }
        }
        public static class RTHandles { public static RTHandle Alloc(RenderTexture t) => new RTHandle(); }
        public class RawImage { public Texture texture; }
        public class Camera { public RenderTexture targetTexture; }
        public class GameObject {
            public static int Searches;
            public static GameObject Output;
            private RawImage image = new RawImage();
            public static GameObject Find(string name) { Searches++; return Output; }
            public T GetComponent<T>() where T : class => image as T;
        }
        public static class Time { public static double realtimeSinceStartupAsDouble; }
        public static class Screen { public static int width = 1920, height = 1080; }
        public static class Mathf { public static int Max(int a, int b) => Math.Max(a, b); }
        public static class Shader { public static void SetGlobalTexture(int id, Texture texture) { } }
        public static class Graphics { public static void Blit(Texture from, Texture to) { } }
        public static class ScalableBufferManager { public static void ResizeBuffers(float x, float y) { } }
        """;
}
