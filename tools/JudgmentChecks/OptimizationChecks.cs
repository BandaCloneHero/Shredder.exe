using YARG.Gameplay.Judgments;

internal static class OptimizationChecks
{
    public static void Run(Action<bool, string> check)
    {
        var random = new Random(42);
        var pool = new JudgmentLanePool(25, 2);
        var model = new Dictionary<int, (int Lane, object Note)>();
        for (int step = 0; step < 1000; step++)
        {
            int action = random.Next(100);
            if (action < 5)
            {
                pool.Clear();
                pool.Clear();
                model.Clear();
            }
            else if (action < 45 && model.Count > 0)
            {
                int slot = model.Keys.ElementAt(random.Next(model.Count));
                pool.Release(slot);
                pool.Release(slot); // An already released entry cannot corrupt active indices/counts.
                model.Remove(slot);
            }
            else if (action < 65 && model.Count > 0)
            {
                var previous = model.ElementAt(random.Next(model.Count));
                int slot = pool.Acquire(previous.Value.Lane, previous.Value.Note, out bool duplicate);
                check(duplicate && slot == previous.Key, "Duplicate callback keeps its original active slot");
            }
            else
            {
                int lane = random.Next(25);
                var note = new object();
                int slot = pool.Acquire(lane, note, out bool duplicate);
                check(!duplicate && !model.ContainsKey(slot), "Each new image owns a distinct slot");
                model.Add(slot, (lane, note));
            }
            var active = new HashSet<int>();
            for (int i = 0; i < pool.ActiveCount; i++) active.Add(pool.ActiveSlotAt(i));
            check(pool.ActiveCount == model.Count && active.SetEquals(model.Keys), "Dense active list survives arbitrary growth/release/clear");
            bool lanesCorrect = true;
            for (int lane = 0; lane < 25; lane++)
                lanesCorrect &= pool.HasActiveLane(lane) == model.Values.Any(v => v.Lane == lane);
            check(lanesCorrect && active.All(i => pool.IsActive(i) && pool.LaneOf(i) == model[i].Lane),
                "Constant-time lane queries match the independent model");
        }

        // A large earlier burst must not leave work proportional to idle capacity on later frames.
        pool.Clear();
        for (int i = 0; i < 512; i++) pool.Acquire(4, new object(), out _);
        pool.Clear();
        pool.Acquire(4, new object(), out _);
        int visited = 0;
        for (int i = 0; i < pool.ActiveCount; i++) { _ = pool.ActiveSlotAt(i); visited++; }
        check(pool.Count >= 512 && visited == 1, "Only one active image is visited after a 512-image burst");
        for (int lane = 0; lane < 25; lane++) pool.Acquire(lane, new object(), out _);
        int removed = 0;
        for (int i = 0; i < pool.ActiveCount;)
        {
            int slot = pool.ActiveSlotAt(i);
            pool.Release(slot);
            removed++;
        }
        check(removed == 26 && pool.ActiveCount == 0 && Enumerable.Range(0, 25).All(l => !pool.HasActiveLane(l)),
            "Expiring swapped active slots skips no image and leaves no active lanes");
    }
}
