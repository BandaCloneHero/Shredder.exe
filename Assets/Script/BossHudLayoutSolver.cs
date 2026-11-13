using System;
using System.Collections.Generic;
using UnityEngine;

// Finds a uniform scale and position inside an empty rectangle, never across a track.
public sealed class BossHudLayoutSolver
{
    private readonly List<Rect> free = new List<Rect>();

    public bool TryPlace(Rect safeArea, IReadOnlyList<Rect> obstacles, Vector2 size,
        float maximumScale, Vector2 preferredCenter, out Rect placement)
    {
        placement = default;
        if (safeArea.width <= 0f || safeArea.height <= 0f || size.x <= 0f || size.y <= 0f
            || maximumScale <= 0f) return false;
        free.Clear();
        free.Add(safeArea);
        foreach (var obstacle in obstacles)
        {
            // Only process rectangles that existed before this obstacle was subtracted.
            for (int i = free.Count - 1; i >= 0; i--)
            {
                Rect area = free[i];
                if (!area.Overlaps(obstacle)) continue;
                free.RemoveAt(i);
                Add(area.xMin, area.yMin, obstacle.xMin, area.yMax, area);
                Add(obstacle.xMax, area.yMin, area.xMax, area.yMax, area);
                Add(area.xMin, area.yMin, area.xMax, obstacle.yMin, area);
                Add(area.xMin, obstacle.yMax, area.xMax, area.yMax, area);
            }
            // Keep maximal empty rectangles; splitting may produce overlapping candidates.
            for (int i = free.Count - 1; i >= 0; i--)
            {
                for (int j = 0; j < free.Count; j++)
                {
                    if (i == j || !Contains(free[j], free[i])) continue;
                    free.RemoveAt(i);
                    break;
                }
            }
        }

        float bestScore = float.NegativeInfinity;
        foreach (var area in free)
        {
            // Leave a subpixel guard so float rounding cannot put an edge inside a track.
            const float guard = 0.05f;
            float scale = Math.Min(maximumScale,
                Math.Min((area.width - guard * 2f) / size.x, (area.height - guard * 2f) / size.y));
            if (scale <= 0f) continue;
            Vector2 fitted = size * scale;
            Vector2 center = new Vector2(
                Math.Max(area.xMin + guard + fitted.x / 2f, Math.Min(preferredCenter.x, area.xMax - guard - fitted.x / 2f)),
                Math.Max(area.yMin + guard + fitted.y / 2f, Math.Min(preferredCenter.y, area.yMax - guard - fitted.y / 2f)));
            float distance = (center - preferredCenter).sqrMagnitude /
                Math.Max(1f, safeArea.width * safeArea.width + safeArea.height * safeArea.height);
            float score = scale - distance * 0.02f;
            if (score <= bestScore) continue;
            bestScore = score;
            placement = new Rect(center - fitted / 2f, fitted);
        }
        return bestScore > float.NegativeInfinity;
    }

    public static bool Fits(Rect placement, Rect safeArea, IReadOnlyList<Rect> obstacles)
    {
        if (!Contains(safeArea, placement)) return false;
        foreach (var obstacle in obstacles)
            if (placement.Overlaps(obstacle)) return false;
        return true;
    }

    private static bool Contains(Rect outer, Rect inner)
    {
        const float epsilon = 0.01f;
        return inner.xMin >= outer.xMin - epsilon && inner.yMin >= outer.yMin - epsilon
            && inner.xMax <= outer.xMax + epsilon && inner.yMax <= outer.yMax + epsilon;
    }

    private void Add(float left, float bottom, float right, float top, Rect source)
    {
        left = Math.Max(left, source.xMin);
        right = Math.Min(right, source.xMax);
        bottom = Math.Max(bottom, source.yMin);
        top = Math.Min(top, source.yMax);
        if (right > left && top > bottom) free.Add(Rect.MinMaxRect(left, bottom, right, top));
    }
}
