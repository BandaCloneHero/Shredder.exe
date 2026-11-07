// Only the Inspector attributes and Mathf used by the linked settings file.
// This harness does not emulate or validate Unity rendering.
namespace UnityEngine
{
    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class TooltipAttribute : System.Attribute { public TooltipAttribute(string text) { } }
    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class MinAttribute : System.Attribute { public MinAttribute(float min) { } }
    public sealed class HeaderAttribute : System.Attribute { public HeaderAttribute(string text) { } }
    public sealed class RangeAttribute : System.Attribute { public RangeAttribute(float min, float max) { } }
    public static class Mathf
    {
        public static float Max(float a, float b) => System.Math.Max(a, b);
        public static float Min(float a, float b) => System.Math.Min(a, b);
        public static float Clamp(float value, float min, float max) => System.Math.Clamp(value, min, max);
    }
}
