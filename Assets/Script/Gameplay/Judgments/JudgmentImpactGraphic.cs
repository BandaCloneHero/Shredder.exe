using UnityEngine;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Small procedural ring and four rays. No textures or post-processing.</summary>
    public sealed class JudgmentImpactGraphic : MaskableGraphic
    {
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var size = rectTransform.rect.size * 0.5f;
            const int segments = 32;
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                float b = (i + 1) * Mathf.PI * 2 / segments;
                AddQuad(vh, Point(a, size, 0.91f), Point(a, size, 1), Point(b, size, 1), Point(b, size, 0.91f));
            }
            for (int i = 0; i < 4; i++)
            {
                float angle = i * Mathf.PI / 2;
                AddQuad(vh, Point(angle - 0.025f, size, 1.06f), Point(angle, size, 1.3f),
                    Point(angle + 0.025f, size, 1.06f), Point(angle, size, 0.98f));
            }
        }

        private static Vector2 Point(float angle, Vector2 size, float radius) =>
            new(Mathf.Cos(angle) * size.x * radius, Mathf.Sin(angle) * size.y * radius);

        private void AddQuad(VertexHelper vh, Vector2 a, Vector2 b, Vector2 c, Vector2 d)
        {
            int start = vh.currentVertCount;
            vh.AddVert(a, color, Vector2.zero);
            vh.AddVert(b, color, Vector2.zero);
            vh.AddVert(c, color, Vector2.zero);
            vh.AddVert(d, color, Vector2.zero);
            vh.AddTriangle(start, start + 1, start + 2);
            vh.AddTriangle(start, start + 2, start + 3);
        }
    }
}
