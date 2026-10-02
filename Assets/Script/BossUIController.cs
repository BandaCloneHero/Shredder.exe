using UnityEngine;
using UnityEngine.UI;
using TMPro; // Use se estiver usando TextMeshPro para os avisos de texto
using YARG;
using System.Collections;

public class BossUIController : MonoBehaviour
{
    [Header("Referências")]
    [SerializeField] private BossHealthBar bossHealthBar;
    [SerializeField] private Image healthBarFillImage; // A imagem interna do Slider que preenche a vida

    [Header("Avisos de Fase na Tela (Opcional)")]
    [SerializeField] private TMP_Text phaseNotificationText; // Texto na tela para avisar a fase
    [SerializeField] private TMP_FontAsset notificationFont;
    [Min(0f)] [SerializeField] private float defeatNotificationDuration = 5f;

    [Header("Cores da Barra por Fase")]
    [SerializeField] private Color phase1Color = Color.green;
    [SerializeField] private Color phase2Color = Color.yellow;
    [SerializeField] private Color phase3Color = Color.red; // Mantido para compatibilidade com cenas antigas.

    private int lastKnownPhase = 1;
    private Coroutine notificationRoutine;
    private GameObject generatedNotification;

    private void Awake()
    {
        if (bossHealthBar == null) bossHealthBar = GetComponent<BossHealthBar>();
    }

    private void OnEnable()
    {
        if (bossHealthBar != null) bossHealthBar.Defeated += OnDefeated;
    }

    private void OnDisable()
    {
        if (bossHealthBar != null) bossHealthBar.Defeated -= OnDefeated;
        if (notificationRoutine != null) StopCoroutine(notificationRoutine);
        notificationRoutine = null;
        if (phaseNotificationText != null) phaseNotificationText.text = "";
    }

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
        if (bossHealthBar == null || bossHealthBar.IsDefeated) return;

        float hpPercent = bossHealthBar.MaxHealth > 0f ? bossHealthBar.CurrentHealth / bossHealthBar.MaxHealth : 1f;
        int currentPhase = bossHealthBar.CurrentPhase;

        // Atualiza a cor e avisos se a fase mudou
        if (currentPhase != lastKnownPhase)
        {
            lastKnownPhase = currentPhase;
            OnPhaseChanged(currentPhase);
        }

        // Atualiza a cor dinamicamente na barra de vida
        UpdateBarColor(hpPercent);
    }

    private void OnDefeated()
    {
        if (phaseNotificationText == null)
        {
            generatedNotification = new GameObject("BossDefeatNotification",
                typeof(RectTransform), typeof(CanvasRenderer), typeof(TextMeshProUGUI));
            generatedNotification.layer = gameObject.layer;
            phaseNotificationText = generatedNotification.GetComponent<TextMeshProUGUI>();
            if (notificationFont != null) phaseNotificationText.font = notificationFont;
            phaseNotificationText.fontSize = 28f;
            phaseNotificationText.fontStyle = FontStyles.Bold;
            phaseNotificationText.alignment = TextAlignmentOptions.Center;
            phaseNotificationText.color = new Color(0.3f, 1f, 0.85f, 1f);
            phaseNotificationText.raycastTarget = false;
        }
        var canvas = GetComponentInParent<Canvas>();
        var rect = phaseNotificationText.rectTransform;
        rect.SetParent(canvas != null ? canvas.rootCanvas.transform : transform.parent, false);
        rect.anchorMin = rect.anchorMax = new Vector2(0.5f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition3D = Vector3.zero;
        rect.localScale = Vector3.one;
        rect.localRotation = Quaternion.identity;
        rect.sizeDelta = new Vector2(600f, 80f);
        rect.SetAsLastSibling();
        phaseNotificationText.alignment = TextAlignmentOptions.Center;
        SetNotification("GEPETO DERROTADO!");
        if (notificationRoutine != null) StopCoroutine(notificationRoutine);
        notificationRoutine = StartCoroutine(ClearDefeatNotification());
    }

    private IEnumerator ClearDefeatNotification()
    {
        yield return new WaitForSeconds(defeatNotificationDuration);
        if (phaseNotificationText != null) phaseNotificationText.text = "";
        notificationRoutine = null;
    }

    private void OnDestroy()
    {
        if (generatedNotification != null) Destroy(generatedNotification);
    }

    private void OnPhaseChanged(int phase)
    {
        if (phase == 2)
        {
            SetNotification("GEPETO MUDOU DE FORMA!");
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

        if (hpPercent <= 0.5f)
        {
            healthBarFillImage.color = phase2Color;
        }
        else
        {
            healthBarFillImage.color = phase1Color;
        }
    }
}
