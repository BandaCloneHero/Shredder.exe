using TMPro;
using UnityEngine;
using YARG.Localization;

namespace YARG.Menu.ScoreScreen
{
    internal static class ScoreScreenText
    {
        public static string Translate(string text)
        {
            if (string.IsNullOrEmpty(text)) return text;
            if (text == "High score") text = "High Score";
            return LocalizationManager.TryGetLocalizedKey("Menu.ScoreScreen.Labels." + text, out var translation)
                ? translation : text;
        }

        // Called before player names, song names and score values are assigned.
        public static void Apply(Transform root)
        {
            foreach (var label in root.GetComponentsInChildren<TextMeshProUGUI>(true))
                label.text = Translate(label.text);
        }
    }
}
