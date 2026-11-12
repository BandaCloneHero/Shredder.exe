using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using YARG.Gameplay.Visuals;

// Run after the track projection/HUD updates. Move the parent, leaving sprite animation intact.
[DefaultExecutionOrder(1000)]
[RequireComponent(typeof(RectTransform), typeof(CanvasGroup))]
public sealed class BossResponsiveLayout : MonoBehaviour
{
    [SerializeField] private HighwayCameraRendering highwayRenderer;
    [Min(0f)] [SerializeField] private float trackPadding = 32f;
    [Min(0f)] [SerializeField] private float playerHudPadding = 90f;
    [Min(0f)] [SerializeField] private float screenPadding = 24f;
    [Min(0f)] [SerializeField] private float headerHeight = 170f;
    [Min(0f)] [SerializeField] private float footerHeight = 70f;

    private readonly List<Rect> obstacles = new List<Rect>();
    private readonly BossHudLayoutSolver solver = new BossHudLayoutSolver();
    private RectTransform dock;
    private RectTransform canvasRect;
    private Canvas rootCanvas;
    private CanvasGroup visibility;
    private Rect currentPlacement;
    private int lastTrackCount = -1;
    private bool hasPlacement;

    private void Awake()
    {
        dock = (RectTransform)transform;
        rootCanvas = GetComponentInParent<Canvas>().rootCanvas;
        canvasRect = (RectTransform)rootCanvas.transform;
        visibility = GetComponent<CanvasGroup>();
        visibility.blocksRaycasts = false;
        visibility.interactable = false;
        visibility.alpha = 0f;
        // Sprite calibration/attack effects can exceed the nominal portrait rectangle.
        // Keep those effects inside the same reserved region used by collision placement.
        if (GetComponent<RectMask2D>() == null) gameObject.AddComponent<RectMask2D>();
        if (highwayRenderer == null) highwayRenderer = FindAnyObjectByType<HighwayCameraRendering>();
    }

    private void LateUpdate()
    {
        if (highwayRenderer == null) return;
        int count = highwayRenderer.RenderedTrackCount;
        // Wait for loading/projection initialization instead of showing a misplaced boss.
        if (count == 0) { visibility.alpha = 0f; return; }
        obstacles.Clear();
        for (int i = 0; i < count; i++)
        {
            Rect? screenBounds = highwayRenderer.GetRenderedTrackBoundsScreenSpace(i);
            if (!screenBounds.HasValue || !IsFinite(screenBounds.Value))
            {
                visibility.alpha = 0f;
                return;
            }
            Rect bounds = ToCanvasRect(screenBounds.Value);
            obstacles.Add(Rect.MinMaxRect(bounds.xMin - trackPadding, bounds.yMin - trackPadding,
                bounds.xMax + trackPadding, bounds.yMax + playerHudPadding));
        }

        Rect safeArea = ToCanvasRect(Screen.safeArea);
        safeArea = Rect.MinMaxRect(safeArea.xMin + screenPadding, safeArea.yMin + footerHeight,
            safeArea.xMax - screenPadding, safeArea.yMax - headerHeight);
        Vector2 preferred = new Vector2(safeArea.xMin + dock.rect.width / 2f,
            safeArea.yMax - dock.rect.height / 2f);
        float maximumScale = Mathf.Max(0.45f, 1.1f - count * 0.1f);
        if (!solver.TryPlace(safeArea, obstacles, dock.rect.size, maximumScale, preferred, out Rect target))
        {
            visibility.alpha = 0f;
            return;
        }

        // Small camera pulses should not make the boss jump between empty areas.
        bool keepPosition = hasPlacement && count == lastTrackCount
            && BossHudLayoutSolver.Fits(currentPlacement, safeArea, obstacles)
            && currentPlacement.width >= target.width * 0.92f
            && currentPlacement.width <= dock.rect.width * maximumScale + 0.01f;
        if (!keepPosition) currentPlacement = target;
        lastTrackCount = count;
        hasPlacement = true;
        dock.localScale = Vector3.one * (currentPlacement.width / dock.rect.width);
        dock.position = canvasRect.TransformPoint(currentPlacement.center);
        visibility.alpha = 1f;
    }

    private Rect ToCanvasRect(Rect screenRect)
    {
        Camera camera = rootCanvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : rootCanvas.worldCamera;
        RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRect, screenRect.min, camera, out Vector2 min);
        RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRect, screenRect.max, camera, out Vector2 max);
        return Rect.MinMaxRect(min.x, min.y, max.x, max.y);
    }

    private static bool IsFinite(Rect rect)
    {
        return rect.width > 0f && rect.height > 0f
            && !float.IsNaN(rect.xMin) && !float.IsInfinity(rect.xMin)
            && !float.IsNaN(rect.xMax) && !float.IsInfinity(rect.xMax)
            && !float.IsNaN(rect.yMin) && !float.IsInfinity(rect.yMin)
            && !float.IsNaN(rect.yMax) && !float.IsInfinity(rect.yMax);
    }
}
