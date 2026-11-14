using TMPro;
using UnityEngine;
using UnityEngine.UI;

/// <summary>Library-local selector, sharing its lifetime with the library menu.</summary>
public sealed class BossSelectionPanel : MonoBehaviour
{
    private GameObject panel;
    private readonly TMP_Text[] labels = new TMP_Text[3];
    private void Start()
    {
        panel = new GameObject("Escolha do chefe", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        var canvas = panel.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 100;
        var scaler = panel.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        var source = GetComponentInChildren<TMP_Text>(true);
        for (int i = 0; i < 3; i++)
        {
            int index = i;
            var item = new GameObject("Boss " + i, typeof(RectTransform), typeof(Image), typeof(Button));
            item.transform.SetParent(panel.transform, false);
            var rect = (RectTransform)item.transform;
            rect.anchorMin = rect.anchorMax = new Vector2(.5f, 1f);
            rect.pivot = new Vector2(.5f, 1f);
            rect.anchoredPosition = new Vector2((i - 1) * 250, -8);
            rect.sizeDelta = new Vector2(242, 62);
            item.GetComponent<Image>().color = new Color(.035f, .04f, .065f, .96f);
            item.GetComponent<Button>().onClick.AddListener(() => { BossRoster.Selected = (BossRoster.Identity)index; Refresh(); });
            var caption = new GameObject("Nome", typeof(RectTransform), typeof(TextMeshProUGUI));
            caption.transform.SetParent(item.transform, false);
            labels[i] = caption.GetComponent<TextMeshProUGUI>();
            if (source != null) labels[i].font = source.font;
            labels[i].fontSize = 19;
            labels[i].alignment = TextAlignmentOptions.Center;
            labels[i].raycastTarget = false;
            var textRect = labels[i].rectTransform;
            textRect.anchorMin = Vector2.zero; textRect.anchorMax = Vector2.one;
            textRect.offsetMin = textRect.offsetMax = Vector2.zero;
        }
        Refresh();
    }
    private void Refresh()
    {
        string[] names = { "Gepeto", "Geminias", "Cláudio" };
        string[] titles = { "O Arquiteto", "O Oráculo Bifronte", "O Escriba do Veredito" };
        for (int i = 0; i < labels.Length; i++)
        {
            labels[i].text = ((int)BossRoster.Selected == i ? "◆ " : "") + names[i] + "\n<size=70%>" + titles[i] + "</size>";
            labels[i].color = (int)BossRoster.Selected == i ? BossRoster.Accent : Color.white;
        }
    }
    private void OnEnable() { if (panel != null) panel.SetActive(true); }
    private void OnDisable() { if (panel != null) panel.SetActive(false); }
    private void OnDestroy() { if (panel != null) Destroy(panel); }
}
