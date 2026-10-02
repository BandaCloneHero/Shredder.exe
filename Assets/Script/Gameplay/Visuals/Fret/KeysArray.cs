using System.Collections.Generic;
using UnityEngine;
using YARG.Core.Engine.Keys;
using YARG.Core.Game;
using YARG.Gameplay.Player;
using YARG.Themes;
using YARG.Helpers.Extensions;

namespace YARG.Gameplay.Visuals
{
    public class KeysArray : MonoBehaviour
    {
        [SerializeField]
        private float _trackWidth = 2f;

        [Space]
        [SerializeField]
        private float _whiteKeyOffset;
        [SerializeField]
        private float _blackKeyOffset;

        private bool _sevenWhiteKeysMode;
        public float KeySpacing => _trackWidth / (_sevenWhiteKeysMode ? 7 : ProKeysPlayer.WHITE_KEY_VISIBLE_COUNT);
        private float KeyWidthScale => _sevenWhiteKeysMode ? ProKeysPlayer.WHITE_KEY_VISIBLE_COUNT / 7f : 1f;
        private float AdaptOffset(float offset) => !_sevenWhiteKeysMode ? offset :
            -_trackWidth * 0.5f + (offset + _trackWidth * 0.5f) * KeyWidthScale;

        private TrackPlayer _player;

        private readonly List<Fret> _keys = new();

        private static readonly int IndexId = Shader.PropertyToID("_Index");

        public void Initialize(TrackPlayer player, ThemePreset themePreset, ColorProfile.ProKeysColors colors)
        {
            _player = player;
            _sevenWhiteKeysMode = player is ProKeysPlayer { SevenWhiteKeysMode: true };

            var whiteKeyPrefab = ThemeManager.Instance.CreateFretPrefabFromTheme(themePreset, VisualStyle.ProKeys,
                ThemeManager.WHITE_KEY_PREFAB_NAME);
            var blackKeyPrefab = ThemeManager.Instance.CreateFretPrefabFromTheme(themePreset, VisualStyle.ProKeys,
                ThemeManager.BLACK_KEY_PREFAB_NAME);

            // Pro-keys always starts at C

            _keys.Clear();
            int whitePositionIndex = 0;
            int blackPositionIndex = 0;

            for (int i = 0; i < ProKeysPlayer.TOTAL_KEY_COUNT; i++)
            {
                // The index within the octave (0-11)
                int noteIndex = i % 12;
                int octaveIndex = i / 12;

                if (ProKeysUtilities.IsBlackKey(noteIndex))
                {
                    // Black keys

                    var fret = Instantiate(blackKeyPrefab, transform);
                    fret.SetActive(true);
                    fret.transform.localPosition = new Vector3(
                        blackPositionIndex * KeySpacing + AdaptOffset(_blackKeyOffset), 0f, 0f);
                    var blackScale = fret.transform.localScale;
                    blackScale.x *= KeyWidthScale;
                    fret.transform.localScale = blackScale;

                    int group = octaveIndex * 2 + (ProKeysUtilities.IsLowerHalfKey(noteIndex) ? 0 : 1);
                    var color = colors.GetBlackKeyColor(group);
                    if (player is ProKeysPlayer { SevenWhiteKeysMode: true })
                        color = System.Drawing.Color.FromArgb(28, 28, 28);

                    var fretComp = fret.GetComponent<Fret>();
                    fretComp.Initialize(color, color, color, color);

                    var material = fret.GetComponentInChildren<MeshRenderer>().material;
                    material.SetFloat(IndexId, player.HighwayIndex);

                    _keys.Add(fretComp);

                    blackPositionIndex++;
                    if (ProKeysUtilities.IsGapOnNextBlackKey(noteIndex))
                    {
                        blackPositionIndex++;
                    }
                }
                else
                {
                    // White keys

                    var fret = Instantiate(whiteKeyPrefab, transform);
                    fret.SetActive(true);
                    fret.transform.localPosition = new Vector3(
                        whitePositionIndex * KeySpacing + AdaptOffset(_whiteKeyOffset), 0f, 0f);
                    var whiteScale = fret.transform.localScale;
                    whiteScale.x *= KeyWidthScale;
                    fret.transform.localScale = whiteScale;

                    var color = colors.WhiteKey;
                    if (player is ProKeysPlayer { SevenWhiteKeysMode: true }
                        && SevenKeyProKeysLayout.IsPlayable(i))
                        color = SevenKeyProKeysLayout.GetColor(i).ToSystemColor();

                    var fretComp = fret.GetComponent<Fret>();
                    fretComp.Initialize(color, color, color, color);

                    var material = fret.GetComponentInChildren<MeshRenderer>().material;
                    material.SetFloat(IndexId, player.HighwayIndex);

                    _keys.Add(fretComp);

                    whitePositionIndex++;
                }

                // Retain pitch-index slots for the engine, but render only C through B.
                // This includes the five decorative black keys between the seven whites.
                if (player is ProKeysPlayer { SevenWhiteKeysMode: true } && i >= 12)
                    _keys[i].gameObject.SetActive(false);
            }
        }

        public float GetKeyX(int index)
        {
            return _keys[index].transform.localPosition.x;
        }

        public void SetPressed(int index, bool pressed)
        {
            if (!_keys[index].gameObject.activeSelf) return;
            _keys[index].SetPressed(pressed);
        }

        public void PlayHitAnimation(int index)
        {
            if (!_keys[index].gameObject.activeSelf) return;
            _keys[index].PlayHitAnimation();
            _keys[index].PlayHitParticles();
        }

        public void PlayMissAnimation(int index)
        {
            if (!_keys[index].gameObject.activeSelf) return;
            _keys[index].PlayMissAnimation();
            _keys[index].PlayMissParticles();
        }

        public void SetBreMode(bool breMode)
        {
            foreach (var fret in _keys)
            {
                if (!fret.gameObject.activeSelf) continue;
                fret.SetBreMode(breMode);
            }
        }
    }
}
