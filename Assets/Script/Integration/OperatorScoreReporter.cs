using System;
using System.Collections;
using System.IO;
using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;
using YARG.Core;
using YARG.Core.Engine;
using YARG.Helpers.Extensions;
using YARG.Song;
using YARG.Core.Game;
using YARG.Core.Song;
using YARG.Menu.ScoreScreen;
using YARG.Localization;

namespace YARG.Integration
{
    /// <summary>
    /// Sends completed Unity score cards and achievement telemetry to the FIFO queue.
    /// Confirmed results automatically update the web profile, ranking and achievements.
    /// </summary>
    public static class OperatorScoreReporter
    {
        private const string DefaultEndpoint = "https://shredder.feira-de-jogos.dev.br/api/operador/resultados-executavel";

        [Serializable]
        private sealed class ServerConfig
        {
            public string resultsUrl;
        }

        private static bool TryGetEndpoint(out string endpoint)
        {
            endpoint = null;
            try
            {
                string configured = Environment.GetEnvironmentVariable("SHREDDER_RESULTS_URL");
                string configFile = Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? string.Empty, "shredder-server.json");
                if (string.IsNullOrWhiteSpace(configured) && File.Exists(configFile))
                {
                    if (new FileInfo(configFile).Length > 4096) return false;
                    configured = JsonConvert.DeserializeObject<ServerConfig>(File.ReadAllText(configFile))?.resultsUrl;
                    if (string.IsNullOrWhiteSpace(configured)) return false;
                }
                configured = string.IsNullOrWhiteSpace(configured) ? DefaultEndpoint : configured.Trim();
                if (!Uri.TryCreate(configured, UriKind.Absolute, out var url) ||
                    !(url.Scheme == "https" || (url.Scheme == "http" && url.IsLoopback)) ||
                    !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query) || !string.IsNullOrEmpty(url.Fragment) ||
                    url.AbsolutePath != "/api/operador/resultados-executavel") return false;
                endpoint = url.AbsoluteUri;
                return true;
            }
            catch { return false; }
        }

        [Serializable]
        private sealed class ResultBatch
        {
            public string loteId;
            public string musica;
            public int pontuacaoBanda;
            [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
            public bool? bossDerrotado;
            public List<PlayerResult> resultados;
        }

        [Serializable]
        private sealed class PlayerResult
        {
            public string perfilNome;
            public string instrumento;
            public string modoJogo;
            public int pontuacao;
            public float precisao;
            public int maiorCombo;
            public int notasAcertadas;
            public int notasErradas;
            public bool fullCombo;
            public bool pausada;
            public float energiaFinal;
            public string dificuldade;
            public bool concluida;
        }

        public static IEnumerator Send(ScoreScreenStats scoreScreenStats, SongEntry song)
        {
            if (song == null || !scoreScreenStats.IsLiveGame)
                yield break;
            if (!TryGetEndpoint(out var endpoint))
            {
                Debug.LogWarning("Servidor de resultados não configurado corretamente. Nenhum resultado foi enviado.");
                yield break;
            }

            var batch = new ResultBatch
            {
                loteId = scoreScreenStats.ReportId,
                musica = song.Name,
                pontuacaoBanda = Mathf.Max(0, scoreScreenStats.BandScore),
                bossDerrotado = scoreScreenStats.BossBattle?.Defeated,
                resultados = new List<PlayerResult>()
            };

            if (scoreScreenStats.PlayerScores == null)
                yield break;

            foreach (var playerScore in scoreScreenStats.PlayerScores)
            {
                var profile = playerScore.Player?.Profile;
                BaseStats stats = playerScore.Stats;
                if (profile == null || stats == null || profile.IsBot || playerScore.Player.IsReplay)
                    continue;

                batch.resultados.Add(new PlayerResult
                {
                    perfilNome = profile.Name,
                    instrumento = InstrumentName(profile),
                    modoJogo = profile.GameMode.ToString(),
                    pontuacao = Mathf.Max(0, stats.TotalScore),
                    precisao = Mathf.Clamp(stats.Percent * 100f, 0f, 100f),
                    maiorCombo = Mathf.Max(0, stats.MaxCombo),
                    notasAcertadas = Mathf.Max(0, stats.NotesHit),
                    notasErradas = Mathf.Max(0, stats.NotesMissed),
                    fullCombo = stats.IsFullCombo,
                    pausada = scoreScreenStats.WasPaused,
                    energiaFinal = Mathf.Clamp(playerScore.FinalEnergy, 0f, 100f),
                    dificuldade = profile.CurrentDifficulty is Difficulty.Expert or Difficulty.ExpertPlus
                        ? "maxima" : profile.CurrentDifficulty.ToString().ToLowerInvariant(),
                    concluida = true
                });
            }

            if (batch.resultados.Count == 0)
                yield break;

            byte[] body = System.Text.Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(batch));
            for (int attempt = 0; attempt < 3; attempt++)
            {
                using var request = new UnityWebRequest(endpoint, UnityWebRequest.kHttpVerbPOST);
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.timeout = 10;
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success)
                    yield break;
                if (attempt == 2 || (request.responseCode >= 400 && request.responseCode < 500 && request.responseCode != 429))
                {
                    Debug.LogWarning($"Não foi possível sincronizar os resultados: {request.error} {request.downloadHandler.text}");
                    yield break;
                }
                yield return new WaitForSecondsRealtime(2 << attempt);
            }
        }

        private static string InstrumentName(YargProfile profile)
        {
            return profile.CurrentInstrument.ToLocalizedName();
        }
    }
}
