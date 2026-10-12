"""Inspectable gameplay adaptations; no fixed drum pattern without audio evidence."""
import collections
import copy
import math
from pathlib import Path

import numpy as np
from scipy import ndimage, signal

from wav_chart_analysis import DT, SAMPLE_RATE, WHITE_KEYS, activity, stft


def original_audio_layout(raw, work):
    """Use decoded MP3 as timeline; align all stems with a verified common lag."""
    frames = len(raw['mix'])
    stem_frames = len(raw['guitar'])
    if any(len(raw[i]) != stem_frames for i in ('guitar', 'bass', 'drums', 'keys')):
        raise ValueError('Different stem lengths; do not guess individual shifts.')
    if abs(frames-stem_frames) > 44100*.20:
        raise ValueError('Original mix differs in length by more than 200ms; verify the recording.')
    probes = []
    length = min(frames, stem_frames, 44100*20)
    for offset in sorted(set([0, max(0, min(frames, stem_frames)//2-length//2), max(0, min(frames, stem_frames)-length)])):
        a = raw['mix'][offset:offset+length].mean(axis=1)[::10].astype(np.float64)
        b = sum(raw[i][offset:offset+length].mean(axis=1)[::10].astype(np.float64) for i in ('guitar', 'bass', 'drums', 'keys'))
        norm = np.linalg.norm(a)*np.linalg.norm(b)
        if norm < 1e-8:
            continue
        corr = signal.correlate(a, b, method='fft')
        lags = signal.correlation_lags(len(a), len(b))
        allowed = np.flatnonzero(abs(lags) <= 2205)
        selected = int(allowed[np.argmax(corr[allowed])])
        probes.append({'offset_seconds': offset/44100, 'lag_seconds': float(lags[selected]/4410),
                       'correlation': float(corr[selected]/norm)})
    reliable = [p for p in probes if p['correlation'] >= .35]
    if len(reliable) < min(2, len(probes)) or not reliable:
        raise ValueError('Original MP3 and stem sum lack reliable alignment evidence; verify source recording.')
    lags = [p['lag_seconds'] for p in reliable]
    if max(lags)-min(lags) > .015:
        raise ValueError('Original MP3 drifts against stems; one offset cannot align this recording.')
    shift = round(float(np.median(lags))*44100)
    result = {'mix': raw['mix']}
    for instrument in ('guitar', 'bass', 'drums', 'keys'):
        adjusted = np.memmap(Path(work)/(instrument+'.aligned.f32'), dtype='<f4', mode='w+', shape=(frames, 2))
        adjusted[:] = 0.
        start = max(0, shift)
        source_start = max(0, -shift)
        count = min(stem_frames-source_start, frames-start)
        if count <= 0:
            raise ValueError('No aligned audio overlap.')
        adjusted[start:start+count] = raw[instrument][source_start:source_start+count]
        adjusted.flush()
        result[instrument] = adjusted
    return result, {'status': 'original_mix_timeline_aligned', 'sample_rate': 44100,
                    'samples': frames, 'original_stem_samples': stem_frames,
                    'mix_probes': probes, 'common_stem_shift_ms': shift/44.1,
                    'length_adjustment_ms': (frames-stem_frames)/44.1,
                    'automatic_shifts': bool(shift), 'equal_sample_counts': True,
                    'limitation': 'Common alignment verified; individual stem delays remain unproven.'}


def refine_groove(analysis, audio, beat):
    """Recover bright attacks and resolve noisy tom/snare ambiguity per recording."""
    result = copy.deepcopy(analysis)
    events = result['events']
    f, times, mag = stft(audio, 2048)
    high = np.sqrt(np.sum(mag[f >= 3500]**2, axis=0))
    mid = np.sqrt(np.sum(mag[(f >= 700) & (f < 3500)]**2, axis=0))
    low = np.sqrt(np.sum(mag[(f >= 45) & (f < 650)]**2, axis=0))
    rms, floor, _ = activity(audio)
    period = 60 / beat['bpm']
    snares = [e['start'] for e in events if e['kind'] == 'snare' and e['confidence'] >= .45]
    # Infer the phase from this recording, rather than assuming the first beat
    # is a downbeat. A weak circular concentration disables the rhythmic prior.
    phase_vector = np.mean(np.exp(2j * np.pi * np.asarray(snares) / period)) if snares else 0j
    phase = float(np.angle(phase_vector) * period / (2 * np.pi))
    concentration = float(abs(phase_vector))
    relabeled = []
    for event in events:
        if event['kind'] != 'tom':
            continue
        first = max(0, round(event['start'] / DT))
        stop = min(len(times), first + 7)
        body = float(np.mean(low[first:stop]))
        rattle = float(np.mean(mid[first:stop]))
        bright = float(np.mean(high[first:stop]))
        distance = abs((event['start'] - phase + period / 2) % period - period / 2)
        # Only broadband noisy bodies near the learned snare pulse qualify.
        # Tonal tom fills are kept even when they happen on a backbeat.
        if concentration > .25 and distance < .080 and rattle > body * .45 and bright > body * .12:
            event['kind'], event['pitches'] = 'snare', [1]
            relabeled.append(event['start'])

    novelty = np.maximum(0., high - ndimage.minimum_filter1d(high, size=7))
    baseline = ndimage.median_filter(novelty, size=101)
    mad = ndimage.median_filter(abs(novelty - baseline), size=101)
    threshold = np.maximum(baseline + 3 * mad, float(novelty.max(initial=0)) * .025)
    peaks = signal.find_peaks(novelty, distance=max(1, round(.070 / DT)),
                              prominence=float(novelty.max(initial=0)) * .018)[0]
    added = []
    for frame in peaks:
        if novelty[frame] < threshold[frame] or rms[min(frame, len(rms)-1)] < floor * 2:
            continue
        before = float(np.mean(high[max(0, frame-6):max(1, frame-2)]))
        if high[frame] < before * 1.25:
            continue
        first = int(frame)
        while first > max(0, frame-4) and novelty[first-1] > novelty[frame] * .25:
            first -= 1
        start = max(0., float(times[first]) - .005)
        # Chimbal recovery must correspond to a bright transient, not merely
        # a time where a canned groove would have put a hit.
        bright_fraction = float(high[frame] / max(high[frame]+mid[frame]+low[frame], 1e-9))
        if bright_fraction < .23:
            continue
        if any(abs(e['start']-start) < .075 and e['kind'] in ('hihat', 'crash') for e in events):
            continue
        if any(abs(e['start']-start) < .055 and e['kind'] == 'snare' for e in events) and bright_fraction < .45:
            continue
        # Do not add a third hand stroke on top of an existing tom/snare fill.
        if sum(abs(e['start']-start) < .025 and e['kind'] != 'kick' for e in events) >= 2:
            continue
        end = min(start + .045, len(audio)/SAMPLE_RATE - .005)
        if end <= start:
            continue
        early = float(np.mean(high[frame+2:frame+6])) if frame+6 < len(high) else 0.
        tail = float(np.mean(high[frame+8:frame+14])) if frame+14 < len(high) else 0.
        next_attack = any(start+.055 < float(times[p]) < start+.16 for p in peaks)
        kind = 'crash' if early > 0 and tail/early > .55 and not next_attack else 'hihat'
        event = {'start': start, 'end': end, 'pitches': [4 if kind == 'crash' else 2],
                 'strength': float(novelty[frame]/max(float(np.quantile(novelty, .95)), 1e-9)),
                 'confidence': .50, 'kind': kind}
        events.append(event)
        added.append({'time': start, 'kind': kind})
    # Resolve a noisy tom reclassified onto an already detected snare.
    unique = []
    for e in sorted(events, key=lambda e: (e['confidence'], e['strength']), reverse=True):
        if not any(e['kind'] == other['kind'] and abs(e['start']-other['start']) < .065 for other in unique):
            unique.append(e)
    # User-selected standard groove adaptation: a regular hat pulse where
    # kick/snare already establish a beat and the WAV has bright percussion.
    # These pulses are explicitly distinguished from transcribed attacks.
    groove_pulses = []
    bodies = [e['start'] for e in unique if e['kind'] in ('kick', 'snare')]
    body_times = np.asarray(bodies)
    cymbal_reference = float(np.quantile(high, .90))
    if beat.get('confidence', 0.) >= .20 and cymbal_reference > 1e-7:
        for grid in beat.get('beats', []):
            if sum(abs(t-grid) < 2. for t in bodies) < 4:
                continue
            # Busy tom fills take priority over a generic accompaniment pulse.
            if sum(abs(e['start']-grid) < 1. and e['kind'] == 'tom' for e in unique) >= 4:
                continue
            if any(abs(e['start']-grid) < period*.35 and e['kind'] in ('hihat', 'crash') for e in unique):
                continue
            local = body_times[abs(body_times-grid) < 2.]
            phases = (local-grid+period/2) % period-period/2
            vector = np.mean(np.exp(2j*np.pi*phases/period))
            if abs(vector) < .35:
                continue
            correction = float(np.angle(vector)*period/(2*np.pi))
            start = max(0., float(grid)+correction)
            frame = min(len(high)-1, round(start/DT))
            bright = float(np.mean(high[max(0, frame-2):frame+3]))
            body = float(np.mean(low[max(0, frame-2):frame+3]))
            if bright < cymbal_reference*.10 or bright < body*.025 or rms[min(frame, len(rms)-1)] < floor*2:
                continue
            if any(abs(e['start']-start) < .10 and e['kind'] in ('hihat', 'crash') for e in unique):
                continue
            if sum(abs(e['start']-start) < .025 and e['kind'] != 'kick' for e in unique) >= 2:
                continue
            end = min(start+.045, len(audio)/SAMPLE_RATE-.005)
            if end <= start:
                continue
            unique.append({'start': start, 'end': end, 'pitches': [2], 'strength': .65,
                           'confidence': .35, 'kind': 'hihat'})
            groove_pulses.append(start)
    result['events'] = sorted(unique, key=lambda e: (e['start'], e['pitches']))
    result['diagnostics']['events'] = len(unique)
    result['diagnostics']['groove_refinement'] = {
        'method': 'audio-supported high-band attacks and learned snare phase',
        'added_cymbal_attacks': added, 'tom_to_snare_times': relabeled,
        'snare_phase_concentration': concentration,
        'standard_groove_hat_pulses': groove_pulses,
        'groove_pulses_are_gameplay_adaptation': True,
        'class_counts': dict(collections.Counter(e['kind'] for e in unique)),
        'forced_pattern_hits': len(groove_pulses),
        'limitation': 'Cymbal/snare separation remains heuristic; listen to the listed timestamps.'}
    return result


def accompany_keys(charts, analyses, beat, mix, max_gap=4.):
    """Fill long keyboard rests with explicit gameplay notes from accompaniment.

    Genuine detected keyboard notes and holds remain intact. Added notes are
    NOT reported as keyboard transcription, even if the mix is audibly active.
    """
    result = copy.deepcopy(charts)
    rms, floor, reference = activity(mix)
    duration = len(mix)/SAMPLE_RATE
    period = 60/beat['bpm']
    additions = {}
    pitched = sorted([e for i in ('bass', 'guitar') for e in analyses[i]['events']
                      if e['pitches'] and e['confidence'] >= .35], key=lambda e: e['start'])
    pitched_times = np.array([e['start'] for e in pitched])
    rhythmic = sorted(set(e['start'] for i in ('drums', 'guitar', 'bass') for e in analyses[i]['events']))
    rhythmic = np.array(rhythmic)
    beats = np.array(beat.get('beats', []))
    if not len(beats) or reference < 10**(-65/20):
        return result, {'added_notes': {}, 'reason': 'No reliable grid or audible mix'}
    for level, (difficulty, notes) in enumerate(result.items()):
        notes.sort()
        occupied = sorted((n[0], n[1]) for n in notes)
        merged = []
        for start, end in occupied:
            if merged and start <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end])
        cursor = 0.
        gaps = []
        for start, end in merged:
            if start-cursor >= max_gap:
                gaps.append((cursor, start))
            cursor = max(cursor, end)
        if duration-cursor >= max_gap:
            gaps.append((cursor, duration))
        added = []
        step = 2 if level == 0 else 1
        for left, right in gaps:
            for grid in beats[::step]:
                if not left+.20 < grid < right-.20:
                    continue
                # Prefer attacks actually performed in the other instruments.
                index = int(np.searchsorted(rhythmic, grid))
                nearby = rhythmic[max(0, index-1):index+1]
                start = float(min(nearby, key=lambda t: abs(t-grid))) if len(nearby) and min(abs(nearby-grid)) < min(.10, period*.22) else float(grid)
                frame = min(len(rms)-1, round(start/DT))
                if rms[frame] < max(floor*2, reference*.06):
                    continue
                index = int(np.searchsorted(pitched_times, start))
                around = pitched[max(0, index-1):index+1]
                match = min(around, key=lambda e: abs(e['start']-start)) if around else None
                if match and abs(match['start']-start) <= 2*period:
                    pitch = min(match['pitches'])
                    pitch_class = pitch % 12
                    distance = np.minimum(abs(WHITE_KEYS % 12-pitch_class), 12-abs(WHITE_KEYS % 12-pitch_class))
                    lane = int(WHITE_KEYS[np.argmin(distance)])
                    basis = 'bass/guitar pitch adapted to white key'
                else:
                    # Deliberate accompaniment pattern, never a claimed note.
                    lane = int(WHITE_KEYS[(len(added)//4 + len(added)%4) % len(WHITE_KEYS)])
                    basis = 'rhythmic accompaniment pattern'
                end = min(start+.090, right-.06, duration-.005)
                if end <= start or any(abs(start-n[0]) < .090 or n[0] <= start < n[1]+.06 for n in notes):
                    continue
                notes.append([start, end, lane])
                added.append({'time': start, 'end': end, 'lane': lane, 'basis': basis,
                              'keyboard_audibility_required': False})
        result[difficulty] = sorted(notes)
        additions[difficulty] = added
    return result, {'method': 'accompaniment in audible gaps >= 4s; preserve detected keys/holds',
                    'synthetic_gameplay_adaptation': True, 'added_notes': additions,
                    'limitation': 'Added notes do not assert that the original recording contains these piano notes.'}
