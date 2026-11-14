using System;

internal static class BossTransformationChecks
{
    public static void Run(Action<bool, string> check)
    {
        var playback = new BossTransformationPlayback();
        check(!playback.IsPlaying && playback.FrameIndex == 0, "No transformation before the health threshold");
        playback.Begin(8, 1.6f);
        check(playback.IsPlaying && playback.FrameIndex == 0, "Transformation begins with the normal form");
        playback.Advance(.11f);
        for (int frame = 0; frame < 8; frame++)
        {
            check(playback.IsPlaying && playback.FrameIndex == frame, "Every intermediate transformation frame gets screen time");
            if (frame < 7) playback.Advance(.2f);
        }
        playback.Advance(.11f);
        check(!playback.IsPlaying && playback.FrameIndex == 7, "Transformation completes on the evil form");
        playback.Begin(8, 1.6f);
        playback.Advance(.8f);
        check(playback.IsPlaying && playback.FrameIndex == 4, "Halfway through the transition shows the intermediate form");
        playback.Advance(-1f);
        check(playback.FrameIndex == 4, "Negative elapsed time cannot rewind the transformation");
        playback.Cancel();
        playback.Advance(10f);
        check(!playback.IsPlaying && playback.FrameIndex == 4, "Death or scene disable cancels visual playback");
        playback.Begin(8, 1.6f);
        check(playback.FrameIndex == 0, "Restart clears a cancelled transition");
        playback.Advance(10f);
        check(!playback.IsPlaying && playback.FrameIndex == 7, "Long frames cannot overrun the sprite array");
        playback.Begin(0, 1.6f);
        check(!playback.IsPlaying, "Missing frames cannot start playback");
    }
}
