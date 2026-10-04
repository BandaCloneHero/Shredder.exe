using System;
using System.Collections.Generic;
using UnityEngine;
using YARG.Core;
using YARG.Core.Chart;
using YARG.Core.Input;

public partial class ReactionController
{
    [Header("Poses por comando — ordem binária")]
    [SerializeField] private Sprite[] guitarCommandPoses = Array.Empty<Sprite>();
    [SerializeField] private Sprite[] bassCommandPoses = Array.Empty<Sprite>();
    [SerializeField] private Texture2D bassCommandTexture;
    private Sprite[] runtimeBassCommandPoses;
    [SerializeField] private Sprite[] drumsCommandPoses = Array.Empty<Sprite>();
    [SerializeField] private Texture2D drumsCommandTexture;
    private Sprite[] runtimeDrumsCommandPoses;
    [SerializeField] private Sprite[] keysCommandPoses = Array.Empty<Sprite>();
    [SerializeField, Min(0.02f)] private float commandStrikeDuration = 0.12f;
    private readonly Queue<GameInput> commandInputs = new();
    private readonly Queue<BotPoseEvent> botPoseEvents = new();
    private readonly double[] botPoseUntil = new double[7];
    private readonly double[] botSustainUntil = new double[7];
    private bool commandBot;
    private bool fiveLaneKeyboard;

    private readonly struct BotPoseEvent
    {
        public readonly double Time, End;
        public readonly int Index;
        public readonly bool StartChord, Strike;
        public BotPoseEvent(double time, double end, int index, bool startChord = false, bool strike = false)
        {
            Time = time; End = end; Index = index; StartChord = startChord; Strike = strike;
        }
    }
    private readonly double[] drumPoseUntil = new double[5];
    private static readonly int[] DrumPadMasks = { 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12 };
    private static readonly int[] KeyboardWhiteKeys = { 0, 2, 4, 5, 7, 9, 11 };
    private Sprite[] currentCommandPoses;
    private GameMode commandMode;
    private int heldCommands;
    private int engineHeldCommands;
    private bool hasEngineHeldCommands;
    private bool reportedEngineButtons;
    private double strumPoseUntil;
    private double commandErrorUntil;
    private double commandDefenseUntil;
    private double lastCommandTime = double.NegativeInfinity;
    private GuitarButtonLights guitarButtonLights;
    private bool UsesSimpleGuitar => currentCommandPoses == guitarCommandPoses
        && activeIdleFrames == guitarIdleFrames && guitarCommandPoses.Length == 2;
    private bool CommandPosesActive => currentCommandPoses != null && currentCommandPoses.Length > 0;
    private double CommandTime => reactionGameManager != null ? reactionGameManager.SongTime : 0d;

    private void CreateBassCommandPoses()
    {
        if (runtimeBassCommandPoses != null || bassCommandTexture == null) return;
        if (bassCommandTexture.width % 8 != 0 || bassCommandTexture.height % 8 != 0)
        {
            Debug.LogError("A folha de comandos do baixo precisa ter 8 colunas e 8 linhas.", this);
            return;
        }
        int width = bassCommandTexture.width / 8;
        int height = bassCommandTexture.height / 8;
        runtimeBassCommandPoses = new Sprite[64];
        for (int i = 0; i < runtimeBassCommandPoses.Length; i++)
        {
            // Atlas rows are written top to bottom; Unity rectangles start at the bottom.
            var rect = new Rect(i % 8 * width, (7 - i / 8) * height, width, height);
            var sprite = Sprite.Create(bassCommandTexture, rect, new Vector2(0.5f, 0.5f),
                100f, 0, SpriteMeshType.FullRect);
            sprite.name = $"Baixista_{(i < 32 ? "Cima" : "Baixo")}_{i % 32:D2}";
            runtimeBassCommandPoses[i] = sprite;
        }
        bassCommandPoses = runtimeBassCommandPoses;
        bassIdleFrames = new[] { runtimeBassCommandPoses[0] };
    }

    private void OnDestroy()
    {
        if (runtimeBassCommandPoses != null)
            foreach (var sprite in runtimeBassCommandPoses)
                if (sprite != null) Destroy(sprite);
        if (runtimeDrumsCommandPoses != null)
            foreach (var sprite in runtimeDrumsCommandPoses)
                if (sprite != null) Destroy(sprite);
    }

    private void CreateDrumCommandPoses()
    {
        if (runtimeDrumsCommandPoses != null || drumsCommandTexture == null) return;
        if (drumsCommandTexture.width % 6 != 0 || drumsCommandTexture.height % 4 != 0)
        {
            Debug.LogError("A folha da bateria precisa ter 6 colunas e 4 linhas.", this);
            return;
        }
        int width = drumsCommandTexture.width / 6;
        int height = drumsCommandTexture.height / 4;
        runtimeDrumsCommandPoses = new Sprite[22];
        for (int i = 0; i < runtimeDrumsCommandPoses.Length; i++)
        {
            var rect = new Rect(i % 6 * width, (3 - i / 6) * height, width, height);
            var sprite = Sprite.Create(drumsCommandTexture, rect, new Vector2(0.5f, 0.5f),
                100f, 0, SpriteMeshType.FullRect);
            sprite.name = $"Baterista_Mascara_{DrumPadMasks[i % 11] + (i >= 11 ? 16 : 0):D2}";
            runtimeDrumsCommandPoses[i] = sprite;
        }
        drumsCommandPoses = runtimeDrumsCommandPoses;
        drumsIdleFrames = new[] { runtimeDrumsCommandPoses[0] };
    }

    public void ConfigureCommandPoses(GameMode mode, bool sevenKeys, bool isBot = false,
        Instrument instrument = Instrument.Band, bool fiveLaneKeys = false)
    {
        CreateBassCommandPoses();
        CreateDrumCommandPoses();
        if (instrument != Instrument.Band) configuredInstrument = instrument;
        // FiveLaneKeysPlayer plays guitar/bass charts with ProKeys input actions.
        // Its character still uses the five-button guitar/bass pose sheet.
        GameMode poseMode = fiveLaneKeys ? GameMode.FiveFretGuitar : mode;
        // MIDI Drumkit uses EliteDrums input actions while playing a four-pad chart.
        // The engine converts these inputs to DrumsAction before OnPadHit fires.
        if (mode == GameMode.EliteDrums
            && configuredInstrument is Instrument.FourLaneDrums or Instrument.ProDrums)
            poseMode = GameMode.FourLaneDrums;
        Sprite[] poses = poseMode switch
        {
            GameMode.FiveFretGuitar when configuredInstrument == Instrument.FiveFretBass => bassCommandPoses,
            GameMode.FiveFretGuitar when activeIdleFrames == guitarIdleFrames => guitarCommandPoses,
            GameMode.FourLaneDrums => drumsCommandPoses,
            GameMode.ProKeys when sevenKeys => keysCommandPoses,
            _ => null
        };
        if (currentCommandPoses == poses && commandMode == poseMode && commandBot == isBot
            && fiveLaneKeyboard == fiveLaneKeys) return;
        currentCommandPoses = poses;
        commandMode = poseMode;
        commandBot = isBot;
        fiveLaneKeyboard = fiveLaneKeys;
        ResetCommandPoses();
        ReportCommandPoseSetup();
    }

    [System.Diagnostics.Conditional("UNITY_EDITOR")]
    private void ReportCommandPoseSetup()
    {
        if (commandMode == GameMode.FourLaneDrums)
        {
            int loaded = 0;
            if (currentCommandPoses != null)
                foreach (var sprite in currentCommandPoses) if (sprite != null) loaded++;
            Debug.Log($"[Poses da bateria] Instrumento={configuredInstrument}, bot={commandBot}, "
                + $"sprites carregados={loaded}/22; entrada pelos hits do motor.", this);
            return;
        }
        if (configuredInstrument != Instrument.FiveFretBass) return;
        int count = 0;
        if (currentCommandPoses != null)
            foreach (var sprite in currentCommandPoses) if (sprite != null) count++;
        Debug.Log($"[Poses do baixo] Modo={commandMode}, teclado5={fiveLaneKeyboard}, bot={commandBot}, sprites carregados={count}/64, "
            + $"folha={(bassCommandTexture != null ? bassCommandTexture.name : "ausente")}", this);
    }

    public void QueueCommandInput(GameInput input)
    {
        if (!commandBot) commandInputs.Enqueue(input);
    }

    public void SynchronizeGuitarButtons(int mask)
    {
        if (commandMode != GameMode.FiveFretGuitar || commandBot) return;
        engineHeldCommands = mask & 31;
        hasEngineHeldCommands = true;
#if UNITY_EDITOR
        if (!reportedEngineButtons && engineHeldCommands != 0 && configuredInstrument == Instrument.FiveFretBass)
        {
            reportedEngineButtons = true;
            Debug.Log($"[Poses do baixo] Botões recebidos da highway: máscara={engineHeldCommands}.", this);
        }
#endif
    }

    // Mirror the engine's white-key states, including held notes and releases.
    public void SynchronizeKeyboardKey(int key, bool pressed)
    {
        if (commandMode != GameMode.ProKeys || commandBot || !CommandPosesActive) return;
        int index = Array.IndexOf(KeyboardWhiteKeys, key);
        if (index < 0) return;
        if (pressed) engineHeldCommands |= 1 << index;
        else engineHeldCommands &= ~(1 << index);
        hasEngineHeldCommands = true;
    }

    // Bots hit notes inside the engine without sending controller inputs.
    // Queue their judged notes on the song clock, preserving chords and sustains.
    public void QueueBotNote<TNote>(TNote note, double hitTime) where TNote : Note<TNote>
    {
        if (!commandBot || !CommandPosesActive) return;
        switch (note)
        {
            case GuitarNote guitar when commandMode == GameMode.FiveFretGuitar:
                if (fiveLaneKeyboard)
                {
                    // The keys engine reports each member of a chord individually.
                    // Accumulate those presses instead of clearing the earlier members.
                    botPoseEvents.Enqueue(new BotPoseEvent(hitTime, hitTime, -1, strike: true));
                    int fretIndex = guitar.Fret - (int)FiveFretGuitarFret.Green;
                    if (fretIndex >= 0 && fretIndex < 5)
                        botPoseEvents.Enqueue(new BotPoseEvent(hitTime,
                            guitar.IsSustain ? guitar.TimeEnd : hitTime, fretIndex));
                    break;
                }
                botPoseEvents.Enqueue(new BotPoseEvent(hitTime, hitTime, -1, true));
                foreach (var fret in guitar.AllNotes)
                {
                    int index = fret.Fret - (int)FiveFretGuitarFret.Green;
                    if (index >= 0 && index < 5)
                        botPoseEvents.Enqueue(new BotPoseEvent(hitTime,
                            fret.IsSustain ? fret.TimeEnd : hitTime, index));
                }
                break;
            case ProKeysNote key when commandMode == GameMode.ProKeys:
                int keyIndex = GetSevenKeyIndex(key.Key);
                if (keyIndex >= 0)
                    botPoseEvents.Enqueue(new BotPoseEvent(hitTime,
                        key.IsSustain ? key.TimeEnd : hitTime, keyIndex));
                break;
            case DrumNote drum when commandMode == GameMode.FourLaneDrums:
                int pad = drum.Pad switch
                {
                    1 => 0, 2 or 5 => 1, 3 or 6 => 2, 4 or 7 => 3, 0 => 4, _ => -1
                };
                if (pad >= 0) botPoseEvents.Enqueue(new BotPoseEvent(hitTime, hitTime, pad));
                break;
        }
    }

    private static int GetSevenKeyIndex(int key) => key switch
    {
        0 => 0, 2 => 1, 4 => 2, 5 => 3, 7 => 4, 9 => 5, 11 => 6, _ => -1
    };

    private void ApplyBotPose(BotPoseEvent pose)
    {
        if (pose.Strike) strumPoseUntil = pose.Time + commandStrikeDuration;
        if (pose.StartChord)
        {
            for (int i = 0; i < botPoseUntil.Length; i++)
                if (botSustainUntil[i] <= pose.Time) botPoseUntil[i] = double.NegativeInfinity;
            strumPoseUntil = pose.Time + commandStrikeDuration;
        }
        if (pose.Index < 0) return;
        double until = Math.Max(pose.End, pose.Time + commandStrikeDuration);
        if (commandMode == GameMode.FourLaneDrums)
            drumPoseUntil[pose.Index] = Math.Max(drumPoseUntil[pose.Index], until);
        else
        {
            botPoseUntil[pose.Index] = Math.Max(botPoseUntil[pose.Index], until);
            botSustainUntil[pose.Index] = Math.Max(botSustainUntil[pose.Index], pose.End);
        }
    }

    private void ResetCommandPoses()
    {
        heldCommands = 0;
        engineHeldCommands = 0;
        hasEngineHeldCommands = false;
        reportedEngineButtons = false;
        commandInputs.Clear();
        botPoseEvents.Clear();
        for (int i = 0; i < botPoseUntil.Length; i++)
            botPoseUntil[i] = botSustainUntil[i] = double.NegativeInfinity;
        for (int i = 0; i < drumPoseUntil.Length; i++)
            drumPoseUntil[i] = double.NegativeInfinity;
        strumPoseUntil = commandErrorUntil = commandDefenseUntil = double.NegativeInfinity;
        lastCommandTime = double.NegativeInfinity;
        if (uiImage != null) uiImage.color = Color.white;
        if (guitarButtonLights != null) guitarButtonLights.gameObject.SetActive(false);
    }

    private bool UpdateCommandPoses()
    {
        if (!CommandPosesActive) { commandInputs.Clear(); botPoseEvents.Clear(); return false; }
        if (reactionGameManager == null) return false;
        double now = CommandTime;
        if (reactionGameManager.IsSeekingReplay || now < lastCommandTime) ResetCommandPoses();
        lastCommandTime = now;
        while (commandInputs.Count > 0 && commandInputs.Peek().Time <= now)
            ApplyCommandInput(commandInputs.Dequeue(), now);
        while (botPoseEvents.Count > 0 && botPoseEvents.Peek().Time <= now)
            ApplyBotPose(botPoseEvents.Dequeue());
        int mask = hasEngineHeldCommands ? engineHeldCommands : heldCommands;
        if (commandBot)
        {
            mask = 0;
            for (int i = 0; i < botPoseUntil.Length; i++)
                if (now < botPoseUntil[i]) mask |= 1 << i;
        }
        if (commandMode == GameMode.FourLaneDrums)
        {
            mask = GetDrumCommandMask(now);
        }
        int pose = mask;
        if (commandMode == GameMode.FourLaneDrums && currentCommandPoses.Length == 22)
            pose = Array.IndexOf(DrumPadMasks, mask & 15) + ((mask & 16) != 0 ? 11 : 0);
        if (commandMode == GameMode.FiveFretGuitar && now < strumPoseUntil) pose += 32;
        if (UsesSimpleGuitar) pose = now < strumPoseUntil ? 1 : 0;
        if (pose < 0 || pose >= currentCommandPoses.Length || currentCommandPoses[pose] == null) return false;
        uiImage.sprite = currentCommandPoses[pose];
        // Error/defense feedback keeps the input pose visible instead of replacing the hands.
        uiImage.color = enableMissReaction && now < commandErrorUntil ? new Color(1f, 0.65f, 0.65f)
            : now < commandDefenseUntil ? new Color(0.65f, 1f, 0.85f) : Color.white;
        CharacterSpriteSizing.Get(spriteSizing, uiImage.sprite, out float scale, out Vector2 offset);
        var rect = uiImage.rectTransform;
        float size = Mathf.Min(rect.rect.width, rect.rect.height);
        rect.localScale = portraitScale * scale;
        rect.anchoredPosition3D = portraitPosition + new Vector3(offset.x * size * portraitScale.x,
            offset.y * size * portraitScale.y, 0f);
        if (UsesSimpleGuitar)
        {
            if (guitarButtonLights == null)
            {
                var lights = new GameObject("Guitar button lights", typeof(RectTransform), typeof(GuitarButtonLights));
                lights.transform.SetParent(uiImage.transform, false);
                guitarButtonLights = lights.GetComponent<GuitarButtonLights>();
                var lightRect = guitarButtonLights.rectTransform;
                lightRect.anchorMin = Vector2.zero;
                lightRect.anchorMax = Vector2.one;
                lightRect.offsetMin = lightRect.offsetMax = Vector2.zero;
                lightRect.pivot = rect.pivot;
            }
            guitarButtonLights.gameObject.SetActive(true);
            guitarButtonLights.Show(uiImage, mask, pose);
        }
        else if (guitarButtonLights != null) guitarButtonLights.gameObject.SetActive(false);
        return true;
    }

    private void ApplyCommandInput(GameInput input, double now)
    {
        int action = input.Action;
        if (commandMode == GameMode.FiveFretGuitar)
        {
            if (fiveLaneKeyboard)
            {
                int key = action - (int)ProKeysAction.GreenKey;
                if (key >= 0 && key < 5)
                {
                    SetHeldCommand(key, input.Button);
                    if (input.Button) strumPoseUntil = now + commandStrikeDuration;
                }
                else if (action == (int)ProKeysAction.OpenNote && input.Button)
                    strumPoseUntil = now + commandStrikeDuration;
                return;
            }
            // Solo frets are aliases for the same five physical positions.
            if (action >= 10 && action <= 14) action -= 10;
            if (action >= 0 && action < 5) SetHeldCommand(action, input.Button);
            else if ((action == (int)GuitarAction.StrumUp || action == (int)GuitarAction.StrumDown) && input.Button)
                strumPoseUntil = now + commandStrikeDuration;
        }
        else if (commandMode == GameMode.ProKeys)
        {
            int key = GetSevenKeyIndex(action);
            if (key >= 0) SetHeldCommand(key, input.Button);
        }
        // Drum poses receive normalized OnPadHit events rather than raw input actions.
        // Raw MIDI action 0 is the kick; ordinary DrumsAction 0 is the red pad.
    }

    private int GetDrumCommandMask(double now)
    {
        // Two sticks: pick the two newest active pad strikes; kick uses the foot.
        int first = -1, second = -1;
        for (int pad = 0; pad < 4; pad++)
        {
            if (drumPoseUntil[pad] <= now) continue;
            if (first < 0 || drumPoseUntil[pad] > drumPoseUntil[first])
            {
                second = first;
                first = pad;
            }
            else if (second < 0 || drumPoseUntil[pad] > drumPoseUntil[second]) second = pad;
        }
        int mask = now < drumPoseUntil[4] ? 16 : 0;
        if (first >= 0) mask |= 1 << first;
        if (second >= 0) mask |= 1 << second;
        return mask;
    }

    private static int GetDrumActionIndex(DrumsAction action) => action switch
    {
        DrumsAction.RedDrum => 0,
        DrumsAction.YellowDrum or DrumsAction.YellowCymbal => 1,
        DrumsAction.BlueDrum or DrumsAction.BlueCymbal => 2,
        DrumsAction.GreenDrum or DrumsAction.GreenCymbal => 3,
        DrumsAction.Kick => 4,
        _ => -1
    };

    public void QueueDrumStrike(DrumsAction action, double time)
    {
        if (commandMode != GameMode.FourLaneDrums || !CommandPosesActive) return;
        int pad = GetDrumActionIndex(action);
        if (pad >= 0) botPoseEvents.Enqueue(new BotPoseEvent(time, time, pad));
#if UNITY_EDITOR
        if (pad >= 0 && !reportedEngineButtons)
        {
            reportedEngineButtons = true;
            Debug.Log($"[Poses da bateria] Primeiro hit recebido: {action}, pose={pad}.", this);
        }
#endif
    }

    private void SetHeldCommand(int index, bool pressed)
    {
        if (pressed) heldCommands |= 1 << index;
        else heldCommands &= ~(1 << index);
    }
}
