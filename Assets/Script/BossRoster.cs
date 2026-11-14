using UnityEngine;

/// <summary>Original AI-inspired stage personas. Selection persists between songs.</summary>
public static class BossRoster
{
    public enum Identity { Gepeto, Geminias, Claudio }
    private const string Preference = "Shredder.BossIdentity";
    public static Identity Selected
    {
        get => (Identity)Mathf.Clamp(PlayerPrefs.GetInt(Preference, 0), 0, 2);
        set { PlayerPrefs.SetInt(Preference, (int)value); PlayerPrefs.Save(); }
    }
    public static string Name => Selected == Identity.Geminias ? "Geminias" : Selected == Identity.Claudio ? "Cláudio" : "Gepeto";
    public static string Title => Selected == Identity.Geminias ? "O Núcleo Multimodal" : Selected == Identity.Claudio ? "O Assistente Inflexível" : "O Arquiteto";
    public static string Attack(int number) => Selected == Identity.Geminias
        ? (number % 2 == 1 ? "INFERÊNCIA PARALELA" : "TORRENTE MULTIMODAL")
        : Selected == Identity.Claudio ? "REVISÃO DE CONTEXTO" : "SOBRECARGA";
    public static Color Accent => Selected == Identity.Geminias ? new Color(.4f, .65f, 1f)
        : Selected == Identity.Claudio ? new Color(1f, .58f, .35f) : new Color(.15f, .9f, 1f);
}
