using System;
using UnityEngine;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Independent preallocated slots per lane. No coroutines, event subscriptions or per-hit GameObjects.</summary>
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
        [SerializeField] private Vector2 _overlapDistance = new(0, 100);
        [Tooltip("Máximo de feedbacks por pista. Uma pista nunca reutiliza o feedback de outra.")]
        [SerializeField, Range(1, 8)] private int _maximumFeedbacks = 1;
        [SerializeField] private bool _fitToLane = false;
        [SerializeField, Range(0.2f, 3)] private float _laneWidthFraction = 2f;

        [Header("Animação (segundos)")]
        [SerializeField, Min(0)] private float _growth = 0.08f;
        [SerializeField, Min(0)] private float _settle = 0.10f;
        [SerializeField, Min(0)] private float _hold = 0.20f;
        [SerializeField, Min(0.001f)] private float _fade = 0.20f;
        [SerializeField, Min(0)] private float _initialScale = 0.68f;
        [SerializeField, Min(1)] private float _peakScale = 1.2f;

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
            public double? Milliseconds;
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
            _slots = new JudgmentLanePool(Mathf.Max(1, laneCount), Mathf.Clamp(_maximumFeedbacks, 1, 8));
            _lanePositions = new Vector2[_slots.LaneCount];
            _laneWidths = new float[_slots.LaneCount];
            _laneVisible = new bool[_slots.LaneCount];
            _entries = new Entry[_slots.Count];
            for (int i = 0; i < _entries.Length; i++)
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
            IsInitialized = true;
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
            PositionEntries();
        }

        public void Show(object logicalNote, int lane, RhythmJudgment judgment, double? milliseconds)
        {
            if (!IsInitialized || !isActiveAndEnabled || (_game != null && _game.Paused) ||
                (uint)lane >= (uint)LaneCount) return;
            int slot = _slots.Acquire(lane, logicalNote, out bool existing);
            var selected = _entries[slot];
            // Only duplicate callbacks for this exact note in this exact lane are combined.
            if (existing)
            {
                if ((int)judgment < (int)selected.Judgment ||
                    (judgment == selected.Judgment && Math.Abs(milliseconds ?? 0) <= Math.Abs(selected.Milliseconds ?? 0))) return;
                _slots.Refresh(slot);
            }
            selected.Judgment = judgment;
            selected.Milliseconds = milliseconds;
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
            PositionEntries();
        }

        private void Update()
        {
            if (!IsInitialized || (_game != null && _game.Paused)) return;
            foreach (var entry in _entries)
            {
                if (!_slots.IsActive(entry.Slot)) continue;
                entry.Animation.Advance(Time.frameCount, Time.unscaledDeltaTime);
                if (entry.Animation.Age >= _growth + _settle + _hold + _fade)
                {
                    _slots.Release(entry.Slot);
                    entry.Rect.gameObject.SetActive(false);
                }
                else Animate(entry);
            }
            PositionEntries();
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

        private void PositionEntries()
        {
            if (_entries == null) return;
            foreach (var entry in _entries)
            {
                if (!_slots.IsActive(entry.Slot)) continue;
                int lane = _slots.LaneOf(entry.Slot);
                entry.Rect.anchoredPosition = _lanePositions[lane] + _positionOffset +
                    _overlapDistance * (_slots.Rank(entry.Slot) * LaneScale(entry.Slot));
                if (!_laneVisible[lane]) entry.Group.alpha = 0;
            }
        }

        private static float Ease(float t) => 1 - Mathf.Pow(1 - Mathf.Clamp01(t), 3);

        public void Clear()
        {
            if (_entries == null) return;
            foreach (var entry in _entries)
            {
                entry.Rect.gameObject.SetActive(false);
            }
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
