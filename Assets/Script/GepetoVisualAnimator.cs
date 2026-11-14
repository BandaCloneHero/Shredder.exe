using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;
using System.Collections;
using YARG;
using YARG.Gameplay;
using TMPro;

public class GepetoVisualAnimator : MonoBehaviour
{
    [SerializeField] private CharacterSpriteSizing[] spriteSizing = System.Array.Empty<CharacterSpriteSizing>();
    public Image RobotImage => robotImage;
    [Header("Ações de combate — folhas separadas")]
    [SerializeField] private Sprite[] prepareBlueFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] prepareRedFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] holdBlueFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] holdRedFrames = System.Array.Empty<Sprite>();
    [Min(0.1f)] [SerializeField] private float holdFramesPerSecond = 12f;
    [SerializeField] private Sprite[] attackBlueFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] attackRedFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] blockedBlueFrames = System.Array.Empty<Sprite>();
    [SerializeField] private Sprite[] blockedRedFrames = System.Array.Empty<Sprite>();
    [Min(0.1f)] [SerializeField] private float combatFramesPerSecond = 16f;
    private Sprite[] combatFrames;
    private bool combatLoop;
    private bool holdingOrb;
    private int combatIndex;
    private int combatHoldFrame = -1;
    private float combatTimer;
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

    [Header("Layout responsivo do personagem")]
    [SerializeField] private bool responsiveLayout = true;
    private RectTransform layoutCanvas;
    private TMP_Text[] layoutTexts = System.Array.Empty<TMP_Text>();
    private int layoutPlayerCount = -1;
    private float nextLayoutRefresh;
    private float layoutDiscoveryUntil;
    private readonly Vector3[] layoutCorners = new Vector3[4];
    private readonly List<GepetoHudLayout.Area> protectedHudAreas = new();

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
        ConfigurePersona();
        if (robotImage != null) originalImageColor = robotImage.color;
        if (robotImage != null)
        {
            robotImage.raycastTarget = false;
            robotImage.enabled = true;
            robotImage.preserveAspect = true;
            musicalRect = robotImage.rectTransform;
            var canvas = robotImage.GetComponentInParent<Canvas>();
            layoutCanvas = canvas != null ? canvas.rootCanvas.transform as RectTransform : null;
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

    [Header("Transição entre as formas")]
    [Min(0.1f)] [SerializeField] private float phaseTransformationSeconds = 1.6f;
    private readonly BossTransformationPlayback transformation = new BossTransformationPlayback();
    private float activeTransformationEffectDuration = 1.2f;
    private bool usesPersonaSheet;

    private void ConfigurePersona()
    {
        bool originalGepeto = BossRoster.Selected == BossRoster.Identity.Gepeto;
        var sheet = BossSpriteAtlas.Load();
        // Existing scenes can still use their serialized Gepeto sheets as a fallback.
        if (originalGepeto && sheet == null) return;
        bool twins = BossRoster.Selected == BossRoster.Identity.Geminias;
        spriteSizing = System.Array.Empty<CharacterSpriteSizing>();
        normalGlowColor = BossRoster.Accent;
        phase2GlowColor = originalGepeto ? new Color(1f, .12f, .2f, .55f)
            : twins ? new Color(.8f, .35f, 1f, .55f) : new Color(1f, .8f, .4f, .55f);
        if (sheet != null)
        {
            usesPersonaSheet = true;
            allSprites = new List<Sprite>();
            // Rows 0..4: idle, hurt, transformation, ascended idle, ascended hurt.
            for (int row = 0; row < 5; row++) allSprites.AddRange(SheetRow(sheet, row));
            normalIdleStart = 0; normalIdleEnd = 7;
            phase2IdleStart = 24; phase2IdleEnd = 31;
            prepareBlueFrames = SheetRow(sheet, 5);
            attackBlueFrames = SheetRow(sheet, 6);
            blockedBlueFrames = SheetRow(sheet, 7);
            prepareRedFrames = SheetRow(sheet, 8);
            attackRedFrames = SheetRow(sheet, 9);
            blockedRedFrames = SheetRow(sheet, 10);
            // Hold only the charged poses; never replay the charging sequence.
            holdBlueFrames = new[] { prepareBlueFrames[6], prepareBlueFrames[7] };
            holdRedFrames = new[] { prepareRedFrames[6], prepareRedFrames[7] };
            deathSprites = new List<Sprite>(SheetRow(sheet, 11));
            return;
        }
        allSprites = new List<Sprite>();
        for (int i = 0; i < 32; i++)
        {
            var frame = BossPersonaArt.Frame(twins, i >= 16, (i % 8) / 7f, 0);
            allSprites.Add(frame); generatedSprites.Add(frame);
        }
        normalIdleStart = 0; normalIdleEnd = 7;
        phase2IdleStart = 16; phase2IdleEnd = 23;
        prepareBlueFrames = PersonaFrames(twins, false, 1);
        prepareRedFrames = PersonaFrames(twins, true, 1);
        holdBlueFrames = prepareBlueFrames; holdRedFrames = prepareRedFrames;
        attackBlueFrames = PersonaFrames(twins, false, 2);
        attackRedFrames = PersonaFrames(twins, true, 2);
        blockedBlueFrames = PersonaFrames(twins, false, 3);
        blockedRedFrames = PersonaFrames(twins, true, 3);
        deathSprites = new List<Sprite>(PersonaFrames(twins, true, 4));
    }

    private Sprite[] SheetRow(Texture2D texture, int row)
    {
        var frames = BossSpriteAtlas.Row(texture, row);
        generatedSprites.AddRange(frames);
        return frames;
    }

    private Sprite[] PersonaFrames(bool twins, bool phase, int action)
    {
        var frames = new Sprite[12];
        for (int i = 0; i < frames.Length; i++)
        {
            frames[i] = BossPersonaArt.Frame(twins, phase, i / 11f, action);
            generatedSprites.Add(frames[i]);
        }
        return frames;
    }

    private void Update()
    {
        if (musicalGameManager != null && (musicalGameManager.Paused || musicalGameManager.IsSeekingReplay)) return;
        if (isDying || allSprites.Count == 0 || bossHealthBar == null) return;
        if (transformation.IsPlaying)
        {
            transformation.Advance(Time.deltaTime);
            if (transformation.IsPlaying)
            {
                if (robotImage != null) robotImage.sprite = allSprites[16 + transformation.FrameIndex];
            }
            else
            {
                // Combat events keep updating their pending action during the transition.
                // Resume the latest action, rather than restoring a stale warning or attack.
                if (combatFrames != null && combatFrames.Length > 0)
                {
                    if (robotImage != null) robotImage.sprite = combatFrames[combatIndex];
                }
                else SetAnimationRange(phase2IdleStart, phase2IdleEnd, true);
                hitReactionRestRemaining = Mathf.Max(0f, hitReactionRestDuration);
            }
            return;
        }
        if (combatFrames != null && combatFrames.Length > 0)
        {
            combatTimer += Time.deltaTime;
            float duration = 1f / Mathf.Max(0.1f, holdingOrb ? holdFramesPerSecond : combatFramesPerSecond);
            while (combatTimer >= duration)
            {
                combatTimer -= duration;
                combatIndex++;
                if (combatHoldFrame >= 0 && combatIndex >= combatHoldFrame)
                {
                    var holdFrames = bossHealthBar.CurrentPhase == 2 ? holdRedFrames : holdBlueFrames;
                    if (holdFrames != null && holdFrames.Length > 0)
                    {
                        PlayCombatAction(holdBlueFrames, holdRedFrames, true);
                        holdingOrb = true;
                    }
                    else
                    {
                        // Older scenes still animate the charged portion without recreating the orb.
                        combatIndex = Mathf.Max(0, combatHoldFrame - 2);
                    }
                    break;
                }
                if (combatIndex >= combatFrames.Length)
                {
                    if (combatLoop) combatIndex = 0;
                    else { EndAttackSequence(); break; }
                }
            }
            if (combatFrames != null && robotImage != null)
                robotImage.sprite = combatFrames[combatIndex];
            return;
        }

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
                    if (bossHealthBar.CurrentPhase == 2)
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
        UpdatePortraitLayout();
        ApplySpriteSizing();
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
            ? Mathf.Sin(Mathf.PI * (1f - transformationEffectRemaining / activeTransformationEffectDuration))
            : 0f;
        transformationEffectRemaining = Mathf.Max(0f, transformationEffectRemaining - Time.deltaTime);
        musicalRect.localScale *= (1f + pulse * beatScaleAmount * intensity + burst * transformationScaleAmount);
        musicalRect.anchoredPosition3D += Vector3.up * (pulse * beatMovementPixels * intensity);
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
            ApplySpriteSizing();
            musicalRect.localRotation = restingRotation;
        }
        if (musicalOutline != null) musicalOutline.enabled = false;
    }

    private void UpdatePortraitLayout()
    {
        if (!responsiveLayout || layoutCanvas == null || musicalRect == null) return;
        // The dock owns screen-space placement and clips its children. Moving this
        // child with root-canvas coordinates would push the portrait outside its mask.
        var dock = musicalRect.GetComponentInParent<BossResponsiveLayout>();
        if (dock != null && dock.isActiveAndEnabled)
        {
            musicalRect.anchorMin = musicalRect.anchorMax = new Vector2(.5f, .5f);
            musicalRect.pivot = new Vector2(.5f, .5f);
            var dockRect = (RectTransform)dock.transform;
            var portrait = GepetoHudLayout.CalculateWithinDock(dockRect.rect.width, dockRect.rect.height);
            musicalRect.sizeDelta = Vector2.one * portrait.Size;
            restingPosition = new Vector3(portrait.X, portrait.Y, 0f);
            return;
        }
        if (musicalGameManager == null) musicalGameManager = FindAnyObjectByType<GameManager>();
        int players = Mathf.Max(1, musicalGameManager != null ? musicalGameManager.Players.Count : 1);
        if (players != layoutPlayerCount) layoutDiscoveryUntil = Time.unscaledTime + 8f;
        if (players != layoutPlayerCount || (Time.unscaledTime < layoutDiscoveryUntil && Time.unscaledTime >= nextLayoutRefresh))
        {
            layoutTexts = layoutCanvas.GetComponentsInChildren<TMP_Text>(true);
            layoutPlayerCount = players;
            nextLayoutRefresh = Time.unscaledTime + 1f;
        }
        var canvasRect = layoutCanvas.rect;
        if (canvasRect.width <= 0f || canvasRect.height <= 0f) return;
        protectedHudAreas.Clear();
        // Reserve the left HUD even before percentage text receives its first value.
        protectedHudAreas.Add(new GepetoHudLayout.Area(0, canvasRect.height * .72f,
            canvasRect.width * .30f, canvasRect.height * .28f));
        foreach (var text in layoutTexts)
        {
            if (text == null || !text.isActiveAndEnabled || !text.gameObject.activeInHierarchy
                || (bossHealthBar != null && text.transform.IsChildOf(bossHealthBar.transform))) continue;
            if ((text.text ?? string.Empty).IndexOf('%') < 0 && text.name.IndexOf("Accuracy", System.StringComparison.OrdinalIgnoreCase) < 0
                && text.name.IndexOf("Percent", System.StringComparison.OrdinalIgnoreCase) < 0) continue;
            var area = text.rectTransform;
            if (area.parent is RectTransform parent && parent.rect.width < canvasRect.width * .45f
                && parent.rect.height < canvasRect.height * .4f) area = parent;
            area.GetWorldCorners(layoutCorners);
            Vector3 min = layoutCanvas.InverseTransformPoint(layoutCorners[0]);
            Vector3 max = min;
            for (int i = 1; i < 4; i++)
            {
                Vector3 point = layoutCanvas.InverseTransformPoint(layoutCorners[i]);
                min = Vector3.Min(min, point); max = Vector3.Max(max, point);
            }
            protectedHudAreas.Add(new GepetoHudLayout.Area(min.x - canvasRect.xMin - 16,
                min.y - canvasRect.yMin - 16, max.x - min.x + 32, max.y - min.y + 32));
        }
        var placement = GepetoHudLayout.Calculate(canvasRect.width, canvasRect.height, players, protectedHudAreas);
        if (placement.Size <= 0f) return;
        musicalRect.anchorMin = musicalRect.anchorMax = new Vector2(.5f, .5f);
        musicalRect.pivot = new Vector2(.5f, .5f);
        musicalRect.sizeDelta = new Vector2(placement.Size, placement.Size);
        restingPosition = new Vector3(placement.X - canvasRect.width * .5f,
            placement.Y - canvasRect.height * .5f, restingPosition.z);
        if (bossHealthBar != null && bossHealthBar.transform.parent == layoutCanvas
            && bossHealthBar.transform is RectTransform healthRect)
        {
            healthRect.anchorMin = healthRect.anchorMax = new Vector2(.5f, .5f);
            healthRect.pivot = new Vector2(.5f, .5f);
            healthRect.anchoredPosition = new Vector2(restingPosition.x, restingPosition.y - placement.Size * .56f - 32f);
            healthRect.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, placement.Size);
        }
    }

    private void ApplySpriteSizing()
    {
        CharacterSpriteSizing.Get(spriteSizing, robotImage.sprite, out float scale, out Vector2 offset);
        float size = Mathf.Min(musicalRect.rect.width, musicalRect.rect.height);
        musicalRect.localScale = restingScale * scale;
        musicalRect.anchoredPosition3D = restingPosition + new Vector3(offset.x * size * restingScale.x,
            offset.y * size * restingScale.y, 0f);
    }

    public void SetAnimationRange(int start, int end, bool loop)
    {
        if (isDying || transformation.IsPlaying) return;
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
        combatFrames = null;
        transformation.Cancel();
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
        if (combatFrames != null || transformation.IsPlaying) return;
        if (isDying || isTransitioning || isPlayingHitAnimation || hitReactionRestRemaining > 0f) return;

        // A quarta linha contém a reação furiosa da forma vermelha.
        int hitStart = bossHealthBar != null && bossHealthBar.CurrentPhase == 2 ? (usesPersonaSheet ? 32 : 24) : 8;
        SetAnimationRange(hitStart, hitStart + 7, false);
        isTransitioning = true;
        isPlayingHitAnimation = true;
    }

    // Chamado quando a vida cruza a metade.
    public void TriggerPhase2Transformation()
    {
        if (isDying) return;
        if (transformation.IsPlaying) return;
        activeTransformationEffectDuration = Mathf.Max(.1f,
            usesPersonaSheet ? phaseTransformationSeconds : transformationEffectDuration);
        transformationEffectRemaining = activeTransformationEffectDuration;
        if (missFeedbackRoutine != null)
        {
            StopCoroutine(missFeedbackRoutine);
            missFeedbackRoutine = null;
        }
        if (robotImage != null) robotImage.color = originalImageColor;
        // Keep the combat clock intact. Its latest action is shown after the transformation.
        if (combatFrames != null)
        {
            var redFrames = holdingOrb ? holdRedFrames
                : combatFrames == prepareBlueFrames ? prepareRedFrames
                : combatFrames == attackBlueFrames ? attackRedFrames
                : combatFrames == blockedBlueFrames ? blockedRedFrames : null;
            if (redFrames != null && redFrames.Length > 0)
            {
                combatFrames = redFrames;
                combatIndex = Mathf.Clamp(combatIndex, 0, redFrames.Length - 1);
            }
        }
        isTransitioning = false;
        isPlayingHitAnimation = false;
        if (allSprites.Count >= 24)
        {
            transformation.Begin(8, phaseTransformationSeconds);
            if (robotImage != null) robotImage.sprite = allSprites[16];
        }
        else if (combatFrames == null) SetAnimationRange(phase2IdleStart, phase2IdleEnd, true);
    }

    public void TriggerMissFeedback()
    {
        if (combatFrames != null || transformation.IsPlaying) return;
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
        transformation.Cancel();
        combatFrames = null;
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

    public void TriggerPrepareAttack() => PlayCombatAction(prepareBlueFrames, prepareRedFrames, false, usesPersonaSheet ? 7 : 10);
    public void TriggerAttack() => PlayCombatAction(attackBlueFrames, attackRedFrames, false, -1, usesPersonaSheet ? 0 : 4);
    public void TriggerBlockedAttack() => PlayCombatAction(blockedBlueFrames, blockedRedFrames, false);

    private void PlayCombatAction(Sprite[] blue, Sprite[] red, bool loop, int holdFrame = -1, int startFrame = 0)
    {
        if (isDying || !isActiveAndEnabled) return;
        var frames = bossHealthBar != null && bossHealthBar.CurrentPhase == 2 ? red : blue;
        if (frames == null || frames.Length == 0) return;
        if (missFeedbackRoutine != null)
        {
            StopCoroutine(missFeedbackRoutine);
            missFeedbackRoutine = null;
        }
        if (robotImage != null) robotImage.color = originalImageColor;
        combatFrames = frames;
        holdingOrb = false;
        combatLoop = loop;
        combatIndex = Mathf.Clamp(startFrame, 0, frames.Length - 1);
        combatHoldFrame = holdFrame < 0 ? -1 : Mathf.Clamp(holdFrame, combatIndex, frames.Length - 1);
        combatTimer = 0f;
        isPlayingHitAnimation = false;
        if (robotImage != null && !transformation.IsPlaying) robotImage.sprite = frames[combatIndex];
    }

    public void EndAttackSequence()
    {
        if (isDying || combatFrames == null) return;
        combatFrames = null;
        holdingOrb = false;
        if (transformation.IsPlaying) return;
        bool red = bossHealthBar != null && bossHealthBar.CurrentPhase == 2;
        SetAnimationRange(red ? phase2IdleStart : normalIdleStart, red ? phase2IdleEnd : normalIdleEnd, true);
        hitReactionRestRemaining = hitReactionRestDuration;
    }

    private void OnDestroy()
    {
        if (musicalOutline != null) Destroy(musicalOutline);
        foreach (var sprite in generatedSprites)
        {
            if (sprite != null)
            {
                if (!usesPersonaSheet && BossRoster.Selected != BossRoster.Identity.Gepeto) Destroy(sprite.texture);
                Destroy(sprite);
            }
        }
    }
}
