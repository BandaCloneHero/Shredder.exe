using System;
using UnityEngine;
using YARG.Core.Game;

namespace YARG.Gameplay.Judgments
{
    public enum RhythmJudgment { Perfect, Great, Good, Miss }

    [Serializable]
    public sealed class RhythmJudgmentSettings
    {
        [Tooltip("Desative para preservar a janela original do preset.")]
        public bool UseMillisecondWindow = true;
        [Min(0)] public float PerfectMs = 25;
        [Min(0)] public float GreatMs = 60;
        [Min(1)] public float GoodMs = 100;

        public void Validate()
        {
            PerfectMs = Mathf.Max(0, PerfectMs);
            GreatMs = Mathf.Max(PerfectMs, GreatMs);
            GoodMs = Mathf.Max(1, Mathf.Max(GreatMs, GoodMs));
        }

        public RhythmJudgment Classify(double signedMilliseconds)
        {
            // Epsilon only compensates binary floating-point subtraction at exact boundaries.
            double value = Math.Abs(signedMilliseconds);
            if (value <= PerfectMs + 1e-7) return RhythmJudgment.Perfect;
            if (value <= GreatMs + 1e-7) return RhythmJudgment.Great;
            if (!UseMillisecondWindow || value <= GoodMs + 1e-7) return RhythmJudgment.Good;
            return RhythmJudgment.Miss;
        }

        public EnginePreset.HitWindowPreset Configure(EnginePreset.HitWindowPreset original)
        {
            Validate();
            var window = original.Copy();
            if (UseMillisecondWindow)
            {
                window.IsDynamic = false;
                // Core expects the FULL window in seconds, not a per-side duration.
                window.MinWindow = window.MaxWindow = GoodMs * 0.002;
                window.FrontToBackRatio = 1;
            }
            return window;
        }
    }
}
