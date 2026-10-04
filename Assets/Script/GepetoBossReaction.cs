using System.Collections.Generic;
using UnityEngine;
using YARG;
using YARG.Gameplay;
using YARG.Gameplay.Player;
using YARG.Menu.ScoreScreen;

public class GepetoBossReaction : MonoBehaviour
{
    [SerializeField] private BossHealthBar bossHealthBar;

    private readonly List<TrackPlayer> subscribedPlayers = new();
    private readonly Dictionary<TrackPlayer, System.Action<double, double>> hitHandlers = new();
    private readonly Dictionary<TrackPlayer, float> playerDamage = new();
    private readonly Dictionary<TrackPlayer, System.Action> missHandlers = new();
    private BossAttackController attackController;
    private GameManager gameManager;
    private GepetoVisualAnimator visualAnimator;

    private void Awake()
    {
        if (bossHealthBar == null)
            bossHealthBar = FindAnyObjectByType<BossHealthBar>();
        visualAnimator = FindAnyObjectByType<GepetoVisualAnimator>();
        attackController = gameObject.AddComponent<BossAttackController>();
        attackController.Initialize(bossHealthBar, ApplyAttackBonus);
    }

    private void Update()
    {
        if (gameManager == null)
            gameManager = FindAnyObjectByType<GameManager>();
        if (gameManager == null || bossHealthBar == null)
            return;

        var players = gameManager.Players;
        if (players == null)
            return;

        int totalNotes = 0;
        foreach (var player in players)
        {
            if (player is not TrackPlayer trackPlayer)
                continue;

            totalNotes += trackPlayer.BossEventCount;
            if (subscribedPlayers.Contains(trackPlayer))
                continue;

            subscribedPlayers.Add(trackPlayer);
            System.Action<double, double> handler = (noteTime, hitTime) => OnNoteHit(trackPlayer, noteTime, hitTime);
            hitHandlers.Add(trackPlayer, handler);
            playerDamage.Add(trackPlayer, 0f);
            trackPlayer.BossNoteHit += handler;
            System.Action missHandler = () => OnNoteMissed(trackPlayer);
            missHandlers.Add(trackPlayer, missHandler);
            trackPlayer.BossNoteMissed += missHandler;
        }

        bossHealthBar.SetExpectedNoteCount(totalNotes);
        attackController.Tick(gameManager, subscribedPlayers);
    }

    private void OnNoteHit(TrackPlayer player, double noteTime, double hitTime)
    {
        if (gameManager != null && gameManager.IsSeekingReplay)
            return;

        if (bossHealthBar == null) return;
        float healthBefore = bossHealthBar.CurrentHealth;
        attackController.RegisterHit(player);
        bossHealthBar.RegisterNoteHit(noteTime, hitTime, attackController.DamageMultiplier(player));
        playerDamage[player] += Mathf.Max(0f, healthBefore - bossHealthBar.CurrentHealth);
    }

    private void ApplyAttackBonus(TrackPlayer player, float amount)
    {
        if (bossHealthBar == null) return;
        float healthBefore = bossHealthBar.CurrentHealth;
        bossHealthBar.TakeDamage(amount);
        playerDamage[player] += Mathf.Max(0f, healthBefore - bossHealthBar.CurrentHealth);
    }

    private void OnNoteMissed(TrackPlayer player)
    {
        if (gameManager != null && gameManager.IsSeekingReplay)
            return;

        attackController.RegisterMiss(player);
        bossHealthBar?.RegisterNoteMiss();
        visualAnimator?.TriggerMissFeedback();
    }

    private void OnDestroy()
    {
        foreach (var player in subscribedPlayers)
        {
            if (player == null) continue;
            if (hitHandlers.TryGetValue(player, out var handler))
                player.BossNoteHit -= handler;
            if (missHandlers.TryGetValue(player, out var missHandler))
                player.BossNoteMissed -= missHandler;
        }
    }

    public BossBattleResult CaptureResult()
    {
        if (bossHealthBar == null) return null;
        var contributions = new List<BossPlayerContribution>();
        foreach (var player in subscribedPlayers)
        {
            if (player == null) continue;
            contributions.Add(new BossPlayerContribution
            {
                Player = player.Player,
                Damage = playerDamage[player]
            });
        }
        return new BossBattleResult
        {
            BossName = "Gepeto",
            Defeated = bossHealthBar.IsDefeated,
            RemainingHealth = bossHealthBar.CurrentHealth,
            MaxHealth = bossHealthBar.MaxHealth,
            Players = contributions.ToArray()
        };
    }
}
