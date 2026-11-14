using System;
using System.Collections.Generic;

/// <summary>Canvas-space placement, independent of per-player highway scaling.</summary>
public static class GepetoHudLayout
{
    public readonly struct Area
    {
        public readonly float X, Y, Width, Height;
        public Area(float x, float y, float width, float height)
        { X = x; Y = y; Width = width; Height = height; }
        public bool Overlaps(Area other) => X < other.X + other.Width && X + Width > other.X
            && Y < other.Y + other.Height && Y + Height > other.Y;
    }
    public readonly struct Placement
    {
        public readonly float X, Y, Size;
        public readonly Area Reserved;
        public Placement(float x, float y, float size, Area reserved)
        { X = x; Y = y; Size = size; Reserved = reserved; }
    }
    /// <summary>Portrait coordinates relative to the masked boss dock, never the root canvas.</summary>
    public static Placement CalculateWithinDock(float width, float height)
    {
        if (width <= 0 || height <= 0) return default;
        float y = height * .075f;
        // Reserve 12% on either side for calibrated sprite scaling and glow.
        float size = Math.Min(width * .88f, height * .74f);
        float half = size * .56f;
        return new Placement(0f, y, size, new Area(-half, y - half, half * 2f, half * 2f));
    }

    public static Placement Calculate(float width, float height, int players, IReadOnlyList<Area> obstacles)
    {
        if (width <= 0 || height <= 0) return default;
        float margin = Math.Max(8, height * .025f);
        float desired = Math.Min(height * (players == 2 ? .42f : players > 2 ? .27f : .36f), width * .30f);
        float preferredX = width * (players <= 1 ? .20f : .5f);
        float preferredY = height * (players <= 1 ? .40f : .65f);
        // Keep space for the animation/glow and the life bar, not just the idle image.
        for (float size = desired; size >= 24; size *= .9f)
        {
            bool found = false; float best = float.MaxValue; Placement result = default;
            for (int xi = -1; xi <= 12; xi++)
            for (int yi = -1; yi <= 10; yi++)
            {
                float x = xi < 0 ? preferredX : width * xi / 12f;
                float y = yi < 0 ? preferredY : height * yi / 10f;
                float half = size * .56f;
                var bounds = new Area(x - half, y - half - 64, half * 2, half * 2 + 64);
                if (bounds.X < margin || bounds.Y < margin || bounds.X + bounds.Width > width - margin
                    || bounds.Y + bounds.Height > height - margin) continue;
                bool blocked = false;
                for (int i = 0; obstacles != null && i < obstacles.Count; i++)
                    if (bounds.Overlaps(obstacles[i])) { blocked = true; break; }
                if (blocked) continue;
                float dx = (x - preferredX) / width, dy = (y - preferredY) / height;
                float score = dx * dx + dy * dy;
                if (score >= best) continue;
                best = score; result = new Placement(x, y, size, bounds); found = true;
            }
            if (found) return result;
        }
        return default;
    }
}
