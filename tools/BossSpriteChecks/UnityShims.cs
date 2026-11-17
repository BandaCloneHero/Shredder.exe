using System;
// In-memory pixel API only: these checks do not simulate Unity's renderer or GPU.
namespace UnityEngine
{
    public enum TextureFormat { RGBA32 }
    public enum FilterMode { Bilinear }
    public enum TextureWrapMode { Clamp }
    public enum SpriteMeshType { FullRect }
    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero => new Vector2(0, 0);
    }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
    }
    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float width, float height)
        { this.x = x; this.y = y; this.width = width; this.height = height; }
    }
    public static class Mathf
    {
        public static float Abs(float x) => Math.Abs(x);
        public static float Min(float x, float y) => Math.Min(x, y);
        public static float Max(float x, float y) => Math.Max(x, y);
    }
    public struct Color { public float r, g, b, a; }
    public struct Color32
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static implicit operator Color32(Color c) => new Color32(
            (byte)Math.Round(c.r * 255), (byte)Math.Round(c.g * 255),
            (byte)Math.Round(c.b * 255), (byte)Math.Round(c.a * 255));
        public static implicit operator Color(Color32 c) => new Color
            { r = c.r / 255f, g = c.g / 255f, b = c.b / 255f, a = c.a / 255f };
    }
    public class Texture2D
    {
        public int width, height, anisoLevel;
        public bool isReadable = true, mipmaps;
        public string name;
        public FilterMode filterMode;
        public TextureWrapMode wrapMode;
        public Color32[] Pixels;
        public Texture2D(int w, int h, TextureFormat format, bool mipmaps)
        { width = w; height = h; this.mipmaps = mipmaps; Pixels = new Color32[w * h]; }
        public Color[] GetPixels(int x, int y, int w, int h)
        {
            if (!isReadable) throw new InvalidOperationException("Unreadable texture");
            var result = new Color[w * h];
            for (int yy = 0; yy < h; yy++) for (int xx = 0; xx < w; xx++)
                result[yy * w + xx] = Pixels[(y + yy) * width + x + xx];
            return result;
        }
        public void SetPixels32(Color32[] pixels) => Pixels = (Color32[])pixels.Clone();
        public void Apply(bool updateMipmaps, bool makeNoLongerReadable) => isReadable = !makeNoLongerReadable;
    }
    public class Sprite
    {
        public Texture2D texture;
        public Rect rect;
        public Vector2 pivot;
        public float pixelsPerUnit;
        public string name;
        public static Sprite Create(Texture2D texture, Rect rect, Vector2 pivot,
            float pixelsPerUnit, uint extrude, SpriteMeshType type) => new Sprite
            { texture = texture, rect = rect, pivot = pivot, pixelsPerUnit = pixelsPerUnit };
    }
    public static class Debug { public static void LogError(string message) { } }
    public static class Resources { public static T Load<T>(string path) where T : class => null; }
}
public static class BossRoster
{
    public enum Identity { Gepeto, Geminias, Claudio }
    public static Identity Selected;
}
