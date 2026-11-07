using System;
using UnityEngine;
using UnityEngine.Serialization;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Prewarmed images per note and lane; grows for bursts without interrupting active feedbacks.</summary>
    public sealed class RhythmJudgmentDisplay : MonoBehaviour
    {
        [Header("Imagens de julgamento")]
        [SerializeField] private Texture2D _perfectTexture;
        [SerializeField] private Texture2D _greatTexture;
        [SerializeField] private Texture2D _goodTexture;
        [SerializeField] private Texture2D _missTexture;
        [SerializeField] private Vector2 _imageSize = new(220, 96);

        [Header("Cores dos efeitos")]
        [SerializeField] private Color _perfect = new(0f, 0.95f, 1f);
        [SerializeField] private Color _great = new(0.1f, 1f, 0.1f);
        [SerializeField] private Color _good = new(1f, 0.95f, 0.1f);
        [SerializeField] private Color _miss = new(1f, 0.18f, 0.22f);

        [Header("Posição na highway")]
        [SerializeField, Range(0, 1)] private float _highwayDepth = 0;
        [SerializeField] private Vector2 _positionOffset = new(0, 54);
        [SerializeField, Min(0.1f)] private float _scale = 1;
        [Tooltip("Reserva inicial por pista. Cresce quando necessário, sem interromper imagens ativas.")]
        [FormerlySerializedAs("_maximumFeedbacks")]
        [SerializeField, Range(1, 32)] private int _prewarmPerLane = 4;
        [SerializeField] private bool _fitToLane = false;
        [SerializeField, Range(0.2f, 3)] private float _laneWidthFraction = 2f;

        [Header("Animação (segundos)")]
        [SerializeField, Min(0)] private float _growth = 0.08f;
        [SerializeField, Min(0)] private float _settle = 0.10f;
        [SerializeField, Min(0)] private float _hold = 0;
        [SerializeField, Min(0.001f)] private float _fade = 0.40f;
        [SerializeField, Min(0)] private float _initialScale = 0.68f;
        [SerializeField, Min(1)] private float _peakScale = 1.2f;

        [Header("Subida suave (unidades do Canvas)")]
        [SerializeField] private float _startVerticalOffset = -10f;
        [SerializeField, Min(0)] private float _riseDistance = 26f;

        [Header("Efeitos leves")]
        [SerializeField] private bool _enableGlow = true;
        [SerializeField, Range(0, 1)] private float _glowIntensity = 0.22f;
        [SerializeField] private bool _enableImpact = true;
        [SerializeField, Range(0, 1)] private float _impactIntensity = 0.3f;

        [Header("Diagnóstico no Editor")]
        [SerializeField, Min(0)] private int _previewLane;

        public float HighwayDepth => _highwayDepth;
        public bool IsInitialized { get; private set; }

        private sealed class Entry
        {
            public RectTransform Rect;
            public CanvasGroup Group;
            public RawImage Main, Glow;
            public JudgmentImpactGraphic Impact;
            public int Slot;
            public RhythmJudgment Judgment;
            public JudgmentFeedbackClock Animation;

        }

        private Entry[] _entries;
        private RectTransform _root;
        private GameManager _game;
        private Canvas _canvas;
        private RectTransform _hudParent;
        private JudgmentLanePool _slots;
        private Vector2[] _lanePositions;
        private float[] _laneWidths;
        private bool[] _laneVisible;

        public int LaneCount => _slots?.LaneCount ?? 0;
        public bool NeedsLaneWidth => _fitToLane;
        public bool HasActiveLane(int lane) => _slots != null && _slots.HasActiveLane(lane);

        public void Initialize(Transform hudParent, GameManager game, int laneCount)
        {
            _game = game;
            if (_root != null) return;
            _hudParent = hudParent as RectTransform;
            _canvas = hudParent != null ? hudParent.GetComponentInParent<Canvas>() : null;
            if (_hudParent == null || _canvas == null)
            {
                Debug.LogError("[Julgamento] HUD sem RectTransform/Canvas. O feedback não foi inicializado.", this);
                return;
            }
            // Main Texture2D assets have stable references; no dependency on Sprite subasset IDs.
            if (_perfectTexture == null) _perfectTexture = Resources.Load<Texture2D>("Julgamentos/perfeito");
            if (_greatTexture == null) _greatTexture = Resources.Load<Texture2D>("Julgamentos/otimo");
            if (_goodTexture == null) _goodTexture = Resources.Load<Texture2D>("Julgamentos/bom");
            if (_missTexture == null) _missTexture = Resources.Load<Texture2D>("Julgamentos/errou");
            if (_perfectTexture == null || _greatTexture == null || _goodTexture == null || _missTexture == null)
            {
                Debug.LogError("[Julgamento] Imagens ausentes em Resources/Julgamentos. Verifique a importação dos PNGs e Git LFS.", this);
                return;
            }
            _root = CreateRect("Julgamentos", hudParent, _imageSize);
            _slots = new JudgmentLanePool(Mathf.Max(1, laneCount), Mathf.Clamp(_prewarmPerLane, 1, 32));
            _lanePositions = new Vector2[_slots.LaneCount];
            _laneWidths = new float[_slots.LaneCount];
            _laneVisible = new bool[_slots.LaneCount];
            EnsureEntryCapacity();
            IsInitialized = true;
        }

        private void EnsureEntryCapacity()
        {
            int previousCount = _entries?.Length ?? 0;
            if (previousCount >= _slots.Count) return;
            Array.Resize(ref _entries, _slots.Count);
            for (int i = previousCount; i < _entries.Length; i++)
            {
                var entry = new Entry { Slot = i };
                entry.Rect = CreateRect("Feedback " + i, _root, _imageSize);
                entry.Group = entry.Rect.gameObject.AddComponent<CanvasGroup>();
                entry.Group.blocksRaycasts = entry.Group.interactable = false;
                var impact = CreateRect("Impacto", entry.Rect, new Vector2(250, 65));
                entry.Impact = impact.gameObject.AddComponent<JudgmentImpactGraphic>();
                entry.Impact.raycastTarget = false;
                entry.Glow = CreateImage("Brilho", entry.Rect);
                entry.Glow.rectTransform.localScale = Vector3.one * 1.06f;
                entry.Main = CreateImage("Julgamento", entry.Rect);
                entry.Rect.gameObject.SetActive(false);
                _entries[i] = entry;
            }
        }

        private static RectTransform CreateRect(string name, Transform parent, Vector2 size)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false);
            rect.gameObject.layer = parent.gameObject.layer;
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0.5f, 0.5f);
            rect.sizeDelta = size;
            return rect;
        }

        private RawImage CreateImage(string name, Transform parent)
        {
            var rect = CreateRect(name, parent, _imageSize);
            var graphic = rect.gameObject.AddComponent<RawImage>();
            graphic.raycastTarget = false;
            graphic.color = Color.white; // Preserve the artist's gradient, outline and transparency.
            graphic.texture = _perfectTexture;
            FitArtwork(graphic, _perfectTexture);
            return graphic;
        }

        private void FitArtwork(RawImage image, Texture texture)
        {
            float width = Mathf.Max(1, _imageSize.x), height = Mathf.Max(1, _imageSize.y);
            float factor = Mathf.Min(width / texture.width, height / texture.height);
            image.rectTransform.sizeDelta = new Vector2(texture.width * factor, texture.height * factor);
        }

        public void SetLaneScreenPosition(int lane, Vector2? screenPosition, Vector2? screenRightEdge)
        {
            if (_slots == null || (uint)lane >= (uint)LaneCount) return;
            var camera = _canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : _canvas.worldCamera;
            _laneVisible[lane] = screenPosition.HasValue &&
                RectTransformUtility.ScreenPointToLocalPointInRectangle(_hudParent, screenPosition.Value,
                    camera, out _lanePositions[lane]);
            if (_laneVisible[lane] && screenRightEdge.HasValue &&
                RectTransformUtility.ScreenPointToLocalPointInRectangle(_hudParent, screenRightEdge.Value,
                    camera, out var edge))
                _laneWidths[lane] = Mathf.Abs(edge.x - _lanePositions[lane].x) * 2;
        }

        public void Show(object logicalNote, int lane, RhythmJudgment judgment, double? milliseconds)
        {
            if (!IsInitialized || !isActiveAndEnabled || (_game != null && _game.Paused) ||
                (uint)lane >= (uint)LaneCount) return;
            int slot = _slots.Acquire(lane, logicalNote, out bool existing);
            // A duplicate callback is not another scored note: leave its current animation untouched.
            if (existing) return;
            EnsureEntryCapacity();
            var selected = _entries[slot];
            selected.Judgment = judgment;
            selected.Animation.Restart(Time.frameCount);
            var color = judgment switch
            {
                RhythmJudgment.Perfect => _perfect,
                RhythmJudgment.Great => _great,
                RhythmJudgment.Good => _good,
                _ => _miss
            };
            var texture = judgment switch
            {
                RhythmJudgment.Perfect => _perfectTexture,
                RhythmJudgment.Great => _greatTexture,
                RhythmJudgment.Good => _goodTexture,
                _ => _missTexture
            };
            selected.Main.texture = selected.Glow.texture = texture;
            FitArtwork(selected.Main, texture);
            FitArtwork(selected.Glow, texture);
            selected.Main.color = Color.white;
            selected.Glow.color = new Color(1, 1, 1, _glowIntensity);
            selected.Glow.gameObject.SetActive(_enableGlow && (int)judgment <= (int)RhythmJudgment.Great);
            selected.Impact.color = new Color(color.r, color.g, color.b, _impactIntensity);
            selected.Impact.gameObject.SetActive(_enableImpact && (int)judgment <= (int)RhythmJudgment.Great);
            selected.Rect.gameObject.SetActive(true);
            selected.Rect.SetAsLastSibling();
            Animate(selected); // Immediate first frame, independent of Update ordering.
            PositionEntry(selected);
        }

        private void LateUpdate()
        {
            if (!IsInitialized) return;
            bool paused = _game != null && _game.Paused;
            float lifetime = _growth + _settle + _hold + _fade;
            // Projection is supplied by gameplay's Update. Position only active images once, afterwards.
            for (int i = 0; i < _slots.ActiveCount;)
            {
                var entry = _entries[_slots.ActiveSlotAt(i)];
                if (!paused) entry.Animation.Advance(Time.frameCount, Time.unscaledDeltaTime);
                if (!paused && entry.Animation.Age >= lifetime)
                {
                    _slots.Release(entry.Slot);
                    entry.Rect.gameObject.SetActive(false);
                    // Release swaps the last active slot into i, so process that slot next.
                    continue;
                }
                Animate(entry);
                PositionEntry(entry);
                i++;
            }
        }

        private void Animate(Entry entry)
        {
            float intensity = entry.Judgment == RhythmJudgment.Perfect ? 1 :
                entry.Judgment == RhythmJudgment.Great ? 0.8f : 0.35f;
            float peak = 1 + (_peakScale - 1) * intensity;
            float age = entry.Animation.Age;
            float scale;
            if (age < _growth) scale = Mathf.Lerp(_initialScale, peak, Ease(age / Mathf.Max(0.001f, _growth)));
            else if (age < _growth + _settle) scale = Mathf.Lerp(peak, 1, Ease((age - _growth) / Mathf.Max(0.001f, _settle)));
            else scale = 1;
            entry.Rect.localScale = Vector3.one * scale * LaneScale(entry.Slot);
            entry.Group.alpha = 1 - Mathf.SmoothStep(0, 1, Mathf.Clamp01((age - _growth - _settle - _hold) / Mathf.Max(0.001f, _fade)));
            float flash = Mathf.Clamp01(age / Mathf.Max(0.001f, _growth + _settle));
            entry.Impact.rectTransform.localScale = Vector3.one * Mathf.Lerp(0.6f, 1.3f, Ease(flash));
            Color color = entry.Impact.color;
            color.a = (1 - flash) * _impactIntensity * intensity;
            entry.Impact.color = color;
        }

        private float LaneScale(int slot)
        {
            int lane = _slots.LaneOf(slot);
            if (!_fitToLane || _laneWidths[lane] <= 0) return _scale;
            return Mathf.Min(_scale, _laneWidths[lane] * _laneWidthFraction /
                (Mathf.Max(1, _imageSize.x) * Mathf.Max(1, _peakScale)));
        }

        private void PositionEntry(Entry entry)
        {
            float lifetime = Mathf.Max(0.001f, _growth + _settle + _hold + _fade);
            int lane = _slots.LaneOf(entry.Slot);
            // Derive motion from age, never accumulate it: reprojection cannot double the drift.
            float rise = Mathf.SmoothStep(0, 1, Mathf.Clamp01(entry.Animation.Age / lifetime));
            float verticalOffset = _startVerticalOffset + _riseDistance * rise;
            entry.Rect.anchoredPosition = _lanePositions[lane] + _positionOffset +
                new Vector2(0, verticalOffset);
            if (!_laneVisible[lane]) entry.Group.alpha = 0;
        }

        private static float Ease(float t) => 1 - Mathf.Pow(1 - Mathf.Clamp01(t), 3);

        public void Clear()
        {
            if (_entries == null) return;
            for (int i = 0; i < _slots.ActiveCount; i++)
                _entries[_slots.ActiveSlotAt(i)].Rect.gameObject.SetActive(false);
            _slots.Clear();
        }


        [ContextMenu("Diagnóstico/Testar PERFEITO! durante a música")]
        private void PreviewPerfect() => Preview(RhythmJudgment.Perfect, 8);

        [ContextMenu("Diagnóstico/Testar ÓTIMO! durante a música")]
        private void PreviewGreat() => Preview(RhythmJudgment.Great, -42);

        [ContextMenu("Diagnóstico/Testar BOM! durante a música")]
        private void PreviewGood() => Preview(RhythmJudgment.Good, 87);

        [ContextMenu("Diagnóstico/Testar ERROU! durante a música")]
        private void PreviewMiss() => Preview(RhythmJudgment.Miss, null);

        private void Preview(RhythmJudgment judgment, double? milliseconds)
        {
            if (!Application.isPlaying || !IsInitialized)
            {
                Debug.LogWarning("[Julgamento] Inicie uma música antes de testar o HUD.", this);
                return;
            }
            if (_game != null && _game.Paused)
            {
                Debug.LogWarning("[Julgamento] Retome a música para testar a animação.", this);
                return;
            }
            // Use the same selected lane slot as gameplay; never a separate central preview.
            int lane = Mathf.Clamp(_previewLane, 0, LaneCount - 1);
            Show(null, lane, judgment, milliseconds);
        }

        private void OnDisable() => Clear();

        private void OnDestroy()
        {
            if (_root != null) Destroy(_root.gameObject);
        }
    }
}
