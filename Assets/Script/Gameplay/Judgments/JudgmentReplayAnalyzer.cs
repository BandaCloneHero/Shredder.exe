using System;
using System.Collections.Generic;
using Cysharp.Text;
using YARG.Core;
using YARG.Core.Chart;
using YARG.Core.Engine;
using YARG.Core.Engine.Guitar;
using YARG.Core.Engine.Guitar.Engines;
using YARG.Core.Engine.Keys;
using YARG.Core.Engine.Keys.Engines;
using YARG.Core.Engine.Drums;
using YARG.Core.Engine.Drums.Engines;
using YARG.Core.Engine.Vocals;
using YARG.Core.Engine.Vocals.Engines;
using YARG.Core.Game;
using YARG.Core.Logging;
using YARG.Core.Replays;
using YARG.Core.Replays.Analyzer;

namespace YARG.Gameplay.Judgments
{
    // App-side adapter: Core's replay format, modifiers, engine manager and stat verification stay intact.
    public static class JudgmentReplayAnalyzer
    {
        public static AnalysisResult[] AnalyzeReplay(SongChart chart, ReplayInfo info, ReplayData data, JudgmentReplayMetadata metadata)
        {
            if (metadata == null) return ReplayAnalyzer.AnalyzeReplay(chart, info, data);
            var manager = new EngineManager();
            var engines = new BaseEngine[data.Frames.Length];
            var cursors = new int[engines.Length];
            double end = info.ReplayLength;
            for (int i = 0; i < engines.Length; i++)
            {
                var frame = data.Frames[i];
                var policy = metadata.GetPolicy(i);
                engines[i] = CreateEngine(chart, frame.Profile, frame.EngineParameters, policy);
                engines[i].PreferClosestNote = policy != null && policy.UseMillisecondWindow;
                manager.Register(engines[i], frame.Profile.CurrentInstrument, chart, RockMeterPreset.Normal);
                engines[i].SetSpeed(frame.EngineParameters.SongSpeed);
                engines[i].Reset();
                if (frame.Inputs.Length > 0) end = Math.Max(end, frame.Inputs[^1].Time);
            }
            void Update(double time)
            {
                for (int i = 0; i < engines.Length; i++)
                {
                    var inputs = data.Frames[i].Inputs;
                    while (cursors[i] < inputs.Length && inputs[cursors[i]].Time <= time)
                    {
                        var input = inputs[cursors[i]++];
                        engines[i].QueueInput(ref input);
                    }
                }
                manager.UpdateEngines(time);
            }
            if (data.FrameTimes.Length > 0)
            {
                foreach (double time in data.FrameTimes) Update(time);
            }
            else
            {
                // Input events retain their own double timestamps, independent of this simulation cadence.
                for (double time = -2; time < end; time += 1d / 60) Update(time);
            }
            Update(end);
            var results = new AnalysisResult[engines.Length];
            for (int i = 0; i < engines.Length; i++)
            {
                var frame = data.Frames[i];
                bool passed = IsPassResult(frame.Stats, engines[i].BaseStats, out string log);
                results[i] = new AnalysisResult { Frame = frame, OriginalStats = frame.Stats,
                    ResultStats = engines[i].BaseStats, Passed = passed, StatLog = log,
                    ScoreDifference = engines[i].BaseStats.TotalScore - frame.Stats.TotalScore };
            }
            return results;
        }

        private static BaseEngine CreateEngine(SongChart _chart, YargProfile profile, BaseEngineParameters parameters, RhythmJudgmentSettings policy)
        {
            var session = policy == null ? null : new RhythmJudgmentSession(policy);
            switch (profile.GameMode)
            {
                case GameMode.FiveFretGuitar:
                {
                    // Reset the notes
                    var notes = _chart.GetFiveFretTrack(profile.CurrentInstrument)
                        .GetDifficulty(profile.CurrentDifficulty).Clone();
                    profile.ApplyModifiers(notes, _chart.SyncTrack);
                    foreach (var note in notes.Notes)
                    {
                        foreach (var subNote in note.AllNotes)
                        {
                            subNote.ResetNoteState();
                        }
                    }

                    // Create engine
                    return session == null ? new YargFiveFretGuitarEngine(
                        notes,
                        _chart.SyncTrack,
                        (GuitarEngineParameters) parameters,
                        profile.IsBot) : new JudgedGuitarEngine(
                        notes,
                        _chart.SyncTrack,
                        (GuitarEngineParameters) parameters,
                        profile.IsBot, session);
                }
                case GameMode.FourLaneDrums:
                case GameMode.FiveLaneDrums:
                case GameMode.EliteDrums:
                {
                    // Reset the notes
                    var notes = _chart.GetDrumsTrack(profile.CurrentInstrument)
                        .GetDifficulty(profile.CurrentDifficulty).Clone();
                    notes.SetDrumActivationFlags(profile.StarPowerActivationType);
                    profile.ApplyModifiers(notes, _chart.SyncTrack);
                    foreach (var note in notes.Notes)
                    {
                        foreach (var subNote in note.AllNotes)
                        {
                            subNote.ResetNoteState();
                        }
                    }

                    // Create engine
                    return session == null ? new YargDrumsEngine(
                        notes,
                        _chart.SyncTrack,
                        (DrumsEngineParameters) parameters,
                        profile.IsBot,
                        profile.GameMode is GameMode.EliteDrums) : new JudgedDrumsEngine(
                        notes,
                        _chart.SyncTrack,
                        (DrumsEngineParameters) parameters,
                        profile.IsBot,
                        profile.GameMode is GameMode.EliteDrums, session);
                }
                case GameMode.ProKeys:
                {
                    if (profile.CurrentInstrument is Instrument.ProKeys) // Pro Keys
                    {
                        // Reset the notes
                        var proNotes = _chart.ProKeys.GetDifficulty(profile.CurrentDifficulty).Clone();
                        profile.ApplyModifiers(proNotes, _chart.SyncTrack);
                        foreach (var note in proNotes.Notes)
                        {
                            foreach (var subNote in note.AllNotes)
                            {
                                subNote.ResetNoteState();
                            }
                        }

                        // Create engine
                        return session == null ? new YargProKeysEngine(
                            proNotes,
                            _chart.SyncTrack,
                            (KeysEngineParameters) parameters,
                            profile.IsBot) : new JudgedProKeysEngine(
                            proNotes,
                            _chart.SyncTrack,
                            (KeysEngineParameters) parameters,
                            profile.IsBot, session);
                    }

                    // Five-Lane Keys
                    // Reset the notes
                    var fiveLaneNotes = _chart.GetFiveFretTrack(profile.CurrentInstrument)
                        .GetDifficulty(profile.CurrentDifficulty).Clone();
                    profile.ApplyModifiers(fiveLaneNotes, _chart.SyncTrack);
                    foreach (var note in fiveLaneNotes.Notes)
                    {
                        foreach (var subNote in note.AllNotes)
                        {
                            subNote.ResetNoteState();
                        }
                    }

                    // Create engine
                    return session == null ? new YargFiveLaneKeysEngine(
                        fiveLaneNotes,
                        _chart.SyncTrack,
                        (KeysEngineParameters) parameters,
                        profile.IsBot) : new JudgedFiveLaneKeysEngine(
                        fiveLaneNotes,
                        _chart.SyncTrack,
                        (KeysEngineParameters) parameters,
                        profile.IsBot, session);
                }
                case GameMode.Vocals:
                {
                    // Get the notes
                    var notes = _chart.GetVocalsTrack(profile.CurrentInstrument)
                        .Parts[profile.HarmonyIndex].Clone();
                    profile.ApplyVocalModifiers(notes);

                    // Create engine
                    return new YargVocalsEngine(
                        // hate the double-clone lol but for now it'll be fine
                        notes.CloneAsInstrumentDifficulty(),
                        _chart.SyncTrack,
                        (VocalsEngineParameters) parameters,
                        profile.IsBot);
                }
                default:
                    throw new InvalidOperationException("Game mode not configured!");
            }
        }

        private static bool IsPassResult(BaseStats original, BaseStats result, out string log)
        {
            // For easier maintenance/reading, manually check log level and
            // use a string builder instead of LogFormat methods

            var builder = new Utf16ValueStringBuilder(true);

            // This helper is copied to the instrument-specific methods
            // because passing a `using` variable by reference is disallowed,
            // and working around that is annoying
            void FormatStat<T>(string stat, T originalValue, T resultValue)
                where T : IEquatable<T>
            {
                string format = originalValue.Equals(resultValue)
                    ? "- {0}: {1} == {2}\n"
                    : "- {0}: {1} != {2}\n";
                builder.AppendFormat(format, stat, originalValue, resultValue);
            }

            // Commented stats aren't serialized

            builder.AppendLine("Scoring:");
            FormatStat("Committed score", original.CommittedScore, result.CommittedScore);
            FormatStat("Pending score", original.PendingScore, result.PendingScore);
            FormatStat("Score from notes", original.NoteScore, result.NoteScore);
            FormatStat("Score from sustains", original.SustainScore, result.SustainScore);
            FormatStat("Score from multipliers", original.MultiplierScore, result.MultiplierScore);
            FormatStat("Score from solos", original.SoloBonuses, result.SoloBonuses);
            FormatStat("Score from SP", original.StarPowerScore, result.StarPowerScore);
            // FormatStat("Stars", original.Stars, result.Stars);

            builder.AppendLine();

            builder.AppendLine("Performance:");
            FormatStat("Notes hit", original.NotesHit, result.NotesHit);
            FormatStat("Notes missed", original.NotesMissed, result.NotesMissed);
            FormatStat("Combo", original.Combo, result.Combo);
            FormatStat("Max combo", original.MaxCombo, result.MaxCombo);
            FormatStat("Multiplier", original.ScoreMultiplier, result.ScoreMultiplier);
            FormatStat("Hit percent", original.Percent, result.Percent);

            builder.AppendLine();

            builder.AppendLine("Star Power:");
            FormatStat("Phrases hit", original.StarPowerPhrasesHit, result.StarPowerPhrasesHit);
            FormatStat("Phrases missed", original.StarPowerPhrasesMissed, result.StarPowerPhrasesMissed);
            FormatStat("Total ticks earned", original.TotalStarPowerTicks, result.TotalStarPowerTicks);
            FormatStat("Remaining ticks", original.StarPowerTickAmount, result.StarPowerTickAmount);
            FormatStat("Ticks from whammy", original.StarPowerWhammyTicks, result.StarPowerWhammyTicks);
            FormatStat("Time in SP", original.TimeInStarPower, result.TimeInStarPower);
            FormatStat("Activation count", original.StarPowerActivationCount, result.StarPowerActivationCount);
            // FormatStat("Total bars filled", original.TotalStarPowerBarsFilled, result.TotalStarPowerBarsFilled);
            FormatStat("Ended with SP active", original.IsStarPowerActive, result.IsStarPowerActive);

            builder.AppendLine();

            bool scoringPass =
                original.CommittedScore == result.CommittedScore &&
                original.PendingScore == result.PendingScore &&
                original.NoteScore == result.NoteScore &&
                original.SustainScore == result.SustainScore &&
                original.MultiplierScore == result.MultiplierScore &&
                original.SoloBonuses == result.SoloBonuses &&
                original.StarPowerScore == result.StarPowerScore; // &&
                // original.Stars == result.Stars;

            bool performancePass =
                original.NotesHit == result.NotesHit &&
                original.SustainScore == result.SustainScore &&
                original.NotesMissed == result.NotesMissed &&
                original.Combo == result.Combo &&
                original.MaxCombo == result.MaxCombo &&
                original.ScoreMultiplier == result.ScoreMultiplier &&
                original.Percent == result.Percent;

            bool spPass =
                original.StarPowerPhrasesHit == result.StarPowerPhrasesHit &&
                original.StarPowerPhrasesMissed == result.StarPowerPhrasesMissed &&
                original.IsStarPowerActive == result.IsStarPowerActive &&
                original.StarPowerTickAmount == result.StarPowerTickAmount &&
                original.TotalStarPowerTicks == result.TotalStarPowerTicks &&
                original.StarPowerWhammyTicks == result.StarPowerWhammyTicks &&
                original.TimeInStarPower == result.TimeInStarPower &&
                original.StarPowerActivationCount == result.StarPowerActivationCount &&
                //original.TotalStarPowerBarsFilled == result.TotalStarPowerBarsFilled &&
                original.IsStarPowerActive == result.IsStarPowerActive;

            bool generalPass = scoringPass && performancePass && spPass;

            bool instrumentPass;
            switch (original, result)
            {
                case (GuitarStats guitar1, GuitarStats guitar2):
                    instrumentPass = IsInstrumentPassResult(guitar1, guitar2, ref builder);
                    break;

                case (DrumsStats drums1, DrumsStats drums2):
                    instrumentPass = IsInstrumentPassResult(drums1, drums2, ref builder);
                    break;

                case (VocalsStats vox1, VocalsStats vox2):
                    instrumentPass = IsInstrumentPassResult(vox1, vox2, ref builder);
                    break;

                // case (ProGuitarStats pg1, ProGuitarStats pg2):
                //     instrumentPass = IsInstrumentPassResult(pg1, pg2, ref builder);
                //     break;

                case (KeysStats pk1, KeysStats pk2):
                    instrumentPass = IsInstrumentPassResult(pk1, pk2, ref builder);
                    break;

                default:
                    YargLogger.Assert(original.GetType() == result.GetType(), "Tried to compare mismatching stats types!");
                    YargLogger.LogFormatDebug("Instrument-specific validation not yet implemented for {0}",
                        original.GetType());
                    instrumentPass = true;
                    break;
            }

            log = builder.ToString();
            builder.Dispose();

            return generalPass && instrumentPass;
        }

        private static bool IsInstrumentPassResult(GuitarStats original, GuitarStats result,
            ref Utf16ValueStringBuilder builder)
        {
            void FormatStat<T>(string stat, T originalValue, T resultValue, ref Utf16ValueStringBuilder builder)
                where T : IEquatable<T>
            {
                string format = originalValue.Equals(resultValue)
                    ? "- {0}: {1} == {2}\n"
                    : "- {0}: {1} != {2}\n";
                builder.AppendFormat(format, stat, originalValue, resultValue);
            }

            builder.AppendLine("Guitar:");
            FormatStat("Overstrums", original.Overstrums, result.Overstrums, ref builder);
            FormatStat("Ghost inputs", original.GhostInputs, result.GhostInputs, ref builder);
            FormatStat("HOPOs strummed", original.HoposStrummed, result.HoposStrummed, ref builder);

            return original.Overstrums == result.Overstrums &&
                original.GhostInputs == result.GhostInputs &&
                original.HoposStrummed == result.HoposStrummed;
        }

        private static bool IsInstrumentPassResult(DrumsStats original, DrumsStats result, ref Utf16ValueStringBuilder builder)
        {
            void FormatStat<T>(string stat, T originalValue, T resultValue, ref Utf16ValueStringBuilder builder)
                where T : IEquatable<T>
            {
                string format = originalValue.Equals(resultValue)
                    ? "- {0}: {1} == {2}\n"
                    : "- {0}: {1} != {2}\n";
                builder.AppendFormat(format, stat, originalValue, resultValue);
            }

            builder.AppendLine("Drums:");
            FormatStat("Overhits", original.Overhits, result.Overhits, ref builder);
            FormatStat("Ghosts hit correctly", original.GhostsHit, result.GhostsHit, ref builder);
            FormatStat("Ghosts hit incorrectly",
                original.TotalGhosts - original.GhostsHit,
                result.TotalGhosts - result.GhostsHit, ref builder);
            FormatStat("Accents hit correctly", original.AccentsHit, result.AccentsHit, ref builder);
            FormatStat("Accents hit incorrectly",
                original.TotalAccents - original.AccentsHit,
                result.TotalAccents - result.AccentsHit, ref builder);
            FormatStat("Score from dynamics", original.DynamicsBonus, result.DynamicsBonus, ref builder);

            return original.Overhits == result.Overhits &&
                original.GhostsHit == result.GhostsHit &&
                original.TotalGhosts == result.TotalGhosts &&
                original.AccentsHit == result.AccentsHit &&
                original.TotalAccents == result.TotalAccents &&
                original.DynamicsBonus == result.DynamicsBonus;
        }

        private static bool IsInstrumentPassResult(VocalsStats original, VocalsStats result, ref Utf16ValueStringBuilder builder)
        {
            void FormatStat<T>(string stat, T originalValue, T resultValue, ref Utf16ValueStringBuilder builder)
                where T : IEquatable<T>
            {
                string format = originalValue.Equals(resultValue)
                    ? "- {0}: {1} == {2}\n"
                    : "- {0}: {1} != {2}\n";
                builder.AppendFormat(format, stat, originalValue, resultValue);
            }

            builder.AppendLine("Vocals:");
            FormatStat("Note ticks hit", original.TicksHit, result.TicksHit, ref builder);
            FormatStat("Note ticks missed", original.TicksMissed, result.TicksMissed, ref builder);

            return original.TicksHit == result.TicksHit &&
                original.TicksMissed == result.TicksMissed;
        }

        // private static bool IsInstrumentPassResult(ProGuitarStats original, ProGuitarStats result)
        // {
        //     using var builder = new Utf16ValueStringBuilder(true);

        //     void FormatStat<T>(string stat, T originalValue, T resultValue)
        //         where T : IEquatable<T>
        //     {
        //         string format = originalValue.Equals(resultValue)
        //             ? "- {0}: {1} == {2}\n"
        //             : "- {0}: {1} != {2}\n";
        //         builder.AppendFormat(format, stat, originalValue, resultValue);
        //     }

        //     builder.AppendLine("Pro Guitar:");
        //     FormatStat("Stat", original.Stat, result.Stat);

        //     return original.Stat == result.Stat;
        // }

        private static bool IsInstrumentPassResult(KeysStats original, KeysStats result, ref Utf16ValueStringBuilder builder)
        {
            void FormatStat<T>(string stat, T originalValue, T resultValue, ref Utf16ValueStringBuilder builder)
                where T : IEquatable<T>
            {
                string format = originalValue.Equals(resultValue)
                    ? "- {0}: {1} == {2}\n"
                    : "- {0}: {1} != {2}\n";
                builder.AppendFormat(format, stat, originalValue, resultValue);
            }

            builder.AppendLine("Guitar:");
            FormatStat("Overhits", original.Overhits, result.Overhits, ref builder);
            FormatStat("Fat fingers ignored", original.FatFingersIgnored, result.FatFingersIgnored, ref builder);

            return original.Overhits == result.Overhits &&
                original.FatFingersIgnored == result.FatFingersIgnored;
        }

    }
}
