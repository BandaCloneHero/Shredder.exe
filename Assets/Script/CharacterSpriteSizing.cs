using System;
using UnityEngine;

[Serializable]
public class CharacterSpriteSizing
{
    public Sprite sprite;
    public float scale = 1f;
    public Vector2 offset;

    public static void Get(CharacterSpriteSizing[] entries, Sprite sprite, out float scale, out Vector2 offset)
    {
        scale = 1f;
        offset = Vector2.zero;
        if (entries == null || sprite == null) return;
        foreach (var entry in entries)
        {
            if (entry.sprite != sprite) continue;
            scale = entry.scale;
            offset = entry.offset;
            return;
        }
    }
}
