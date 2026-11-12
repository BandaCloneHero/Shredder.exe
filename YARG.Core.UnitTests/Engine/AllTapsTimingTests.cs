using NUnit.Framework;
using YARG.Core.Chart;
using YARG.Core.Engine.Guitar;
using YARG.Core.Engine.Guitar.Engines;
using YARG.Core.Game;
using YARG.Core.Input;

namespace YARG.Core.UnitTests.Engine;

public class AllTapsTimingTests
{
    private static (YargFiveFretGuitarEngine engine, List<GuitarNote> notes) Create(bool chord = false)
    {
        var notes = new List<GuitarNote>();
        for (int i = 0; i < 3; i++)
        {
            var note = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Tap,
                GuitarNoteFlags.None, NoteFlags.None, i + 1, 0, (uint)((i + 1) * 960), 0);
            if (chord)
                note.AddChildNote(new GuitarNote(FiveFretGuitarFret.Red, GuitarNoteType.Tap,
                    GuitarNoteFlags.None, NoteFlags.None, i + 1, 0, (uint)((i + 1) * 960), 0));
            if (i > 0) { note.PreviousNote = notes[i - 1]; notes[i - 1].NextNote = note; }
            notes.Add(note);
        }
        var chart = new InstrumentDifficulty<GuitarNote>(Instrument.FiveFretGuitar, Difficulty.Expert,
            notes, new(), new());
        var sync = new SyncTrack(480);
        sync.Tempos.Add(new TempoChange(120, 0, 0));
        var preset = EnginePreset.Default.FiveFretGuitar.Copy();
        preset.HitWindow.IsDynamic = false;
        preset.HitWindow.MinWindow = preset.HitWindow.MaxWindow = .2;
        preset.HitWindow.FrontToBackRatio = 1;
        float[] thresholds = [.05f, .1f, .2f, .4f, .6f, .9f];
        var engine = new YargFiveFretGuitarEngine(chart, sync, preset.Create(thresholds, thresholds, false), false)
            { PreferClosestNote = true };
        engine.SetSpeed(1);
        return (engine, notes);
    }

    [TestCase(30)] [TestCase(60)] [TestCase(120)] [TestCase(144)]
    public void GuitarAllTapsAcceptsEarlyAndLateInputsAfterTheFirstNote(int fps)
    {
        foreach (double offset in new[] { -.1, -.087, -.05, -.025, -.01, 0, .01, .025, .05, .087, .1 })
        {
            var (engine, notes) = Create();
            var hitTimes = new List<double>();
            engine.OnNoteHit += (_, _) => hitTimes.Add(engine.NoteHitTime);
            double frame = 0;
            foreach (var note in notes)
            {
                double time = note.Time + offset;
                while (frame < time) { engine.Update(frame); frame += 1d / fps; }
                var press = GameInput.Create(time, GuitarAction.GreenFret, true);
                var release = GameInput.Create(time + .15, GuitarAction.GreenFret, false);
                engine.QueueInput(ref press);
                engine.Update(frame);
                engine.QueueInput(ref release);
                engine.Update(time + .15);
                frame = time + .15 + 1d / fps;
            }
            Assert.That(notes.All(n => n.WasHit), Is.True, $"All Taps: {offset * 1000} ms, {fps} FPS");
            Assert.That(hitTimes, Has.Count.EqualTo(3));
            for (int i = 0; i < notes.Count; i++)
                Assert.That(hitTimes[i] - notes[i].Time, Is.EqualTo(offset).Within(1e-9));
            Assert.That(engine.EngineStats.Combo, Is.EqualTo(3));
        }
    }

    [Test]
    public void AllTapsChordCompletesWithoutStrumAndEmitsOneHitPerChord()
    {
        var (engine, notes) = Create(chord: true);
        int callbacks = 0;
        engine.OnNoteHit += (_, _) => callbacks++;
        foreach (var note in notes)
        {
            var green = GameInput.Create(note.Time - .05, GuitarAction.GreenFret, true);
            var red = GameInput.Create(note.Time - .04, GuitarAction.RedFret, true);
            var releaseRed = GameInput.Create(note.Time + .15, GuitarAction.RedFret, false);
            var releaseGreen = GameInput.Create(note.Time + .16, GuitarAction.GreenFret, false);
            engine.QueueInput(ref green);
            engine.QueueInput(ref red);
            engine.QueueInput(ref releaseRed);
            engine.QueueInput(ref releaseGreen);
            engine.Update(note.Time + .2);
        }
        Assert.That(notes.All(n => n.WasFullyHit()), Is.True);
        Assert.That(callbacks, Is.EqualTo(3));
        Assert.That(engine.EngineStats.Combo, Is.EqualTo(3));
    }
}
