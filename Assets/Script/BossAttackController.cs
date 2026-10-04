using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using YARG;
using YARG.Gameplay;
using YARG.Gameplay.Player;

/// <summary>Timed defense challenges use existing chart notes and never change hit timing.</summary>
public sealed class BossAttackController : MonoBehaviour
{
    [Min(0.1f)] [SerializeField] private float warningSeconds = 3f;
    [Min(0.1f)] [SerializeField] private float defenseSeconds = 5f;
    [Min(0f)] [SerializeField] private float penaltySeconds = 4f;
    [Range(0f, 0.6f)] [SerializeField] private float visualSpeedIncrease = 0.25f;
    [Min(0f)] [SerializeField] private float visualSpeedSeconds = 10f;
    [Range(0f, 1f)] [SerializeField] private float failedDamageMultiplier = 0.85f;
    [Range(0f, 1f)] [SerializeField] private float requiredHitRate = 0.7f;
    [Min(1)] [SerializeField] private int requiredStreak = 3;
    [Range(0f, 0.05f)] [SerializeField] private float healPerAttackFraction = 0.01f;
    [Range(0f, 0.02f)] [SerializeField] private float blockBonusFraction = 0.005f;
    [Range(0f, 0.1f)] [SerializeField] private float totalHealLimitFraction = 0.05f;
    [Min(1)] [SerializeField] private int maxAttacks = 4;

    private sealed class Defense
    {
        public int Hits, Misses, Streak, BestStreak;
        public double PenaltyUntil;
        public double SpeedUntil;
        public string Outcome;
    }
    private enum AttackState { Waiting, Warning, Defense, Result }
    private readonly Dictionary<TrackPlayer, Defense> defenses = new();
    private BossHealthBar health;
    private GepetoVisualAnimator bossAnimator;
    private GameManager manager;
    private AttackState state;
    private double deadline, nextAttack, lastTime = double.NaN;
    private int attackCount;
    private float healedTotal;
    private TextMeshProUGUI label;
    private GameObject labelObject;
    private readonly StringBuilder text = new();
    private bool replayWasSeeked;
    private float lastRecovery;
    private System.Action<TrackPlayer, float> grantBlockBonus;

    public void Initialize(BossHealthBar boss, System.Action<TrackPlayer, float> onBlockBonus)
    {
        health = boss;
        bossAnimator = FindAnyObjectByType<GepetoVisualAnimator>();
        grantBlockBonus = onBlockBonus;
    }

    public void Tick(GameManager game, List<TrackPlayer> players)
    {
        manager = game;
        if (health == null || manager == null) return;
        if (manager.IsSeekingReplay)
        {
            // Seeking cannot provide a complete defense window. Disable attacks for this replay.
            replayWasSeeked = true;
            CancelAttack();
            return;
        }
        if (health.IsDefeated || replayWasSeeked || manager.IsPractice || manager.SongTime >= manager.SongLength)
        {
            CancelAttack();
            return;
        }
        if (manager.Paused || manager.SongTime < 0d) return;
        foreach (var player in players)
            if (!defenses.ContainsKey(player)) defenses.Add(player, new Defense());
        double now = manager.SongTime;
        if (double.IsNaN(lastTime)) nextAttack = Mathf.Max(8f, (float)manager.SongLength * 0.15f);
        if (!double.IsNaN(lastTime) && now < lastTime - 0.1d)
        {
            CancelAttack();
            nextAttack = now + Interval();
        }
        lastTime = now;
        if (state == AttackState.Waiting && now >= nextAttack && attackCount < maxAttacks
            && now + warningSeconds + defenseSeconds + Mathf.Max(penaltySeconds, visualSpeedSeconds) < manager.SongLength)
        {
            state = AttackState.Warning;
            deadline = now + warningSeconds;
            attackCount++;
            foreach (var defense in defenses.Values)
            {
                defense.Hits = defense.Misses = defense.Streak = defense.BestStreak = 0;
                defense.Outcome = null;
            }
            EnsureLabel();
            bossAnimator?.TriggerPrepareAttack();
        }
        else if (state == AttackState.Warning && now >= deadline)
        {
            state = AttackState.Defense;
            bossAnimator?.TriggerAttack();
            deadline = now + defenseSeconds;
        }
        else if (state == AttackState.Defense && now >= deadline)
        {
            Resolve(now);
            state = AttackState.Result;
            deadline = now + Mathf.Max(penaltySeconds, visualSpeedSeconds);
            nextAttack = now + Interval();
        }
        else if (state == AttackState.Result && now >= deadline) state = AttackState.Waiting;
        UpdateLabel(now);
    }

    private double Interval() => Mathf.Max(12f, (float)manager.SongLength * (health.CurrentPhase == 2 ? 0.16f : 0.22f));

    public float DamageMultiplier(TrackPlayer player)
    {
        return manager != null && defenses.TryGetValue(player, out var defense)
            && manager.SongTime < defense.PenaltyUntil ? failedDamageMultiplier : 1f;
    }

    public void RegisterHit(TrackPlayer player)
    {
        if (state != AttackState.Defense || manager == null || manager.Paused
            || manager.SongTime >= deadline || !defenses.TryGetValue(player, out var defense)) return;
        defense.Hits++;
        defense.Streak++;
        defense.BestStreak = Mathf.Max(defense.BestStreak, defense.Streak);
    }

    public void RegisterMiss(TrackPlayer player)
    {
        if (state != AttackState.Defense || manager == null || manager.Paused
            || manager.SongTime >= deadline || !defenses.TryGetValue(player, out var defense)) return;
        defense.Misses++;
        defense.Streak = 0;
    }

    private void Resolve(double now)
    {
        float failedWeight = 0f;
        int totalNotes = 0;
        foreach (var player in defenses.Keys) totalNotes += player.BossEventCount;
        foreach (var entry in defenses)
        {
            var defense = entry.Value;
            int attempts = defense.Hits + defense.Misses;
            if (attempts == 0) { defense.Outcome = "Sem notas — isento"; continue; }
            bool blocked = defense.Hits >= Mathf.CeilToInt(attempts * requiredHitRate)
                && defense.BestStreak >= Mathf.Min(requiredStreak, attempts);
            if (blocked)
            {
                defense.Outcome = "BLOQUEOU!";
                entry.Key.ShowBossDefenseReaction();
                continue;
            }
            entry.Key.ShowBossFailureReaction();
            defense.PenaltyUntil = now + penaltySeconds;
            entry.Key.ApplyBossVisualSpeedBoost(visualSpeedIncrease, visualSpeedSeconds);
            defense.SpeedUntil = now + visualSpeedSeconds;
            defense.Outcome = $"Dano -{(1f - failedDamageMultiplier) * 100f:0}% ({penaltySeconds:0}s) · notas +{visualSpeedIncrease * 100f:0}% ({visualSpeedSeconds:0}s)";
            failedWeight += totalNotes > 0 ? (float)entry.Key.BossEventCount / totalNotes : 0f;
        }
        float budget = Mathf.Max(0f, health.MaxHealth * totalHealLimitFraction - healedTotal);
        float recovery = Mathf.Min(budget, health.MaxHealth * healPerAttackFraction * Mathf.Clamp01(failedWeight));
        lastRecovery = health.RecoverHealth(recovery);
        healedTotal += lastRecovery;
        bool anyBlocked = false;
        foreach (var entry in defenses)
        {
            if (entry.Value.Outcome != "BLOQUEOU!" || totalNotes <= 0) continue;
            anyBlocked = true;
            float share = (float)entry.Key.BossEventCount / totalNotes;
            grantBlockBonus?.Invoke(entry.Key, health.MaxHealth * blockBonusFraction * share);
        }
        if (anyBlocked && !health.IsDefeated) bossAnimator?.TriggerBlockedAttack();
    }

    private void EnsureLabel()
    {
        if (label != null) return;
        var animator = FindAnyObjectByType<GepetoVisualAnimator>();
        var portrait = animator != null ? animator.RobotImage : null;
        if (portrait == null) return;
        var canvas = portrait.GetComponentInParent<Canvas>();
        if (canvas == null) return;
        labelObject = new GameObject("Gepeto Attack Warning", typeof(RectTransform), typeof(Image));
        labelObject.layer = portrait.gameObject.layer;
        labelObject.transform.SetParent(canvas.rootCanvas.transform, false);
        var rect = (RectTransform)labelObject.transform;
        rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 1f);
        rect.pivot = new Vector2(0.5f, 1f);
        rect.anchoredPosition = new Vector2(0f, -30f);
        rect.sizeDelta = new Vector2(Mathf.Min(960f, ((RectTransform)canvas.rootCanvas.transform).rect.width - 40f), 190f);
        var background = labelObject.GetComponent<Image>();
        background.color = new Color(0.025f, 0.035f, 0.07f, 0.9f);
        background.raycastTarget = false;
        var textObject = new GameObject("Attack Message", typeof(RectTransform), typeof(TextMeshProUGUI));
        textObject.layer = portrait.gameObject.layer;
        textObject.transform.SetParent(rect, false);
        label = textObject.GetComponent<TextMeshProUGUI>();
        label.rectTransform.anchorMin = Vector2.zero;
        label.rectTransform.anchorMax = Vector2.one;
        label.rectTransform.offsetMin = new Vector2(20f, 10f);
        label.rectTransform.offsetMax = new Vector2(-20f, -10f);
        var bossUI = health.GetComponent<BossUIController>();
        if (bossUI != null && bossUI.AttackNotificationFont != null) label.font = bossUI.AttackNotificationFont;
        label.fontSize = 26f;
        label.enableAutoSizing = true;
        label.fontSizeMin = 18f;
        label.fontSizeMax = 26f;
        label.alignment = TextAlignmentOptions.Center;
        label.richText = true;
        label.raycastTarget = false;
        labelObject.SetActive(false);
    }

    private void UpdateLabel(double now)
    {
        if (label == null) return;
        labelObject.SetActive(state != AttackState.Waiting);
        if (state == AttackState.Waiting) { label.text = ""; return; }
        text.Clear();
        int seconds = Mathf.CeilToInt((float)(deadline - now));
        label.color = state == AttackState.Warning ? new Color(1f, 0.7f, 0.25f) : new Color(0.35f, 1f, 0.9f);
        if (state == AttackState.Warning) text.Append($"<b><size=135%>GEPETO ATACA EM {seconds}s!</size></b>\n"
            + $"Faça {requiredStreak} acertos seguidos e acerte pelo menos {requiredHitRate * 100f:0}% na defesa.\n"
            + $"<b>Se falhar: notas {visualSpeedIncrease * 100f:0}% mais rápidas por {visualSpeedSeconds:0}s!</b>");
        else
        {
            bool accelerated = false;
            foreach (var defense in defenses.Values) accelerated |= now < defense.SpeedUntil;
            label.color = state == AttackState.Result && accelerated ? new Color(1f, 0.45f, 0.3f) : label.color;
            text.Append(state == AttackState.Defense ? $"<b><size=135%>BLOQUEIE O ATAQUE! {seconds}s</size></b>\n"
                : accelerated ? $"<b><size=135%>NOTAS +{visualSpeedIncrease * 100f:0}% · {seconds}s</size></b>\n"
                : "<b><size=135%>DEFESA ENCERRADA</size></b>\n");
            if (state == AttackState.Result && lastRecovery > 0f)
                text.Append($"<size=80%>Gepeto recuperou {lastRecovery:0.#} de vida.</size>\n");
            foreach (var entry in defenses)
            {
                string name = entry.Key.Player.Profile.Name;
                text.Append("<size=80%><noparse>").Append(name).Append("</noparse>: ");
                if (state == AttackState.Defense)
                {
                    int attempts = entry.Value.Hits + entry.Value.Misses;
                    float hitRate = attempts > 0 ? 100f * entry.Value.Hits / attempts : 0f;
                    text.Append($"sequência {Mathf.Min(entry.Value.BestStreak, requiredStreak)}/{requiredStreak} · {hitRate:0}%");
                }
                else if (now < entry.Value.SpeedUntil)
                {
                    text.Append($"Notas aceleradas: {Mathf.CeilToInt((float)(entry.Value.SpeedUntil - now))}s");
                    if (now < entry.Value.PenaltyUntil)
                        text.Append($" · dano reduzido: {Mathf.CeilToInt((float)(entry.Value.PenaltyUntil - now))}s");
                }
                else text.Append(entry.Value.Outcome);
                text.AppendLine("</size>");
            }
        }
        label.text = text.ToString();
    }

    private void CancelAttack()
    {
        if (state != AttackState.Waiting) bossAnimator?.EndAttackSequence();
        state = AttackState.Waiting;
        foreach (var entry in defenses)
        {
            entry.Value.PenaltyUntil = 0d;
            entry.Value.SpeedUntil = 0d;
            if (entry.Key != null) entry.Key.ClearBossVisualSpeedBoost();
        }
        if (label != null) label.text = "";
        if (labelObject != null) labelObject.SetActive(false);
    }

    private void OnDisable() => CancelAttack();
    private void OnDestroy() { if (labelObject != null) Destroy(labelObject); }
}
