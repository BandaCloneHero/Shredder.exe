using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Reflection;
using YARG.Core.Chart;
using YARG.Core.Game;

// Compile the REAL layout overrides extracted from each Unity player. Only scene dependencies
// (ordering dictionaries/key transforms) are supplied here; formulas are never copied into tests.
internal static class LaneMappingChecks
{
    public static void Run(string root, Action<bool, string> check)
    {
        GuitarNote Note(int fret) => new(fret, GuitarNoteType.Tap, GuitarNoteFlags.None, NoteFlags.None, 1, 0, 960, 0);
        dynamic guitar = Probe(root, "FiveFretGuitarPlayer", "GuitarNote");
        guitar.Ordering = new Dictionary<int, int> { [1] = 0, [2] = 1, [3] = 2, [4] = 3, [5] = 4 };
        for (int fret = 1; fret <= 5; fret++)
        {
            int lane = guitar.Lane(Note(fret));
            check(lane == fret - 1, "Guitar maps each actual fret to its own column");
            check(Math.Abs((float)guitar.GetJudgmentLaneX(lane) - ((fret - .5f) / 5)) < 1e-6, "Guitar column center");
        }
        guitar.Ordering = new Dictionary<int, int> { [1] = 4, [2] = 3, [3] = 2, [4] = 1, [5] = 0 };
        check(guitar.Lane(Note(2)) == 3, "Red follows the existing left-handed ordering");
        check(guitar.Lane(Note(7)) == 5 && guitar.GetJudgmentLaneX(5) == .5f, "Full-width open note remains full-width");
        check(guitar.Chord, "Guitar expands one logical chord into visual parts");
        var chord = Note(1);
        chord.AddChildNote(Note(3));
        chord.AddChildNote(Note(5));
        var chordLanes = new List<int>();
        foreach (var part in chord.AllNotes) chordLanes.Add(guitar.Lane(part));
        check(chordLanes.Distinct().Count() == 3, "A guitar chord targets three different columns");

        dynamic keys = Probe(root, "FiveLaneKeysPlayer", "GuitarNote");
        keys._highwayOrdering = new Dictionary<int, int> { [1] = 0, [2] = 1, [3] = 2, [4] = 3, [5] = 4 };
        check(keys.Lane(Note(2)) == 1, "Five-lane keys red column");
        check(keys.Lane(Note(7)) == 5, "Open without dedicated column uses the wide strike area");
        keys.UsingOpenLane = true;
        keys.LaneCount = 6;
        keys._highwayOrdering = new Dictionary<int, int> { [7] = 0, [1] = 1, [2] = 2, [3] = 3, [4] = 4, [5] = 5 };
        check(keys.Lane(Note(7)) == 0 && keys.Lane(Note(5)) == 5, "Six-lane keys includes dedicated open column");
        check(Math.Abs((float)keys.GetJudgmentLaneX(5) - 5.5f / 6) < 1e-6, "Six-lane projection width");

        dynamic drums = Probe(root, "DrumsPlayer", "DrumNote");
        drums.LaneCount = 7;
        drums.Ordering = new Dictionary<int, int> { [1] = 4, [2] = 2, [5] = 1, [0] = 0, [int.MaxValue] = 6 };
        DrumNote Pad(int pad, bool twice = false) => new(pad, DrumNoteType.Neutral, DrumNoteFlags.None, NoteFlags.None, 1, 960, twice);
        check(drums.Lane(Pad(1)) == 4, "Drums uses custom/mirrored red ordering");
        check(drums.Lane(Pad(2)) == 2 && drums.Lane(Pad(5)) == 1, "Separate drum and cymbal lanes");
        drums.NumberOfDedicatedKickLanes = 2;
        check(drums.Lane(Pad(0, true)) == 6, "Dedicated double-kick column");
        drums.Ordering = new Dictionary<int, int>();
        check(drums.Lane(Pad(0)) == 7 && drums.GetJudgmentLaneX(7) == .5f, "Wide kick strike area");

        dynamic pro = Probe(root, "ProKeysPlayer", "ProKeysNote");
        pro.KeyPositions = new Dictionary<int, float> { [0] = -.8f, [12] = -.3f, [24] = .7f };
        check(pro.JudgmentLaneCount == 25, "Every Pro Keys pitch has independent slots");
        check(Math.Abs((float)pro.GetJudgmentLaneX(0) - .1f) < 1e-6, "Pro Keys projects actual key X");
        pro.Offset = .2f;
        check(Math.Abs((float)pro.GetJudgmentLaneX(12) - .45f) < 1e-6, "Pro Keys follows live range shifting");
    }

    private static object Probe(string root, string player, string noteType)
    {
        var tree = CSharpSyntaxTree.ParseText(File.ReadAllText(Path.Combine(root, "Assets/Script/Gameplay/Player", player + ".cs")));
        var wanted = new HashSet<string> { "JudgmentLaneCount", "GetJudgmentLane", "GetJudgmentLaneX", "GetJudgmentLaneWidth",
            "JudgmentLaneForFret", "JudgmentLaneForPad", "ExpandJudgmentChord" };
        if (player == "FiveLaneKeysPlayer") wanted.Add("IsNormalNote");
        string members = string.Join("\n", tree.GetRoot().DescendantNodes().OfType<ClassDeclarationSyntax>().Single(c => c.Identifier.Text == player)
            .Members.Where(m => wanted.Contains(m is MethodDeclarationSyntax method ? method.Identifier.Text :
                m is PropertyDeclarationSyntax property ? property.Identifier.Text : "")).Select(m => m.ToFullString()));
        string source = @"
using System;
using System.Collections.Generic;
using UnityEngine;
using YARG.Core.Chart;
using YARG.Core.Engine.Keys;
using static YARG.Core.Engine.Keys.FiveLaneKeysEngine;
public class ProbeBase {
    public int LaneCount = 5;
    public int NumberOfDedicatedKickLanes;
    public const float TRACK_WIDTH = 2;
    public virtual int JudgmentLaneCount => 1;
    public virtual float GetJudgmentLaneX(int lane) => 0;
    public virtual float GetJudgmentLaneWidth(int lane) => 0;
    protected virtual bool ExpandJudgmentChord => false;
    protected virtual int GetJudgmentLane(" + noteType + @" note) => -1;
}
public class Probe : ProbeBase {
    public const int LANE_COUNT = 5, TOTAL_KEY_COUNT = 25, WHITE_KEY_VISIBLE_COUNT = 10, DOUBLE_KICK_FRET_INDEX = int.MaxValue;
    public Dictionary<int, int> Ordering = new Dictionary<int, int>();
    public Dictionary<int, int> _highwayOrdering = new Dictionary<int, int>();
    public Dictionary<int, float> KeyPositions = new Dictionary<int, float>();
    public bool UsingOpenLane;
    public float Offset;
    public int GetLanePosition(FiveFretGuitarFret fret) => Ordering[(int)fret];
    public struct Info { public int Position; }
    public Info GetHighwayOrderingInfo(int pad) => new Info { Position = Ordering.TryGetValue(pad, out var position) ? position : -1 };
    public float GetNoteX(int key) => KeyPositions[key] + Offset;
    public int Lane(" + noteType + @" note) => GetJudgmentLane(note);
    public bool Chord => ExpandJudgmentChord;
" + members + "\n}";
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")).Split(Path.PathSeparator)
            .Append(typeof(EnginePreset).Assembly.Location).Append(typeof(UnityEngine.Mathf).Assembly.Location)
            .Distinct().Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("Mapping" + player, new[] { CSharpSyntaxTree.ParseText(source,
            new CSharpParseOptions(LanguageVersion.CSharp9)) }, refs,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var output = new MemoryStream();
        var result = compilation.Emit(output);
        if (!result.Success) throw new InvalidOperationException(player + ": " + string.Join("\n", result.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error)));
        return Assembly.Load(output.ToArray()).CreateInstance("Probe");
    }
}
