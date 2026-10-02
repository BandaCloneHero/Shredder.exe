using UnityEngine;

namespace YARG.Gameplay.Player
{
    /// <summary>Seven fixed white keys, retaining native Pro Keys pitch indices.</summary>
    public static class SevenKeyProKeysLayout
    {
        // C D E F G A B in the first octave; MIDI chart pitches 48..59.
        private static readonly int[] Keys = { 0, 2, 4, 5, 7, 9, 11 };
        private static readonly Color[] Colors =
        {
            new Color(0.20f, 0.85f, 0.30f), // C: green
            new Color(0.95f, 0.25f, 0.25f), // D: red
            new Color(1.00f, 0.85f, 0.15f), // E: yellow
            new Color(0.25f, 0.50f, 1.00f), // F: blue
            new Color(1.00f, 0.55f, 0.15f), // G: orange
            new Color(0.15f, 0.90f, 0.95f), // A: cyan
            new Color(0.75f, 0.35f, 1.00f), // B: violet
        };

        public static bool IsPlayable(int pitchIndex) => System.Array.IndexOf(Keys, pitchIndex) >= 0;

        public static Color GetColor(int pitchIndex)
        {
            int index = System.Array.IndexOf(Keys, pitchIndex);
            return index >= 0 ? Colors[index] : Color.clear;
        }
    }
}
