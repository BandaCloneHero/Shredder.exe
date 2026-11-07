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
        [Header("Antecipado (ms)")]
        [Min(0)] public float PerfectMs = 28;
        [Min(0)] public float GreatMs = 65;
        [Min(1)] public float GoodMs = 185;
        [Header("Atrasado (ms) — margem menor")]
        [Min(0)] public float LatePerfectMs = 26;
        [Min(0)] public float LateGreatMs = 62;
        [Min(1)] public float LateGoodMs = 170;

        [Header("Pontuação relativa ao acerto perfeito")]
        [Range(0.02f, 0.99f)] public float GreatScoreMultiplier = 0.8f;
        [Range(0.01f, 0.98f)] public float GoodScoreMultiplier = 0.5f;
        [Header("Dano ao boss")]
        [Min(0)] public float PerfectDamageMultiplier = 1.15f;
        [Min(0)] public float GreatDamageMultiplier = 1f;
        [Min(0)] public float GoodDamageMultiplier = 0.7f;

        public RhythmJudgmentSettings Copy() => (RhythmJudgmentSettings)MemberwiseClone();

        public void Validate()
        {
            PerfectMs = Mathf.Max(0, PerfectMs);
            GreatMs = Mathf.Max(PerfectMs, GreatMs);
            GoodMs = Mathf.Max(1, Mathf.Max(GreatMs, GoodMs));
            LatePerfectMs = Mathf.Min(PerfectMs, Mathf.Max(0, LatePerfectMs));
            LateGreatMs = Mathf.Min(GreatMs, Mathf.Max(LatePerfectMs, LateGreatMs));
            LateGoodMs = Mathf.Min(GoodMs, Mathf.Max(1, Mathf.Max(LateGreatMs, LateGoodMs)));
            GreatScoreMultiplier = Mathf.Clamp(GreatScoreMultiplier, 0.02f, 0.99f);
            GoodScoreMultiplier = Mathf.Clamp(GoodScoreMultiplier, 0.01f, GreatScoreMultiplier - 0.01f);
            PerfectDamageMultiplier = Mathf.Max(0.03f, PerfectDamageMultiplier);
            GreatDamageMultiplier = Mathf.Clamp(GreatDamageMultiplier, 0.02f, PerfectDamageMultiplier - 0.01f);
            GoodDamageMultiplier = Mathf.Clamp(GoodDamageMultiplier, 0.01f, GreatDamageMultiplier - 0.01f);
        }

        public RhythmJudgment Classify(double signedMilliseconds)
        {
            double value = Math.Abs(signedMilliseconds);
            bool early = signedMilliseconds <= 0;
            if (value <= (early ? PerfectMs : LatePerfectMs) + 1e-7) return RhythmJudgment.Perfect;
            if (value <= (early ? GreatMs : LateGreatMs) + 1e-7) return RhythmJudgment.Great;
            if (!UseMillisecondWindow || value <= (early ? GoodMs : LateGoodMs) + 1e-7) return RhythmJudgment.Good;
            return RhythmJudgment.Miss;
        }

        public double ScoreMultiplier(RhythmJudgment judgment) => judgment switch
        {
            RhythmJudgment.Perfect => 1,
            RhythmJudgment.Great => GreatScoreMultiplier,
            RhythmJudgment.Good => GoodScoreMultiplier,
            _ => 0
        };

        public float DamageMultiplier(RhythmJudgment judgment) => judgment switch
        {
            RhythmJudgment.Perfect => PerfectDamageMultiplier,
            RhythmJudgment.Great => GreatDamageMultiplier,
            RhythmJudgment.Good => GoodDamageMultiplier,
            _ => 0
        };

        public EnginePreset.HitWindowPreset Configure(EnginePreset.HitWindowPreset original)
        {
            Validate();
            var window = original.Copy();
            if (UseMillisecondWindow)
            {
                window.IsDynamic = false;
                window.MinWindow = window.MaxWindow = (GoodMs + LateGoodMs) * 0.001;
                // Core splits the TOTAL window with this ratio. No frame-based comparisons.
                window.FrontToBackRatio = 2d * GoodMs / (GoodMs + LateGoodMs);
            }
            return window;
        }
    }
}
