using System;
using UnityEngine;

/// <summary>Eight columns, twelve action rows, read left to right from the top.</summary>
public static class BossSpriteAtlas
{
    public const int Columns = 8;
    public const int Rows = 12;
    public const int Padding = 4;
    public static Texture2D Load()
    {
        string name = BossRoster.Selected == BossRoster.Identity.Geminias ? "Geminias"
            : BossRoster.Selected == BossRoster.Identity.Claudio ? "Claudio" : "Gepeto";
        var texture = Resources.Load<Texture2D>("Bosses/" + name);
        if (texture == null || !texture.isReadable || texture.width % Columns != 0 || texture.height % Rows != 0
            || texture.width / Columns != texture.height / Rows)
        {
            Debug.LogError("Folha de sprites inválida ou ausente: " + name);
            return null;
        }
        return texture;
    }
    public static Sprite Cell(Texture2D texture, int row, int column)
    {
        if (texture == null) throw new ArgumentNullException(nameof(texture));
        if (row < 0 || row >= Rows) throw new ArgumentOutOfRangeException(nameof(row));
        if (column < 0 || column >= Columns) throw new ArgumentOutOfRangeException(nameof(column));
        int size = texture.width / Columns;
        if (!texture.isReadable || size < 1 || texture.width % Columns != 0
            || texture.height % Rows != 0 || texture.height / Rows != size)
            throw new ArgumentException("Expected a readable atlas with square cells.", nameof(texture));

        var source = texture.GetPixels(column * size, texture.height - (row + 1) * size, size, size);
        var alpha = new byte[source.Length];
        for (int i = 0; i < source.Length; i++) alpha[i] = ((Color32)source[i]).a;
        var foreign = BossFrameIsolation.FindForeignEdgePixels(alpha, size);
        int paddedSize = size + Padding * 2;
        var pixels = new Color32[paddedSize * paddedSize];
        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            int index = y * size + x;
            if (!foreign[index]) pixels[(y + Padding) * paddedSize + x + Padding] = source[index];
        }
        // A standalone texture cannot sample a neighbouring frame, even with bilinear filtering.
        var isolated = new Texture2D(paddedSize, paddedSize, TextureFormat.RGBA32, false)
        {
            name = texture.name + "_" + row + "_" + column,
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
            anisoLevel = 0
        };
        isolated.SetPixels32(pixels);
        isolated.Apply(false, true);
        // Identical untrimmed square rectangles keep the anchor and scale stable across actions.
        var sprite = Sprite.Create(isolated, new Rect(Padding, Padding, size, size),
            new Vector2(.5f, .5f), 100f, 0, SpriteMeshType.FullRect);
        sprite.name = isolated.name;
        return sprite;
    }

    public static Sprite[] Row(Texture2D texture, int row)
    {
        var frames = new Sprite[Columns];
        for (int i = 0; i < Columns; i++) frames[i] = Cell(texture, row, i);
        return frames;
    }
}
