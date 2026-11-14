using System;

/// <summary>Visual-only transition clock; callers stop advancing it while gameplay is paused.</summary>
public sealed class BossTransformationPlayback
{
    private int frameCount;
    private float duration;
    private float elapsed;
    public bool IsPlaying { get; private set; }
    public int FrameIndex => frameCount <= 0 ? 0 : Math.Min(frameCount - 1,
        (int)(elapsed / duration * frameCount));

    public void Begin(int frames, float seconds)
    {
        frameCount = Math.Max(0, frames);
        duration = Math.Max(.1f, seconds);
        elapsed = 0f;
        IsPlaying = frameCount > 0;
    }

    public void Advance(float seconds)
    {
        if (!IsPlaying) return;
        elapsed = Math.Min(duration, elapsed + Math.Max(0f, seconds));
        IsPlaying = elapsed < duration;
    }

    public void Cancel() => IsPlaying = false;
}
