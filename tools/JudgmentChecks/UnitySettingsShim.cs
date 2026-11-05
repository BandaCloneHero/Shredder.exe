// Only the Inspector attributes and Mathf used by the linked settings file.
// This harness does not emulate or validate Unity rendering.
namespace UnityEngine
{
    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class TooltipAttribute(string text) : System.Attribute { }
    [System.AttributeUsage(System.AttributeTargets.Field)]
    public sealed class MinAttribute(float min) : System.Attribute { }
    public static class Mathf
    {
        public static float Max(float a, float b) => System.Math.Max(a, b);
    }
}
