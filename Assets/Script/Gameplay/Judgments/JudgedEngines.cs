using YARG.Core.Chart;
using YARG.Core.Engine.Guitar;
using YARG.Core.Engine.Guitar.Engines;
using YARG.Core.Engine.Keys;
using YARG.Core.Engine.Keys.Engines;
using YARG.Core.Engine.Drums;
using YARG.Core.Engine.Drums.Engines;

namespace YARG.Gameplay.Judgments
{
    // Override only note-head scoring. The existing engine still awards combo, SP, sustains and solos.
    public sealed class JudgedGuitarEngine : YargFiveFretGuitarEngine
    {
        private readonly RhythmJudgmentSession _session;
        public JudgedGuitarEngine(InstrumentDifficulty<GuitarNote> chart, SyncTrack sync, GuitarEngineParameters parameters,
            bool bot, RhythmJudgmentSession session) : base(chart, sync, parameters, bot) { _session = session; }
        protected override void AddScore(GuitarNote note)
        {
            var result = _session.Hit(note, note.Time, CurrentTime, BaseParameters.SongSpeed, 1 + note.ChildNotes.Count);
            int points = _session.Points(POINTS_PER_NOTE * (1 + note.ChildNotes.Count), result);
            EngineStats.NoteScore += points;
            AddScore(points);
        }
        public override void Reset(bool keepCurrentButtons = false) { base.Reset(keepCurrentButtons); _session?.Reset(); }
    }

    public sealed class JudgedFiveLaneKeysEngine : YargFiveLaneKeysEngine
    {
        private readonly RhythmJudgmentSession _session;
        private double _pressTime;
        public JudgedFiveLaneKeysEngine(InstrumentDifficulty<GuitarNote> chart, SyncTrack sync, KeysEngineParameters parameters,
            bool bot, RhythmJudgmentSession session) : base(chart, sync, parameters, bot) { _session = session; }
        protected override void HitNote(GuitarNote note)
        {
            _pressTime = GetKeyPressTimes()[(int)note.FiveLaneKeysAction];
            if (IsBot || _pressTime == DEFAULT_PRESS_TIME) _pressTime = CurrentTime;
            base.HitNote(note);
        }
        protected override void AddScore(GuitarNote note)
        {
            var result = _session.Hit(note, note.Time, _pressTime, BaseParameters.SongSpeed);
            int points = _session.Points(POINTS_PER_NOTE, result);
            EngineStats.NoteScore += points;
            AddScore(points);
        }
        public override void Reset(bool keepCurrentButtons = false) { base.Reset(keepCurrentButtons); _session?.Reset(); }
    }

    public sealed class JudgedProKeysEngine : YargProKeysEngine
    {
        private readonly RhythmJudgmentSession _session;
        private double _pressTime;
        public JudgedProKeysEngine(InstrumentDifficulty<ProKeysNote> chart, SyncTrack sync, KeysEngineParameters parameters,
            bool bot, RhythmJudgmentSession session) : base(chart, sync, parameters, bot) { _session = session; }
        protected override void HitNote(ProKeysNote note)
        {
            _pressTime = GetKeyPressTimes()[note.Key];
            if (IsBot || _pressTime == DEFAULT_PRESS_TIME) _pressTime = CurrentTime;
            base.HitNote(note);
        }
        protected override void AddScore(ProKeysNote note)
        {
            var result = _session.Hit(note, note.Time, _pressTime, BaseParameters.SongSpeed);
            int points = _session.Points(POINTS_PER_PRO_KEYS_NOTE, result);
            EngineStats.NoteScore += points;
            AddScore(points);
        }
        public override void Reset(bool keepCurrentButtons = false) { base.Reset(keepCurrentButtons); _session?.Reset(); }
    }

    public sealed class JudgedDrumsEngine : YargDrumsEngine
    {
        private readonly RhythmJudgmentSession _session;
        public JudgedDrumsEngine(InstrumentDifficulty<DrumNote> chart, SyncTrack sync, DrumsEngineParameters parameters,
            bool bot, bool midi, RhythmJudgmentSession session) : base(chart, sync, parameters, bot, midi) { _session = session; }
        protected override void AddScore(DrumNote note)
        {
            var result = _session.Hit(note, note.Time, CurrentTime, BaseParameters.SongSpeed);
            int points = _session.Points(GetPointsPerNote(), result);
            EngineStats.NoteScore += points;
            AddScore(points);
        }
        public override void Reset(bool keepCurrentButtons = false) { base.Reset(keepCurrentButtons); _session?.Reset(); }
    }
}
