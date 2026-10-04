using UnityEngine;
using UnityEngine.InputSystem;

namespace YARG.Menu.Main
{
    public class MainMenuBackground : MonoBehaviour
    {
        [SerializeField]
        private Transform _cameraContainer;
        [SerializeField]
        private Camera _camera;
        [SerializeField]
        private SpriteRenderer _background;

        private void FitBackground()
        {
            if (_background == null || _background.sprite == null || _camera == null) return;
            float distance = Vector3.Dot(_background.transform.position - _camera.transform.position,
                _camera.transform.forward);
            if (distance <= 0f) return;
            float height = _camera.orthographic ? _camera.orthographicSize * 2f
                : 2f * distance * Mathf.Tan(_camera.fieldOfView * Mathf.Deg2Rad * 0.5f);
            Vector3 size = _background.sprite.bounds.size;
            // Cover the viewport without distorting the illustration, with room for cursor parallax.
            float scale = Mathf.Max(height / size.y, height * _camera.aspect / size.x) * 1.06f;
            _background.transform.localScale = new Vector3(scale, scale, 1f);
        }

        private void Start()
        {
            _cameraContainer.transform.position = new Vector3(0, 2f, 0);
            FitBackground();
        }

        private void Update()
        {
            FitBackground();
            // Move the camera container down
            _cameraContainer.transform.position = Vector3.Lerp(_cameraContainer.transform.position,
                new Vector3(0, 0.5f, 0), Time.deltaTime * 1.5f);

            // Get the mouse position
            if (Mouse.current == null) return;
            var mousePos = Mouse.current.position.ReadValue();
            mousePos = _camera.ScreenToViewportPoint(mousePos);

            // Clamp
            mousePos.x = Mathf.Clamp(mousePos.x, 0f, 1f);
            mousePos.y = Mathf.Clamp(mousePos.y, 0f, 1f);

            // Move camera with the cursor
            var transformCache = _camera.transform;
            var initialPos = transformCache.localPosition;
            transformCache.localPosition = initialPos
                .WithX(Mathf.Lerp(initialPos.x, mousePos.x / 4f, Time.deltaTime * 8f))
                .WithY(Mathf.Lerp(initialPos.y, mousePos.y / 3f - 0.25f, Time.deltaTime * 8f));
        }
    }
}
