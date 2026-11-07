using System;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Reusable slots per lane. Active feedbacks are never evicted or restarted for another note.</summary>
    public sealed class JudgmentLanePool
    {
        private struct Slot
        {
            public object Note;
            public int Lane;
            public bool Active;
            public int NextInLane;
            public int ActiveIndex;
        }

        private Slot[] _slots;
        private int[] _activeSlots;
        private readonly int[] _laneHeads;
        private readonly int[] _laneTails;
        private readonly int[] _laneActiveCounts;
        public int LaneCount { get; }
        public int InitialPerLane { get; }
        public int Count => _slots.Length;
        public int ActiveCount { get; private set; }
        public int ActiveSlotAt(int index) => _activeSlots[index];

        public JudgmentLanePool(int laneCount, int initialPerLane)
        {
            if (laneCount < 1 || initialPerLane < 1) throw new ArgumentOutOfRangeException();
            LaneCount = laneCount;
            InitialPerLane = initialPerLane;
            _slots = new Slot[laneCount * initialPerLane];
            _activeSlots = new int[_slots.Length];
            _laneHeads = new int[laneCount];
            _laneTails = new int[laneCount];
            _laneActiveCounts = new int[laneCount];
            for (int lane = 0; lane < laneCount; lane++)
            {
                int start = lane * initialPerLane;
                _laneHeads[lane] = start;
                _laneTails[lane] = start + initialPerLane - 1;
                InitializeLaneSlots(lane, start, start + initialPerLane);
            }
        }

        private void InitializeLaneSlots(int lane, int start, int end)
        {
            for (int i = start; i < end; i++)
            {
                _slots[i].Lane = lane;
                _slots[i].NextInLane = i + 1 < end ? i + 1 : -1;
            }
        }

        public bool HasActiveLane(int lane) => (uint)lane < (uint)LaneCount && _laneActiveCounts[lane] > 0;

        public int Acquire(int lane, object note, out bool existing)
        {
            if ((uint)lane >= (uint)LaneCount) throw new ArgumentOutOfRangeException(nameof(lane));
            existing = false;
            int available = -1;
            // Visit only this lane, including any reserves appended by earlier bursts.
            for (int i = _laneHeads[lane]; i >= 0; i = _slots[i].NextInLane)
            {
                if (_slots[i].Active)
                {
                    if (note != null && ReferenceEquals(_slots[i].Note, note))
                    {
                        existing = true;
                        return i;
                    }
                }
                else if (available < 0) available = i;
            }
            if (available < 0)
            {
                available = _slots.Length;
                Array.Resize(ref _slots, _slots.Length + InitialPerLane);
                Array.Resize(ref _activeSlots, _slots.Length);
                InitializeLaneSlots(lane, available, _slots.Length);
                _slots[_laneTails[lane]].NextInLane = available;
                _laneTails[lane] = _slots.Length - 1;
            }
            _slots[available].Note = note;
            _slots[available].Active = true;
            _slots[available].ActiveIndex = ActiveCount;
            _activeSlots[ActiveCount++] = available;
            _laneActiveCounts[lane]++;
            return available;
        }

        public bool IsActive(int slot) => _slots[slot].Active;
        public int LaneOf(int slot) => _slots[slot].Lane;

        public void Release(int slot)
        {
            if (!_slots[slot].Active) return;
            int index = _slots[slot].ActiveIndex;
            int moved = _activeSlots[--ActiveCount];
            _activeSlots[index] = moved;
            _slots[moved].ActiveIndex = index;
            _laneActiveCounts[_slots[slot].Lane]--;
            // Keep lane ownership and linked reserves when the animation finishes.
            _slots[slot].Note = null;
            _slots[slot].Active = false;
        }

        public void Clear()
        {
            while (ActiveCount > 0) Release(_activeSlots[ActiveCount - 1]);
        }
    }
}
