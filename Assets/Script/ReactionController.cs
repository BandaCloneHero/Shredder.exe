using System;
using UnityEngine;
using YARG.Core;
using YARG.Gameplay;
using UnityEngine.UI; // Importante para reconhecer o componente Image

public partial class ReactionController : MonoBehaviour
{
    [SerializeField] private CharacterSpriteSizing[] spriteSizing = Array.Empty<CharacterSpriteSizing>();
    private Vector3 portraitScale;
    private Vector3 portraitPosition;

    [Header("Expressões (Sprites)")]
    public Sprite normalSprite;  // Rosto feliz / neutro
    public Sprite missSprite;    // Rosto triste / reação de erro

    [Header("Configurações")]
    public float displayDuration = 1.5f; // Tempo na tela em segundos
    [SerializeField] private bool enableMissReaction = false;

    [Header("Roland — guitarra")]
    [SerializeField] private Sprite[] guitarIdleFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] guitarMissFrames = Array.Empty<Sprite>();
    [Header("Banda — baixo, bateria e teclado")]
    [SerializeField] private Sprite[] bassIdleFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] bassMissFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] drumsIdleFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] drumsMissFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] keysIdleFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] keysMissFrames = Array.Empty<Sprite>();
    private Sprite[] activeIdleFrames = Array.Empty<Sprite>();
    private Instrument configuredInstrument = Instrument.Band;
    [Header("Defesa especial — uma folha por personagem")]
    [SerializeField] private Sprite[] guitarDefenseFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] bassDefenseFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] drumsDefenseFrames = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] keysDefenseFrames = Array.Empty<Sprite>();
    private Sprite[] activeDefenseFrames = Array.Empty<Sprite>();
    private bool playingDefense;
    private Sprite[] activeMissFrames = Array.Empty<Sprite>();
    [Min(0.1f)] [SerializeField] private float idleFramesPerSecond = 16f;
    [Min(0.1f)] [SerializeField] private float missFramesPerSecond = 12f;
    [Min(0)] [SerializeField] private int missReactionStartFrame = 0;
    [Min(0)] [SerializeField] private int missExpressionHoldFrame = 5;
    [Min(0f)] [SerializeField] private float missExpressionHoldDuration = 0.35f;
    [Min(0f)] [SerializeField] private float missReactionRestDuration = 0.5f;
    [SerializeField] private Vector2 guitarPortraitSize = new Vector2(350f, 315f);

    private Image uiImage;
    private GameManager reactionGameManager;
    private Vector2 originalPortraitSize;
    private bool originalPreserveAspect;
    private bool useGuitarAnimation;
    private bool playingMiss;
    private float frameTime;
    private float staticMissRemaining;
    private float reactionRestRemaining;
    private int frameIndex;

    public event Action<int> NoteHit;

    private void Awake()
    {
        CreateBassCommandPoses();
        CreateDrumCommandPoses();
        uiImage = GetComponent<Image>();
        if (uiImage != null)
        {
            originalPortraitSize = uiImage.rectTransform.sizeDelta;
            portraitScale = uiImage.rectTransform.localScale;
            portraitPosition = uiImage.rectTransform.anchoredPosition3D;
            originalPreserveAspect = uiImage.preserveAspect;
        }
    }

    void Start()
    {
        reactionGameManager = FindAnyObjectByType<GameManager>();
        ResetReaction();
    }

    public void ConfigureForGuitar(bool isGuitar)
    {
        ConfigureForInstrument(isGuitar ? Instrument.FiveFretGuitar : Instrument.Band);
    }

    public void ConfigureForInstrument(Instrument instrument)
    {
        CreateBassCommandPoses();
        CreateDrumCommandPoses();
        configuredInstrument = instrument;
        (activeIdleFrames, activeMissFrames) = instrument switch
        {
            Instrument.FiveFretBass or Instrument.SixFretBass
                or Instrument.ProBass_17Fret or Instrument.ProBass_22Fret => (bassIdleFrames, bassMissFrames),
            Instrument.FourLaneDrums or Instrument.ProDrums
                or Instrument.FiveLaneDrums or Instrument.EliteDrums => (drumsIdleFrames, drumsMissFrames),
            Instrument.Keys or Instrument.ProKeys => (keysIdleFrames, keysMissFrames),
            Instrument.FiveFretGuitar or Instrument.SixFretGuitar
                or Instrument.FiveFretRhythm or Instrument.SixFretRhythm
                or Instrument.FiveFretCoopGuitar or Instrument.SixFretCoopGuitar
                or Instrument.ProGuitar_17Fret or Instrument.ProGuitar_22Fret => (guitarIdleFrames, guitarMissFrames),
            _ => (Array.Empty<Sprite>(), Array.Empty<Sprite>())
        };
        useGuitarAnimation = activeIdleFrames.Length > 0;
        activeDefenseFrames = activeIdleFrames == guitarIdleFrames ? guitarDefenseFrames
            : activeIdleFrames == bassIdleFrames ? bassDefenseFrames
            : activeIdleFrames == drumsIdleFrames ? drumsDefenseFrames
            : activeIdleFrames == keysIdleFrames ? keysDefenseFrames : Array.Empty<Sprite>();
        if (uiImage != null)
        {
            uiImage.preserveAspect = useGuitarAnimation || originalPreserveAspect;
            uiImage.rectTransform.sizeDelta = useGuitarAnimation ? guitarPortraitSize : originalPortraitSize;
        }
        ResetReaction();
    }

    public void ResetReaction()
    {
        ResetCommandPoses();
        playingMiss = false;
        playingDefense = false;
        frameIndex = 0;
        frameTime = staticMissRemaining = reactionRestRemaining = 0f;
        ShowCurrentFrame();
    }

    private void LateUpdate()
    {
        if (reactionGameManager != null && reactionGameManager.Paused) return;
        if (uiImage == null) return;
        if (UpdateCommandPoses()) return;
        reactionRestRemaining = Mathf.Max(0f, reactionRestRemaining - Time.deltaTime);
        if (!useGuitarAnimation)
        {
            if (!playingMiss) return;
            staticMissRemaining -= Time.deltaTime;
            if (staticMissRemaining <= 0f)
            {
                playingMiss = false;
                ShowCurrentFrame();
            }
            return;
        }

        var frames = playingDefense ? activeDefenseFrames : playingMiss ? activeMissFrames : activeIdleFrames;
        if (frames.Length == 0) return;
        frameTime += Time.deltaTime;
        while (frameTime >= GetFrameDuration())
        {
            frameTime -= GetFrameDuration();
            frameIndex++;
            if (frameIndex >= frames.Length)
            {
                frameIndex = 0;
                if (playingMiss || playingDefense)
                {
                    playingMiss = false;
                    playingDefense = false;
                    reactionRestRemaining = Mathf.Max(0f, missReactionRestDuration);
                    frameTime = 0f;
                    break;
                }
            }
        }
        ShowCurrentFrame();
    }

    private float GetFrameDuration()
    {
        float duration = 1f / Mathf.Max(0.1f,
            playingMiss ? missFramesPerSecond : idleFramesPerSecond);
        if (playingMiss && frameIndex == missExpressionHoldFrame)
            duration += Mathf.Max(0f, missExpressionHoldDuration);
        return duration;
    }

    private void ShowCurrentFrame()
    {
        if (uiImage == null) return;
        var frames = playingDefense ? activeDefenseFrames : playingMiss ? activeMissFrames : activeIdleFrames;
        if (CommandPosesActive && currentCommandPoses[0] != null)
        {
            uiImage.sprite = currentCommandPoses[0];
        }
        else if (useGuitarAnimation && frames.Length > 0)
        {
            var sprite = frames[Mathf.Clamp(frameIndex, 0, frames.Length - 1)];
            if (sprite != null) uiImage.sprite = sprite;
        }
        else
        {
            var sprite = playingMiss ? missSprite : normalSprite;
            if (sprite != null) uiImage.sprite = sprite;
        }
        CharacterSpriteSizing.Get(spriteSizing, uiImage.sprite, out float scale, out Vector2 offset);
        var rect = uiImage.rectTransform;
        float size = Mathf.Min(rect.rect.width, rect.rect.height);
        rect.localScale = portraitScale * scale;
        rect.anchoredPosition3D = portraitPosition + new Vector3(offset.x * size * portraitScale.x,
            offset.y * size * portraitScale.y, 0f);
    }

    public void TriggerMissReaction()
    {
        if (!enableMissReaction) return;
        if (CommandPosesActive) { commandErrorUntil = CommandTime + 0.18d; return; }
        if (playingDefense) return;
        if (uiImage == null) return;
        if (useGuitarAnimation && (playingMiss || reactionRestRemaining > 0f
            || activeMissFrames.Length == 0)) return;
        playingMiss = true;
        frameIndex = useGuitarAnimation
            ? Mathf.Clamp(missReactionStartFrame, 0, activeMissFrames.Length - 1) : 0;
        frameTime = 0f;
        staticMissRemaining = Mathf.Max(0f, displayDuration);
        ShowCurrentFrame();
    }

    public void TriggerDefenseReaction()
    {
        if (CommandPosesActive) { commandDefenseUntil = CommandTime + 0.4d; return; }
        if (uiImage == null || activeDefenseFrames.Length == 0) return;
        playingMiss = false;
        playingDefense = true;
        frameIndex = 0;
        frameTime = 0f;
        ShowCurrentFrame();
    }

    public void TriggerBossFailureReaction()
    {
        playingDefense = false;
        playingMiss = false;
        reactionRestRemaining = 0f;
        TriggerMissReaction();
    }

    public void TriggerHit(int lane)
    {
        NoteHit?.Invoke(lane);
    }

}
