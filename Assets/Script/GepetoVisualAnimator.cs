using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;
using System.Collections;
using YARG;
using YARG.Gameplay;

public class GepetoVisualAnimator : MonoBehaviour
{
    [Header("Referências")]
    [SerializeField] private Image robotImage;
    [SerializeField] private BossHealthBar bossHealthBar;

    [Header("Folha de sprites do Gepeto")]
    [Tooltip("Quadros importados: folha original e, em seguida, os novos idles azul e vermelho. Os intervalos de idle são configurados abaixo.")]
    [SerializeField] private List<Sprite> allSprites = new List<Sprite>();
    [SerializeField] private Texture2D robotSpriteSheet;
    [SerializeField] private int spriteSheetColumns = 8;
    [SerializeField] private int spriteSheetRows = 4;
    [SerializeField] private float spritePixelsPerUnit = 100f;
    [Min(0)] [SerializeField] private int spriteFrameInset = 24;

    [Header("Velocidade da Animação (FPS)")]
    [SerializeField] private float animSpeed = 15f; // Aumente aqui se quiser mais rápido
    [Header("Idle com quadros de movimento")]
    [Min(0.1f)] [SerializeField] private float idleAnimSpeed = 8f;
    [SerializeField] private int normalIdleStart = 0;
    [SerializeField] private int normalIdleEnd = 7;
    [SerializeField] private int phase2IdleStart = 20;
    [SerializeField] private int phase2IdleEnd = 23;

    [Header("Pausa entre reações de dano")]
    [Tooltip("Tempo em segundos de idle após uma reação, antes de permitir outro hit visual. Não limita o dano das notas.")]
    [Min(0f)] [SerializeField] private float hitReactionRestDuration = 2f;

    [Header("Feedback de erro")]
    [Min(0f)] [SerializeField] private float missFeedbackRestDuration = 2f;

    [Header("Derrota")]
    [SerializeField] private List<Sprite> deathSprites = new List<Sprite>();
    [Min(0.1f)] [SerializeField] private float deathAnimSpeed = 16f;
    [Min(0f)] [SerializeField] private float deathFinalFrameHoldDuration = 1.5f;
    [Min(0f)] [SerializeField] private float deathFadeDuration = 0.6f;
    private bool isDying;

    [Header("Feedback musical — apenas no personagem")]
    [SerializeField] private bool musicalFeedbackEnabled = true;
    [Range(0f, 0.05f)] [SerializeField] private float beatScaleAmount = 0.018f;
    [Range(0f, 8f)] [SerializeField] private float beatMovementPixels = 3f;
    [Range(0f, 2f)] [SerializeField] private float beatTiltDegrees = 0.65f;
    [Min(0.1f)] [SerializeField] private float transformationEffectDuration = 1.2f;
    [Range(0f, 0.15f)] [SerializeField] private float transformationScaleAmount = 0.08f;
    [SerializeField] private Color normalGlowColor = new Color(0.15f, 0.9f, 1f, 0.45f);
    [SerializeField] private Color phase2GlowColor = new Color(1f, 0.12f, 0.3f, 0.55f);
    private GameManager musicalGameManager;
    private RectTransform musicalRect;
    private Vector3 restingScale;
    private Vector3 restingPosition;
    private Quaternion restingRotation;
    private Outline musicalOutline;
    private float transformationEffectRemaining;

    private int currentAnimationStart = 0;
    private int currentAnimationEnd = 7;
    private float timer = 0f;
    private int currentIndex = 0;
    private bool isTransitioning = false;
    private bool isPlayingHitAnimation;
    private float hitReactionRestRemaining;
    private Coroutine missFeedbackRoutine;
    private float nextMissFeedbackTime;
    private Color originalImageColor = Color.white;
    private readonly List<Sprite> generatedSprites = new List<Sprite>();

    private void Start()
    {
        if (robotImage == null) robotImage = GetComponent<Image>();
        if (bossHealthBar == null) bossHealthBar = GetComponent<BossHealthBar>();
        if (robotImage != null) originalImageColor = robotImage.color;
        if (robotImage != null)
        {
            musicalRect = robotImage.rectTransform;
            restingScale = musicalRect.localScale;
            restingPosition = musicalRect.anchoredPosition3D;
            restingRotation = musicalRect.localRotation;
            musicalOutline = robotImage.gameObject.AddComponent<Outline>();
            musicalOutline.useGraphicAlpha = true;
            musicalOutline.enabled = false;
        }

        if (allSprites.Count == 0 && robotSpriteSheet != null)
            BuildSpritesFromSheet();

        SetAnimationRange(normalIdleStart, normalIdleEnd, true);
    }

    private void Update()
    {
        if (musicalGameManager != null && (musicalGameManager.Paused || musicalGameManager.IsSeekingReplay)) return;
        if (isDying || allSprites.Count == 0 || bossHealthBar == null) return;

        hitReactionRestRemaining = Mathf.Max(0f, hitReactionRestRemaining - Time.deltaTime);
        float frameDuration = isTransitioning
            ? 1f / Mathf.Max(0.1f, animSpeed)
            : 1f / Mathf.Max(0.1f, idleAnimSpeed);
        timer += Time.deltaTime;
        while (timer >= frameDuration)
        {
            timer -= frameDuration;
            currentIndex++;

            if (currentIndex > currentAnimationEnd)
            {
                if (isTransitioning)
                {
                    float hpPercent = bossHealthBar.MaxHealth > 0f 
                        ? bossHealthBar.CurrentHealth / bossHealthBar.MaxHealth : 1f;
                    
                    if (hpPercent <= 0.5f)
                    {
                        SetAnimationRange(phase2IdleStart, phase2IdleEnd, true);
                    }
                    else
                    {
                        SetAnimationRange(normalIdleStart, normalIdleEnd, true);
                    }
                    isTransitioning = false;
                    isPlayingHitAnimation = false;
                    hitReactionRestRemaining = Mathf.Max(0f, hitReactionRestDuration);
                }
                else
                {
                    currentIndex = currentAnimationStart; // Loop normal
                }
            }

            if (currentIndex < allSprites.Count && robotImage != null)
            {
                robotImage.sprite = allSprites[currentIndex];
            }
        }
    }

    private void LateUpdate()
    {
        if (musicalRect == null) return;
        if (!musicalFeedbackEnabled || isDying)
        {
            RestoreMusicalPose();
            return;
        }
        if (musicalGameManager == null)
            musicalGameManager = FindAnyObjectByType<GameManager>();
        if (musicalGameManager == null || musicalGameManager.BeatEventHandler == null) return;
        if (musicalGameManager.IsSeekingReplay || musicalGameManager.SongTime < 0d
            || musicalGameManager.SongTime >= musicalGameManager.SongLength)
        {
            transformationEffectRemaining = 0f;
            RestoreMusicalPose();
            return;
        }
        if (musicalGameManager.Paused) return;

        // Audio progress follows the audible music; no free-running timer or BPM estimate.
        float progress = Mathf.Clamp01((float)musicalGameManager.BeatEventHandler.Audio.StrongBeat.CurrentPercentage);
        float pulse = Mathf.Pow(1f - progress, 4f);
        bool phase2 = bossHealthBar != null && bossHealthBar.CurrentPhase == 2;
        float intensity = phase2 ? 1.25f : 1f;
        float burst = transformationEffectRemaining > 0f
            ? Mathf.Sin(Mathf.PI * (1f - transformationEffectRemaining / Mathf.Max(0.1f, transformationEffectDuration)))
            : 0f;
        transformationEffectRemaining = Mathf.Max(0f, transformationEffectRemaining - Time.deltaTime);
        musicalRect.localScale = restingScale * (1f + pulse * beatScaleAmount * intensity + burst * transformationScaleAmount);
        musicalRect.anchoredPosition3D = restingPosition + Vector3.up * (pulse * beatMovementPixels * intensity);
        musicalRect.localRotation = restingRotation * Quaternion.Euler(0f, 0f,
            Mathf.Sin(progress * Mathf.PI * 2f) * beatTiltDegrees * intensity);
        if (musicalOutline != null)
        {
            musicalOutline.enabled = true;
            Color glow = phase2 ? phase2GlowColor : normalGlowColor;
            glow.a *= Mathf.Clamp01(0.25f + pulse * 0.55f + burst * 0.75f);
            musicalOutline.effectColor = glow;
            float width = 1f + pulse + burst * 4f;
            musicalOutline.effectDistance = new Vector2(width, -width);
        }
    }

    private void RestoreMusicalPose()
    {
        if (musicalRect != null)
        {
            musicalRect.localScale = restingScale;
            musicalRect.anchoredPosition3D = restingPosition;
            musicalRect.localRotation = restingRotation;
        }
        if (musicalOutline != null) musicalOutline.enabled = false;
    }

    public void SetAnimationRange(int start, int end, bool loop)
    {
        if (isDying) return;
        currentAnimationStart = start;
        currentAnimationEnd = end;
        currentIndex = start;
        timer = 0f;
        isTransitioning = !loop;
        if (robotImage != null && currentIndex >= 0 && currentIndex < allSprites.Count)
            robotImage.sprite = allSprites[currentIndex];
    }

    private void OnDisable()
    {
        transformationEffectRemaining = 0f;
        RestoreMusicalPose();
        if (missFeedbackRoutine != null)
        {
            StopCoroutine(missFeedbackRoutine);
            missFeedbackRoutine = null;
            if (robotImage != null) robotImage.color = originalImageColor;
        }
        nextMissFeedbackTime = 0f;
    }

    private void BuildSpritesFromSheet()
    {
        if (spriteSheetColumns <= 0 || spriteSheetRows <= 0
            || robotSpriteSheet.width % spriteSheetColumns != 0
            || robotSpriteSheet.height % spriteSheetRows != 0)
        {
            Debug.LogError("A folha de sprites do Gepeto precisa ser divisível pela grade configurada.", this);
            return;
        }

        allSprites = new List<Sprite>();
        int frameWidth = robotSpriteSheet.width / spriteSheetColumns;
        int frameHeight = robotSpriteSheet.height / spriteSheetRows;
        if (spriteFrameInset < 0 || spriteFrameInset * 2 >= Mathf.Min(frameWidth, frameHeight))
        {
            Debug.LogError("A margem de recorte do Gepeto é maior que o quadro.", this);
            return;
        }
        for (int row = 0; row < spriteSheetRows; row++)
        {
            for (int column = 0; column < spriteSheetColumns; column++)
            {
                var rect = new Rect(
                    column * frameWidth + spriteFrameInset,
                    robotSpriteSheet.height - (row + 1) * frameHeight + spriteFrameInset,
                    frameWidth - spriteFrameInset * 2,
                    frameHeight - spriteFrameInset * 2);
                var sprite = Sprite.Create(robotSpriteSheet, rect, new Vector2(0.5f, 0.5f), spritePixelsPerUnit);
                allSprites.Add(sprite);
                generatedSprites.Add(sprite);
            }
        }
    }

    public void TriggerHitAnimation()
    {
        if (isDying || isTransitioning || isPlayingHitAnimation || hitReactionRestRemaining > 0f) return;

        // A quarta linha contém a reação furiosa da forma vermelha.
        int hitStart = bossHealthBar != null && bossHealthBar.CurrentPhase == 2 ? 24 : 8;
        SetAnimationRange(hitStart, hitStart + 7, false);
        isTransitioning = true;
        isPlayingHitAnimation = true;
    }

    // Chamado quando a vida cruza a metade.
    public void TriggerPhase2Transformation()
    {
        if (isDying) return;
        transformationEffectRemaining = Mathf.Max(0.1f, transformationEffectDuration);
        SetAnimationRange(16, 23, false);
        isTransitioning = true;
        isPlayingHitAnimation = false;
    }

    public void TriggerMissFeedback()
    {
        if (isDying || !isActiveAndEnabled || robotImage == null || isTransitioning
            || missFeedbackRoutine != null || Time.unscaledTime < nextMissFeedbackTime) return;
        nextMissFeedbackTime = Time.unscaledTime + 0.18f + Mathf.Max(0f, missFeedbackRestDuration);
        missFeedbackRoutine = StartCoroutine(MissFeedbackRoutine());
    }

    private IEnumerator MissFeedbackRoutine()
    {
        robotImage.color = new Color(1f, 0.35f, 0.35f, originalImageColor.a);
        yield return new WaitForSecondsRealtime(0.18f);
        if (robotImage != null)
            robotImage.color = originalImageColor;
        missFeedbackRoutine = null;
    }

    public void TriggerDeathAnimation()
    {
        if (isDying) return;
        isDying = true;
        transformationEffectRemaining = 0f;
        RestoreMusicalPose();
        if (missFeedbackRoutine != null)
        {
            StopCoroutine(missFeedbackRoutine);
            missFeedbackRoutine = null;
        }
        if (robotImage != null) robotImage.color = originalImageColor;
        StartCoroutine(DeathRoutine());
    }

    private IEnumerator DeathRoutine()
    {
        // Uses gameplay time so pausing also pauses the defeat sequence.
        var frameWait = new WaitForSeconds(1f / Mathf.Max(0.1f, deathAnimSpeed));
        for (int frame = 0; frame < deathSprites.Count; frame++)
        {
            if (robotImage != null && deathSprites[frame] != null)
                robotImage.sprite = deathSprites[frame];
            yield return frameWait;
        }
        if (robotImage != null && deathSprites.Count > 0)
        {
            robotImage.sprite = deathSprites[deathSprites.Count - 1];
            yield return new WaitForSeconds(Mathf.Max(0f, deathFinalFrameHoldDuration));
        }

        float elapsed = 0f;
        while (elapsed < deathFadeDuration)
        {
            if (robotImage != null)
            {
                Color color = originalImageColor;
                color.a *= 1f - Mathf.Clamp01(elapsed / deathFadeDuration);
                robotImage.color = color;
            }
            yield return null;
            elapsed += Time.deltaTime;
        }
        if (robotImage != null) robotImage.enabled = false;
        // Hide only boss visuals; never stop the song or deactivate gameplay.
        bossHealthBar?.HideDefeatedHealthBar();
    }

    private void OnDestroy()
    {
        if (musicalOutline != null) Destroy(musicalOutline);
        foreach (var sprite in generatedSprites)
        {
            if (sprite != null)
                Destroy(sprite);
        }
    }
}
