using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using Cysharp.Threading.Tasks;
using DG.Tweening;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using YARG.Core;
using YARG.Core.Audio;
using YARG.Core.Engine.Drums;
using YARG.Core.Engine.Guitar;
using YARG.Core.Engine.Keys;
using YARG.Core.Engine.Vocals;
using YARG.Core.Input;
using YARG.Core.Logging;
using YARG.Core.Replays;
using YARG.Core.Replays.Analyzer;
using YARG.Core.Song;
using YARG.Localization;
using YARG.Menu.MusicLibrary;
using YARG.Menu.Navigation;
using YARG.Menu.Persistent;
using YARG.Scores;
using YARG.Song;
using YARG.Playlists;
using YARG.Helpers.Extensions;
using YARG.Core.Engine;
using YARG.Playback;
using YARG.Settings;
using YARG.Integration;

namespace YARG.Menu.ScoreScreen
{
    public class ScoreScreenMenu : MonoBehaviour
    {
        [SerializeField]
        private Transform _cardContainer;
        [SerializeField]
        private Image _sourceIcon;
        [SerializeField]
        private RawImage _albumCover;
        [SerializeField]
        private TextMeshProUGUI _songTitle;
        [SerializeField]
        private TextMeshProUGUI _artistName;
        [SerializeField]
        private StarView _bandStarView;
        [SerializeField]
        private TextMeshProUGUI _bandScore;
        [SerializeField]
        private ColoredPillElement _bandScoreNotSavedPill;
        [SerializeField]
        private ScrollRect _cardScrollRect;
        [SerializeField]
        private float _horizontalScrollRate = 30f;
        [SerializeField]
        private float _horizontalScrollDuration = 0.25f;
        [SerializeField]
        private Ease _horizontalScrollEase = Ease.OutCubic;
        [SerializeField]
        private float _verticalScrollRate = 15f;

        [Space]
        [SerializeField]
        private GuitarScoreCard _guitarCardPrefab;
        [SerializeField]
        private DrumsScoreCard _drumsCardPrefab;
        [SerializeField]
        private VocalsScoreCard _vocalsCardPrefab;
        [SerializeField]
        private ProKeysScoreCard _keysCardPrefab;

        private enum ScrollDirection
        {
            Left,
            Right
        }

        private bool _analyzingReplay;
        private bool _restartingSong;
        private bool _showAdvancedStats;

        private float                   _horizontalScrollStep;
        private Tween                   _horizontalScrollTween;
        private CancellationTokenSource _cancellationToken;

        private readonly List<IScoreCard<BaseStats>> _scoreCards = new();
        [SerializeField] private Sprite bossResultPortrait;
        private Tween _bandScoreReveal;
        private Tween _bossReveal;
        private bool _navigationReady;
        private float _lastResultWidth = -1f;
        private int _lastResultCount = -1;

        private void Awake()
        {
            ScoreScreenText.Apply(transform);
        }


        private void OnEnable()
        {
            var song = GlobalVariables.State.CurrentSong;

            if (GlobalVariables.State.ScoreScreenStats is null)
            {
                YargLogger.LogError("Score screen stats was null!");
                return;
            }

            var scoreScreenStats = GlobalVariables.State.ScoreScreenStats.Value;

#if UNITY_EDITOR || YARG_NIGHTLY_BUILD || YARG_TEST_BUILD
            // Do analysis of replay before showing any score data
            // This will make it so that if the analysis takes a while the screen is blank
            // (kinda like a loading screen)
            try
            {
                if (!AnalyzeReplay(song, scoreScreenStats.ReplayInfo))
                {
                    DialogManager.Instance.ShowMessage("Inconsistent Replay Results!",
                        "The replay analysis for this run produced inconsistent results to the actual gameplay.\n" +
                        "Please report this issue to the YARG developers on GitHub or Discord.\n\n" +
                        $"Chart Hash: {song.Hash}");
                }
            }
            catch (Exception ex)
            {
                YargLogger.LogException(ex, $"Failed to analyze replay! Song hash: {song.Hash}");
                DialogManager.Instance.ShowMessage("Failed To Analyze Replay!",
                    "The replay analysis for this run resulted in an unexpected error.\n" +
                    "Please report this issue to the YARG developers on GitHub or Discord.\n\n" +
                    $"Chart Hash: {song.Hash}");
            }
#endif

            // Play audience chatter
            if (SettingsManager.Settings.UseCrowdFx.Value == CrowdFxMode.Enabled)
            {
                GlobalAudioHandler.PlaySoundEffect(SfxSample.Chatter, 1.0);
            }

            // Set text
            _songTitle.text = song.Name;
            _artistName.text = song.Artist;

            var scoreNotSavedText = Localize.Key("Menu.ScoreScreen.BandScoreNotSaved");
            _bandScoreNotSavedPill.SetValues(scoreNotSavedText,
                ColoredPillElement.ColoredPillPreset.HarderModifier);
            _bandScoreNotSavedPill.gameObject.SetActive(
                !ScoreContainer.IsBandScoreValid(PersistentState.Default.SongSpeed));

            // Set speed text (if not at 100% speed)
            if (!Mathf.Approximately(GlobalVariables.State.SongSpeed, 1f))
            {
                var speed = Localize.Percent(GlobalVariables.State.SongSpeed);

                _songTitle.text += $" ({speed})";
            }

            // Set the band score and stars
            _bandStarView.SetStars(scoreScreenStats.BandStars);
            _bandScore.text = scoreScreenStats.BandScore.ToString("N0");
            _bandScoreReveal?.Kill();
            int finalBandScore = scoreScreenStats.BandScore;
            _bandScoreReveal = DOVirtual.Float(0f, 1f, 0.95f,
                progress => _bandScore.text = Mathf.RoundToInt(finalBandScore * progress).ToString("N0"))
                .SetEase(Ease.OutCubic).SetUpdate(true)
                .OnComplete(() => _bandScore.text = finalBandScore.ToString("N0"));

            // Enable continue/restart before building cosmetic result elements.
            SetNavigationScheme();
            _navigationReady = true;
            // Put the scores in!
            ShowBossBattleSummary(scoreScreenStats.BossBattle);
            CreateScoreCards(scoreScreenStats);
            StartCoroutine(OperatorScoreReporter.Send(scoreScreenStats, song));

            UpdateNavigationScheme(true);

            _sourceIcon.sprite = SongSources.SourceToIcon(song.Source);

            _cancellationToken = new CancellationTokenSource();
            _albumCover.LoadAlbumCover(song, _cancellationToken.Token, 0.2f);

            //set restarting state
            _restartingSong = false;
        }

        private void OnDisable()
        {
            _bandScoreReveal?.Kill();
            _bossReveal?.Kill();
            MusicLibraryMenu.CurrentlyPlaying = GlobalVariables.State.CurrentSong;
            if (!GlobalVariables.State.PlayingAShow && !_restartingSong)
            {
                GlobalVariables.State = PersistentState.Default;
            }

            if (SettingsManager.Settings.UseCrowdFx.Value == CrowdFxMode.Enabled)
            {
                GlobalAudioHandler.StopSoundEffect(SfxSample.Chatter, 1.0);
            }

            KillScrollTween();

            _cancellationToken?.Cancel();
            _cancellationToken?.Dispose();
            if (_navigationReady)
            {
                Navigator.Instance.PopScheme();
                _navigationReady = false;
            }
        }

        private GameObject _bossSummary;
        private Vector2 _originalScrollOffsetMax;
        private bool _bossSummaryLayoutApplied;

        private void ShowBossBattleSummary(BossBattleResult battle)
        {
            var scrollRect = (RectTransform)_cardScrollRect.transform;
            if (_bossSummary != null) Destroy(_bossSummary);
            if (_bossSummaryLayoutApplied)
            {
                scrollRect.offsetMax = _originalScrollOffsetMax;
                _bossSummaryLayoutApplied = false;
            }
            if (battle == null) return;

            // Shrink the scroll root: ScrollRect drives viewport geometry when hiding its scrollbar.
            _originalScrollOffsetMax = scrollRect.offsetMax;
            scrollRect.offsetMax = _originalScrollOffsetMax - new Vector2(0f, 122f);
            _bossSummaryLayoutApplied = true;
            _bossSummary = new GameObject("Boss Battle Summary", typeof(RectTransform), typeof(Image));
            _bossSummary.transform.SetParent(_cardScrollRect.transform, false);
            var rect = (RectTransform)_bossSummary.transform;
            rect.anchorMin = new Vector2(0f, 1f);
            rect.anchorMax = Vector2.one;
            rect.pivot = new Vector2(0.5f, 1f);
            rect.anchoredPosition = new Vector2(0f, 122f);
            rect.sizeDelta = new Vector2(0f, 112f);
            var background = _bossSummary.GetComponent<Image>();
            background.color = new Color(0.025f, 0.035f, 0.075f, 0.95f);
            background.raycastTarget = false;
            Color accent = battle.Defeated ? new Color(0.35f, 0.96f, 0.75f) : new Color(1f, 0.55f, 0.35f);
            var stripeObject = new GameObject("Neon Accent", typeof(RectTransform), typeof(Image));
            stripeObject.transform.SetParent(rect, false);
            var stripe = stripeObject.GetComponent<Image>();
            stripe.color = accent;
            stripe.raycastTarget = false;
            stripe.rectTransform.anchorMin = Vector2.zero;
            stripe.rectTransform.anchorMax = new Vector2(1f, 0f);
            stripe.rectTransform.pivot = new Vector2(0.5f, 0f);
            stripe.rectTransform.sizeDelta = new Vector2(0f, 3f);
            if (bossResultPortrait != null)
            {
                var portraitObject = new GameObject("Boss Portrait", typeof(RectTransform), typeof(Image));
                portraitObject.transform.SetParent(rect, false);
                var portrait = portraitObject.GetComponent<Image>();
                portrait.sprite = bossResultPortrait;
                portrait.preserveAspect = true;
                portrait.raycastTarget = false;
                portrait.rectTransform.anchorMin = portrait.rectTransform.anchorMax = new Vector2(0f, 0.5f);
                portrait.rectTransform.pivot = new Vector2(0f, 0.5f);
                portrait.rectTransform.anchoredPosition = new Vector2(16f, 0f);
                portrait.rectTransform.sizeDelta = new Vector2(104f, 104f);
            }

            var textObject = new GameObject("Battle Result", typeof(RectTransform), typeof(TextMeshProUGUI));
            textObject.transform.SetParent(rect, false);
            var label = textObject.GetComponent<TextMeshProUGUI>();
            label.rectTransform.anchorMin = Vector2.zero;
            label.rectTransform.anchorMax = Vector2.one;
            label.rectTransform.offsetMin = new Vector2(bossResultPortrait != null ? 128f : 18f, 10f);
            label.rectTransform.offsetMax = new Vector2(-18f, -6f);
            label.font = _songTitle.font;
            label.fontSharedMaterial = _songTitle.fontSharedMaterial;
            label.fontSize = 32f;
            label.enableAutoSizing = true;
            label.fontSizeMin = 16f;
            label.fontSizeMax = 32f;
            label.alignment = TextAlignmentOptions.Center;
            label.raycastTarget = false;
            label.color = Color.white;
            label.richText = true;
            float remainingPercent = battle.MaxHealth > 0f
                ? Mathf.Clamp01(battle.RemainingHealth / battle.MaxHealth) * 100f : 0f;
            string status = battle.Defeated ? "DERROTADO — A BANDA VENCEU!" : "SOBREVIVEU — ATÉ A PRÓXIMA!";
            string color = battle.Defeated ? "59F4C0" : "FFB070";
            label.text = $"<color=#{color}><b>{battle.BossName.ToUpperInvariant()} {status}</b></color>\n"
                + $"<size=60%>Vida restante: {battle.RemainingHealth:0.#} / {battle.MaxHealth:0.#} ({remainingPercent:0.#}%)</size>";
            _bossReveal?.Kill();
            var revealGroup = _bossSummary.AddComponent<CanvasGroup>();
            revealGroup.alpha = 0f;
            _bossReveal = revealGroup.DOFade(1f, 0.55f).SetUpdate(true);
        }

        private void CreateScoreCards(ScoreScreenStats scoreScreenStats)
        {
            int fcCount = 0;
            int highScoreCount = 0;

            foreach (var score in scoreScreenStats.PlayerScores)
            {
                // Bots don't get vox
                if (!score.Player.Profile.IsBot)
                {
                    // We intentionally don't count both high score and full combo
                    if (score.Stats.IsFullCombo)
                    {
                        fcCount++;
                    }
                    else if (score.IsHighScore)
                    {
                        highScoreCount++;
                    }
                }

                IScoreCard<BaseStats> card = null;

                switch (score.Player.Profile.GameMode)
                {
                    case GameMode.FiveFretGuitar:
                    {
                        card = Instantiate(_guitarCardPrefab, _cardContainer);
                        ((ScoreCard<GuitarStats>)card).Initialize(score.IsHighScore, score.Player, score.Stats as GuitarStats, score.AverageMultiplier);
                        break;
                    }
                    case GameMode.FourLaneDrums:
                    case GameMode.FiveLaneDrums:
                    case GameMode.EliteDrums:
                    {
                        card = Instantiate(_drumsCardPrefab, _cardContainer);
                        ((ScoreCard<DrumsStats>)card).Initialize(score.IsHighScore, score.Player, score.Stats as DrumsStats, score.AverageMultiplier);
                        break;
                    }
                    case GameMode.Vocals:
                    {
                        card = Instantiate(_vocalsCardPrefab, _cardContainer);
                        ((ScoreCard<VocalsStats>)card).Initialize(score.IsHighScore, score.Player, score.Stats as VocalsStats, score.AverageMultiplier);
                        break;
                    }
                    case GameMode.ProKeys:
                    {
                        card = Instantiate(_keysCardPrefab, _cardContainer);
                        ((ScoreCard<KeysStats>) card).Initialize(score.IsHighScore, score.Player, score.Stats as KeysStats, score.AverageMultiplier);
                        break;
                    }
                }

                Debug.Assert(card != null, $"ScoreCard not initialized for GameMode: {score.Player.Profile.GameMode}");
                card.SetCardContents();
                _scoreCards.Add(card);
            }

            // Mark that the music library should refresh when next opened
            if (GlobalVariables.State.ScoreScreenStats.Value.PlayerScores.Any(e => !e.Player.Profile.IsBot))
            {
                MusicLibraryMenu.NeedsReload();
            }

            // Make sure to update the canvases since we *just* added the score cards
            Canvas.ForceUpdateCanvases();
            FitAllResultCards();
            Canvas.ForceUpdateCanvases();

            // If the scroll bar is active, make it all the way to the left
            InitializeScrollRect();

            // As a final bonus, play the appropriate full combo/high score vox samples
            PlayScoreVox(fcCount, highScoreCount);
        }

        private void KillScrollTween()
        {
            _horizontalScrollTween?.Kill();
            _horizontalScrollTween = null;
        }

        private async void InitializeScrollRect()
        {
            KillScrollTween();
            _cardScrollRect.horizontalNormalizedPosition = 0f;
            SetupScrollStep();
        }

        private void SetupScrollStep()
        {
            if (_cardContainer.childCount == 0) return;
            var cardRect = _cardContainer.GetChild(0) as RectTransform;
            var layoutGroup = _cardContainer.GetComponent<HorizontalLayoutGroup>();
            if (cardRect == null || layoutGroup == null) return;
            _horizontalScrollStep = cardRect.rect.width * cardRect.localScale.x + layoutGroup.spacing;
        }

        private void LateUpdate()
        {
            FitAllResultCards();
        }

        private void FitAllResultCards()
        {
            if (_cardScrollRect == null || _cardContainer == null || _cardContainer.childCount == 0) return;
            var viewport = _cardScrollRect.viewport != null ? _cardScrollRect.viewport
                : (RectTransform)_cardScrollRect.transform;
            float width = viewport.rect.width;
            int count = _cardContainer.childCount;
            if (width <= 0f || (Mathf.Approximately(width, _lastResultWidth) && count == _lastResultCount)) return;
            var layout = _cardContainer.GetComponent<HorizontalLayoutGroup>();
            if (layout == null) return;
            _lastResultWidth = width;
            _lastResultCount = count;
            float available = Mathf.Max(1f, width - layout.padding.horizontal - layout.spacing * (count - 1) - 2f);
            float totalWidth = 0f;
            foreach (Transform child in _cardContainer)
                if (child is RectTransform card) totalWidth += card.rect.width;
            if (totalWidth <= 0f) return;
            float scale = Mathf.Min(1f, available / totalWidth);
            layout.childScaleWidth = true;
            layout.childScaleHeight = true;
            foreach (Transform child in _cardContainer)
                child.localScale = new Vector3(scale, scale, 1f);
            LayoutRebuilder.MarkLayoutForRebuild((RectTransform)_cardContainer);
            SetupScrollStep();
        }

        private static void PlayScoreVox(int fcCount, int highScoreCount)
        {
            if (fcCount > 0)
            {
                GlobalAudioHandler.PlayVoxSample(VoxSample.FullCombo);
                YargLogger.LogInfo("Playing full combo vox sample");
            }

            if (fcCount > 1)
            {
                YargLogger.LogDebug($"Playing full combo vox sample for {fcCount} times");
                switch (fcCount)
                {
                    case 2:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times2);
                        break;
                    case 3:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times3);
                        break;
                    case 4:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times4);
                        break;
                    case 5:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times5);
                        break;
                    case 6:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times6);
                        break;
                    case > 6:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.TimesMany);
                        break;
                }
            }

            if (highScoreCount > 0)
            {
                GlobalAudioHandler.PlayVoxSample(VoxSample.HighScore);
                YargLogger.LogInfo("Playing high score vox sample");
            }

            if (highScoreCount > 1)
            {
                switch (highScoreCount)
                {
                    case 2:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times2);
                        break;
                    case 3:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times3);
                        break;
                    case 4:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times4);
                        break;
                    case 5:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times5);
                        break;
                    case 6:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.Times6);
                        break;
                    case > 6:
                        GlobalAudioHandler.PlayVoxSample(VoxSample.TimesMany);
                        break;
                }
            }
        }

#nullable enable
        private bool AnalyzeReplay(SongEntry songEntry, ReplayInfo? replayEntry)
#nullable disable
        {
            _analyzingReplay = true;

            var chart = songEntry.LoadChart();
            if (chart == null)
            {
                YargLogger.LogError("Chart did not load");
                _analyzingReplay = false;
                return true;
            }

            if (GlobalVariables.State.ScoreScreenStats.Value.PlayerScores.All(e => e.Player.Profile.IsBot))
            {
                YargLogger.LogInfo("No human players in ReplayEntry.");
                _analyzingReplay = false;
                return true;
            }

            if (replayEntry == null)
            {
                YargLogger.LogError("ReplayEntry is null");
                _analyzingReplay = false;
                return true;
            }

            var replayOptions = new ReplayReadOptions
            {
                KeepFrameTimes = GlobalVariables.VerboseReplays
            };
            var (result, data) = ReplayIO.TryLoadData(replayEntry, replayOptions);
            if (result != ReplayReadResult.Valid)
            {
                YargLogger.LogFormatError("Replay did not load. {0}", result);
                _analyzingReplay = false;
                return true;
            }

            var results = ReplayAnalyzer.AnalyzeReplay(chart, replayEntry, data);
            bool allPass = true;

            for (int i = 0; i < results.Length; i++)
            {
                var analysisResult = results[i];

                // Always print the stats in debug mode
#if UNITY_EDITOR || YARG_TEST_BUILD
                YargLogger.LogFormatInfo("({0}, {1}/{2}) Verification Result: {3}. Stats:\n{4}",
                    data.Frames[i].Profile.Name, data.Frames[i].Profile.CurrentInstrument,
                    data.Frames[i].Profile.CurrentDifficulty, item4: analysisResult.Passed ? "Passed" : "Failed",
                    item5: analysisResult.StatLog);
#endif

                if (!analysisResult.Passed)
                {
#if !(UNITY_EDITOR || YARG_TEST_BUILD)
                    YargLogger.LogFormatWarning("({0}, {1}/{2}) FAILED verification. Stats:\n{3}",
                        data.Frames[i].Profile.Name, data.Frames[i].Profile.CurrentInstrument,
                        data.Frames[i].Profile.CurrentDifficulty, item4: analysisResult.StatLog);
#endif
                    _analyzingReplay = false;
                    allPass = false;
                }
            }

            _analyzingReplay = false;
            return allPass;
        }

        private NavigationScheme.Entry _continueButtonEntry;
        private NavigationScheme.Entry _endEarlyButtonEntry;
        private NavigationScheme.Entry _restartButtonEntry;
        private NavigationScheme.Entry _showAdvancedButtonEntry;
        private NavigationScheme.Entry _removeFavoriteButtonEntry;
        private NavigationScheme.Entry _addFavoriteButtonEntry;
        private NavigationScheme.Entry _scrollLeftEntry;
        private NavigationScheme.Entry _scrollRightEntry;
        private NavigationScheme.Entry _scrollUpEntry;
        private NavigationScheme.Entry _scrollDownEntry;

        private void SetNavigationScheme()
        {
            var song = GlobalVariables.State.CurrentSong;

            _continueButtonEntry = new NavigationScheme.Entry(MenuAction.Green, "Menu.Common.Continue", () =>
                {
                    if (!_analyzingReplay)
                    {
                        GlobalVariables.State.ShowIndex++;
                        if (GlobalVariables.State.PlayingAShow &&
                            GlobalVariables.State.ShowIndex < GlobalVariables.State.ShowSongs.Count)
                        {
                            // Reset CurrentSong and launch back into the Gameplay scene
                            GlobalVariables.State.CurrentSong =
                                GlobalVariables.State.ShowSongs[GlobalVariables.State.ShowIndex];
                            GlobalVariables.Instance.LoadScene(SceneIndex.Gameplay);
                        }
                        else
                        {
                            GlobalVariables.State.PlayingAShow = false;
                            GlobalVariables.Instance.LoadScene(SceneIndex.Menu);
                        }
                    }
                });

            _endEarlyButtonEntry = new NavigationScheme.Entry(MenuAction.Red, "Menu.ScoreScreen.EndSetlistEarly", () =>
            {
                GlobalVariables.State.PlayingAShow = false;
                GlobalVariables.Instance.LoadScene(SceneIndex.Menu);
            });

            _restartButtonEntry = new NavigationScheme.Entry(MenuAction.Yellow, "Menu.ScoreScreen.RestartSong", () =>
            {
                _restartingSong = true;
                GlobalVariables.Instance.LoadScene(SceneIndex.Gameplay);
            });

            _addFavoriteButtonEntry = new NavigationScheme.Entry(MenuAction.Blue, "Menu.MusicLibrary.Popup.Item.AddToFavorites", () =>
                {
                    YargLogger.LogInfo("added favorite");
                    PlaylistContainer.FavoritesPlaylist.AddSong(song);
                    UpdateNavigationScheme(true);
                });

            _removeFavoriteButtonEntry = new NavigationScheme.Entry(MenuAction.Blue, "Menu.MusicLibrary.Popup.Item.RemoveFromFavorites", () =>
                {
                    YargLogger.LogInfo("removed favorite");
                    PlaylistContainer.FavoritesPlaylist.RemoveSong(song);
                    UpdateNavigationScheme(true);
                });

            UpdateShowAdvancedButton();

            _scrollLeftEntry = new NavigationScheme.Entry(MenuAction.Left, "Menu.Common.Scroll", context =>
                {
                    ScrollScoresHorizontal(ScrollDirection.Left, context.IsRepeat);
                });

            _scrollRightEntry = new NavigationScheme.Entry(MenuAction.Right, "Menu.Common.Scroll", context =>
                {
                    ScrollScoresHorizontal(ScrollDirection.Right, context.IsRepeat);
                });

            _scrollUpEntry = new NavigationScheme.Entry(MenuAction.Up, "Menu.Common.Scroll", context =>
                {
                    ScrollScoreCard(context.Player, _verticalScrollRate);
                });

            _scrollDownEntry = new NavigationScheme.Entry(MenuAction.Down, "Menu.Common.Scroll", context =>
                {
                    ScrollScoreCard(context.Player, -1 * _verticalScrollRate);
                });

            UpdateNavigationScheme();
        }
        private void ScrollScoresHorizontal(ScrollDirection direction, bool isHeld)
        {
            float scrollableWidth = _cardScrollRect.ScrollableWidth();
            bool canScroll = scrollableWidth > 0f;
            if (!canScroll)
            {
                return;
            }

            // If dpad is held, ignore repeated inputs while tween is active
            bool isTweenActive = _horizontalScrollTween != null;
            if (isHeld && isTweenActive)
            {
                return;
            }

            float startPos = _cardScrollRect.horizontalNormalizedPosition;
            float directionMultiplier = direction == ScrollDirection.Right ? 1f : -1f;
            float targetPos = Mathf.Clamp(startPos + directionMultiplier * _horizontalScrollStep / scrollableWidth, 0f, 1f);

            if (targetPos == startPos)
            {
                return;
            }

            SmoothScrollTo(targetPos);
        }

        private void SmoothScrollTo(float targetPos)
        {
            KillScrollTween();
            _horizontalScrollTween = _cardScrollRect
                .DOHorizontalNormalizedPos(targetPos, _horizontalScrollDuration)
                .SetEase(_horizontalScrollEase)
                .SetUpdate(true)
                .OnComplete(() => _horizontalScrollTween = null);
        }

        private void ScrollScoreCard(Player.YargPlayer player, float delta)
        {
            var card = _scoreCards.FirstOrDefault(card => card.Player == player);
            card?.ScrollStats(delta);
        }

        private void ToggleAdvancedStats()
        {
            _showAdvancedStats = !_showAdvancedStats;
            UpdateShowAdvancedButton();

            foreach (var scoreCard in _scoreCards)
            {
                scoreCard.SetAdvancedStatsShown(_showAdvancedStats);
            }

            UpdateNavigationScheme(true);
        }

        private void UpdateShowAdvancedButton()
        {
            var key = _showAdvancedStats ? "Menu.ScoreScreen.HideAdvanced" : "Menu.ScoreScreen.ShowAdvanced";
            _showAdvancedButtonEntry = new NavigationScheme.Entry(MenuAction.Orange, key, ToggleAdvancedStats);
        }

        private void UpdateNavigationScheme(bool reset = false)
        {
            if (reset)
            {
                Navigator.Instance.PopScheme();
            }

            List<NavigationScheme.Entry> buttons = new()
            {
                _continueButtonEntry,
                _restartButtonEntry
            };

            var song = GlobalVariables.State.CurrentSong;
            var isFavorited = PlaylistContainer.FavoritesPlaylist.ContainsSong(song);

            if (isFavorited)
            {
                buttons.Add(_removeFavoriteButtonEntry);
            }
            else
            {
                buttons.Add(_addFavoriteButtonEntry);
            }

            if (_scoreCards.Any(card => card is not ScoreCard<VocalsStats>))
            {
                buttons.Add(_showAdvancedButtonEntry);
            }

            if (GlobalVariables.State.PlayingAShow &&
                GlobalVariables.State.ShowIndex + 1 < GlobalVariables.State.ShowSongs.Count)
            {
                buttons.Insert(1, _endEarlyButtonEntry);
            }

            buttons.Add(_scrollLeftEntry);
            buttons.Add(_scrollRightEntry);
            buttons.Add(_scrollUpEntry);
            buttons.Add(_scrollDownEntry);
            Navigator.Instance.PushScheme(new(buttons, true));
        }
    }
}
