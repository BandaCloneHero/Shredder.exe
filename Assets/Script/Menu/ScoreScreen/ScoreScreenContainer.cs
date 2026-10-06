using YARG.Core.Engine;
using YARG.Core.Replays;
using YARG.Player;
using YARG.Replays;

namespace YARG.Menu.ScoreScreen
{
    public struct PlayerScoreCard
    {
        public bool  IsHighScore;
        public float AverageMultiplier;

        public YargPlayer Player;
        public BaseStats  Stats;
        public float FinalEnergy;
    }

    public struct ScoreScreenStats
    {
        public BossBattleResult BossBattle;
        public PlayerScoreCard[] PlayerScores;

        public int BandStars;
        public int BandScore;
        public bool WasPaused;
        public bool IsLiveGame;
        public string ReportId;

#nullable enable
        public ReplayInfo? ReplayInfo;
#nullable disable
    }

    public sealed class BossBattleResult
    {
        public string BossName;
        public bool Defeated;
        public float RemainingHealth;
        public float MaxHealth;
        public BossPlayerContribution[] Players;
    }

    public struct BossPlayerContribution
    {
        public YargPlayer Player;
        public float Damage;
    }
}
