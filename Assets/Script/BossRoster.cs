using UnityEngine;

/// <summary>Boss identities associated with the official campaign tracks.</summary>
public static class BossRoster
{
    public enum Identity { Gepeto, Geminias, Claudio }
    public static Identity Selected { get; private set; }

    public static bool ConfigureForSong(string name, string album)
    {
        var identity = album == "Shredder.exe - Campanha" ? name?.Normalize() switch
        {
            "Kairós" => Identity.Gepeto,
            "Neon em Ruínas" => Identity.Geminias,
            "Colapso do Núcleo" => Identity.Claudio,
            _ => (Identity?)null
        } : null;

        Selected = identity.GetValueOrDefault();
        return identity.HasValue;
    }

    public static string Name => Selected == Identity.Geminias ? "Geminias" : Selected == Identity.Claudio ? "Cláudio" : "Gepeto";
    public static string Attack(int number) => Selected == Identity.Geminias
        ? (number % 2 == 1 ? "INFERÊNCIA PARALELA" : "SOBRECARGA MULTIMODAL")
        : Selected == Identity.Claudio ? "PROTOCOLO: REVISÃO" : "SOBRECARGA";
    public static Color Accent => Selected == Identity.Geminias ? new Color(.4f, .65f, 1f)
        : Selected == Identity.Claudio ? new Color(1f, .58f, .35f) : new Color(.15f, .9f, 1f);
}
