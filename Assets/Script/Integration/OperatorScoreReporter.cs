using System;
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;
using YARG.Core;
using YARG.Core.Engine;
using YARG.Helpers.Extensions;
using YARG.Song;

namespace YARG.Integration
{
    /// <summary>
    /// Sends completed Unity score cards to the operator's FIFO review queue.
    /// The web profile and ranking are updated only after operator confirmation.
    /// </summary>
    public static class OperatorScoreReporter
    {
        private const string Endpoint = "https://shredder.feira-de-jogos.dev.br/api/operador/resultados-executavel";

        [Serializable]
        private sealed class ResultBatch
        {
            public string loteId;
            public string musica;
            public int pontuacaoBanda;
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
        }

        public static IEnumerator Send(ScoreScreenStats scoreScreenStats, SongEntry song)
        {
            if (song == null)
                yield break;

            var batch = new ResultBatch
            {
                loteId = Guid.NewGuid().ToString("N"),
                musica = song.Name,
                pontuacaoBanda = Mathf.Max(0, scoreScreenStats.BandScore),
                resultados = new List<PlayerResult>()
            };

            if (scoreScreenStats.PlayerScores == null)
                yield break;

            foreach (var playerScore in scoreScreenStats.PlayerScores)
            {
                var profile = playerScore.Player?.Profile;
                BaseStats stats = playerScore.Stats;
                if (profile == null || stats == null || profile.IsBot)
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
                    fullCombo = stats.IsFullCombo
                });
            }

            if (batch.resultados.Count == 0)
                yield break;

            using var request = new UnityWebRequest(Endpoint, UnityWebRequest.kHttpVerbPOST);
            byte[] body = System.Text.Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(batch));
            request.uploadHandler = new UploadHandlerRaw(body);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.timeout = 10;
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Não foi possível enviar os resultados ao painel do operador: {request.error}");
            }
        }

        private static string InstrumentName(YargProfile profile)
        {
            return profile.CurrentInstrument.ToLocalizedName();
        }
    }
}
