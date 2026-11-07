using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    public static class JudgmentResultsView
    {
        public static GameObject Create(RectTransform parent, TextMeshProUGUI fontSource, JudgmentSummary summary)
        {
            var container = new GameObject("Judgment Results", typeof(RectTransform), typeof(VerticalLayoutGroup), typeof(LayoutElement));
            container.layer = parent.gameObject.layer;
            container.transform.SetParent(parent, false);
            container.transform.SetAsFirstSibling();
            var vertical = container.GetComponent<VerticalLayoutGroup>();
            vertical.spacing = 2;
            vertical.childControlWidth = vertical.childControlHeight = true;
            vertical.childForceExpandWidth = true;
            vertical.childForceExpandHeight = false;
            var layout = container.GetComponent<LayoutElement>();
            layout.minHeight = layout.preferredHeight = 256;
            AddRow(container.transform, fontSource, "perfeito", "PERFEITO!", summary.Perfect);
            AddRow(container.transform, fontSource, "otimo", "ÓTIMO!", summary.Great);
            AddRow(container.transform, fontSource, "bom", "BOM!", summary.Good);
            AddRow(container.transform, fontSource, "errou", "ERROU!", summary.Errors);
            return container;
        }

        private static void AddRow(Transform parent, TextMeshProUGUI fontSource, string asset, string fallback, int count)
        {
            var row = new GameObject(fallback, typeof(RectTransform), typeof(HorizontalLayoutGroup), typeof(LayoutElement));
            row.layer = parent.gameObject.layer;
            row.transform.SetParent(parent, false);
            var layout = row.GetComponent<LayoutElement>();
            layout.minHeight = layout.preferredHeight = 62;
            var horizontal = row.GetComponent<HorizontalLayoutGroup>();
            horizontal.spacing = 12;
            horizontal.childAlignment = TextAnchor.MiddleCenter;
            horizontal.childControlWidth = horizontal.childControlHeight = true;
            horizontal.childForceExpandWidth = false;
            horizontal.childForceExpandHeight = false;
            var texture = Resources.Load<Texture2D>("Julgamentos/" + asset);
            if (texture != null)
            {
                var imageObject = new GameObject("Judgment Image", typeof(RectTransform), typeof(RawImage), typeof(LayoutElement));
                imageObject.layer = row.layer;
                imageObject.transform.SetParent(row.transform, false);
                var image = imageObject.GetComponent<RawImage>();
                image.texture = texture;
                image.color = Color.white;
                image.raycastTarget = false;
                var imageLayout = imageObject.GetComponent<LayoutElement>();
                float width = Mathf.Min(180, 60f * texture.width / texture.height);
                imageLayout.minWidth = imageLayout.preferredWidth = width;
                imageLayout.minHeight = imageLayout.preferredHeight = width * texture.height / texture.width;
            }
            var textObject = new GameObject("Count", typeof(RectTransform), typeof(TextMeshProUGUI), typeof(LayoutElement));
            textObject.layer = row.layer;
            textObject.transform.SetParent(row.transform, false);
            var text = textObject.GetComponent<TextMeshProUGUI>();
            text.font = fontSource.font;
            text.fontSharedMaterial = fontSource.fontSharedMaterial;
            text.fontSize = 30;
            text.enableAutoSizing = true;
            text.fontSizeMin = 16;
            text.fontSizeMax = 30;
            text.color = Color.white;
            text.alignment = TextAlignmentOptions.MidlineLeft;
            text.raycastTarget = false;
            text.text = texture == null ? $"{fallback}  {count:N0}" : count.ToString("N0");
            var textLayout = textObject.GetComponent<LayoutElement>();
            textLayout.minWidth = 48;
            textLayout.preferredWidth = texture == null ? 240 : 100;
            textLayout.preferredHeight = 52;
            textLayout.flexibleWidth = 1;
        }
    }
}
