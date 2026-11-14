using UnityEngine;

/// <summary>Eight columns, twelve action rows, read left to right from the top.</summary>
public static class BossSpriteAtlas
{
    public const int Columns = 8;
    public const int Rows = 12;
    public static Texture2D Load()
    {
        string name = BossRoster.Selected == BossRoster.Identity.Geminias ? "Geminias"
            : BossRoster.Selected == BossRoster.Identity.Claudio ? "Claudio" : "Gepeto";
        var texture = Resources.Load<Texture2D>("Bosses/" + name);
        if (texture == null || texture.width % Columns != 0 || texture.height % Rows != 0
            || texture.width / Columns != texture.height / Rows)
        {
            Debug.LogError("Folha de sprites inválida ou ausente: " + name);
            return null;
        }
        return texture;
    }
    public static Sprite Cell(Texture2D texture, int row, int column)
    {
        int size = texture.width / Columns;
        var sprite = Sprite.Create(texture,
            new Rect(column * size, texture.height - (row + 1) * size, size, size),
            new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect);
        sprite.name = texture.name + "_" + row + "_" + column;
        return sprite;
    }
    public static Sprite[] Row(Texture2D texture, int row)
    {
        var frames = new Sprite[Columns];
        for (int i = 0; i < Columns; i++) frames[i] = Cell(texture, row, i);
        return frames;
    }
}
