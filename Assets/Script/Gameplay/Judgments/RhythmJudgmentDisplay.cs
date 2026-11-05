using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    /// <summary>One fixed pool per highway. No coroutines, event subscriptions or per-hit GameObjects.</summary>
    public sealed class RhythmJudgmentDisplay : MonoBehaviour
    {
        [Header("Tipografia e cores")]
        [SerializeField] private TMP_FontAsset _font;
        [SerializeField, Min(1)] private float _fontSize = 48;
        [SerializeField, Min(1)] private float _millisecondsFontSize = 23;
        [SerializeField] private Color _perfect = new(1f, 0.81f, 0.08f);
        [SerializeField] private Color _great = new(0.25f, 1f, 0.22f);
        [SerializeField] private Color _good = new(0.25f, 0.85f, 1f);
        [SerializeField] private Color _miss = new(1f, 0.18f, 0.22f);
        [SerializeField, Range(0, 1)] private float _outlineWidth = 0.22f;

        [Header("Posição na highway")]
        [SerializeField, Range(0, 1)] private float _highwayDepth = 0.12f;
        [SerializeField] private Vector2 _positionOffset = new(0, 28);
        [SerializeField, Min(0.1f)] private float _scale = 1;
        [SerializeField] private Vector2 _overlapDistance = new(0, 58);
        [SerializeField, Range(1, 8)] private int _maximumFeedbacks = 3;

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

        public float HighwayDepth => _highwayDepth;
        public bool IsInitialized => _entries != null;

        private sealed class Entry
        {
            public RectTransform Rect;
            public CanvasGroup Group;
            public TextMeshProUGUI Main, Timing, Glow;
            public JudgmentImpactGraphic Impact;
            public Material GlowMaterial;
            public object Note;
            public RhythmJudgment Judgment;
            public double? Milliseconds;
            public float Age;
            public long Order;
            public bool Active;
        }

        private Entry[] _entries;
        private RectTransform _root;
        private GameManager _game;
        private Canvas _canvas;
        private RectTransform _hudParent;
        private long _order;

        public void Initialize(Transform hudParent, GameManager game)
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
            if (_font == null) _font = TMP_Settings.defaultFontAsset;
            if (_font == null)
            {
                Debug.LogError("[Julgamento] Fonte TMP ausente. Verifique o prefab TrackView.", this);
                return;
            }
            _root = CreateRect("Julgamentos", hudParent, new Vector2(460, 100));
            _root.localScale = Vector3.one * _scale;
            _entries = new Entry[Mathf.Clamp(_maximumFeedbacks, 1, 8)];
            if (_font == null) _font = TMP_Settings.defaultFontAsset;
            for (int i = 0; i < _entries.Length; i++)
            {
                var entry = new Entry();
                entry.Rect = CreateRect("Feedback " + i, _root, new Vector2(460, 100));
                entry.Group = entry.Rect.gameObject.AddComponent<CanvasGroup>();
                entry.Group.blocksRaycasts = entry.Group.interactable = false;
                var impact = CreateRect("Impacto", entry.Rect, new Vector2(250, 65));
                entry.Impact = impact.gameObject.AddComponent<JudgmentImpactGraphic>();
                entry.Impact.raycastTarget = false;
                entry.Glow = CreateText("Brilho", entry.Rect, _fontSize, Vector2.zero, false);
                if (entry.Glow.fontSharedMaterial != null)
                {
                    entry.GlowMaterial = new Material(entry.Glow.fontSharedMaterial);
                    if (entry.GlowMaterial.HasProperty("_GlowPower"))
                    {
                        entry.GlowMaterial.EnableKeyword("GLOW_ON");
                        entry.GlowMaterial.SetFloat("_GlowPower", 0.25f);
                        entry.GlowMaterial.SetFloat("_GlowOuter", 0.15f);
                    }
                    entry.Glow.fontSharedMaterial = entry.GlowMaterial;
                }
                entry.Glow.rectTransform.localScale = Vector3.one * 1.06f;
                entry.Main = CreateText("Julgamento", entry.Rect, _fontSize, Vector2.zero, true);
                entry.Timing = CreateText("Milissegundos", entry.Rect, _millisecondsFontSize, new Vector2(0, -43), true);
                // Warm TMP buffers/materials before the first hit, including Portuguese glyphs.
                entry.Main.SetText("PERFEITO! ÓTIMO! BOM! ERROU!");
                entry.Timing.SetText("+000 ms -000 ms");
                entry.Glow.SetText("PERFEITO! ÓTIMO!");
                entry.Glow.ForceMeshUpdate();
                entry.Main.ForceMeshUpdate();
                entry.Timing.ForceMeshUpdate();
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

        private TextMeshProUGUI CreateText(string name, Transform parent, float size, Vector2 position, bool outline)
        {
            var rect = CreateRect(name, parent, new Vector2(460, 95));
            rect.anchoredPosition = position;
            var text = rect.gameObject.AddComponent<TextMeshProUGUI>();
            text.font = _font;
            text.fontSize = size;
            text.fontStyle = FontStyles.Bold;
            text.alignment = TextAlignmentOptions.Center;
            text.raycastTarget = false;
            text.enableWordWrapping = false;
            if (outline)
            {
                text.outlineColor = new Color32(15, 12, 24, 255);
                text.outlineWidth = _outlineWidth;
            }
            return text;
        }

        public void SetScreenPosition(Vector3 screenPosition)
        {
            if (_root == null) return;
            // Convert screen pixels into the HUD's local coordinates, including CanvasScaler.
            var camera = _canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : _canvas.worldCamera;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(_hudParent, screenPosition,
                camera, out var localPosition)) return;
            _root.anchoredPosition = localPosition + _positionOffset;
            _root.localScale = Vector3.one * _scale;
        }

        public void Show(object logicalNote, RhythmJudgment judgment, double? milliseconds)
        {
            if (_entries == null || !isActiveAndEnabled || (_game != null && _game.Paused)) return;
            Entry selected = null;
            // Chord parts update a single visual, immediately, using the worst actual result.
            if (logicalNote != null)
            {
                foreach (var entry in _entries)
                {
                    if (!entry.Active || !ReferenceEquals(entry.Note, logicalNote)) continue;
                    selected = entry;
                    if ((int)judgment < (int)entry.Judgment ||
                        (judgment == entry.Judgment && Math.Abs(milliseconds ?? 0) <= Math.Abs(entry.Milliseconds ?? 0))) return;
                    break;
                }
            }
            if (selected == null)
            {
                foreach (var entry in _entries)
                    if (!entry.Active) { selected = entry; break; }
            }
            if (selected == null)
            {
                selected = _entries[0];
                foreach (var entry in _entries)
                    if (entry.Order < selected.Order) selected = entry;
            }
            selected.Note = logicalNote;
            selected.Judgment = judgment;
            selected.Milliseconds = milliseconds;
            selected.Age = 0;
            selected.Order = ++_order;
            selected.Active = true;
            var color = judgment switch
            {
                RhythmJudgment.Perfect => _perfect,
                RhythmJudgment.Great => _great,
                RhythmJudgment.Good => _good,
                _ => _miss
            };
            string label = judgment switch
            {
                RhythmJudgment.Perfect => "PERFEITO!",
                RhythmJudgment.Great => "ÓTIMO!",
                RhythmJudgment.Good => "BOM!",
                _ => "ERROU!"
            };
            selected.Main.SetText(label);
            selected.Glow.SetText(label);
            selected.Main.color = selected.Timing.color = color;
            if (selected.GlowMaterial != null && selected.GlowMaterial.HasProperty("_GlowColor"))
                selected.GlowMaterial.SetColor("_GlowColor", color);
            selected.Glow.color = new Color(color.r, color.g, color.b, _glowIntensity);
            selected.Glow.gameObject.SetActive(_enableGlow && (int)judgment <= (int)RhythmJudgment.Great);
            selected.Impact.color = new Color(color.r, color.g, color.b, _impactIntensity);
            selected.Impact.gameObject.SetActive(_enableImpact && (int)judgment <= (int)RhythmJudgment.Great);
            selected.Timing.gameObject.SetActive(milliseconds.HasValue);
            if (milliseconds.HasValue)
            {
                float rounded = (float)Math.Round(milliseconds.Value, MidpointRounding.AwayFromZero);
                selected.Timing.SetText(rounded > 0 ? "+{0:0} ms" : rounded < 0 ? "-{0:0} ms" : "0 ms", Mathf.Abs(rounded));
            }
            selected.Rect.gameObject.SetActive(true);
            selected.Rect.SetAsLastSibling();
            Animate(selected); // Immediate first frame, independent of Update ordering.
            PositionEntries();
        }

        private void Update()
        {
            if (_entries == null || (_game != null && _game.Paused)) return;
            foreach (var entry in _entries)
            {
                if (!entry.Active) continue;
                entry.Age += Time.unscaledDeltaTime;
                if (entry.Age >= _growth + _settle + _hold + _fade)
                {
                    entry.Active = false;
                    entry.Note = null;
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
            float age = entry.Age;
            float scale;
            if (age < _growth) scale = Mathf.Lerp(_initialScale, peak, Ease(age / Mathf.Max(0.001f, _growth)));
            else if (age < _growth + _settle) scale = Mathf.Lerp(peak, 1, Ease((age - _growth) / Mathf.Max(0.001f, _settle)));
            else scale = 1;
            entry.Rect.localScale = Vector3.one * scale;
            entry.Group.alpha = 1 - Mathf.SmoothStep(0, 1, Mathf.Clamp01((age - _growth - _settle - _hold) / Mathf.Max(0.001f, _fade)));
            float flash = Mathf.Clamp01(age / Mathf.Max(0.001f, _growth + _settle));
            entry.Impact.rectTransform.localScale = Vector3.one * Mathf.Lerp(0.6f, 1.3f, Ease(flash));
            Color color = entry.Impact.color;
            color.a = (1 - flash) * _impactIntensity * intensity;
            entry.Impact.color = color;
        }

        private void PositionEntries()
        {
            foreach (var entry in _entries)
            {
                if (!entry.Active) continue;
                int rank = 0;
                foreach (var other in _entries)
                    if (other.Active && other.Order > entry.Order) rank++;
                entry.Rect.anchoredPosition = _overlapDistance * rank;
            }
        }

        private static float Ease(float t) => 1 - Mathf.Pow(1 - Mathf.Clamp01(t), 3);

        public void Clear()
        {
            if (_entries == null) return;
            foreach (var entry in _entries)
            {
                entry.Active = false;
                entry.Note = null;
                entry.Rect.gameObject.SetActive(false);
            }
            _order = 0;
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
            Show(null, judgment, milliseconds);
        }

        private void OnDisable() => Clear();

        private void OnDestroy()
        {
            // TMP outline setters create private materials; release them with the pool.
            if (_entries != null)
                foreach (var entry in _entries)
                {
                    if (entry.GlowMaterial != null) Destroy(entry.GlowMaterial);
                    if (entry.Main != null) Destroy(entry.Main.fontMaterial);
                    if (entry.Timing != null) Destroy(entry.Timing.fontMaterial);
                }
            if (_root != null) Destroy(_root.gameObject);
        }
    }
}
