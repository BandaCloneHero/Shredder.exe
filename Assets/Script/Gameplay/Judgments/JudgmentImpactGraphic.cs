using UnityEngine;
using UnityEngine.UI;

namespace YARG.Gameplay.Judgments
{
    /// <summary>Small procedural ring and four rays. No textures or post-processing.</summary>
    public sealed class JudgmentImpactGraphic : MaskableGraphic
    {
        // All instances share the same shape. Rebuilding for alpha/color no longer repeats trigonometry.
        private static readonly Vector2[] UnitVertices = BuildUnitVertices();

        private static Vector2[] BuildUnitVertices()
        {
            const int segments = 32;
            var vertices = new Vector2[(segments + 4) * 4];
            for (int i = 0; i < segments; i++)
            {
                float a = i * Mathf.PI * 2 / segments;
                float b = (i + 1) * Mathf.PI * 2 / segments;
                int offset = i * 4;
                vertices[offset] = Point(a, 0.91f);
                vertices[offset + 1] = Point(a, 1);
                vertices[offset + 2] = Point(b, 1);
                vertices[offset + 3] = Point(b, 0.91f);
            }
            for (int i = 0; i < 4; i++)
            {
                float angle = i * Mathf.PI / 2;
                int offset = (segments + i) * 4;
                vertices[offset] = Point(angle - 0.025f, 1.06f);
                vertices[offset + 1] = Point(angle, 1.3f);
                vertices[offset + 2] = Point(angle + 0.025f, 1.06f);
                vertices[offset + 3] = Point(angle, 0.98f);
            }
            return vertices;
        }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var size = rectTransform.rect.size * 0.5f;
            for (int i = 0; i < UnitVertices.Length; i += 4)
            {
                int start = vh.currentVertCount;
                for (int j = 0; j < 4; j++)
                {
                    var vertex = UnitVertices[i + j];
                    vh.AddVert(new Vector2(vertex.x * size.x, vertex.y * size.y), color, Vector2.zero);
                }
                vh.AddTriangle(start, start + 1, start + 2);
                vh.AddTriangle(start, start + 2, start + 3);
            }
        }

        private static Vector2 Point(float angle, float radius) =>
            new(Mathf.Cos(angle) * radius, Mathf.Sin(angle) * radius);
    }
}
