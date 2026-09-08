using UnityEngine;
using UnityEngine.UI;
using TMPro; // Use se estiver usando TextMeshPro para os avisos de texto
using YARG;

public class BossUIController : MonoBehaviour
{
    [Header("Referências")]
    [SerializeField] private BossHealthBar bossHealthBar;
    [SerializeField] private Image healthBarFillImage; // A imagem interna do Slider que preenche a vida

    [Header("Avisos de Fase na Tela (Opcional)")]
    [SerializeField] private TMP_Text phaseNotificationText; // Texto na tela para avisar a fase

    [Header("Cores da Barra por Fase")]
    [SerializeField] private Color phase1Color = Color.green;
    [SerializeField] private Color phase2Color = Color.yellow;
    [SerializeField] private Color phase3Color = Color.red;

    private int lastKnownPhase = 1;

    private void Start()
    {
        if (bossHealthBar == null)
        {
            bossHealthBar = GetComponent<BossHealthBar>();
        }

        if (phaseNotificationText != null)
        {
            phaseNotificationText.text = "";
        }
    }

    private void Update()
    {
        if (bossHealthBar == null) return;

        float hpPercent = bossHealthBar.MaxHealth > 0f ? bossHealthBar.CurrentHealth / bossHealthBar.MaxHealth : 1f;

        // Determina a fase atual com base na vida
        int currentPhase = 1;
        if (hpPercent <= 0.2f)
        {
            currentPhase = 3;
        }
        else if (hpPercent <= 0.5f)
        {
            currentPhase = 2;
        }

        // Atualiza a cor e avisos se a fase mudou
        if (currentPhase != lastKnownPhase)
        {
            lastKnownPhase = currentPhase;
            OnPhaseChanged(currentPhase);
        }

        // Atualiza a cor dinamicamente na barra de vida
        UpdateBarColor(hpPercent);
    }

    private void OnPhaseChanged(int phase)
    {
        if (phase == 2)
        {
            SetNotification("FASE 2: O CHEFE FICOU FURIOSO!");
        }
        else if (phase == 3)
        {
            SetNotification("FASE 3: MODO DESESPERO!");
        }
    }

    private void SetNotification(string message)
    {
        if (phaseNotificationText != null)
        {
            phaseNotificationText.text = message;
            // Aqui você poderia criar um efeito de piscar ou sumir depois de alguns segundos se quiser
        }
        Debug.Log(message);
    }

    private void UpdateBarColor(float hpPercent)
    {
        if (healthBarFillImage == null) return;

        if (hpPercent <= 0.2f)
        {
            healthBarFillImage.color = phase3Color;
        }
        else if (hpPercent <= 0.5f)
        {
            healthBarFillImage.color = phase2Color;
        }
        else
        {
            healthBarFillImage.color = phase1Color;
        }
    }
}