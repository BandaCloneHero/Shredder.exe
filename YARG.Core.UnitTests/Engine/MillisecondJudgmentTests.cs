using NUnit.Framework;
using YARG.Core.Chart;
using YARG.Core.Engine;
using YARG.Core.Engine.Keys;
using YARG.Core.Engine.Keys.Engines;
using YARG.Core.Input;

namespace YARG.Core.UnitTests.Engine;

public class MillisecondJudgmentTests
{
    private static (YargFiveLaneKeysEngine engine, GuitarNote note) Create(bool sustain = false, bool chord = false, bool next = false)
    {
        var note = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Strum, GuitarNoteFlags.None,
            NoteFlags.None, 1, sustain ? 1 : 0, 960, sustain ? 960u : 0u);
        if (chord) note.AddChildNote(new GuitarNote(FiveFretGuitarFret.Red, GuitarNoteType.Strum,
            GuitarNoteFlags.None, NoteFlags.None, 1, 0, 960, 0));
        var notes = new List<GuitarNote> { note };
        if (next)
        {
            var second = new GuitarNote(FiveFretGuitarFret.Green, GuitarNoteType.Strum,
                GuitarNoteFlags.None, NoteFlags.None, 1.08, 0, 1037, 0);
            note.NextNote = second;
            second.PreviousNote = note;
            notes.Add(second);
        }
        var chart = new InstrumentDifficulty<GuitarNote>(Instrument.Keys, Difficulty.Expert, notes, new(), new());
        var sync = new SyncTrack(480);
        sync.Tempos.Add(new TempoChange(120, 0, 0));
        float[] thresholds = [0.05f, 0.1f, 0.2f, 0.4f, 0.6f, 0.9f];
        var parameters = new KeysEngineParameters(new HitWindowSettings(0.2, 0.2, 1, false, 0, 1, 1, 0, 0),
            4, 0, 0.025, thresholds, thresholds, 0.05, 0, false, false);
        var engine = new YargFiveLaneKeysEngine(chart, sync, parameters, false) { PreferClosestNote = true };
        engine.SetSpeed(1);
        return (engine, note);
    }

    [TestCase(30)] [TestCase(60)] [TestCase(120)] [TestCase(144)]
    public void TimestampedInputsKeepTheirAccuracyAcrossFrameRates(int fps)
    {
        foreach (double offset in new[] { -0.100, -0.087, -0.060, -0.025, -0.010, 0, 0.010, 0.025, 0.050, 0.060, 0.100 })
        {
            var (engine, note) = Create();
            double hitTime = 1 + offset;
            double? observed = null;
            int callbacks = 0;
            engine.OnNoteHit += (_, _) => { observed = engine.NoteHitTime; callbacks++; };
            for (double frame = 0; frame < hitTime; frame += 1d / fps) engine.Update(frame);
            var input = GameInput.Create(hitTime, ProKeysAction.GreenKey, true);
            engine.QueueInput(ref input);
            // Simulate a slow frame: input timestamp must survive until the next render update.
            engine.Update(hitTime + 1d / fps);
            engine.Update(1.5);
            Assert.That(note.WasHit, Is.True, $"{fps} FPS, {offset * 1000} ms");
            Assert.That(observed, Is.EqualTo(hitTime).Within(1e-9));
            Assert.That(callbacks, Is.EqualTo(1));
            Assert.That(engine.EngineStats.Combo, Is.EqualTo(1));
        }
    }

    [TestCase(-0.101)] [TestCase(0.101)]
    public void OutsideWindowIsNotAccepted(double offset)
    {
        var (engine, note) = Create();
        var input = GameInput.Create(1 + offset, ProKeysAction.GreenKey, true);
        engine.QueueInput(ref input);
        engine.Update(1.5);
        Assert.That(note.WasHit, Is.False);
        Assert.That(note.WasMissed, Is.True);
    }

    [Test]
    public void CloserIdenticalNoteReceivesInputInsteadOfOldNote()
    {
        var (engine, note) = Create(next: true);
        var input = GameInput.Create(1.075, ProKeysAction.GreenKey, true);
        engine.QueueInput(ref input);
        engine.Update(1.08);
        Assert.That(note.WasMissed, Is.True);
        Assert.That(note.NextNote!.WasHit, Is.True);
        Assert.That(engine.EngineStats.Overhits, Is.Zero);
    }

    [Test]
    public void SustainDoesNotEmitHitEveryFrame()
    {
        var (engine, _) = Create(sustain: true);
        int callbacks = 0;
        engine.OnNoteHit += (_, _) => callbacks++;
        var input = GameInput.Create(1.01, ProKeysAction.GreenKey, true);
        engine.QueueInput(ref input);
        for (double t = 1.02; t < 2.2; t += 1d / 60) engine.Update(t);
        Assert.That(callbacks, Is.EqualTo(1));
        Assert.That(engine.EngineStats.Combo, Is.EqualTo(1));
    }

    [Test]
    public void StaggeredChordReportsOriginalPressTimestamps()
    {
        var (engine, note) = Create(chord: true);
        var times = new List<double>();
        engine.OnNoteHit += (_, _) => times.Add(engine.NoteHitTime);
        var green = GameInput.Create(0.98, ProKeysAction.GreenKey, true);
        var red = GameInput.Create(1.01, ProKeysAction.RedKey, true);
        engine.QueueInput(ref green);
        engine.QueueInput(ref red);
        engine.Update(1.04);
        Assert.That(note.WasFullyHit(), Is.True);
        Assert.That(times, Is.EquivalentTo(new[] { 0.98, 1.01 }));
        Assert.That(engine.EngineStats.Combo, Is.EqualTo(1));
    }
    [Test]
    public void DelayedRenderFramePreservesQueuedInputTimestamp()
    {
        var (engine, note) = Create();
        double? observed = null;
        engine.OnNoteHit += (_, _) => observed = engine.NoteHitTime;
        engine.Update(0.8);
        var input = GameInput.Create(1.008, ProKeysAction.GreenKey, true);
        engine.QueueInput(ref input);
        engine.Update(1.4); // 600 ms render stall, but input was timestamped at +8 ms.
        Assert.That(note.WasHit, Is.True);
        Assert.That(observed, Is.EqualTo(1.008).Within(1e-9));
    }

    [TestCase(0.5)] [TestCase(1)] [TestCase(1.5)]
    public void SongSpeedScalesWindowAndSignedMillisecondsConsistently(double speed)
    {
        var (engine, note) = Create();
        engine.SetSpeed(speed);
        double actualMs = 0;
        engine.OnNoteHit += (_, _) => actualMs = (engine.NoteHitTime - note.Time) * 1000 / speed;
        var input = GameInput.Create(1 - 0.05 * speed, ProKeysAction.GreenKey, true);
        engine.QueueInput(ref input);
        engine.Update(1.2);
        Assert.That(note.WasHit, Is.True);
        Assert.That(actualMs, Is.EqualTo(-50).Within(1e-7));
    }

    [Test]
    public void NoInputDoesNotExpireOldNoteAtOverlapMidpoint()
    {
        var (engine, note) = Create(next: true);
        engine.Update(1.075);
        Assert.That(note.WasMissed, Is.False);
        engine.Update(1.101);
        Assert.That(note.WasMissed, Is.True);
    }

}
