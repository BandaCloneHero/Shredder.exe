"""Local WAV analysis and chart policy. No source MIDI or remote services.

Heuristic transcription, not a claim of human-level musical annotation. All
detected events and uncertainties remain inspectable in analysis JSON files.
"""
import collections
import math
from dataclasses import asdict, dataclass

import numpy as np
from scipy import cluster, ndimage, signal

from create_mp3_test_chart import DIFFICULTIES, HOP, SAMPLE_RATE, WHITE_KEYS, flux

VERSION = 'wav-direct-1'
DT = HOP / SAMPLE_RATE
INSTRUMENTS = ('guitar', 'bass', 'drums', 'keys')


@dataclass
class Event:
    start: float
    end: float
    pitches: list
    strength: float
    confidence: float
    kind: str = 'pitched'


def stft(audio, size=2048):
    f, t, z = signal.stft(audio, SAMPLE_RATE, nperseg=size,
                          noverlap=size-HOP, boundary='zeros', padded=True)
    return f, t, abs(z).astype(np.float32)


def activity(audio):
    """Absolute silence guard plus a relative noise gate; never normalize silence."""
    squared = ndimage.uniform_filter1d(np.asarray(audio, dtype=np.float64)**2,
                                      size=441, mode='constant')
    rms = np.sqrt(np.maximum(squared[::HOP], 0))
    reference = float(np.quantile(rms, .95)) if rms.size else 0.
    # -70 dBFS rejects numerical tails; relative floor rejects separation hiss.
    floor = max(10**(-70/20), reference*.035)
    return rms, floor, reference


def onset_candidates(audio, gap=.045):
    f, t, mag = stft(audio, 1024)
    envelope = flux(mag[(f >= 35) & (f <= 10000)])
    rms, floor, reference = activity(audio)
    if reference < 10**(-65/20) or not envelope.size or envelope.max() <= 1e-8:
        return [], envelope, t
    local = ndimage.median_filter(envelope, size=101)
    deviation = ndimage.median_filter(abs(envelope-local), size=101)
    threshold = np.maximum(local+2.2*deviation, envelope.max()*.018)
    peaks = signal.find_peaks(envelope, distance=max(1, round(gap/DT)),
                              prominence=envelope.max()*.012)[0]
    hits = []
    for p in peaks:
        if envelope[p] < threshold[p] or rms[min(p, len(rms)-1)] < floor:
            continue
        # Short centered windows smear attacks. Backtrack the novelty rise,
        # rather than assuming every amplitude maximum is a new note.
        a = int(p)
        while a > max(0, p-4) and envelope[a-1] > envelope[p]*.25:
            a -= 1
        start = max(0., float(t[a])-.005)
        if start < len(audio)/SAMPLE_RATE-.02:
            hits.append((start, int(p), float(envelope[p])))
    return hits, envelope, t


def beat_analysis(audio):
    """Broad-range periodicity with local estimates. Notes are never quantized."""
    hits, env, times = onset_candidates(audio)
    if len(hits) < 4:
        return {'bpm': 120., 'confidence': 0., 'beats': [], 'local_bpm': [],
                'warning': 'Insufficient rhythmic evidence; MIDI clock only.'}
    corr = signal.correlate(env, env, mode='full', method='fft')[len(env)-1:]
    lags = np.arange(math.ceil(60/240/DT), math.floor(60/45/DT)+1)
    # Compare correlation normalized by the number of overlapping frames.
    score = corr[lags]/np.maximum(len(env)-lags, 1)
    best = int(lags[np.argmax(score)])
    bpm = 60/(best*DT)
    alternatives = [float(bpm)]
    if bpm < 85:
        faster = round(best/2)
        if corr[faster] > corr[best]*.55:
            alternatives.append(float(60/(faster*DT)))
            best = faster
            bpm = alternatives[-1]
    period = best*DT
    phases = np.linspace(0, period, 100, endpoint=False)
    ht = np.array([h[0] for h in hits])
    weights = np.array([h[2] for h in hits])
    phase = float(phases[np.argmax([np.sum(weights*np.exp(
        -(np.minimum((ht-p)%period, period-(ht-p)%period)/.045)**2)) for p in phases])])
    beats = np.arange(phase, len(audio)/SAMPLE_RATE, period)
    confidence = float(np.clip(corr[best]/max(corr[0], 1e-9), 0, 1))
    local = []
    for start in np.arange(0, times[-1], 20):
        section = env[(times >= start) & (times < start+20)]
        if len(section) <= lags[-1] or section.max(initial=0) < 1e-8:
            continue
        c = signal.correlate(section, section, method='fft')[len(section)-1:]
        nearby = lags[abs(60/(lags*DT)-bpm) < bpm*.18]
        lag = int(nearby[np.argmax(c[nearby])])
        local.append({'start': float(start), 'bpm': float(60/(lag*DT))})
    return {'bpm': float(bpm), 'confidence': confidence,
            'beats': list(map(float, beats)), 'local_bpm': local,
            'tempo_candidates': alternatives,
            'note_quantization': 'none; sample-origin timestamps are retained',
            'warning': 'Beat phase, meter and half/double tempo are heuristic.'}


def tuning_from_spectrum(frequencies, magnitude):
    """Weighted circular cents histogram from interpolated narrow spectral peaks."""
    cents, weights = [], []
    step = frequencies[1]-frequencies[0]
    for spectrum in magnitude[:, ::25].T:
        peaks = signal.find_peaks(spectrum)[0]
        peaks = [p for p in peaks if 90 < frequencies[p] < 2200 and spectrum[p] > spectrum.max()*.16]
        for p in peaks:
            left, center, right = np.log(np.maximum(spectrum[p-1:p+2], 1e-10))
            denominator = left-2*center+right
            shift = .5*(left-right)/denominator if denominator < -1e-8 else 0.
            hz = float(frequencies[p]+np.clip(shift, -.5, .5)*step)
            note = 69+12*math.log2(hz/440)
            cents.append((note-round(note))*100)
            weights.append(float(spectrum[p]**2))
    if not cents or max(weights) <= 1e-12:
        return {'cents': 0., 'confidence': 0., 'samples': 0}
    histogram, _ = np.histogram(cents, bins=np.linspace(-50, 50, 101), weights=weights)
    histogram = ndimage.gaussian_filter1d(histogram, 3, mode='wrap')
    mode = float(np.argmax(histogram)-49.5)
    deviations = (np.asarray(cents)-mode+50)%100-50
    selected = abs(deviations) < 15
    offset = mode+float(np.average(deviations[selected], weights=np.asarray(weights)[selected]))
    offset = (offset+50)%100-50
    confidence = float(np.sum(np.asarray(weights)[selected])/max(sum(weights), 1e-12))
    return {'cents': offset if confidence > .28 else 0., 'confidence': confidence, 'samples': len(cents)}


def harmonic_dictionary(frequencies, pitches, size):
    """Hann-window harmonic atoms; competing fundamentals suppress octave ghosts."""
    atoms = []
    resolution = SAMPLE_RATE/size
    for pitch in pitches:
        fundamental = 440*2**((float(pitch)-69)/12)
        atom = np.zeros(len(frequencies))
        for h in range(1, 5):
            center = fundamental*h
            if center > frequencies[-1]-resolution:
                break
            delta = (frequencies-center)/resolution
            # Positive approximation of the main Hann lobe.
            lobe = np.maximum(0., np.sinc(delta)+.5*np.sinc(delta-1)+.5*np.sinc(delta+1))
            lobe[abs(delta) > 2.5] = 0
            atom += lobe/h**1.15
        atoms.append(atom)
    return np.asarray(atoms, dtype=np.float32).T


def sparse_fit(templates, magnitude, iterations=100, penalty=.035):
    """Nonnegative sparse least squares via multiplicative updates, in chunks."""
    norm = np.linalg.norm(templates, axis=0)
    dictionary = templates/np.maximum(norm, 1e-9)
    gram = dictionary.T@dictionary
    result = np.empty((dictionary.shape[1], magnitude.shape[1]), dtype=np.float32)
    for start in range(0, magnitude.shape[1], 1500):
        projection = dictionary.T@magnitude[:, start:start+1500]
        a = np.maximum(projection, 1e-10)
        regularizer = penalty*np.max(projection, axis=0, keepdims=True)
        for _ in range(iterations):
            a *= projection/np.maximum(gram@a+regularizer, 1e-10)
        result[:, start:start+a.shape[1]] = a
    return dictionary, result


def polyphonic_features(audio, instrument):
    size = 4096
    f, times, magnitude = stft(audio, size)
    pitches = np.arange(40 if instrument == 'guitar' else 36,
                        89 if instrument == 'guitar' else 97)
    # Remove broadband distortion/noise while retaining narrow harmonic peaks.
    baseline = ndimage.median_filter(magnitude, size=(13, 1))
    tonal = np.maximum(0, magnitude-baseline*.8)
    tuning = tuning_from_spectrum(f, magnitude)
    dictionary = harmonic_dictionary(f, pitches+tuning['cents']/100, size)
    average = np.mean(tonal, axis=1)
    # Unbounded whitening makes missing high partials outweigh a clearly
    # audible fundamental. Cap it using the recording's tonal reference.
    weight = 1/np.maximum(average, max(float(average.max())*.025, 1e-5))**.25
    weight[f < 40] = 0
    dictionary, a = sparse_fit(dictionary*weight[:, None], tonal*weight[:, None],
                               iterations=110, penalty=.06)
    # Frame-wise explained energy is evidence, not a calibrated probability.
    residual = np.linalg.norm(tonal*weight[:, None]-dictionary@a, axis=0)
    quality = np.clip(1-residual/np.maximum(np.linalg.norm(tonal*weight[:, None], axis=0), 1e-8), 0, 1)
    a = ndimage.median_filter(a, size=(1, 3))
    return pitches, times, a, quality, tuning


def release_end(rms, floor, start, limit):
    first = max(0, int((start+.04)/DT))
    last = min(len(rms), max(first+1, int(limit/DT)))
    peak = float(np.max(rms[first:min(last, first+15)], initial=0))
    gate = max(floor, peak*.16)
    for frame in range(first, max(first, last-3)):
        if np.all(rms[frame:frame+4] < gate):
            return max(start+.04, frame*DT)
    return max(start+.04, limit)


def guitar_events(audio):
    attacks, envelope, _ = onset_candidates(audio, .065)
    rms, floor, reference = activity(audio)
    if not attacks:
        return [], {'method': 'spectral attacks + sparse harmonic dictionary', 'silence': True}
    pitches, times, activation, quality, tuning = polyphonic_features(audio, 'guitar')
    duration = len(audio)/SAMPLE_RATE
    events = []
    uncertain = []
    for j, (start, frame, strength) in enumerate(attacks):
        limit = attacks[j+1][0] if j+1 < len(attacks) else duration-.01
        lo = min(len(times)-1, max(0, round((start+.03)/DT)))
        hi = min(len(times), max(lo+1, round(min(start+.14, limit)/DT)))
        support = activation[:, lo:hi].mean(axis=1)
        ranked = np.argsort(support)[::-1]
        chosen = [int(pitches[i]) for i in ranked[:4]
                  if support[i] > max(support.max(initial=0)*.32, 1e-7)]
        confidence = float(np.mean(quality[lo:hi]))
        # An audible distorted pick may have uncertain pitch; keep its attack
        # but explicitly mark pitch ambiguity for review, rather than silence.
        if not chosen:
            uncertain.append(start)
            continue
        if confidence < .35:
            uncertain.append(start)
            chosen = chosen[:1]
        end = min(duration-.005, release_end(rms, floor, start, limit-.012))
        events.append(Event(start, end, sorted(chosen), strength, confidence))
    return events, {'method': 'adaptive novelty + sparse competing harmonic atoms',
                    'pitch_uncertain_times': uncertain, 'candidate_attacks': len(attacks),
                    'tuning': tuning, 'rms_reference': reference, 'silence_floor': floor}


def yin_pitch(audio, low=28, high=72):
    """FFT-accelerated YIN difference with cumulative normalization.

    Centered 4096-sample windows, periodicity threshold and sub-sample lag.
    Pitch is evidence only; independent short-window attacks control timing.
    """
    size = 4096
    padded = np.pad(audio, (size//2, size//2))
    windows = np.lib.stride_tricks.sliding_window_view(padded, size)[::HOP]
    minimum = max(2, int(SAMPLE_RATE/(440*2**((high-69)/12))))
    maximum = min(size//2-1, int(SAMPLE_RATE/(440*2**((low-69)/12))))
    pitches = np.full(len(windows), np.nan)
    confidence = np.zeros(len(windows))
    for block in range(0, len(windows), 256):
        x = np.array(windows[block:block+256], dtype=np.float64, copy=True)
        x -= x.mean(axis=1, keepdims=True)
        corr = np.fft.irfft(abs(np.fft.rfft(x, n=size*2, axis=1))**2,
                            n=size*2, axis=1)[:, :maximum+1]
        sums = np.pad(np.cumsum(x*x, axis=1), ((0, 0), (1, 0)))
        lag = np.arange(maximum+1)
        difference = np.maximum(0, sums[:, size-lag]+sums[:, -1, None]-sums[:, lag]-2*corr)
        cmnd = np.ones_like(difference)
        cmnd[:, 1:] = difference[:, 1:]*lag[None, 1:]/np.maximum(
            np.cumsum(difference[:, 1:], axis=1), 1e-12)
        for row, curve in enumerate(cmnd):
            minima = signal.find_peaks(-curve[minimum:maximum])[0]+minimum
            acceptable = minima[curve[minima] < .20]
            selected = int(acceptable[0]) if acceptable.size else int(minimum+np.argmin(curve[minimum:]))
            certainty = float(1-curve[selected])
            if certainty < .70:
                continue
            # At the lowest supported pitch the chosen lag can be the last
            # sample; there is no right neighbour for parabolic interpolation.
            offset = 0.
            if selected+1 < len(curve):
                a, b, c = curve[selected-1:selected+2]
                offset = float(np.clip(.5*(a-c)/max(a-2*b+c, 1e-9), -.5, .5))
            hz = SAMPLE_RATE/(selected+offset)
            note = 69+12*math.log2(hz/440)
            if low-.5 <= note <= high+.5:
                pitches[block+row] = note
                confidence[block+row] = certainty
    return pitches, confidence


def bass_events(audio):
    attacks, _, _ = onset_candidates(audio, .055)
    rms, floor, reference = activity(audio)
    if reference < 10**(-65/20):
        return [], {'method': 'YIN + independent attacks', 'silence': True}
    pitches, confidence = yin_pitch(audio)
    rms = np.pad(rms, (0, max(0, len(pitches)-len(rms))))[:len(pitches)]
    valid = np.isfinite(pitches) & (confidence >= .72) & (rms >= floor)
    stable = pitches[valid & (confidence > .9)]
    residual_cents = (stable-np.rint(stable))*100
    if len(stable):
        angles = np.exp(2j*np.pi*residual_cents/100)
        consistency = abs(angles.mean())
        tuning = float(np.angle(angles.mean())/(2*np.pi)*100) if consistency > .4 else 0.
    else:
        tuning, consistency = 0., 0.
    rounded = np.where(valid, np.rint(np.nan_to_num(pitches)-tuning/100), -1).astype(int)
    rounded = ndimage.median_filter(rounded, size=5)
    # Low fundamentals cause phase-dependent flux in short FFT windows. A
    # repick must also renew amplitude; stable legato pitch changes are handled
    # separately below and need no amplitude jump.
    smoothed_rms = ndimage.uniform_filter1d(rms, size=5)
    renewed = []
    for start, frame, strength in attacks:
        frame = round(start/DT)
        before = float(np.min(smoothed_rms[max(0, frame-7):max(1, frame-1)], initial=np.inf))
        after = float(np.max(smoothed_rms[frame:min(len(rms), frame+7)], initial=0))
        if after > max(before*1.18, floor*1.5):
            renewed.append((start, frame, strength))
    starts = [(a[0], 'attack', a[2]) for a in renewed]
    # Legato changes and a sustained note at t=0 do not require a pick transient.
    for frame in range(0, len(rounded)-5):
        pitch = rounded[frame]
        if pitch < 0 or (frame and rounded[frame-1] == pitch):
            continue
        if np.all(rounded[frame:frame+5] == pitch):
            time = frame*DT
            if all(abs(time-s[0]) > .065 for s in starts):
                starts.append((time, 'pitch_change', float(rms[frame])))
    starts.sort()
    duration = len(audio)/SAMPLE_RATE
    events = []
    rejected = []
    for j, (start, kind, strength) in enumerate(starts):
        if start >= duration-.04:
            continue
        limit = starts[j+1][0] if j+1 < len(starts) else duration-.005
        lo = min(len(pitches)-1, round((start+.025)/DT))
        hi = min(len(pitches), max(lo+1, round(min(start+.13, limit)/DT)))
        supported = rounded[lo:hi]
        supported = supported[supported >= 0]
        if not supported.size:
            rejected.append(start)
            continue
        pitch, count = collections.Counter(supported.tolist()).most_common(1)[0]
        certainty = float(np.mean(confidence[lo:hi]))
        if count/max(hi-lo, 1) < .45 or certainty < .7:
            rejected.append(start)
            continue
        end = min(duration-.005, release_end(rms, floor, start, limit-.012))
        if end-start < .025:
            continue
        # Merge pitch-tracker flicker, but preserve independently detected re-picks.
        if events and kind == 'pitch_change' and events[-1].pitches == [pitch] and start-events[-1].end < .09:
            events[-1].end = end
            continue
        events.append(Event(start, end, [int(pitch)], strength, certainty, kind))
    return events, {'method': 'FFT YIN periodicity, stable pitch changes, spectral repicks',
                    'candidate_attacks': len(attacks), 'rejected_times': rejected,
                    'tuning': {'cents': tuning, 'confidence': float(consistency)},
                    'rms_reference': reference, 'silence_floor': floor}


def keys_events(audio):
    rms, floor, reference = activity(audio)
    if reference < 10**(-65/20):
        return [], {'method': 'sparse harmonic atoms + hysteresis', 'silence': True}
    pitches, times, a, quality, tuning = polyphonic_features(audio, 'keys')
    attacks, _, _ = onset_candidates(audio, .055)
    onset_times = np.array([h[0] for h in attacks])
    rms = np.pad(rms, (0, max(0, len(times)-len(rms))))[:len(times)]
    peak = np.max(a, axis=0)
    # Per-pitch adaptive floor and competing-note support. Weak keyboard bleed
    # can still be ambiguous; report it instead of promising source separation.
    absolute = max(float(np.quantile(peak, .95))*.06, 1e-6)
    events = []
    for index, pitch in enumerate(pitches):
        smooth = ndimage.median_filter(a[index], size=5)
        # Confidence is reported per event. A framewise confidence cutoff was
        # truncating audible holds whenever a neighboring harmonic interfered.
        supported = (smooth >= np.maximum(absolute, peak*.24)) & (rms >= floor)
        supported = ndimage.binary_closing(supported, structure=np.ones(3))
        boundaries = np.diff(np.r_[False, supported, False].astype(int))
        for first, stop in zip(np.flatnonzero(boundaries == 1), np.flatnonzero(boundaries == -1)):
            if stop-first < 7:
                continue
            start = float(times[first])
            end = min(float(times[min(stop, len(times)-1)]), len(audio)/SAMPLE_RATE-.005)
            nearest = onset_times[abs(onset_times-start) <= .085]
            if nearest.size:
                # Prefer the strongest local transient over phase-flux ripples.
                start = float(max(nearest, key=lambda t: next(h[2] for h in attacks if h[0] == t)))
            # Repeated same-pitch keys need their own attacks even if pedal holds.
            splits = onset_times[(onset_times > start+.09) & (onset_times < end-.08)]
            # Only split when this pitch has a local activation rise.
            splits = [float(t) for t in splits if smooth[min(len(smooth)-1, round((t+.03)/DT))]
                      > smooth[max(0, round((t-.025)/DT))]*1.25]
            edges = [start, *splits, end]
            for left, right in zip(edges, edges[1:]):
                if right-left >= .055:
                    events.append(Event(left, right, [int(pitch)], float(smooth[first:stop].mean()),
                                        float(quality[first:stop].mean())))
    return sorted(events, key=lambda e: (e.start, e.pitches)), {
        'method': 'competing harmonic atoms, temporal hysteresis, per-pitch release',
        'candidate_attacks': len(attacks), 'rms_reference': reference,
        'tuning': tuning, 'silence_floor': floor, 'low_confidence_count': sum(e.confidence < .45 for e in events)}


def drum_identity(f, spectrum, tail_ratio):
    """Semantic features, independent of any NMF component index or song."""
    energy = spectrum**2
    total = max(float(energy.sum()), 1e-12)
    low = float(energy[(f >= 35) & (f < 160)].sum()/total)
    body = float(energy[(f >= 160) & (f < 650)].sum()/total)
    treble = float(energy[f >= 3500].sum()/total)
    middle = float(energy[(f >= 650) & (f < 3500)].sum()/total)
    tonal_band = (f >= 45) & (f <= 650)
    power = energy[tonal_band]
    tonal = float(power.max(initial=0)/max(float(power.sum()), 1e-12))
    dominant = float(f[tonal_band][np.argmax(power)])
    if low > .48 and dominant < 160:
        return 'kick', min(1., low+.2)
    if treble > .38 and low < .16 and body < .20:
        return ('crash' if tail_ratio > .42 else 'hihat'), min(1., treble+.15)
    # A tuned snare body can be strongly tonal too. Broadband treble rattle
    # distinguishes it from a tom; tonality alone was misclassifying snares.
    if body+low > .40 and tonal > .19 and dominant >= 120 and treble < .09:
        return 'tom', min(1., tonal*2+.25)
    if middle+body > .30 and (treble > .07 or tonal < .20):
        return 'snare', min(1., middle+body)
    return 'unknown', .2


def drums_events(audio):
    attacks, envelope, _ = onset_candidates(audio, .040)
    rms, floor, reference = activity(audio)
    if len(attacks) < 2:
        return [], {'method': 'recording-adaptive percussion dictionary', 'silence': not attacks,
                    'warning': 'Too few percussion exemplars to calibrate safely.'}
    f, times, magnitude = stft(audio, 2048)
    active = (f >= 35) & (f <= 10000)
    f, magnitude = f[active], magnitude[active]
    # Learn actual attack spectra in this recording. Clusters absorb each
    # physical hit's body + click + rattle, rather than treating bands as pads.
    examples, decay = [], []
    # Weak flux ripples under cymbal tails are poor timbre exemplars. Keep
    # their potential hits in detection, but train on stronger new transients.
    training_floor = float(np.quantile([h[2] for h in attacks], .35))
    for index, (start, frame, strength) in enumerate(attacks):
        frame = min(frame, magnitude.shape[1]-4)
        examples.append(np.sqrt(np.mean(magnitude[:, frame:frame+4]**2, axis=1)))
        # Stop measuring decay before the next training transient contaminates
        # it. A later snare must not turn an earlier closed hat into a crash.
        next_frame = attacks[index+1][1] if index+1 < len(attacks) else magnitude.shape[1]
        stop = min(frame+17, next_frame-2)
        later = magnitude[:, frame+7:max(frame+8, stop)]
        decay.append(float(np.linalg.norm(later)/math.sqrt(max(later.shape[1], 1))/
                           max(np.linalg.norm(examples[-1]), 1e-9)))
    examples = np.asarray(examples)
    all_normalized = examples/np.maximum(np.linalg.norm(examples, axis=1, keepdims=True), 1e-9)
    all_decay = decay
    training_indices = [j for j, h in enumerate(attacks) if h[2] >= training_floor]
    normalized = all_normalized[training_indices]
    decay = np.asarray(all_decay)[training_indices]
    number = min(16, max(2, int(math.sqrt(len(normalized)/2))))
    centers, labels = cluster.vq.kmeans2(normalized, number, iter=80, minit='++', seed=19)
    # Recompute physical spectra from strongest representatives in each group;
    # semantic labeling uses unwhitened spectra, not arbitrary latent indices.
    templates, identities, model_report = [], [], []
    for index in range(number):
        members = np.flatnonzero(labels == index)
        if not members.size:
            continue
        template = np.median(normalized[members], axis=0)
        tail = float(np.median(np.asarray(decay)[members]))
        identity, confidence = drum_identity(f, template, tail)
        templates.append(template)
        identities.append((identity, confidence))
        model_report.append({'class': identity, 'confidence': confidence, 'examples': len(members),
                             'tail_ratio': tail, 'dominant_frequency': float(f[np.argmax(template)])})
    # Add missing physical classes only from actual plausible exemplars, never
    # from fixed mixtures or invented hits. Unknown atoms stay as nuisance atoms.
    present = {i[0] for i in identities}
    for kind in ('kick', 'snare', 'hihat', 'tom', 'crash'):
        if kind in present:
            continue
        # Quiet kick/tom exemplars can fall below the broadband training floor;
        # search the full recording for a missing class, not just loud hits.
        candidates = [(j, drum_identity(f, e, all_decay[j])) for j, e in enumerate(all_normalized)]
        matches = [(j, ident) for j, ident in candidates if ident[0] == kind and ident[1] >= .5]
        if matches:
            j, identity = max(matches, key=lambda pair: pair[1][1])
            templates.append(all_normalized[j])
            identities.append(identity)
            model_report.append({'class': kind, 'confidence': identity[1], 'examples': 1,
                                 'tail_ratio': all_decay[j], 'dominant_frequency': float(f[np.argmax(all_normalized[j])])})
    weight = 1/np.maximum(magnitude.mean(axis=1), 1e-5)**.35
    dictionary, a = sparse_fit(np.asarray(templates).T*weight[:, None],
                               magnitude*weight[:, None], iterations=150, penalty=.08)
    lanes = {'kick': 0, 'snare': 1, 'hihat': 2, 'tom': 3, 'crash': 4}
    events = []
    cymbal_ambiguities = []
    treble_energy = np.sqrt(np.sum(magnitude[f >= 3500]**2, axis=0))
    for kind, lane in lanes.items():
        indices = [j for j, ident in enumerate(identities) if ident[0] == kind]
        if not indices:
            continue
        activation = ndimage.gaussian_filter1d(a[indices].sum(axis=0), .6)
        scale = float(np.quantile(activation, .95))
        if scale <= 1e-8:
            continue
        novelty = np.maximum(0., activation-ndimage.minimum_filter1d(activation, size=9))
        peaks = signal.find_peaks(novelty, prominence=max(scale*.14, novelty.max()*.04),
                                  distance=round((.065 if kind != 'crash' else .15)/DT))[0]
        for p in peaks:
            if activation[p] < scale*.28 or rms[min(p, len(rms)-1)] < floor:
                continue
            # Require new component energy; a long cymbal decay is not a roll.
            before = activation[max(0, p-6):max(1, p-2)].mean()
            if activation[p] < before*1.18:
                continue
            first = int(p)
            while first > max(0, p-6) and novelty[first-1] > novelty[p]*.25:
                first -= 1
            start = max(0., float(times[first])-.005)
            nearby = [h[0] for h in attacks if abs(h[0]-start) < .035]
            if not nearby:
                # Component fluctuations with no independent new transient
                # are decay leakage, not evidence of an extra physical hit.
                continue
            start = min(nearby, key=lambda t: abs(t-start))
            hit_kind = kind
            if kind in ('hihat', 'crash'):
                # Attack spectra of hats and crashes overlap heavily. Confirm
                # the class using THIS hit's decay, not only its learned atom.
                origin = round(start/DT)
                early = treble_energy[origin+3:origin+7].mean() if origin+7 < len(times) else 0
                later = treble_energy[origin+9:origin+15].mean() if origin+15 < len(times) else 0
                current_strength = max((h[2] for h in attacks if abs(h[0]-start) < .035), default=0)
                next_hits = [h[0] for h in attacks if start+.06 < h[0] < start+.15 and h[2] > current_strength*.4]
                if not next_hits and early > 1e-8:
                    hit_kind = 'crash' if later/early > .42 else 'hihat'
                else:
                    cymbal_ambiguities.append(start)
            end = min(start+.045, len(audio)/SAMPLE_RATE-.005)
            if end-start < .02:
                continue
            confidence = float(np.mean([identities[j][1] for j in indices]))
            events.append(Event(start, end, [lanes[hit_kind]], float(novelty[p]/scale), confidence, hit_kind))
    # Two correlated cymbal atoms can explain the same one physical hit.
    # Deduplicate by inferred class, leaving real kick/snare/hat coincidences.
    unique = []
    for event in sorted(events, key=lambda e: e.strength, reverse=True):
        if not any(event.kind == other.kind and abs(event.start-other.start) < .045 for other in unique):
            unique.append(event)
    events = unique
    # Resolve correlated body/rattle explanations using each physical packet.
    # If a tom atom matches the learned snare's body frequency and the packet
    # contains broadband rattle, it is one snare, not two drum strokes.
    snare_frequencies = [float(f[np.argmax(templates[j])]) for j, ident in enumerate(identities)
                         if ident[0] == 'snare']
    packet_ambiguities = []
    resolved = []
    for event in events:
        frame = min(round((event.start+.02)/DT), magnitude.shape[1]-4)
        packet = np.sqrt(np.mean(magnitude[:, frame:frame+4]**2, axis=1))
        inferred, certainty = drum_identity(f, packet, .25)
        treble_fraction = float(np.sum(packet[f >= 3500]**2)/max(float(np.sum(packet**2)), 1e-12))
        if event.kind == 'tom' and inferred == 'snare':
            body = (f >= 100) & (f < 650)
            frequency = float(f[body][np.argmax(packet[body])])
            if any(abs(math.log2(frequency/reference)) < .25 for reference in snare_frequencies if reference > 0):
                event.kind, event.pitches = 'snare', [1]
                packet_ambiguities.append(event.start)
        elif event.kind in ('hihat', 'crash') and inferred == 'snare' and treble_fraction < .28:
            # A weak treble remainder of an otherwise clear snare is ambiguous
            # separation leakage. Do not create a second pad from its rattle.
            packet_ambiguities.append(event.start)
            continue
        resolved.append(event)
    events = []
    for event in sorted(resolved, key=lambda e: e.strength, reverse=True):
        if not any(event.kind == other.kind and abs(event.start-other.start) < .065 for other in events):
            events.append(event)
    return sorted(events, key=lambda e: (e.start, e.pitches)), {
        'method': 'per-recording attack clustering + semantic spectra/decay + sparse competition',
        'candidate_attacks': len(attacks), 'learned_templates': model_report,
        'unrepresented_classes': [k for k in lanes if k not in {i[0] for i in identities}],
        'ambiguous_cymbal_decay_times': sorted(set(cymbal_ambiguities)),
        'ambiguous_body_rattle_times': sorted(set(packet_ambiguities)),
        'rms_reference': reference, 'silence_floor': floor,
        'warning': 'Physical labels are heuristic; mixed exemplars and processed kits need review.'}


def analyze(audio, instrument):
    functions = {'guitar': guitar_events, 'bass': bass_events,
                 'keys': keys_events, 'drums': drums_events}
    events, diagnostics = functions[instrument](audio)
    attacks, _, _ = onset_candidates(audio)
    diagnostics['independent_onsets'] = [h[0] for h in attacks]
    diagnostics['events'] = len(events)
    return {'version': VERSION, 'instrument': instrument, 'duration': len(audio)/SAMPLE_RATE,
            'events': [asdict(e) for e in events], 'diagnostics': diagnostics}


def group_events(events, tolerance=.018):
    groups = []
    for e in sorted(events, key=lambda e: (e.start, e.pitches)):
        if groups and e.start-groups[-1][0] <= tolerance:
            groups[-1][1].append(e)
        else:
            groups.append([e.start, [e]])
    return groups


def difficulty_charts(analysis, beat):
    """Rhythmic subsets, stable pitch order, bounded chords, safe releases."""
    instrument = analysis['instrument']
    events = [Event(**e) for e in analysis['events']]
    groups = group_events(events, .025 if instrument == 'keys' else .018)
    duration = analysis['duration']
    pitched = [p for e in events for p in e.pitches]
    low, high = np.quantile(pitched, [.03, .97]) if pitched else (0, 1)
    span = max(1., high-low)
    result = {}
    selection = list(range(len(groups)))
    # Easy is a subset of Medium, etc.; one rhythmic onset pool drives all.
    chosen_by_level = {}
    for level in (3, 2, 1, 0):
        gap = ((.34, .22, .115, .065) if instrument != 'drums' else (.28, .18, .085, .045))[level]
        beats = np.array(beat['beats'])
        def priority(index):
            start, members = groups[index]
            # Downbeat proximity improves beginner patterns without moving notes.
            distance = np.min(abs(beats-start), initial=999.)
            accent = 1+.8*math.exp(-(distance/.055)**2)
            return max(e.strength for e in members)*accent
        selected = []
        for index in sorted(selection, key=priority, reverse=True):
            start = groups[index][0]
            # Drums are thinned per physical lane; simultaneous hits survive.
            if instrument == 'drums' and level >= 2:
                selected.append(index)
            elif all(abs(start-groups[other][0]) >= gap for other in selected):
                selected.append(index)
        selected.sort()
        chosen_by_level[level] = selected
        selection = selected
    for level, difficulty in enumerate(DIFFICULTIES):
        notes = []
        previous_by_lane = {}
        previous_root = None
        previous_lane = None
        selected = chosen_by_level[level]
        for position, index in enumerate(selected):
            start, members = groups[index]
            supported = {}
            for e in members:
                for pitch in e.pitches:
                    if instrument == 'drums':
                        lane = pitch
                    elif instrument == 'keys':
                        folded = 48+pitch%12
                        # Circular pitch distance avoids B/C octave edge errors.
                        distance = np.minimum(abs(WHITE_KEYS-folded), 12-abs(WHITE_KEYS-folded))
                        lane = int(WHITE_KEYS[np.argmin(distance)])
                    else:
                        count = (3, 4, 5, 5)[level]
                        lane = int(np.clip(round((pitch-low)*(count-1)/span), 0, count-1))
                    existing = supported.get(lane)
                    if existing is None or e.strength > existing[0]:
                        supported[lane] = (e.strength, e.end, pitch)
            max_chord = (1, 2, 3, 4)[level] if instrument == 'keys' else (
                (1, 1, 2, 3)[level] if instrument == 'guitar' else 1)
            if instrument == 'drums':
                # At most two hands plus one kick. A valid simultaneous kick,
                # snare and hat is retained; no blanket triple suppression.
                pads = sorted((p for p in supported if p != 0), key=lambda p: supported[p][0], reverse=True)
                chosen = pads[:(1 if level == 0 else 2)] + ([0] if 0 in supported else [])
            else:
                chosen = sorted(supported, key=lambda p: supported[p][0], reverse=True)[:max_chord]
                if instrument == 'guitar' and len(chosen) >= 3 and max(chosen)-min(chosen) > 3:
                    chosen = chosen[:2]
            if instrument == 'keys':
                # Old held keys count toward the hand limit too. An onset-only
                # chord check would allow several four-note holds to accumulate.
                held = [n for n in notes if n[1] > start and n[2] not in chosen]
                for old in sorted(held, key=lambda n: n[0])[:max(0, len(held)+len(chosen)-max_chord)]:
                    old[1] = min(old[1], start-.004)
            if instrument in ('guitar', 'bass') and len(chosen) == 1:
                lane = chosen[0]
                root = supported[lane][2]
                if previous_root is not None and root == previous_root:
                    # Repeated riffs keep their position; global pitch mapping
                    # already preserves ascending/descending motion.
                    lane = previous_lane
                previous_root, previous_lane = root, lane
                if lane != chosen[0]:
                    supported[lane] = supported[chosen[0]]
                    chosen = [lane]
            next_start = groups[selected[position+1]][0] if position+1 < len(selected) else duration
            for lane in chosen:
                gap = ((.28, .18, .085, .045)[level] if instrument == 'drums' else .035)
                if start-previous_by_lane.get(lane, -999) < gap:
                    continue
                end = min(supported[lane][1], duration-.005)
                if instrument in ('guitar', 'bass'):
                    end = min(end, next_start-.012)
                length = end-start
                if instrument == 'drums' or length < (.30, .25, .20, .16)[level]:
                    end = min(start+.035, next_start-.005, duration-.005)
                if end-start >= .008:
                    notes.append([float(start), float(end), int(lane)])
                    previous_by_lane[lane] = start
        # Octave folding can collide on keys. Clip a sustain before a reattack.
        for lane in set(n[2] for n in notes):
            by_lane = sorted((n for n in notes if n[2] == lane), key=lambda n: n[0])
            for current, following in zip(by_lane, by_lane[1:]):
                current[1] = min(current[1], following[0]-.004)
        result[difficulty] = [n for n in notes if n[1] > n[0]+.004]
    return result


def musical_checks(analysis, charts, audio, fidelity_difficulty='Expert'):
    """Independent evidence checks. Warnings do not certify musical correctness."""
    instrument = analysis['instrument']
    duration = len(audio)/SAMPLE_RATE
    rms, floor, _ = activity(audio)
    onsets = np.asarray(analysis['diagnostics']['independent_onsets'])
    report = {'status': 'needs_listening_review', 'structural_errors': [], 'warnings': [],
              'difficulties': {}, 'musical_correctness_certified': False}
    diagnostics = analysis['diagnostics']
    if diagnostics.get('pitch_uncertain_times'):
        report['warnings'].append(f"{len(diagnostics['pitch_uncertain_times'])} attacks have uncertain pitch; spectral fit does not certify chord accuracy.")
    if diagnostics.get('low_confidence_count'):
        report['warnings'].append(f"{diagnostics['low_confidence_count']} keyboard events have weak spectral explanation; review separation bleed and false notes.")
    if diagnostics.get('ambiguous_body_rattle_times') or diagnostics.get('ambiguous_cymbal_decay_times'):
        report['warnings'].append('Ambiguous drum body/rattle or cymbal decay packets were found; review their timestamps.')
    for level, difficulty in enumerate(DIFFICULTIES):
        chart = charts[difficulty]
        if difficulty == fidelity_difficulty:
            level = 3  # fidelity policy is independent of the MIDI storage slot
        starts = np.unique([n[0] for n in chart])
        active = collections.defaultdict(list)
        by_time = collections.defaultdict(list)
        unsupported, bad_holds = [], []
        for start, end, lane in chart:
            active[lane].append((start, end))
            by_time[start].append(lane)
            if not 0 <= start < end <= duration:
                report['structural_errors'].append(f'{difficulty}: invalid time {start}')
            valid_lane = lane in WHITE_KEYS if instrument == 'keys' else 0 <= lane <= 4
            if not valid_lane:
                report['structural_errors'].append(f'{difficulty}: invalid lane {lane}')
            frame = min(len(rms)-1, round(start/DT))
            if max(rms[max(0, frame-3):min(len(rms), frame+4)], default=0) < floor:
                unsupported.append(start)
            if end-start > .16:
                segment = rms[round((start+.06)/DT):round(end/DT)]
                if len(segment) and np.mean(segment < floor) > .20:
                    bad_holds.append(start)
        for lane, values in active.items():
            values.sort()
            for current, following in zip(values, values[1:]):
                if following[0]-current[0] < .034 or current[1] >= following[0]:
                    report['structural_errors'].append(f'{difficulty}: duplicate/overlap on lane {lane}')
        for start, lanes in by_time.items():
            impossible = len(lanes) != len(set(lanes))
            if instrument == 'drums':
                impossible |= sum(l != 0 for l in lanes) > 2
            elif instrument == 'bass':
                impossible |= len(lanes) > 1
            elif instrument == 'guitar':
                impossible |= len(lanes) > (1, 1, 2, 3)[level] or (len(lanes) == 3 and max(lanes)-min(lanes) > 3)
            else:
                impossible |= len(lanes) > (1, 2, 3, 4)[level]
            if impossible:
                report['structural_errors'].append(f'{difficulty}: chord constraint at {start:.3f}')
            if instrument == 'keys':
                held = sum(begin <= start < end for begin, end, lane in chart)
                if held > (1, 2, 3, 4)[level]:
                    report['structural_errors'].append(f'{difficulty}: too many held keys at {start:.3f}')
        missing = [float(t) for t in onsets if np.min(abs(starts-t), initial=999.) > .080]
        distances = [float(np.min(abs(onsets-s), initial=999.)) for s in starts] if onsets.size else []
        max_density = max((sum(abs(starts-s) <= .5) for s in starts), default=0)
        report['difficulties'][difficulty] = {
            'notes': len(chart), 'attacks': len(starts), 'lane_counts': dict(collections.Counter(n[2] for n in chart)),
            'max_attacks_in_one_second': int(max_density),
            'unsupported_audio_times': sorted(set(unsupported)), 'suspect_hold_times': sorted(set(bad_holds)),
            'onset_distance_median_ms': float(np.median(distances)*1000) if distances else None,
            'onset_distance_p95_ms': float(np.quantile(distances, .95)*1000) if distances else None,
            'uncovered_onset_times': missing,
            'onset_coverage': float(1-len(missing)/len(onsets)) if len(onsets) else None}
        if difficulty == fidelity_difficulty:
            # Audible regions with no chart notes can reveal missed instrument
            # entrances even when the same detector misses their attacks.
            gaps = []
            for start in np.arange(0, duration, 2):
                section = rms[round(start/DT):round((start+2)/DT)]
                if len(section) and np.mean(section > floor*2) > .7 and not np.any((starts >= start) & (starts < start+2)):
                    gaps.append(float(start))
            report['audible_two_second_regions_without_attacks'] = gaps
            if gaps:
                report['warnings'].append('Audible regions lack attacks; could be holds or missed notes.')
            if len(missing) > .25*len(onsets):
                report['warnings'].append('More than 25% of independent onsets have no Expert attack; inspect listed times.')
            if unsupported or bad_holds:
                report['warnings'].append('Some attacks/holds have weak audio support; inspect listed times.')
    # Pitch direction compared with actual mapped root movement is useful even
    # when every MIDI message is perfectly valid. Keys are intentionally folded.
    if instrument in ('guitar', 'bass'):
        expert = charts[fidelity_difficulty]
        source = {round(e['start'], 3): min(e['pitches']) for e in analysis['events'] if e['pitches']}
        mapped_roots = {}
        for start, end, lane in expert:
            mapped_roots[start] = min(mapped_roots.get(start, lane), lane)
        roots = [(start, source.get(round(start, 3)), lane) for start, lane in sorted(mapped_roots.items())]
        reversals = []
        for a, b in zip(roots, roots[1:]):
            if a[1] is not None and b[1] is not None and (b[1]-a[1])*(b[2]-a[2]) < 0:
                reversals.append(b[0])
        report['pitch_direction_reversal_times'] = reversals
    return report
