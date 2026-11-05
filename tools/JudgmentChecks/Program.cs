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
    foreach (double ms in new[] { 60.001, 61, 87, 100, 120, 150, 170, 180 })
        Check(settings.Classify(sign * ms) == RhythmJudgment.Good, $"Good {sign * ms}");
    Check(settings.Classify(sign * 180.001) == RhythmJudgment.Miss, "Outside window");
}
var original = new EnginePreset.HitWindowPreset { IsDynamic = true, MinWindow = .04, MaxWindow = .14 };
var configured = settings.Configure(original);
var window = configured.Create();
Check(!configured.IsDynamic && configured.MinWindow == .36 && configured.MaxWindow == .36, "Full window conversion");
Check(original.IsDynamic && original.MinWindow == .04, "Must not mutate shared preset");
Check(Math.Abs(window.GetFrontEnd(.36) + .18) < 1e-9 && Math.Abs(window.GetBackEnd(.36) - .18) < 1e-9, "Symmetric window");
settings.UseMillisecondWindow = false;
var legacy = settings.Configure(original);
Check(legacy.IsDynamic && legacy.MinWindow == .04 && legacy.MaxWindow == .14, "Legacy opt-out");
settings.PerfectMs = 80;
settings.GreatMs = 20;
settings.GoodMs = -1;
settings.Validate();
Check(settings.GreatMs == 80 && settings.GoodMs == 80, "Ordered Inspector thresholds");

// Exercise the production pool: each new note has its own slot until its animation finishes.
var columns = new JudgmentLanePool(5, 1);
var chord = new object();
var indices = new int[5];
for (int lane = 0; lane < 5; lane++)
{
    indices[lane] = columns.Acquire(lane, chord, out bool existing);
    Check(!existing && columns.LaneOf(indices[lane]) == lane, "Chord must have one slot per column");
}
Check(indices.Distinct().Count() == 5, "Five simultaneous columns must own different entries");
int repeated = columns.Acquire(2, chord, out bool duplicate);
Check(duplicate && repeated == indices[2], "Duplicate callback only reuses its own column/note");
int rapid = columns.Acquire(2, new object(), out duplicate);
Check(!duplicate && rapid != indices[2] && columns.IsActive(indices[2]), "Rapid notes preserve the previous image in the SAME column");
Check(columns.IsActive(indices[0]) && columns.IsActive(indices[4]), "Other columns remain active");
var overlap = new JudgmentLanePool(5, 2);
int older = overlap.Acquire(0, new object(), out _);
int newer = overlap.Acquire(0, new object(), out _);
int otherLane = overlap.Acquire(4, new object(), out _);
int overflow = overlap.Acquire(0, new object(), out _);
Check(overflow != older && overflow != newer, "Grow beyond initial capacity instead of replacing any active image");
Check(overlap.IsActive(older) && overlap.IsActive(newer) && overlap.IsActive(otherLane), "Growth preserves all old images");
Check(overlap.LaneOf(overflow) == 0 && overlap.LaneOf(otherLane) == 4, "Growing a lane preserves every slot's lane identity");
overlap.Release(newer);
Check(!overlap.IsActive(newer) && overlap.Acquire(0, new object(), out _) == newer, "Reuse a slot ONLY after its animation finishes");
overlap.Release(otherLane);
Check(overlap.Acquire(4, new object(), out _) == otherLane, "Released slot retains its original column");
var burst = new JudgmentLanePool(5, 4);
var burstSlots = new HashSet<int>();
for (int i = 0; i < 100; i++) burstSlots.Add(burst.Acquire(1, new object(), out _));
Check(burstSlots.Count == 100 && burstSlots.All(burst.IsActive), "100 distinct fast notes in one lane preserve 100 independent images");
Check(burstSlots.All(i => burst.LaneOf(i) == 1), "All expanded slots still follow the original lane");
// Preallocated source objects: measuring slot operations, not object construction or assertions.
var events = new[] { new object(), new object(), new object() };
for (int i = 0; i < 100; i++)
{
    int slot = columns.Acquire(i % 5, events[i % 3], out _);
    columns.Release(slot);
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int i = 0; i < 10_000; i++)
{
    int slot = columns.Acquire(i % 5, events[i % 3], out _);
    columns.Release(slot);
}
Check(GC.GetAllocatedBytesForCurrentThread() == before, "No managed allocations when reusing finished feedback slots after warmup");
columns.Clear();
for (int lane = 0; lane < 5; lane++)
{
    Check(!columns.HasActiveLane(lane), "Reset clears every lane");
    int slot = columns.Acquire(lane, new object(), out _);
    Check(columns.LaneOf(slot) == lane, "Reset preserves lane ownership for future notes");
}

// A slow creation frame previously consumed the entire visual lifetime before first draw.
var animation = new JudgmentFeedbackClock();
animation.Restart(10);
animation.Advance(10, 2.5f);
Check(animation.Age == 0, "New image must survive its creation frame even after a 2.5 second stall");
animation.Advance(11, .016f);
Check(Math.Abs(animation.Age - .016f) < 1e-6, "Animation advances on following frames");
animation.Restart(12);
animation.Advance(12, 1);
Check(animation.Age == 0, "A newly reused slot starts visibly in its own lane");
animation.Advance(13, -.5f);
Check(animation.Age == 0, "Visual age cannot go backwards");

string root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../"));
LaneMappingChecks.Run(root, Check);
EarlyHitChecks.Run(Check);
string[] sources = Directory.GetFiles(Path.Combine(root, "Assets/Script/Gameplay/Judgments"), "*.cs")
    .Concat(new[] { "HUD/TrackView.cs", "Player/TrackPlayer.cs", "Player/FiveFretGuitarPlayer.cs",
        "Player/FiveLaneKeysPlayer.cs", "Player/ProKeysPlayer.cs", "Player/DrumsPlayer.cs" }
        .Select(f => Path.Combine(root, "Assets/Script/Gameplay", f))).ToArray();
// Read the actual assets used by Gameplay; C# defaults alone do not validate prefab setup.
foreach (string prefab in new[] { "FiveFretGuitarVisual", "FiveLaneKeysVisual", "ProKeysVisual", "FourLaneDrumsVisual" })
{
    string yaml = File.ReadAllText(Path.Combine(root, "Assets/Prefabs/Gameplay/Visual", prefab + ".prefab"));
    Check(yaml.Contains("  JudgmentSettings:\n    UseMillisecondWindow: 1\n    PerfectMs: 25\n    GreatMs: 60\n    GoodMs: 180"),
        $"Serialized timing defaults missing from {prefab}");
}
string hud = File.ReadAllText(Path.Combine(root, "Assets/Prefabs/Gameplay/HUD/TrackView.prefab"));
string scriptMeta = File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Judgments/RhythmJudgmentDisplay.cs.meta"));
string scriptGuid = System.Text.RegularExpressions.Regex.Match(scriptMeta, @"guid: (\w+)").Groups[1].Value;
Check(hud.Contains("guid: " + scriptGuid) && hud.Contains("  _judgments: {fileID: 8934482200100012345}"), "HUD component wiring");
string hudMeta = File.ReadAllText(Path.Combine(root, "Assets/Prefabs/Gameplay/HUD/TrackView.prefab.meta"));
string hudGuid = System.Text.RegularExpressions.Regex.Match(hudMeta, @"guid: (\w+)").Groups[1].Value;
string scene = File.ReadAllText(Path.Combine(root, "Assets/Scenes/Gameplay.unity"));
Check(scene.Contains("_trackViewPrefab: {fileID: 504031665406120138, guid: " + hudGuid), "Gameplay references the configured HUD");

// Original artwork is imported under Assets and wired to the actual gameplay HUD.
foreach (var pair in new[] { ("perfect", "perfeito"), ("great", "otimo"), ("good", "bom"), ("miss", "errou") })
{
    string asset = Path.Combine(root, "Assets/Resources/Julgamentos", pair.Item2 + ".png");
    byte[] imported = File.ReadAllBytes(asset);
    Check(imported.SequenceEqual(File.ReadAllBytes(Path.Combine(root, "Images/Julgamentos", pair.Item2 + ".png"))),
        $"Original artwork must be preserved: {pair.Item2}");
    Check(imported.Length > 26 && imported[0] == 137 && imported[1] == 80 && imported[25] == 6,
        $"RGBA PNG: {pair.Item2}");
    string meta = File.ReadAllText(asset + ".meta");
    string guid = System.Text.RegularExpressions.Regex.Match(meta, @"guid: (\w+)").Groups[1].Value;
    Check(meta.Contains("textureType: 0") && meta.Contains("spriteMode: 0") && meta.Contains("alphaIsTransparency: 1") && meta.Contains("textureFormat: 4"),
        $"Transparent Texture2D import: {pair.Item2}");
    Check(hud.Contains("_" + pair.Item1 + "Texture: {fileID: 2800000, guid: " + guid),
        $"Correct judgment texture wired in gameplay prefab: {pair.Item2}");
}
string presentation = File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Judgments/RhythmJudgmentDisplay.cs"));
Check(!presentation.Contains("TextMeshProUGUI") && !presentation.Contains("SetText(") && !presentation.Contains("Timing"),
    "Judgment presentation must contain no generated label or timing text");
Check(presentation.Contains("FitArtwork(selected.Main, texture)") && presentation.Contains("selected.Main.color = Color.white"),
    "Preserve artwork aspect and original colors");
Check(presentation.Contains("Resources.Load<Texture2D>(\"Julgamentos/perfeito\")") &&
    presentation.Contains("Resources.Load<Texture2D>(\"Julgamentos/errou\")"), "Artwork has an import-independent resource lookup");
Check(presentation.Contains("selected.Animation.Restart(Time.frameCount)") &&
    presentation.Contains("entry.Animation.Advance(Time.frameCount, Time.unscaledDeltaTime)"), "Display uses the tested visual clock");
Check(hud.Contains("_prewarmPerLane: 4") && !hud.Contains("_maximumFeedbacks:"),
    "Prefab reserves capacity instead of setting an active-image replacement limit");
Check(!presentation.Contains("_overlapDistance") && !presentation.Contains("_slots.Rank("),
    "A new note must not reposition older feedbacks through forced stacking");
Check(hud.Contains("_imageSize: {x: 220, y: 96}") && hud.Contains("_fitToLane: 0"),
    "Larger images must not be automatically shrunk to a single narrow column");

foreach (string file in sources)
{
    var errors = CSharpSyntaxTree.ParseText(File.ReadAllText(file), new CSharpParseOptions(LanguageVersion.CSharp9))
        .GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
    Check(errors.Length == 0, $"Syntax: {file}: {string.Join<Diagnostic>(", ", errors)}");
}
Console.WriteLine($"PASS: {checks} checks of classification/settings, prefab wiring and C# 9 syntax. Unity rendering was not tested.");
