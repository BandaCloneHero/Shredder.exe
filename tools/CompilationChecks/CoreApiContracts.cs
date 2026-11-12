// Compile the Core API shapes used by the game without loading Unity/native audio.
using System;
using System.Collections.Generic;
using YARG.Core;
using YARG.Core.Audio;
using YARG.Core.Chart;
using YARG.Core.Engine;
using YARG.Core.Game;
using YARG.Core.Replays;
using YARG.Core.Song;

internal static class CoreApiContracts
{
    private static void Check(BaseEngine engine, EngineManager manager, Instrument instrument,
        SongChart chart, RockMeterPreset rockMeter, SongEntry song,
        Dictionary<Guid, ColorProfile> colors, Dictionary<Guid, CameraPreset> cameras,
        ReplayFrame[] frames, double[] frameTimes, PauseInfo[] pauses, ReplayStats[] stats)
    {
        using var background = song.LoadBackground();
        using var audio = song.LoadAudio(1f, 1d);
        SongStem stem = instrument.ToSongStem();
        stem = SongStem.Drums;
        manager.Register(engine, instrument, chart, rockMeter);
        manager.Register(engine, instrument, 0, chart, rockMeter);
        engine.PreferClosestNote = true;
        var replay = new ReplayData(colors, cameras, frames, frameTimes);
        ReplayIO.TrySerialize("unused", song, 1f, 0d, 0, default, pauses, stats, replay);
    }
}
