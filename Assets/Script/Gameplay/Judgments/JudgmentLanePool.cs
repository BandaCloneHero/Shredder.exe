using System;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Fixed, independent slots per visual lane. Does not judge notes or change score.</summary>
    public sealed class JudgmentLanePool
    {
        private struct Slot
        {
            public object Note;
            public long Order;
            public bool Active;
        }

        private readonly Slot[] _slots;
        public int LaneCount { get; }
        public int PerLane { get; }
        public int Count => _slots.Length;
        private long _order;

        public JudgmentLanePool(int laneCount, int perLane)
        {
            if (laneCount < 1 || perLane < 1) throw new ArgumentOutOfRangeException();
            LaneCount = laneCount;
            PerLane = perLane;
            _slots = new Slot[laneCount * perLane];
        }

        public bool HasActiveLane(int lane)
        {
            if ((uint)lane >= (uint)LaneCount) return false;
            int end = (lane + 1) * PerLane;
            for (int i = lane * PerLane; i < end; i++)
                if (_slots[i].Active) return true;
            return false;
        }

        public int Acquire(int lane, object note, out bool existing)
        {
            if ((uint)lane >= (uint)LaneCount) throw new ArgumentOutOfRangeException(nameof(lane));
            int start = lane * PerLane, end = start + PerLane;
            existing = false;
            if (note != null)
                for (int i = start; i < end; i++)
                    if (_slots[i].Active && ReferenceEquals(_slots[i].Note, note))
                    {
                        existing = true;
                        return i;
                    }
            int selected = start;
            for (int i = start; i < end; i++)
            {
                if (!_slots[i].Active) { selected = i; break; }
                if (_slots[i].Order < _slots[selected].Order) selected = i;
            }
            _slots[selected].Note = note;
            _slots[selected].Active = true;
            Refresh(selected);
            return selected;
        }

        public bool IsActive(int slot) => _slots[slot].Active;
        public int LaneOf(int slot) => slot / PerLane;
        public void Refresh(int slot) => _slots[slot].Order = ++_order;

        public int Rank(int slot)
        {
            int rank = 0, start = LaneOf(slot) * PerLane;
            for (int i = start; i < start + PerLane; i++)
                if (_slots[i].Active && _slots[i].Order > _slots[slot].Order) rank++;
            return rank;
        }

        public void Release(int slot) => _slots[slot] = default;
        public void Clear()
        {
            Array.Clear(_slots, 0, _slots.Length);
            _order = 0;
        }
    }
}
