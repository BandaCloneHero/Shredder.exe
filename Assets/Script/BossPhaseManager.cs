using UnityEngine;
using System.Collections;
using YARG;

public class BossPhaseManager : MonoBehaviour
{
    [Header("Referências")]
    [SerializeField] private BossHealthBar bossHealthBar;

    [Header("Configurações de Ressurreição Souls-like")]
    [Tooltip("Quantas vezes o boss pode ressuscitar (Fases 2 e 3).")]
    [SerializeField] private int maxResurrections = 2;
    [Tooltip("Tempo de pausa dramática quando a vida zera antes de começar a encher de novo.")]
    [SerializeField] private float resurrectionPauseDuration = 2f;

    private int currentResurrectionCount = 0;
    private bool isResurrecting = false;

    private void Start()
    {
        if (bossHealthBar == null)
        {
            bossHealthBar = GetComponent<BossHealthBar>();
        }
    }

    private void Update()
    {
        if (bossHealthBar == null || isResurrecting) return;

        // Se a vida chegou a 0 e o boss ainda tem fases de ressurreição sobrando
        if (bossHealthBar.CurrentHealth <= 0f && currentResurrectionCount < maxResurrections)
        {
            StartCoroutine(ResurrectionRoutine());
        }
    }

    private IEnumerator ResurrectionRoutine()
    {
        isResurrecting = true;
        currentResurrectionCount++;

        if (currentResurrectionCount == 1)
        {
            Debug.Log("[BossPhaseManager] >>> FASE 2: O Boss caiu, mas a barra vai voltar! Agressividade aumentada.");
        }
        else if (currentResurrectionCount == 2)
        {
            Debug.Log("[BossPhaseManager] >>> FASE 3 (DESESPERO): Última vida do Boss! Ele está furioso.");
        }

        // Pausa dramática fingindo que morreu
        yield return new WaitForSeconds(resurrectionPauseDuration);

        // Restaura a vida máxima (a barra vai arrastar subindo sozinha por causa do SmoothSpeed do seu Slider)
        bossHealthBar.TakeDamage(-bossHealthBar.MaxHealth); // Ou redefine o HP cheio

        // Aqui você pode aumentar a dificuldade para as próximas fases (ex: deixar o dano das notas maior)
        // Exemplo: bossHealthBar.noteDamageAmount *= 1.5f;

        isResurrecting = false;
    }
}