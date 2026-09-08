using UnityEngine;
using UnityEngine.UI;
using YARG;
using YARG.Gameplay;
using System.Collections.Generic;

public class GepetoBossReaction : MonoBehaviour
{
    [Tooltip("Arraste o componente Image do robô aqui")]
    [SerializeField] private Image robotImage;

    [Tooltip("Sprite do robô de boa / neutro")]
    [SerializeField] private Sprite robotHappySprite;

    [Tooltip("Sprite do robô putasso no dano crítico")]
    [SerializeField] private Sprite robotAngrySprite;

    [Header("Configuração de Reação")]
    [Tooltip("Duração da expressão de raiva ao sofrer dano crítico.")]
    [Min(0.1f)]
    [SerializeField] private float angryCooldown = 2f;

    [Header("Barra de Vida da Corporação")]
    [SerializeField] private BossHealthBar bossHealthBar;

    private float angryTimer = 0f;
    private bool isAngry = false;
    private GameManager gameManager;
    private readonly List<ReactionController> reactionControllers = new List<ReactionController>();
    private readonly List<TrackAvatar> trackedAvatars = new List<TrackAvatar>();

    private void Awake()
    {
        if (robotImage == null)
        {
            robotImage = GetComponent<Image>();
        }

        if (bossHealthBar == null)
        {
            bossHealthBar = FindAnyObjectByType<BossHealthBar>();
        }
    }

    private void Start()
    {
        SetRobotState(false);
    }

    private void Update()
    {
        if (gameManager == null)
        {
            gameManager = FindAnyObjectByType<GameManager>();
            if (gameManager == null) return;
        }

        RefreshHitSubscriptions();

        // O robô SÓ fica puto se a pontuação atingir o patamar de dano crítico na barra
        if (bossHealthBar != null)
        {
            bool triggerCriticalReaction = bossHealthBar.ProcessScoreForCritical(gameManager.BandScore);
            if (triggerCriticalReaction)
            {
                TriggerAngryFace();
            }
        }

        // Controla o tempo da carinha de bravo voltando ao normal
        if (angryTimer > 0f)
        {
            angryTimer -= Time.deltaTime;
        }

        if (angryTimer <= 0f && isAngry)
        {
            SetRobotState(false);
        }
    }

    private void RefreshHitSubscriptions()
    {
        ReactionController[] reactions = FindObjectsByType<ReactionController>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        foreach (var reaction in reactions)
        {
            if (reaction == null || !reaction.isActiveAndEnabled || reactionControllers.Contains(reaction)) continue;

            reactionControllers.Add(reaction);
            reaction.NoteHit += OnNoteHit;
        }

        if (reactionControllers.Count > 0) return;

        TrackAvatar[] avatars = FindObjectsByType<TrackAvatar>(FindObjectsInactive.Include, FindObjectsSortMode.None);
        foreach (var avatar in avatars)
        {
            if (avatar == null || !avatar.isActiveAndEnabled || trackedAvatars.Contains(avatar)) continue;

            trackedAvatars.Add(avatar);
            avatar.NoteHit += OnNoteHit;
        }
    }

    private void OnNoteHit(int lane)
    {
        // Notas dão apenas dano minúsculo de fundo e NÃO mudam a expressão do robô
        bossHealthBar?.RegisterNoteHit();
    }

    private void OnDestroy()
    {
        foreach (var reaction in reactionControllers)
        {
            if (reaction != null) reaction.NoteHit -= OnNoteHit;
        }

        foreach (var avatar in trackedAvatars)
        {
            if (avatar != null) avatar.NoteHit -= OnNoteHit;
        }
    }

    private void TriggerAngryFace()
    {
        SetRobotState(true);
        angryTimer = angryCooldown;
    }

    private void SetRobotState(bool angry)
    {
        isAngry = angry;
        if (robotImage == null) return;

        if (angry && robotAngrySprite != null)
        {
            robotImage.sprite = robotAngrySprite;
        }
        else if (!angry && robotHappySprite != null)
        {
            robotImage.sprite = robotHappySprite;
        }
    }
}