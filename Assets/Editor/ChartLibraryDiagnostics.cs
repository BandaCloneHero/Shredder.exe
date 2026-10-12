using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEngine;
using YARG.Core;
using YARG.Core.Game;
using YARG.Core.Input;
using YARG.Settings;
using YARG.Song;

namespace Editor
{
    // Diagnostic only: no gameplay, profiles, song files or cache are changed.
    public static class ChartLibraryDiagnostics
    {
        [MenuItem("Shredder/Charts/Diagnosticar biblioteca carregada")]
        public static void Report()
        {
            string projectSongs = Path.GetFullPath(Path.Combine(Application.dataPath, "../musicas"));
            Debug.Log($"[Charts] Pasta musicas deste projeto: {projectSongs}");
            if (Directory.Exists(projectSongs))
            {
                foreach (string directory in Directory.GetDirectories(projectSongs))
                {
                    string midi = Path.Combine(directory, "notes.mid");
                    if (!File.Exists(midi)) continue;
                    using var hash = SHA256.Create();
                    using var file = File.OpenRead(midi);
                    string sha = BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
                    Debug.Log($"[Charts] Arquivo local: {midi} | SHA256={sha}");
                }
            }
            if (!Application.isPlaying)
            {
                Debug.Log("[Charts] Entre em Play e espere a biblioteca carregar para consultar o scanner.");
                return;
            }
            foreach (string folder in SettingsManager.Settings.SongFolders)
                Debug.Log($"[Charts] Pasta cadastrada no jogo: {folder}");

            var instruments = new[] { Instrument.FiveFretGuitar, Instrument.FiveFretBass,
                Instrument.FourLaneDrums, Instrument.ProDrums, Instrument.Keys, Instrument.ProKeys };
            foreach (var song in SongContainer.UnfilteredSongs)
            {
                var text = new StringBuilder();
                text.Append($"[Charts] Carregada: {song.Name} | Origem: {song.SortBasedLocation}");
                foreach (var instrument in instruments)
                {
                    bool easy = song[instrument][Difficulty.Easy];
                    bool medium = song[instrument][Difficulty.Medium];
                    bool expert = song[instrument][Difficulty.Expert];
                    if (easy || medium || expert)
                        text.Append($" | {instrument}: Facil={easy}, Medio={medium}, Especialista={expert}");
                }
                Debug.Log(text.ToString());
            }
            Debug.Log("[Charts] Compare os niveis carregados com analysis.json ou difficulty-profile.json da musica. " +
                      "Origens fora de musicas podem ser copias antigas.");
        }
    }
}
