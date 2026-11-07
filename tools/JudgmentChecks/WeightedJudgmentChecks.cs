using YARG.Core;
using YARG.Core.Chart;
using YARG.Core.Engine;
using YARG.Core.Engine.Guitar;
using YARG.Core.Game;
using YARG.Core.Input;
using YARG.Gameplay.Judgments;

internal static class WeightedJudgmentChecks
{
    public static void Run(Action<bool, string> check)
    {
        var settings = new RhythmJudgmentSettings();
        foreach (string mode in new[] { "AllTaps", "BassAllTaps", "FiveLaneKeys", "ProKeys", "FourLaneDrums", "ProDrums", "FiveLaneDrums" })
        foreach (int fps in new[] { 30, 60, 120, 144 })
        foreach (double offset in new[] { -.1, -.05, -.01, .01, .05, .1 })
        foreach (double speed in new[] { .75, 1d, 1.5 })
        {
            var scenario = EarlyHitChecks.Create(mode, offset * speed, settings, speed: speed);
            Simulate(scenario.Engine, scenario.Inputs, fps);
            var summary = scenario.Session.Snapshot();
            var grade = settings.Classify(offset * 1000);
            int expectedPoints = grade == RhythmJudgment.Perfect ? 50 : grade == RhythmJudgment.Great ? 40 : 25;
            if (mode == "ProKeys") expectedPoints = grade == RhythmJudgment.Perfect ? 120 : grade == RhythmJudgment.Great ? 96 : 60;
            if (mode == "ProDrums") expectedPoints = grade == RhythmJudgment.Perfect ? 60 : grade == RhythmJudgment.Great ? 48 : 30;
            string context = $"{mode}/{fps}fps/{offset * 1000}ms/{speed}x";
            check(scenario.AllHit() && scenario.Hits.Count == 3, "Weighted engine accepts real timestamps: " + context);
            check(scenario.Engine.BaseStats.NoteScore == expectedPoints * 3, "Real grade-dependent note score: " + context);
            check(scenario.Engine.BaseStats.CommittedScore == expectedPoints * 3 && scenario.Engine.BaseStats.Combo == 3,
                "No duplicated score or altered combo: " + context);
            check(summary.Hits == 3 && (grade == RhythmJudgment.Perfect ? summary.Perfect == 3 :
                grade == RhythmJudgment.Great ? summary.Great == 3 : summary.Good == 3), "Actual per-note counters: " + context);
            scenario.Engine.Reset();
            check(scenario.Session.Snapshot().Hits == 0 && scenario.Engine.BaseStats.NoteScore == 0, "Restart clears score and summary: " + context);
        }
        foreach (string mode in new[] { "AllTaps", "FiveLaneKeys", "ProKeys", "FourLaneDrums" })
        foreach (double offset in new[] { .171, .185 })
        {
            var scenario = EarlyHitChecks.Create(mode, offset, settings);
            Simulate(scenario.Engine, scenario.Inputs, 30);
            check(scenario.Hits.Count == 0 && scenario.Engine.BaseStats.NoteScore == 0, "Outside asymmetric window gives no score: " + mode + offset);
        }

        // The shared result is immutable and counted once even when HUD, score and end-song all consume it.
        var session = new RhythmJudgmentSession(settings);
        var note = new object();
        var result = session.Hit(note, 1, 1.05, 1, 3);
        check(result.Grade == RhythmJudgment.Great && Math.Abs(result.DamageMultiplier - 1) < 1e-6, "Boss shares GREAT result");
        session.Hit(note, 1, 1, 1, 3);
        session.Miss(note, 3);
        var snapshot = session.Snapshot();
        check(snapshot.Great == 3 && snapshot.Hits == 3 && snapshot.Errors == 0, "Chord gems count once, no finalization double count");
        session.Miss(new object(), 2);
        session.InvalidInput();
        check(snapshot.Errors == 0 && session.Snapshot().Errors == 3, "Result snapshot is detached; misses plus invalid inputs are errors");
        check(settings.DamageMultiplier(RhythmJudgment.Perfect) > settings.DamageMultiplier(RhythmJudgment.Great) &&
            settings.DamageMultiplier(RhythmJudgment.Great) > settings.DamageMultiplier(RhythmJudgment.Good) &&
            settings.DamageMultiplier(RhythmJudgment.Miss) == 0, "Boss damage ordering and zero miss damage");
        settings.GoodMs = 1000;
        check(session.Policy.GoodMs == 185, "Inspector changes cannot mutate a running/replayed scoring policy");
        GuitarChordAndSustain(check);
        StaggeredKeys(check);
        MultiplierAndStarPower(check);
    }

    internal static void Simulate(BaseEngine engine, List<GameInput> inputs, int fps, double end = 4)
    {
        int cursor = 0;
        for (int frame = 0; frame <= end * fps; frame++)
        {
            double time = frame / (double)fps;
            while (cursor < inputs.Count && inputs[cursor].Time <= time)
            {
                var input = inputs[cursor++];
                engine.QueueInput(ref input);
            }
            engine.Update(time);
        }
    }

    private static void StaggeredKeys(Action<bool, string> check)
    {
        foreach (bool pro in new[] { false, true })
        foreach (int fps in new[] { 30, 144 })
        foreach (double first in new[] { -.08, -.05 })
        {
            var settings = new RhythmJudgmentSettings();
            var sync = new SyncTrack(480);
            sync.Tempos.Add(new TempoChange(120, 0, 0));
        sync.TimeSignatures.Add(new TimeSignatureChange(4, 4, 0, 0, 0, 0, 0, 0));
            var preset = EnginePreset.Default.ProKeys.Copy();
            preset.HitWindow = settings.Configure(preset.HitWindow);
            float[] thresholds = { .05f, .1f, .2f, .4f, .6f, .9f };
            var session = new RhythmJudgmentSession(settings);
            BaseEngine engine;
            var reportedTimes = new List<double>();
            if (pro)
            {
                var parent = new ProKeysNote(0, ProKeysNoteFlags.None, NoteFlags.None, 1, 0, 960, 0);
                parent.AddChildNote(new ProKeysNote(2, ProKeysNoteFlags.None, NoteFlags.None, 1, 0, 960, 0));
                var track = new InstrumentDifficulty<ProKeysNote>(Instrument.ProKeys, Difficulty.Expert, new() { parent }, new(), new());
                var keys = new JudgedProKeysEngine(track, sync, preset.Create(thresholds, thresholds, false), false, session);
                keys.OnNoteHit += (_, _) => reportedTimes.Add(keys.NoteHitTime);
                engine = keys;
            }
            else
            {
                var parent = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Strum, GuitarNoteFlags.None, NoteFlags.None, 1, 0, 960, 0);
                parent.AddChildNote(new GuitarNote(FiveFretGuitarFret.Red, GuitarNoteType.Strum, GuitarNoteFlags.None, NoteFlags.None, 1, 0, 960, 0));
                var track = new InstrumentDifficulty<GuitarNote>(Instrument.Keys, Difficulty.Expert, new() { parent }, new(), new());
                var keys = new JudgedFiveLaneKeysEngine(track, sync, preset.Create(thresholds, thresholds, false), false, session);
                keys.OnNoteHit += (_, _) => reportedTimes.Add(keys.NoteHitTime);
                engine = keys;
            }
            var inputs = new List<GameInput> {
                GameInput.Create(1 + first, pro ? ProKeysAction.Key1 : ProKeysAction.GreenKey, true),
                GameInput.Create(1 + first + .03, pro ? ProKeysAction.Key3 : ProKeysAction.RedKey, true) };
            Simulate(engine, inputs, fps);
            var summary = session.Snapshot();
            check(reportedTimes.Count == 2 && Math.Abs(reportedTimes[0] - (1 + first)) < 1e-9 &&
                Math.Abs(reportedTimes[1] - (1 + first + .03)) < 1e-9, "Stagger keeps each original key timestamp");
            check(summary.Great == 1 && summary.Hits == 2 && (first == -.08 ? summary.Good == 1 : summary.Perfect == 1),
                "Two columns in one staggered chord get different real grades");
            int expected = first == -.08 ? (pro ? 156 : 65) : (pro ? 216 : 90);
            check(engine.BaseStats.NoteScore == expected && engine.BaseStats.Combo == 1, "Stagger uses individual weighted score without duplicate combo");
        }
    }

    private static void MultiplierAndStarPower(Action<bool, string> check)
    {
        var settings = new RhythmJudgmentSettings();
        var sync = new SyncTrack(480);
        sync.Tempos.Add(new TempoChange(120, 0, 0));
        sync.TimeSignatures.Add(new TimeSignatureChange(4, 4, 0, 0, 0, 0, 0, 0));
        var notes = new List<GuitarNote>();
        var inputs = new List<GameInput>();
        for (int i = 0; i < 32; i++)
        {
            double time = 1 + i * .3;
            var note = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Tap, GuitarNoteFlags.None, NoteFlags.None,
                time, 0, (uint)Math.Round(time * 960), 0);
            if (i > 0) { note.PreviousNote = notes[^1]; notes[^1].NextNote = note; }
            notes.Add(note);
            inputs.Add(GameInput.Create(time - .05, GuitarAction.GreenFret, true));
            inputs.Add(GameInput.Create(time + .05, GuitarAction.GreenFret, false));
        }
        inputs.Add(GameInput.Create(1.1, GuitarAction.StarPower, true));
        inputs.Sort((a, b) => a.Time.CompareTo(b.Time));
        var track = new InstrumentDifficulty<GuitarNote>(Instrument.FiveFretGuitar, Difficulty.Expert, notes, new(), new());
        var preset = EnginePreset.Default.FiveFretGuitar.Copy();
        preset.HitWindow = settings.Configure(preset.HitWindow);
        float[] thresholds = { .05f, .1f, .2f, .4f, .6f, .9f };
        var engine = new JudgedGuitarEngine(track, sync, preset.Create(thresholds, thresholds, false), false, new RhythmJudgmentSession(settings));
        engine.BaseStats.StarPowerTickAmount = engine.TicksPerFullSpBar;
        Simulate(engine, inputs, 60, 12);
        check(engine.BaseStats.Combo == 32 && engine.BaseStats.NoteScore == 32 * 40, "Combo and weighted heads survive a multiplier streak");
        check(engine.BaseStats.StarPowerActivationCount == 1 && engine.BaseStats.StarPowerScore > 0 && engine.BaseStats.MultiplierScore > 0,
            "Original Star Power and combo multiplier paths still award points");
        check(engine.BaseStats.TotalScore == engine.BaseStats.NoteScore + engine.BaseStats.MultiplierScore + engine.BaseStats.StarPowerScore,
            "Star Power and combo totals reconcile with weighted heads");
    }

    private static void GuitarChordAndSustain(Action<bool, string> check)
    {
        foreach (double offset in new[] { -.01, -.05, -.1 })
        {
            var settings = new RhythmJudgmentSettings();
            var sync = new SyncTrack(480);
            sync.Tempos.Add(new TempoChange(120, 0, 0));
        sync.TimeSignatures.Add(new TimeSignatureChange(4, 4, 0, 0, 0, 0, 0, 0));
            var chord = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Strum, GuitarNoteFlags.None, NoteFlags.None, 1, 1, 960, 960);
            chord.AddChildNote(new GuitarNote(FiveFretGuitarFret.Red, GuitarNoteType.Strum, GuitarNoteFlags.None, NoteFlags.None, 1, 1, 960, 960));
            chord.AddChildNote(new GuitarNote(FiveFretGuitarFret.Yellow, GuitarNoteType.Strum, GuitarNoteFlags.None, NoteFlags.None, 1, 1, 960, 960));
            var track = new InstrumentDifficulty<GuitarNote>(Instrument.FiveFretGuitar, Difficulty.Expert, new() { chord }, new(), new());
            var preset = EnginePreset.Default.FiveFretGuitar.Copy();
            preset.HitWindow = settings.Configure(preset.HitWindow);
            float[] thresholds = { .05f, .1f, .2f, .4f, .6f, .9f };
            var session = new RhythmJudgmentSession(settings);
            var engine = new JudgedGuitarEngine(track, sync, preset.Create(thresholds, thresholds, false), false, session);
            int events = 0;
            engine.OnNoteHit += (_, note) => { events++; session.Hit(note, note.Time, engine.NoteHitTime, 1, 1 + note.ChildNotes.Count); };
            var inputs = new List<GameInput> {
                GameInput.Create(.5, GuitarAction.GreenFret, true), GameInput.Create(.5, GuitarAction.RedFret, true),
                GameInput.Create(.5, GuitarAction.YellowFret, true), GameInput.Create(1 + offset, GuitarAction.StrumDown, true),
                GameInput.Create(1 + offset + .05, GuitarAction.StrumDown, false) };
            Simulate(engine, inputs, 60);
            int expected = offset == -.01 ? 150 : offset == -.05 ? 120 : 75;
            check(engine.BaseStats.NoteScore == expected && engine.BaseStats.SustainScore > 0, "Strum chord head is weighted; sustain scoring still works");
            check(events == 1 && engine.BaseStats.Combo == 1 && session.Snapshot().Hits == 3, "Three chord images/counts, one score/combo event; no sustain-frame judgments");
            check(engine.BaseStats.CommittedScore == engine.BaseStats.NoteScore + engine.BaseStats.SustainScore +
                engine.BaseStats.MultiplierScore + engine.BaseStats.SoloBonuses + engine.BaseStats.StarPowerScore,
                "Weighted score remains in engine score components");
        }
    }
}
