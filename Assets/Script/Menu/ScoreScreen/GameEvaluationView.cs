using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace YARG.Menu.ScoreScreen
{
    // Static QR bundled with the game: no network request is needed to display it.
    public static class GameEvaluationView
    {
        public const string FormUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeeleFRJ3PbTeX9nmxFtfqF_3VMD6bBGixNGFODEtqjbHGK9A/viewform?entry.52413313=Shredder.exe";

        public static GameObject Create(Transform parent, TextMeshProUGUI fontSource, System.Action onContinue)
        {
            if (fontSource == null) return null;
            var panel = new GameObject("Game Evaluation", typeof(RectTransform), typeof(Image));
            panel.layer = parent.gameObject.layer;
            panel.transform.SetParent(parent, false);
            var rect = panel.GetComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
            var background = panel.GetComponent<Image>();
            background.color = new Color(.035f, .035f, .055f, 1);
            background.raycastTarget = true;

            var content = new GameObject("Evaluation Content", typeof(RectTransform));
            content.layer = panel.layer;
            content.transform.SetParent(panel.transform, false);
            var contentRect = content.GetComponent<RectTransform>();
            contentRect.anchorMin = contentRect.anchorMax = contentRect.pivot = new Vector2(.5f, .5f);
            contentRect.sizeDelta = new Vector2(440, 540);
            AddText(content.transform, fontSource, "Avalie o Shredder.exe", 0, 46, 30);
            var qr = Resources.Load<Texture2D>("Avaliacao/shredder-avaliacao");
            if (qr != null)
            {
                var image = new GameObject("Evaluation QR", typeof(RectTransform), typeof(RawImage));
                image.layer = panel.layer;
                image.transform.SetParent(content.transform, false);
                var imageRect = image.GetComponent<RectTransform>();
                imageRect.anchorMin = imageRect.anchorMax = imageRect.pivot = new Vector2(.5f, 1);
                imageRect.anchoredPosition = new Vector2(0, -64);
                imageRect.sizeDelta = new Vector2(342, 342);
                image.GetComponent<RawImage>().texture = qr;
                image.GetComponent<RawImage>().raycastTarget = false;
            }
            AddText(content.transform, fontSource, "Leia o QR Code com o celular", -414, 28, 22);
            AddButton(content.transform, fontSource, "Abrir avaliação", -454,
                () => Application.OpenURL(FormUrl));
            AddButton(content.transform, fontSource, "Continuar", -500, onContinue);
            panel.transform.SetAsLastSibling();
            return panel;
        }

        private static void AddButton(Transform parent, TextMeshProUGUI source, string label, float top, System.Action action)
        {
            var obj = new GameObject(label, typeof(RectTransform), typeof(Image), typeof(Button));
            obj.layer = parent.gameObject.layer;
            obj.transform.SetParent(parent, false);
            var rect = obj.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(.5f, 1);
            rect.anchoredPosition = new Vector2(0, top);
            rect.sizeDelta = new Vector2(280, 38);
            var image = obj.GetComponent<Image>();
            image.color = new Color(.16f, .26f, .32f, 1);
            var button = obj.GetComponent<Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(() => action?.Invoke());
            AddText(obj.transform, source, label, -4, 30, 21);
        }

        private static void AddText(Transform parent, TextMeshProUGUI source, string value, float top, float height, float size)
        {
            var obj = new GameObject("Evaluation Label", typeof(RectTransform), typeof(TextMeshProUGUI));
            obj.layer = parent.gameObject.layer;
            obj.transform.SetParent(parent, false);
            var rect = obj.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0, 1);
            rect.anchorMax = new Vector2(1, 1);
            rect.pivot = new Vector2(.5f, 1);
            rect.anchoredPosition = new Vector2(0, top);
            rect.sizeDelta = new Vector2(0, height);
            var text = obj.GetComponent<TextMeshProUGUI>();
            text.font = source.font;
            text.fontSharedMaterial = source.fontSharedMaterial;
            text.text = value;
            text.fontSize = size;
            text.color = Color.white;
            text.alignment = TextAlignmentOptions.Center;
            text.raycastTarget = false;
        }
    }
}
