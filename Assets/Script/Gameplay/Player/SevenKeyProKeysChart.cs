using YARG.Core.Chart;

namespace YARG.Gameplay.Player
{
    public static class SevenKeyProKeysChart
    {
        // Fold octaves into C–B. Accidentals use the neighboring white key below.
        private static readonly int[] KeyByPitchClass = { 0, 0, 2, 2, 4, 5, 5, 7, 7, 9, 9, 11 };

        public static bool NeedsAdaptation(InstrumentDifficulty<ProKeysNote> difficulty)
        {
            foreach (var chord in difficulty.Notes)
            {
                foreach (var note in chord.AllNotes)
                {
                    if (note.Key >= KeyByPitchClass.Length || KeyByPitchClass[note.Key] != note.Key)
                        return true;
                }
            }

            return false;
        }

        public static void Adapt(InstrumentDifficulty<ProKeysNote> difficulty)
        {
            if (!NeedsAdaptation(difficulty))
                return;

            var chordKeys = new ProKeysNote[KeyByPitchClass.Length];
            var previousByKey = new ProKeysNote[KeyByPitchClass.Length];
            for (int i = 0; i < difficulty.Notes.Count; i++)
            {
                var sourceChord = difficulty.Notes[i];
                System.Array.Clear(chordKeys, 0, chordKeys.Length);
                foreach (var source in sourceChord.AllNotes)
                {
                    int key = KeyByPitchClass[source.Key % KeyByPitchClass.Length];
                    var sameKey = chordKeys[key];
                    var sustain = sameKey != null && sameKey.TickLength > source.TickLength ? sameKey : source;
                    chordKeys[key] = new ProKeysNote(key,
                        source.ProKeysFlags | (sameKey?.ProKeysFlags ?? ProKeysNoteFlags.None),
                        source.Flags | (sameKey?.Flags ?? NoteFlags.None),
                        source.Time, sustain.TimeLength, source.Tick, sustain.TickLength);
                }

                var chord = chordKeys[KeyByPitchClass[sourceChord.Key % KeyByPitchClass.Length]];
                foreach (var note in chordKeys)
                {
                    if (note == null)
                        continue;

                    // Two original pitches can share an adapted lane. End the
                    // earlier hold at the next attack so the key can be struck again.
                    var previous = previousByKey[note.Key];
                    if (previous != null && previous.TickEnd > note.Tick)
                    {
                        previous.TickLength = note.Tick - previous.Tick;
                        previous.TimeLength = note.Time - previous.Time;
                    }

                    previousByKey[note.Key] = note;
                    if (note != chord)
                        chord.AddChildNote(note);
                }

                difficulty.Notes[i] = chord;
            }

            // Cloning rebuilds the note links and per-key engine masks.
            var linkedNotes = difficulty.Notes.DuplicateNotes();
            difficulty.Notes.Clear();
            difficulty.Notes.AddRange(linkedNotes);
            difficulty.RangeShiftEvents.Clear();
        }
    }
}
