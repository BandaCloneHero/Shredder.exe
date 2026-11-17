using System;
using System.Collections.Generic;

/// <summary>Reject detached opaque fragments entering a cell through its border.</summary>
public static class BossFrameIsolation
{
    public static bool[] FindForeignEdgePixels(byte[] alpha, int size)
    {
        if (size < 1 || alpha == null || alpha.Length != size * size)
            throw new ArgumentException("Expected one square alpha frame.");
        var labels = new int[alpha.Length];
        var queue = new int[alpha.Length];
        var counts = new List<int> { 0 };
        var edge = new List<bool> { false };
        var spans = new List<int> { 0 };
        int primary = 0;
        // Use solid pixels for connectivity; translucent glow must not join two robots.
        for (int start = 0; start < alpha.Length; start++)
        {
            if (alpha[start] < 128 || labels[start] != 0) continue;
            int id = counts.Count, head = 0, tail = 1, count = 0;
            bool touchesEdge = false;
            int minX = size, minY = size, maxX = 0, maxY = 0;
            queue[0] = start; labels[start] = id;
            while (head < tail)
            {
                int pixel = queue[head++], x = pixel % size, y = pixel / size;
                count++;
                minX = Math.Min(minX, x); minY = Math.Min(minY, y);
                maxX = Math.Max(maxX, x); maxY = Math.Max(maxY, y);
                touchesEdge |= x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
                for (int dy = -1; dy <= 1; dy++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    int nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                    int next = ny * size + nx;
                    if (alpha[next] < 128 || labels[next] != 0) continue;
                    labels[next] = id; queue[tail++] = next;
                }
            }
            counts.Add(count); edge.Add(touchesEdge);
            spans.Add(Math.Max(maxX - minX + 1, maxY - minY + 1));
            if (primary == 0 || count > counts[primary]) primary = id;
        }
        var remove = new bool[alpha.Length];
        var protect = new bool[alpha.Length];
        for (int i = 0; i < labels.Length; i++)
        {
            int id = labels[i];
            if (id == 0) continue;
            // Large boundary components may be intentional projectiles or transformations.
            // Reject only small detached fragments, never an entire attack effect.
            bool foreign = id != primary && edge[id]
                && counts[id] <= counts[primary] * .12f && spans[id] <= size * .25f;
            var mask = foreign ? remove : protect;
            int x = i % size, y = i / size;
            // Include antialiased edges while protecting the robot and interior effects.
            for (int dy = -3; dy <= 3; dy++)
            for (int dx = -3; dx <= 3; dx++)
            {
                int nx = x + dx, ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < size && ny < size) mask[ny * size + nx] = true;
            }
        }
        for (int i = 0; i < remove.Length; i++) remove[i] &= !protect[i];
        return remove;
    }
}
