using YARG.Core.Game;
using YARG.Core.Replays;
using YARG.Core.Song;
using YARG.Gameplay.Judgments;

internal static class ReplayJudgmentChecks
{
    public static void Run(Action<bool, string> check)
    {
        string directory = Path.Combine(Path.GetTempPath(), "shredder-judgments-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            foreach (string mode in new[] { "AllTaps", "BassAllTaps", "FiveLaneKeys", "ProKeys", "FourLaneDrums", "ProDrums", "FiveLaneDrums" })
            foreach (bool weighted in new[] { true, false })
            {
                var scenario = EarlyHitChecks.Create(mode, -.05, new RhythmJudgmentSettings(), weighted);
                WeightedJudgmentChecks.Simulate(scenario.Engine, scenario.Inputs, 144);
                var frame = new ReplayFrame(scenario.Profile, scenario.Engine.BaseParameters, scenario.Engine.BaseStats, scenario.Inputs.ToArray());
                var data = new ReplayData(new(), new(), new[] { frame }, Array.Empty<double>());
                var checksum = HashWrapper.Hash(data.Serialize());
                var info = new ReplayInfo(Path.Combine(directory, mode + weighted + ".replay"), mode, 12, 1,
                    checksum, "test", "test", "test", default, DateTime.UtcNow, 1, 4,
                    scenario.Engine.BaseStats.TotalScore, StarAmount.None, Array.Empty<PauseInfo>(), Array.Empty<ReplayStats>());
                var metadata = new JudgmentReplayMetadata { Players = new[] { scenario.Profile.Id },
                    Policies = new[] { weighted ? scenario.Session.Policy.Copy() : null } };
                metadata.Save(info);
                var loaded = JudgmentReplayMetadata.Load(info, data);
                check(loaded != null && (loaded.GetPolicy(0) != null) == weighted, "Persisted scoring policy for " + mode + weighted);
                var results = JudgmentReplayAnalyzer.AnalyzeReplay(scenario.Song, info, data, loaded);
                check(results.Length == 1 && results[0].Passed && results[0].ScoreDifference == 0,
                    "Replay reproduces weighted/legacy score: " + mode + weighted + "\n" + results[0].StatLog);
                string export = Path.Combine(directory, "export.replay");
                JudgmentReplayMetadata.CopyCompanion(info.FilePath, export);
                check(File.ReadAllText(export + JudgmentReplayMetadata.Extension) == File.ReadAllText(info.FilePath + JudgmentReplayMetadata.Extension),
                    "Export copies matching judgment policy");
                if (weighted)
                {
                    var policy = loaded.GetPolicy(0);
                    policy.GreatScoreMultiplier = .1f;
                    check(Math.Abs(loaded.GetPolicy(0).GreatScoreMultiplier - .8f) < 1e-6, "Replay policy is detached from caller edits");
                }
                else
                {
                    // No companion is also a normal, supported historical replay.
                    File.Delete(info.FilePath + JudgmentReplayMetadata.Extension);
                    check(JudgmentReplayMetadata.Load(info, data) == null, "Old replay has no invented judgment policy");
                    var legacy = JudgmentReplayAnalyzer.AnalyzeReplay(scenario.Song, info, data, null);
                    check(legacy[0].Passed, "Legacy replay still uses Core analysis: " + mode);
                }
            }
        }
        finally { Directory.Delete(directory, true); }
    }
}
