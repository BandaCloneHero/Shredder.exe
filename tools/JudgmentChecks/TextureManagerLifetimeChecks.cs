using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

// Compile the complete production TextureManager. The UniTask facade queues controlled work,
// while texture/audio doubles enforce main-thread access and count owned resources.
internal static class TextureManagerLifetimeChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        string production = File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/TextureManager.cs"));
        // Task supplies the test runner's async builder; the cleanup body is unchanged.
        production = production.Replace("private async UniTaskVoid Destroy_Async()", "private async System.Threading.Tasks.Task Destroy_Async()");
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator)
            .Append(typeof(YARG.Core.Venue.BackgroundType).Assembly.Location).Distinct().Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("TextureManagerProbe", new[] { CSharpSyntaxTree.ParseText(production),
            CSharpSyntaxTree.ParseText(Shims) }, refs, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var output = new MemoryStream();
        var emitted = compilation.Emit(output);
        if (!emitted.Success) throw new InvalidOperationException(string.Join("\n", emitted.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        dynamic probe = Assembly.Load(output.ToArray()).CreateInstance("Probe");
        probe.Start();
        probe.Tick();
        check(probe.Reads == 2 && probe.Uploads == 0 && probe.Pending == 1, "FFT reads audio on main thread and queues one worker");
        probe.Tick();
        check(probe.Reads == 2 && probe.Pending == 1, "No overlapping FFT jobs or audio writes while worker owns arrays");
        probe.Work();
        probe.Pause(true);
        probe.Tick();
        check(probe.Reads == 2 && probe.Uploads == 0, "Paused spectrum launches no jobs or texture uploads");
        probe.Pause(false);
        probe.Tick();
        check(probe.Reads == 4 && probe.Uploads == 1 && probe.Pending == 1 && probe.PixelsCorrect(),
            "Completed spectrum is uploaded, preserving FFT and waveform values");
        probe.ResizeVideo();
        check(probe.VideoCorrect(), "An already-created video target is released before resizing and recreated");
        probe.Stop();
        check(probe.OwnedTextures == 2, "Spectrum and album survive until pending math completes; video target is destroyed");
        probe.Work();
        probe.Pump();
        check(probe.OwnedTextures == 0 && probe.SharedIntact(), "Scene cleanup frees owned textures while preserving shared icons/default covers");
        check(probe.Reads == 4, "Worker finishes after mixer disposal without touching native audio handles");
        probe.Tick();
        check(probe.Pending == 0 && probe.Reads == 4, "Shutdown prevents new worker jobs");
    }

    private const string Shims = """
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.CompilerServices;
public static class ThreadGuard {
    public static int Main;
    public static void Check() { if (Thread.CurrentThread.ManagedThreadId != Main) throw new Exception("Native access off main thread"); }
}
public class PumpContext : SynchronizationContext {
    private readonly System.Collections.Concurrent.ConcurrentQueue<(SendOrPostCallback, object)> queue = new();
    public override void Post(SendOrPostCallback callback, object state) => queue.Enqueue((callback, state));
    public void Pump() { while (queue.TryDequeue(out var item)) item.Item1(item.Item2); }
}
namespace Cysharp.Threading.Tasks {
    public class WorkSource {
        public TaskCompletionSource<bool> Completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public bool Consumed;
    }
    public readonly struct UniTask {
        private readonly WorkSource source;
        public UniTask(WorkSource source) { this.source = source; }
        public static UniTask CompletedTask => default;
        public StatusValue Status => new(source == null || source.Completion.Task.IsCompleted);
        public readonly struct StatusValue { private readonly bool done; public StatusValue(bool done) { this.done = done; } public bool IsCompleted() => done; }
        public Awaiter GetAwaiter() => new(source);
        public readonly struct Awaiter : INotifyCompletion {
            private readonly WorkSource source;
            public Awaiter(WorkSource source) { this.source = source; }
            public bool IsCompleted => source == null || source.Completion.Task.IsCompleted;
            public void OnCompleted(Action callback) => source.Completion.Task.GetAwaiter().OnCompleted(callback);
            public void GetResult() {
                if (source == null) return;
                if (source.Consumed) throw new Exception("UniTask consumed twice");
                source.Consumed = true; source.Completion.Task.GetAwaiter().GetResult();
            }
        }
        public static readonly Queue<Action> Pending = new();
        public static UniTask RunOnThreadPool(Action<object> work, object state) {
            var source = new WorkSource();
            Pending.Enqueue(() => { try { work(state); source.Completion.SetResult(true); } catch (Exception e) { source.Completion.SetException(e); throw; } });
            return new UniTask(source);
        }
    }
}
namespace UnityEngine {
    public class RangeAttribute : Attribute { public RangeAttribute(float a, float b) { } }
    public enum TextureFormat { R8 }
    public enum TextureWrapMode { Clamp }
    public enum FilterMode { Point }
    public class Texture {
        public static int Owned;
        public bool Shared, Destroyed;
        protected int w, h;
        public virtual int width { get => w; set => w = value; }
        public virtual int height { get => h; set => h = value; }
        public TextureWrapMode wrapMode; public FilterMode filterMode;
        public static void Destroy(Texture t) {
            ThreadGuard.Check(); if (t == null) return;
            if (t.Shared || t.Destroyed) throw new Exception("Destroying shared/already-destroyed asset");
            t.Destroyed = true; Owned--;
        }
    }
    public class Texture2D : Texture {
        public int Uploads; public byte[] Pixels;
        public Texture2D(bool shared) { Shared = shared; if (!shared) Owned++; }
        public Texture2D(int w, int h, TextureFormat f, bool mip, bool linear) : this(false) { this.w = w; this.h = h; }
        public void LoadRawTextureData(byte[] data) { ThreadGuard.Check(); Pixels = (byte[])data.Clone(); }
        public void Apply(bool a, bool b) { ThreadGuard.Check(); Uploads++; }
    }
    public class RenderTexture : Texture {
        private bool created;
        public RenderTexture(int w, int h, int depth) { this.w = w; this.h = h; Owned++; }
        public override int width { get => w; set { if (created) throw new Exception("Resize without Release"); w = value; } }
        public override int height { get => h; set { if (created) throw new Exception("Resize without Release"); h = value; } }
        public bool IsCreated() => created;
        public void Release() { ThreadGuard.Check(); created = false; }
        public void Create() { ThreadGuard.Check(); created = true; }
    }
    public class Material {
        public bool HasTexture(int id) => false;
        public Texture GetTexture(int id) => null;
        public void SetTexture(int id, Texture texture) { }
    }
    public static class Shader { public static int PropertyToID(string name) => name.Length; }
}
namespace YARG.Helpers.Extensions { }
namespace YARG.Song {
    public class Sprite { public UnityEngine.Texture2D texture = new(true); }
    public static class SongSources { public static readonly Sprite Icon = new(); public static Sprite SourceToIcon(string source) => Icon; }
}
namespace YARG.Gameplay {
    public class SongData {
        public string Source => "test";
        public ImageData LoadAlbumData() => new();
    }
    public class ImageData : IDisposable {
        public UnityEngine.Texture2D LoadTexture(bool value) => new(false);
        public void Dispose() { }
    }
    public class GameManager {
        public bool Paused, Disposed; public int Reads;
        public SongData Song = new();
        public int GetMixerFFTData(float[] data, int log, bool complex) {
            ThreadGuard.Check(); if (Disposed) throw new Exception("Audio handle disposed"); Reads++; Array.Clear(data);
            data[0] = .02f; return data.Length;
        }
        public int GetMixerSampleData(float[] data) {
            ThreadGuard.Check(); if (Disposed) throw new Exception("Audio handle disposed"); Reads++; Array.Fill(data, .25f); return data.Length;
        }
    }
    public class GameplayBehaviour {
        protected GameManager GameManager;
        public void Setup(GameManager game) => GameManager = game;
        protected virtual void GameplayDestroy() { }
        public void StopBehaviour() => GameplayDestroy();
        protected void Destroy(UnityEngine.Texture texture) => UnityEngine.Texture.Destroy(texture);
    }
}
public class Probe {
    private YARG.Gameplay.TextureManager manager;
    private YARG.Gameplay.GameManager game;
    private UnityEngine.Texture2D sound, defaultCover;
    private PumpContext context;
    private SynchronizationContext previous;
    public int Reads => game.Reads;
    public int Uploads => sound.Uploads;
    public int Pending => Cysharp.Threading.Tasks.UniTask.Pending.Count;
    public int OwnedTextures => UnityEngine.Texture.Owned;
    public void Start() {
        ThreadGuard.Main = Thread.CurrentThread.ManagedThreadId;
        previous = SynchronizationContext.Current;
        context = new PumpContext(); SynchronizationContext.SetSynchronizationContext(context);
        manager = new(); game = new(); manager.Setup(game);
        defaultCover = new(true); manager.DefaultAlbumCover = defaultCover;
        var flags = System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance;
        sound = (UnityEngine.Texture2D)manager.GetType().GetMethod("GetSoundTexture", flags).Invoke(manager, null);
        manager.GetType().GetMethod("GetAlbumArt", flags).Invoke(manager, null);
    }
    public void Tick() => manager.Update();
    public void Work() => Task.Run(Cysharp.Threading.Tasks.UniTask.Pending.Dequeue()).GetAwaiter().GetResult();
    public void Pause(bool value) => game.Paused = value;
    public bool PixelsCorrect() {
        double magnitude = .01 * (1 - (double)manager.FFTSmoothingFactor);
        byte fft = (byte)Math.Round(Math.Clamp((20 * Math.Log10(magnitude) + 100) / 70 * 255, 0, 255));
        return Math.Abs(sound.Pixels[0] - fft) <= 1 && sound.Pixels[1] == 0 && sound.Pixels[512] == 166;
    }
    public void ResizeVideo() { manager.GetVideoTexture(null, null); manager.CreateVideoTexture(); manager.GetVideoTexture(1280, 720); }
    public bool VideoCorrect() { var texture = manager.GetVideoTexture(null, null); return texture.width == 1280 && texture.height == 720 && texture.IsCreated(); }
    public void Stop() { game.Disposed = true; manager.StopBehaviour(); }
    public void Pump() {
        for (int i = 0; i < 100 && UnityEngine.Texture.Owned > 0; i++) { context.Pump(); Thread.Sleep(1); }
        SynchronizationContext.SetSynchronizationContext(previous);
    }
    public bool SharedIntact() => !defaultCover.Destroyed && !YARG.Song.SongSources.Icon.texture.Destroyed;
}
""";
}
