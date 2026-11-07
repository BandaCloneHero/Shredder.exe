using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;

namespace YARG.Gameplay.Judgments
{
    [Serializable]
    public sealed class JudgmentSummary
    {
        public int Perfect, Great, Good, MissedNotes, InvalidInputs;
        public int Errors => MissedNotes + InvalidInputs;
        public int Hits => Perfect + Great + Good;
        public JudgmentSummary Copy() => (JudgmentSummary)MemberwiseClone();
    }

    public readonly struct RhythmJudgmentResult
    {
        public readonly RhythmJudgment Grade;
        public readonly double? Milliseconds;
        public readonly float DamageMultiplier;
        public RhythmJudgmentResult(RhythmJudgment grade, double? milliseconds, float damageMultiplier)
        {
            Grade = grade;
            Milliseconds = milliseconds;
            DamageMultiplier = damageMultiplier;
        }
    }

    /// <summary>One result per real note/event, shared by engine scoring, HUD, boss and results.</summary>
    public sealed class RhythmJudgmentSession
    {
        private sealed class ReferenceComparer : IEqualityComparer<object>
        {
            public new bool Equals(object a, object b) => ReferenceEquals(a, b);
            public int GetHashCode(object item) => RuntimeHelpers.GetHashCode(item);
        }
        private readonly Dictionary<object, RhythmJudgmentResult> _results = new(new ReferenceComparer());
        private JudgmentSummary _summary = new();
        public RhythmJudgmentSettings Policy { get; }
        public bool WeightedScoring { get; }

        public RhythmJudgmentSession(RhythmJudgmentSettings settings, bool weightedScoring = true)
        {
            Policy = settings.Copy();
            Policy.Validate();
            WeightedScoring = weightedScoring;
        }

        public RhythmJudgmentResult Hit(object note, double noteTime, double hitTime, double speed, int noteCount = 1)
        {
            if (_results.TryGetValue(note, out var previous)) return previous;
            double ms = (hitTime - noteTime) * 1000 / (speed > 0 ? speed : 1);
            var grade = Policy.Classify(ms);
            // Preserve explicit lane/autohit forgiveness: an engine-accepted note is not a visual miss.
            if (grade == RhythmJudgment.Miss) grade = RhythmJudgment.Good;
            var result = new RhythmJudgmentResult(grade, ms, Policy.DamageMultiplier(grade));
            _results.Add(note, result);
            switch (grade)
            {
                case RhythmJudgment.Perfect: _summary.Perfect += noteCount; break;
                case RhythmJudgment.Great: _summary.Great += noteCount; break;
                case RhythmJudgment.Good: _summary.Good += noteCount; break;
            }
            return result;
        }

        public RhythmJudgmentResult Miss(object note, int noteCount = 1)
        {
            if (_results.TryGetValue(note, out var previous)) return previous;
            var result = new RhythmJudgmentResult(RhythmJudgment.Miss, null, 0);
            _results.Add(note, result);
            _summary.MissedNotes += noteCount;
            return result;
        }

        public int Points(int basePoints, RhythmJudgmentResult result) => WeightedScoring
            ? (int)Math.Round(basePoints * Policy.ScoreMultiplier(result.Grade), MidpointRounding.AwayFromZero)
            : basePoints;

        public void InvalidInput() => _summary.InvalidInputs++;
        public JudgmentSummary Snapshot() => _summary.Copy();
        public void Reset()
        {
            _results.Clear();
            _summary = new JudgmentSummary();
        }
    }
}
