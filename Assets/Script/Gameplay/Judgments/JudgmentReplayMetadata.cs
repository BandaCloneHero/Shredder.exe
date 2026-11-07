using System;
using System.IO;
using Newtonsoft.Json;
using YARG.Core.Logging;
using YARG.Core.Replays;

namespace YARG.Gameplay.Judgments
{
    // Companion to the unchanged Core replay format. Legacy replays keep their original scoring.
    public sealed class JudgmentReplayMetadata
    {
        public const string Extension = ".judgments.json";
        public int Version = 1;
        public string ReplayChecksum;
        public Guid[] Players;
        public RhythmJudgmentSettings[] Policies;

        public RhythmJudgmentSettings GetPolicy(int frame) => Policies != null && frame >= 0 && frame < Policies.Length
            ? Policies[frame]?.Copy() : null;

        public void Save(ReplayInfo replay)
        {
            ReplayChecksum = replay.ReplayChecksum.ToString();
            File.WriteAllText(replay.FilePath + Extension, JsonConvert.SerializeObject(this, Formatting.Indented));
        }

        public static JudgmentReplayMetadata Load(ReplayInfo replay, ReplayData data)
        {
            string path = replay.FilePath + Extension;
            if (!File.Exists(path)) return null;
            try
            {
                var metadata = JsonConvert.DeserializeObject<JudgmentReplayMetadata>(File.ReadAllText(path));
                if (metadata == null || metadata.Version != 1 || metadata.ReplayChecksum != replay.ReplayChecksum.ToString() ||
                    metadata.Players == null || metadata.Policies == null || metadata.Players.Length != data.Frames.Length ||
                    metadata.Policies.Length != data.Frames.Length)
                    throw new InvalidDataException("Metadados de julgamento incompatíveis com o replay.");
                for (int i = 0; i < data.Frames.Length; i++)
                {
                    if (metadata.Players[i] != data.Frames[i].Profile.Id)
                        throw new InvalidDataException("Jogador de julgamento incompatível com o replay.");
                    metadata.Policies[i]?.Validate();
                }
                return metadata;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException || exception is JsonException)
            {
                YargLogger.LogException(exception, "Não foi possível carregar os julgamentos do replay; usando as regras legadas.");
                return null;
            }
        }

        public static void CopyCompanion(string source, string destination)
        {
            if (File.Exists(source + Extension)) File.Copy(source + Extension, destination + Extension, true);
        }
    }
}
