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
        }

        private Slot[] _slots;
        public int LaneCount { get; }
        public int InitialPerLane { get; }
        public int Count => _slots.Length;

        public JudgmentLanePool(int laneCount, int initialPerLane)
        {
            if (laneCount < 1 || initialPerLane < 1) throw new ArgumentOutOfRangeException();
            LaneCount = laneCount;
            InitialPerLane = initialPerLane;
            _slots = new Slot[laneCount * initialPerLane];
            for (int i = 0; i < _slots.Length; i++) _slots[i].Lane = i / initialPerLane;
        }

        public bool HasActiveLane(int lane)
        {
            if ((uint)lane >= (uint)LaneCount) return false;
            for (int i = 0; i < _slots.Length; i++)
                if (_slots[i].Lane == lane && _slots[i].Active) return true;
            return false;
        }

        public int Acquire(int lane, object note, out bool existing)
        {
            if ((uint)lane >= (uint)LaneCount) throw new ArgumentOutOfRangeException(nameof(lane));
            existing = false;
            int available = -1;
            for (int i = 0; i < _slots.Length; i++)
            {
                if (_slots[i].Lane != lane) continue;
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
                // Grow only this lane's reserve; existing slot indices and animations stay intact.
                available = _slots.Length;
                Array.Resize(ref _slots, _slots.Length + InitialPerLane);
                for (int i = available; i < _slots.Length; i++) _slots[i].Lane = lane;
            }
            _slots[available].Note = note;
            _slots[available].Active = true;
            return available;
        }

        public bool IsActive(int slot) => _slots[slot].Active;
        public int LaneOf(int slot) => _slots[slot].Lane;

        public void Release(int slot)
        {
            // Keep lane ownership when the animation finishes.
            _slots[slot].Note = null;
            _slots[slot].Active = false;
        }

        public void Clear()
        {
            for (int i = 0; i < _slots.Length; i++) Release(i);
        }
    }
}
