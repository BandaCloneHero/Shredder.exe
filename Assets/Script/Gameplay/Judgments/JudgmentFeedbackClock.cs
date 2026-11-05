using System;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Visual lifetime only. Never participates in musical timing or scoring.</summary>
    public struct JudgmentFeedbackClock
    {
        public float Age { get; private set; }
        private int _startedFrame;

        public void Restart(int frame)
        {
            _startedFrame = frame;
            Age = 0;
        }

        public void Advance(int frame, float deltaSeconds)
        {
            // Delta belongs to the whole frame, including time BEFORE this judgment existed.
            // A slow creation frame must still draw the new judgment once.
            if (frame != _startedFrame) Age += Math.Max(0, deltaSeconds);
        }
    }
}
