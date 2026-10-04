using UnityEngine;
using UnityEngine.UI;

// Geometry follows the five fixed buttons in Roland_Palhetada.png.
public sealed class GuitarButtonLights : MaskableGraphic
{
    private static readonly Color[] ButtonColors =
    {
        new Color(0.2f, 1f, 0.15f), new Color(1f, 0.12f, 0.1f),
        new Color(1f, 0.9f, 0.05f), new Color(0.12f, 0.45f, 1f), new Color(1f, 0.45f, 0.04f)
    };
    private static readonly Vector2[] Centers =
    {
        new Vector2(0.60980f, 0.39698f), new Vector2(0.64907f, 0.41434f),
        new Vector2(0.68623f, 0.43468f), new Vector2(0.72720f, 0.45446f), new Vector2(0.76345f, 0.47239f),
        new Vector2(0.61223f, 0.39679f), new Vector2(0.65347f, 0.41238f),
        new Vector2(0.68786f, 0.43408f), new Vector2(0.72927f, 0.45444f), new Vector2(0.76647f, 0.47234f)
    };
    private Image portrait;
    private int pressedMask;
    private int pose;

    protected override void Awake()
    {
        base.Awake();
        raycastTarget = false;
    }

    public void Show(Image image, int mask, int handPose)
    {
        bool changed = portrait != image || pressedMask != mask || pose != handPose || color != image.color;
        portrait = image;
        pressedMask = mask & 31;
        pose = handPose;
        color = image.color;
        if (changed) SetVerticesDirty();
    }

    protected override void OnPopulateMesh(VertexHelper mesh)
    {
        mesh.Clear();
        if (portrait == null || portrait.sprite == null) return;
        Rect bounds = GetPixelAdjustedRect();
        Vector2 drawnSize = bounds.size;
        Vector2 spriteSize = portrait.sprite.rect.size;
        if (portrait.preserveAspect)
        {
            float scale = Mathf.Min(bounds.width / spriteSize.x, bounds.height / spriteSize.y);
            drawnSize = spriteSize * scale;
        }
        for (int button = 0; button < 5; button++)
        {
            if ((pressedMask & (1 << button)) == 0) continue;
            Vector2 center = bounds.center + Vector2.Scale(Centers[pose * 5 + button] - Vector2.one * 0.5f, drawnSize);
            Color tint = ButtonColors[button] * color;
            Color halo = tint;
            halo.a *= 0.16f;
            AddButton(mesh, center, Vector2.Scale(new Vector2(0.039f, 0.040f), drawnSize), halo);
            AddButton(mesh, center, Vector2.Scale(new Vector2(0.027f, 0.028f), drawnSize), tint);
        }
    }

    private static void AddButton(VertexHelper mesh, Vector2 center, Vector2 size, Color tint)
    {
        int start = mesh.currentVertCount;
        var rotation = Quaternion.Euler(0f, 0f, 27f);
        Vector2[] corners = { new(-0.5f, -0.5f), new(-0.5f, 0.5f), new(0.5f, 0.5f), new(0.5f, -0.5f) };
        foreach (Vector2 corner in corners)
        {
            Vector3 position = center + (Vector2)(rotation * Vector2.Scale(corner, size));
            mesh.AddVert(position, tint, Vector2.zero);
        }
        mesh.AddTriangle(start, start + 1, start + 2);
        mesh.AddTriangle(start + 2, start + 3, start);
    }
}
