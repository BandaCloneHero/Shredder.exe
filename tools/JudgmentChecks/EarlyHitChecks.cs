using YARG.Core;
using YARG.Core.Chart;
using YARG.Core.Engine;
using YARG.Core.Engine.Drums;
using YARG.Core.Engine.Drums.Engines;
using YARG.Core.Engine.Guitar.Engines;
using YARG.Core.Engine.Keys.Engines;
using YARG.Core.Game;
using YARG.Core.Input;
using YARG.Gameplay.Judgments;

internal static class EarlyHitChecks
{
    private sealed class Scenario
    {
        public BaseEngine Engine;
        public List<GameInput> Inputs = new();
        public List<double> Hits = new();
        public Func<bool> AllHit;
    }

    public static void Run(Action<bool, string> check)
    {
        var settings = new RhythmJudgmentSettings();
        foreach (string mode in new[] { "AllTaps", "BassAllTaps", "FiveLaneKeys", "ProKeys", "FourLaneDrums", "ProDrums", "FiveLaneDrums" })
        foreach (int fps in new[] { 30, 60, 120, 144 })
        foreach (double offset in new[] { -.180, -.170, -.150, -.120, .120, .150, .170, .180 })
        {
            var scenario = Create(mode, offset, settings);
            int nextInput = 0;
            for (int frame = 0; frame <= 4 * fps; frame++)
            {
                double time = frame / (double)fps;
                while (nextInput < scenario.Inputs.Count && scenario.Inputs[nextInput].Time <= time)
                {
                    var input = scenario.Inputs[nextInput++];
                    scenario.Engine.QueueInput(ref input);
                }
                scenario.Engine.Update(time);
            }
            string context = $"{mode}, {fps} FPS, {offset * 1000} ms";
            check(scenario.AllHit() && scenario.Hits.Count == 3, "Three real hits, including notes after the first: " + context);
            check(scenario.Engine.BaseStats.Combo == 3, "Combo remains correct: " + context);
            for (int i = 0; i < scenario.Hits.Count; i++)
            {
                double error = scenario.Hits[i] - (i + 1);
                check(Math.Abs(error - offset) < 1e-8 && settings.Classify(error * 1000) == RhythmJudgment.Good,
                    "Original input timestamp is accepted as BOM: " + context);
            }
        }
    }

    private static Scenario Create(string mode, double offset, RhythmJudgmentSettings settings)
    {
        var result = new Scenario();
        var sync = new SyncTrack(480);
        sync.Tempos.Add(new TempoChange(120, 0, 0));
        float[] thresholds = { .05f, .1f, .2f, .4f, .6f, .9f };
        if (mode is "AllTaps" or "BassAllTaps" or "FiveLaneKeys")
        {
            bool guitar = mode != "FiveLaneKeys";
            var notes = new List<GuitarNote>();
            for (int i = 0; i < 3; i++)
                notes.Add(new GuitarNote(FiveFretGuitarFret.Green, guitar ? GuitarNoteType.Tap : GuitarNoteType.Strum,
                    GuitarNoteFlags.None, NoteFlags.None, i + 1, 0, (uint)((i + 1) * 960), 0));
            Link(notes);
            var instrument = mode == "BassAllTaps" ? Instrument.FiveFretBass : guitar ? Instrument.FiveFretGuitar : Instrument.Keys;
            var chart = new InstrumentDifficulty<GuitarNote>(instrument,
                Difficulty.Expert, notes, new(), new());
            if (guitar)
            {
                var preset = EnginePreset.Default.FiveFretGuitar.Copy();
                preset.HitWindow = settings.Configure(preset.HitWindow);
                var engine = new YargFiveFretGuitarEngine(chart, sync, preset.Create(thresholds, thresholds, mode == "BassAllTaps"), false);
                engine.OnNoteHit += (_, _) => result.Hits.Add(engine.NoteHitTime);
                result.Engine = engine;
                for (int i = 0; i < 3; i++)
                {
                    result.Inputs.Add(GameInput.Create(i + 1 + offset, GuitarAction.GreenFret, true));
                    result.Inputs.Add(GameInput.Create(i + 1 + offset + .12, GuitarAction.GreenFret, false));
                }
            }
            else
            {
                var preset = EnginePreset.Default.ProKeys.Copy();
                preset.HitWindow = settings.Configure(preset.HitWindow);
                var engine = new YargFiveLaneKeysEngine(chart, sync, preset.Create(thresholds, thresholds, false), false);
                engine.OnNoteHit += (_, _) => result.Hits.Add(engine.NoteHitTime);
                result.Engine = engine;
                for (int i = 0; i < 3; i++)
                {
                    result.Inputs.Add(GameInput.Create(i + 1 + offset, ProKeysAction.GreenKey, true));
                    result.Inputs.Add(GameInput.Create(i + 1 + offset + .12, ProKeysAction.GreenKey, false));
                }
            }
            result.AllHit = () => notes.All(n => n.WasHit);
        }
        else if (mode == "ProKeys")
        {
            var notes = new List<ProKeysNote>();
            for (int i = 0; i < 3; i++) notes.Add(new ProKeysNote(0, ProKeysNoteFlags.None, NoteFlags.None, i + 1, 0, (uint)((i + 1) * 960), 0));
            Link(notes);
            var chart = new InstrumentDifficulty<ProKeysNote>(Instrument.ProKeys, Difficulty.Expert, notes, new(), new());
            var preset = EnginePreset.Default.ProKeys.Copy();
            preset.HitWindow = settings.Configure(preset.HitWindow);
            var engine = new YargProKeysEngine(chart, sync, preset.Create(thresholds, thresholds, false), false);
            engine.OnNoteHit += (_, _) => result.Hits.Add(engine.NoteHitTime);
            result.Engine = engine;
            result.AllHit = () => notes.All(n => n.WasHit);
            for (int i = 0; i < 3; i++)
            {
                result.Inputs.Add(GameInput.Create(i + 1 + offset, ProKeysAction.Key1, true));
                result.Inputs.Add(GameInput.Create(i + 1 + offset + .12, ProKeysAction.Key1, false));
            }
        }
        else
        {
            var notes = new List<DrumNote>();
            for (int i = 0; i < 3; i++) notes.Add(new DrumNote(1, DrumNoteType.Neutral, DrumNoteFlags.None, NoteFlags.None, i + 1, (uint)((i + 1) * 960)));
            Link(notes);
            var instrument = mode == "FiveLaneDrums" ? Instrument.FiveLaneDrums : mode == "ProDrums" ? Instrument.ProDrums : Instrument.FourLaneDrums;
            var drumMode = mode == "FiveLaneDrums" ? DrumsEngineParameters.DrumMode.FiveLane : mode == "ProDrums" ? DrumsEngineParameters.DrumMode.ProFourLane : DrumsEngineParameters.DrumMode.NonProFourLane;
            var chart = new InstrumentDifficulty<DrumNote>(instrument, Difficulty.Expert, notes, new(), new());
            var preset = EnginePreset.Default.Drums.Copy();
            preset.HitWindow = settings.Configure(preset.HitWindow);
            var engine = new YargDrumsEngine(chart, sync, preset.Create(thresholds, thresholds, drumMode), false, false);
            engine.OnNoteHit += (_, _) => result.Hits.Add(engine.NoteHitTime);
            result.Engine = engine;
            result.AllHit = () => notes.All(n => n.WasHit);
            for (int i = 0; i < 3; i++) result.Inputs.Add(GameInput.Create(i + 1 + offset, DrumsAction.RedDrum, 1f));
        }
        result.Engine.PreferClosestNote = true;
        result.Engine.SetSpeed(1);
        return result;
    }

    private static void Link<T>(List<T> notes) where T : Note<T>
    {
        for (int i = 1; i < notes.Count; i++)
        {
            notes[i].PreviousNote = notes[i - 1];
            notes[i - 1].NextNote = notes[i];
        }
    }
}
