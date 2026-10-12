"""Conservative Easy/Medium gameplay policy, independent of audio transcription."""
import math


def easy_medium_notes(instrument, notes, bpm=120., snare_lane=2):
    """Preserve original timing; thin attacks and bound hand/foot combinations.

    This is a custom gameplay policy between Easy
    and Medium, not a new difficulty understood by the game.
    """
    groups = []
    for note in sorted(notes):
        if note[1] <= note[0]:
            continue
        if groups and note[0]-groups[-1][0] <= .035:
            groups[-1][1].append(list(note))
        else:
            groups.append([note[0], [list(note)]])
    period = 60/max(45., min(240., bpm))
    gap = max(.28, min(.38, period*.70)) if instrument == 'drums' else {
        'guitar': .32, 'bass': .28, 'keys': .32}.get(instrument, .32)
    def priority(group):
        start, members = group
        lanes = {n[2] for n in members}
        if instrument == 'drums':
            # Keep the kick/snare skeleton ahead of ornamental cymbal strokes.
            return (3. if 0 in lanes else 0.) + (3. if snare_lane in lanes else 0.) + .3*len(lanes)
        return 1+min(max(n[1]-n[0] for n in members), .8)
    selected = []
    for group in sorted(groups, key=lambda g: (-priority(g), g[0])):
        if all(abs(group[0]-old[0]) >= gap for old in selected):
            selected.append(group)
    result = []
    for start, members in sorted(selected):
        by_lane = {}
        for note in members:
            lane = note[2]
            if instrument in ('guitar', 'bass'):
                # Four frets; no orange button and no multi-fret chords.
                lane = min(3, max(0, round(lane*.75)))
            candidate = [start, max(start+.035, note[1]), lane]
            if lane not in by_lane or candidate[1] > by_lane[lane][1]:
                by_lane[lane] = candidate
        if instrument == 'drums':
            order = sorted(by_lane, key=lambda lane: (lane != 0, lane != snare_lane, lane))
            chosen = [by_lane[lane] for lane in order[:2]]
            for note in chosen:
                note[1] = start+.035
        else:
            # A single key/fret at a time keeps the profile approachable.
            chosen = [max(by_lane.values(), key=lambda n: (n[1]-n[0], -n[2]))]
            chosen[0][1] = min(chosen[0][1], start+(1.3 if instrument == 'bass' else .85))
        result.extend(chosen)
    result.sort()
    for current, following in zip(result, result[1:]):
        if instrument != 'drums' and current[1] >= following[0]:
            current[1] = following[0]-.012
    return [n for n in result if n[1] > n[0]+.004]


def apply_easy_medium(charts, bpm, snare_lane=2, difficulty='Medium'):
    return {instrument: {level: easy_medium_notes(instrument, levels['Expert'], bpm, snare_lane)
                        if level == difficulty else [] for level in levels}
            for instrument, levels in charts.items()}


def verify_profile(charts, difficulty='Medium'):
    """Check actual gameplay limits, rather than accepting any valid MIDI."""
    stats = {}
    for instrument, levels in charts.items():
        assert all(not notes for level, notes in levels.items() if level != difficulty)
        notes = sorted(levels[difficulty])
        starts = sorted(set(n[0] for n in notes))
        assert all(b-a >= .279 for a, b in zip(starts, starts[1:])), 'Overly dense beginner attacks'
        maximum = max((sum(abs(n[0]-t) <= .035 for n in notes) for t in starts), default=0)
        assert maximum <= (2 if instrument == 'drums' else 1), 'Too many simultaneous hits'
        if instrument in ('guitar', 'bass'):
            assert all(0 <= n[2] <= 3 for n in notes), 'Fifth fret in beginner profile'
        if instrument != 'drums':
            assert all(a[1] < b[0] for a, b in zip(notes, notes[1:])), 'Overlapping beginner holds'
        stats[instrument] = {'notes': len(notes), 'attacks': len(starts), 'max_simultaneous_including_kick': maximum,
                             'minimum_attack_gap_seconds': min((b-a for a, b in zip(starts, starts[1:])), default=None)}
    return stats


def apply_realistic(charts, difficulty='Medium', snare_lane=2):
    """Keep the full detected chart pool; limit drums to two total hits.

    The output difficulty is a storage slot, not a density reduction policy.
    """
    result, report = {}, {}
    for instrument, levels in charts.items():
        original = sorted(levels['Expert'])
        notes = original
        if instrument == 'drums':
            groups = []
            for note in original:
                if groups and note[0]-groups[-1][0][0] <= .035:
                    groups[-1].append(note)
                else:
                    groups.append([note])
            notes = []
            for group in groups:
                chosen = sorted(group, key=lambda n: (n[2] != 0, n[2] != snare_lane, n[0], n[2]))[:2]
                notes.extend(chosen)
            notes.sort()
        result[instrument] = {level: notes if level == difficulty else [] for level in levels}
        report[instrument] = {'detected_chart_notes': len(original), 'retained_notes': len(notes),
                              'removed_for_drum_playability': len(original)-len(notes),
                              'density_thinning': False, 'synthesized_accompaniment': False}
    return result, report
