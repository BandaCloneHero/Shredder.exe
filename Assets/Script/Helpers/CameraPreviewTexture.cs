using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace YARG.Helpers
{
    public class CameraPreviewTexture : MonoBehaviour
    {
        public static RenderTexture PreviewTexture { get; private set; }

        private static readonly List<CameraPreviewTexture> _previews = new();

        private void Awake()
        {
            _previews.Add(this);
        }

        private void OnDestroy()
        {
            _previews.Remove(this);
            if (_previews.Count == 0) ReleasePreviewTexture();
        }

        private static void ReleasePreviewTexture()
        {
            if (PreviewTexture == null) return;
            PreviewTexture.Release();
            CoreUtils.Destroy(PreviewTexture);
            PreviewTexture = null;
        }

        private void UpdateRenderTexture()
        {
            GetComponent<Camera>().targetTexture = PreviewTexture;
        }

        public static void SetAllPreviews()
        {
            int width = Mathf.Max(1, Screen.width);
            int height = Mathf.Max(1, Screen.height);
            if (PreviewTexture == null || PreviewTexture.width != width || PreviewTexture.height != height)
            {
                ReleasePreviewTexture();
                var descriptor = new RenderTextureDescriptor(width, height, RenderTextureFormat.ARGBHalf, 32);
                descriptor.mipCount = 0;
                PreviewTexture = new RenderTexture(descriptor);
            }

            foreach (var script in _previews)
            {
                script.UpdateRenderTexture();
            }
        }
    }
}
