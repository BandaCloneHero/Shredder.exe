using System;
using System.Collections;
using System.Reflection;
using UnityEngine;
using UnityEngine.UI;
using YARG.Gameplay.HUD;
using YARG.Gameplay.Player;

namespace YARG.Gameplay
{
    public class TrackAvatar : MonoBehaviour
    {
        [Header("Componentes de UI")]
        [SerializeField] private Image avatarImage;

        [Header("Track/Engine")]
        [SerializeField] private TrackPlayer trackPlayer;

        [Header("Sprites do Personagem")]
        [SerializeField] private Sprite normalSprite;
        [SerializeField] private Sprite missSprite;

        [Header("Configurações")]
        [SerializeField] private float missDuration = 1.2f;

        private Coroutine _missCoroutine;
        private Coroutine _connectionCoroutine;
        private object _engineInstance;
        private EventInfo _hitEvent;
        private EventInfo _missEvent;
        private Delegate _hitEventHandler;
        private Delegate _eventHandler;

        public event Action<int> NoteHit;

        private void Awake()
        {
            if (avatarImage == null) avatarImage = GetComponent<Image>();
            ResolveTrackPlayer();
        }

        private void OnEnable()
        {
            if (avatarImage != null && normalSprite != null)
            {
                avatarImage.sprite = normalSprite;
            }

            ResolveTrackPlayer();
            SubscribeToCurrentEngine();
        }

        private void OnDisable()
        {
            if (_connectionCoroutine != null)
            {
                StopCoroutine(_connectionCoroutine);
                _connectionCoroutine = null;
            }

            DesinscreverDosEventos();
        }

        private void ResolveTrackPlayer()
        {
            if (trackPlayer != null)
            {
                return;
            }

            trackPlayer = GetComponentInParent<TrackPlayer>(true);

            if (trackPlayer == null)
            {
                var trackView = GetComponentInParent<TrackView>(true);
                if (trackView != null)
                {
                    trackPlayer = trackView.GetComponentInParent<TrackPlayer>(true);
                }
            }
        }

        private void SubscribeToCurrentEngine()
        {
            if (_engineInstance != null && _hitEvent != null && _missEvent != null)
            {
                return;
            }

            if (trackPlayer == null)
            {
                if (_connectionCoroutine == null)
                {
                    _connectionCoroutine = StartCoroutine(ConectarAosEventos());
                }
                return;
            }

            var engineProperty = trackPlayer.GetType().GetProperty("Engine");
            if (engineProperty == null)
            {
                if (_connectionCoroutine == null)
                {
                    _connectionCoroutine = StartCoroutine(ConectarAosEventos());
                }
                return;
            }

            var engine = engineProperty.GetValue(trackPlayer);
            if (engine == null)
            {
                if (_connectionCoroutine == null)
                {
                    _connectionCoroutine = StartCoroutine(ConectarAosEventos());
                }
                return;
            }

            var hitEventInfo = engine.GetType().GetEvent("OnNoteHit");
            var missEventInfo = engine.GetType().GetEvent("OnNoteMissed");
            if (hitEventInfo == null || missEventInfo == null)
            {
                return;
            }

            _engineInstance = engine;
            _hitEvent = hitEventInfo;
            _missEvent = missEventInfo;

            var hitMethodInfo = typeof(TrackAvatar).GetMethod(nameof(HandleNoteHitReflection), BindingFlags.Instance | BindingFlags.NonPublic);
            _hitEventHandler = Delegate.CreateDelegate(hitEventInfo.EventHandlerType, this, hitMethodInfo);
            _hitEvent.AddEventHandler(_engineInstance, _hitEventHandler);

            var missMethodInfo = typeof(TrackAvatar).GetMethod(nameof(HandleNoteMissedReflection), BindingFlags.Instance | BindingFlags.NonPublic);
            _eventHandler = Delegate.CreateDelegate(missEventInfo.EventHandlerType, this, missMethodInfo);
            _missEvent.AddEventHandler(_engineInstance, _eventHandler);
        }

        private IEnumerator ConectarAosEventos()
        {
            while (trackPlayer == null)
            {
                ResolveTrackPlayer();
                if (trackPlayer == null)
                {
                    yield return new WaitForSeconds(0.1f);
                    continue;
                }
            }

            while (trackPlayer.GetType().GetProperty("Engine")?.GetValue(trackPlayer) == null)
            {
                yield return new WaitForSeconds(0.1f);
            }

            _connectionCoroutine = null;
            SubscribeToCurrentEngine();
        }

        private void DesinscreverDosEventos()
        {
            if (_engineInstance != null && _hitEvent != null && _hitEventHandler != null)
            {
                _hitEvent.RemoveEventHandler(_engineInstance, _hitEventHandler);
            }

            if (_engineInstance != null && _missEvent != null && _eventHandler != null)
            {
                _missEvent.RemoveEventHandler(_engineInstance, _eventHandler);
            }

            _engineInstance = null;
            _hitEvent = null;
            _missEvent = null;
            _hitEventHandler = null;
            _eventHandler = null;
        }

        private void HandleNoteHitReflection(int track, object note)
        {
            NoteHit?.Invoke(track);
        }

        private void HandleNoteMissedReflection(int track, object note)
        {
            OnNoteMissed();
        }

        [ContextMenu("Testar Miss")]
        public void OnNoteMissed()
        {
            if (avatarImage == null || missSprite == null) return;

            if (_missCoroutine != null)
            {
                StopCoroutine(_missCoroutine);
            }

            _missCoroutine = StartCoroutine(ShowMissRoutine());
        }

        private IEnumerator ShowMissRoutine()
        {
            avatarImage.sprite = missSprite;
            yield return new WaitForSeconds(missDuration);
            avatarImage.sprite = normalSprite;
            _missCoroutine = null;
        }
    }
}