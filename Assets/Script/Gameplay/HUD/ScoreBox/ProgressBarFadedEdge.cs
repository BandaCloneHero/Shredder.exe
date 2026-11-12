using UnityEngine;

namespace YARG.Gameplay.HUD
{
    [ExecuteInEditMode]
    public class ProgressBarFadedEdge : MonoBehaviour
    {
        [SerializeField]
        private RectTransform progressImg;

        [SerializeField]
        private RectTransform progressMask;

        [Space]
        [Header("Mask's Full Position")]
        [SerializeField]
        private bool useCustomPosition;

        [SerializeField]
        private float customPosition;

        [Space]
        [SerializeField]
        [Range(0, 1)]
        private float value;

#if UNITY_EDITOR
        private void OnValidate()
        {
            value = Mathf.Clamp01(value);
            // Serialized references may not be ready during a script reload.
            // Update RectTransforms on the editor's main thread after loading.
            UnityEditor.EditorApplication.delayCall -= UpdatePreview;
            UnityEditor.EditorApplication.delayCall += UpdatePreview;
        }

        private void UpdatePreview()
        {
            if (this == null)
            {
                return;
            }

            if (progressMask == null || progressImg == null)
            {
                Debug.LogError(
                    $"{nameof(ProgressBarFadedEdge)} requires both {nameof(progressMask)} and " +
                    $"{nameof(progressImg)} to be assigned in the Inspector. " +
                    $"Missing: {(progressMask == null ? nameof(progressMask) : nameof(progressImg))}.", this);
                return;
            }

            SetProgress(value);
        }
#endif

        /// <summary>
        /// Sets position of the progress bar.
        /// </summary>
        /// <param name="progress">A value from 0 to 1 inclusive.</param>
        public void SetProgress(float progress)
        {
            progress = Mathf.Clamp01(progress);
            float mW = useCustomPosition ? customPosition : progressMask.rect.width;
            float iW = progressImg.rect.width;
            var mPos = progressMask.anchoredPosition;
            var iPos = progressImg.anchoredPosition;

            mPos.x = progress * mW - iW;
            iPos.x = -mPos.x;

            progressMask.anchoredPosition = mPos;
            progressImg.anchoredPosition = iPos;
        }
    }
}
