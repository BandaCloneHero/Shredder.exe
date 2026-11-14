using System;

internal static class BossDockPortraitChecks
{
    public static void Run(Action<bool, string> check)
    {
        foreach (var size in new[] { (720f, 580f), (360f, 290f), (1280f, 720f), (300f, 800f), (800f, 300f) })
        {
            var portrait = GepetoHudLayout.CalculateWithinDock(size.Item1, size.Item2);
            var bounds = portrait.Reserved;
            check(portrait.Size > 0 && portrait.X == 0, "Portrait remains centered in its dock");
            check(bounds.X >= -size.Item1 / 2 && bounds.Y >= -size.Item2 / 2
                && bounds.X + bounds.Width <= size.Item1 / 2
                && bounds.Y + bounds.Height <= size.Item2 / 2,
                "Portrait including calibration/glow stays inside the dock mask");
        }
        check(GepetoHudLayout.CalculateWithinDock(0, 580).Size == 0,
            "Portrait waits for valid dock dimensions");
    }
}
