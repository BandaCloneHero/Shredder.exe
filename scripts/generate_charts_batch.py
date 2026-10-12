#!/usr/bin/env python3
"""Generate one main YARG song folder per source, with separate revision backups.

Local processing only. All source MIDIs are ignored. See WAV_CHARTS.md.
"""
import os

# Avoid BLAS oversubscription and make results reproducible on one machine.
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')

import argparse
import ast
import collections
import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import traceback

import imageio_ffmpeg
import mido
import numpy as np
from scipy import signal

from create_mp3_test_chart import DIFFICULTIES, PPQ, make_track, validate
from wav_chart_analysis import (INSTRUMENTS, VERSION, analyze, beat_analysis,
                                difficulty_charts, musical_checks)
from chart_library import Library, artifacts_valid, audit_legacy, legacy_candidates, metadata, source_id


def digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024*1024), b''):
            result.update(block)
    return result.hexdigest()


def dump(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf-8')


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def slug(name):
    return re.sub(r'[^\w .()-]+', '_', name).strip(' .') or 'song'


def command(args):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True)


def implementation_hash():
    # Organization, logging and CLI changes do not invalidate musical analysis.
    # Include the DSP modules and the audio/MIDI functions in this file.
    source = Path(__file__).read_text(encoding='utf-8')
    tree = ast.parse(source)
    functions = {'decode_stereo', 'mono', 'alignment', 'write_midi', 'export_audio'}
    parts = [digest(Path(__file__).parent/name) for name in (
        'wav_chart_analysis.py', 'create_mp3_test_chart.py')]
    parts.extend(ast.get_source_segment(source, node) for node in tree.body
                 if isinstance(node, ast.FunctionDef) and node.name in functions)
    analysis_hash = hashlib.sha256('\n'.join(parts).encode()).hexdigest()
    # Compatibility with the existing final charts/cache: this exact DSP
    # snapshot used a hash of the WHOLE former batch script. No chart is blessed
    # merely because its title matches. Any DSP/export change breaks this bridge.
    if analysis_hash == 'dda10086411f4b28093f29a6c602a49fa04566f491b166d4efdfdab5b85ec88f':
        return '8674c72fe21d9a800d182b3435d356dfdf52728c2d20b6e6223bb8fca546163a'
    return analysis_hash


def identify_folder(folder):
    """Optional song.json resolves unusual/ambiguous filenames without guesses."""
    settings_path = folder/'song.json'
    settings = read_json(settings_path) if settings_path.is_file() else {}
    wavs = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == '.wav')
    aliases = {'guitar': ('guitar', 'guitarra'), 'bass': ('bass', 'baixo'),
               'drums': ('drum', 'bateria'), 'keys': ('keys', 'piano', 'keyboard', 'teclado')}
    stems = {}
    for instrument in INSTRUMENTS:
        explicit = settings.get('stems', {}).get(instrument)
        if explicit:
            candidates = [folder/explicit]
        else:
            candidates = [p for p in wavs if any(p.stem.lower().startswith(prefix) or
                          re.search(r'(?:^|[_ -])'+prefix+r'(?:s?[_ -]|$)', p.stem.lower())
                          for prefix in aliases[instrument])]
        if len(candidates) != 1 or not candidates[0].is_file() or candidates[0].suffix.lower() != '.wav':
            raise ValueError(f'{folder.name}: expected one WAV for {instrument}, found {len(candidates)}; use song.json.')
        stems[instrument] = candidates[0].resolve()
    if len(set(stems.values())) != 4:
        raise ValueError('One file cannot supply two instruments.')
    if settings.get('mix'):
        mix = (folder/settings['mix']).resolve()
        if not mix.is_file():
            raise ValueError(f'Missing mix: {mix}')
    else:
        mixes = sorted(p for p in folder.iterdir() if p.is_file() and
                       p.suffix.lower() in ('.mp3', '.wav', '.flac', '.ogg') and p.resolve() not in stems.values())
        if len(mixes) > 1:
            raise ValueError('Multiple possible full mixes; choose one using song.json.')
        mix = mixes[0].resolve() if mixes else None
    return stems, mix, settings


def discover(root, selection=None):
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f'Input directory does not exist: {root}')
    folders = sorted({p.parent for p in root.rglob('*') if p.is_file() and p.suffix.lower() == '.wav'})
    if selection:
        selected_path = Path(selection).resolve()
        relative_path = (root/selection).resolve()
        folders = [p for p in folders if p.name == selection or p == selected_path or p == relative_path]
        if len(folders) != 1:
            raise ValueError(f'--song must select exactly one folder; matched {len(folders)}.')
    if not folders:
        raise ValueError('No song folders containing WAVs were found.')
    return folders


def decode_stereo(path, target):
    command([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-xerror', '-i', path,
             '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '44100', '-f', 'f32le', '-n', target])
    if target.stat().st_size == 0 or target.stat().st_size % 8:
        raise ValueError(f'Empty/malformed decoded audio: {path}')
    result = np.memmap(target, dtype='<f4', mode='r').reshape(-1, 2)
    for start in range(0, len(result), 262144):
        if not np.isfinite(result[start:start+262144]).all():
            raise ValueError(f'Non-finite audio samples: {path}')
    return result


def mono(data):
    return signal.resample_poly(data.mean(axis=1), 1, 2).astype(np.float32)


def alignment(raw):
    frames = len(raw['guitar'])
    if any(len(value) != frames for value in raw.values()):
        raise ValueError('Different stem/mix sample counts; align audio before charting. No automatic padding.')
    report = {'sample_rate': 44100, 'samples': frames, 'equal_sample_counts': True,
              'automatic_shifts': False, 'sample_origin': 'all decoded files start at sample zero'}
    if 'mix' not in raw:
        report.update(status='unverified_common_origin', warning='Equal lengths do not prove inter-stem synchronization. No mix provided.')
        return report
    probes = []
    length = min(frames, 44100*20)
    for offset in sorted(set([0, max(0, frames//2-length//2), max(0, frames-length)])):
        a = raw['mix'][offset:offset+length].mean(axis=1)[::10].astype(np.float64)
        b = sum(raw[i][offset:offset+length].mean(axis=1)[::10].astype(np.float64) for i in INSTRUMENTS)
        norm = np.linalg.norm(a)*np.linalg.norm(b)
        if norm < 1e-8:
            continue
        correlation = signal.correlate(a, b, method='fft')
        lags = signal.correlation_lags(len(a), len(b))
        allowed = abs(lags) <= 2205
        selected = int(np.flatnonzero(allowed)[np.argmax(correlation[allowed])])
        lag = float(lags[selected]/4410)
        similarity = float(correlation[selected]/norm)
        probes.append({'offset_seconds': offset/44100, 'lag_seconds': lag, 'correlation': similarity})
        if similarity > .35 and abs(lag) > .008:
            raise ValueError(f'Stem sum and mix differ by {lag:.4f}s at {offset/44100:.1f}s; align first.')
    report['mix_probes'] = probes
    report['status'] = 'mix_sum_checked' if probes and all(p['correlation'] > .35 for p in probes) else 'weak_mix_evidence'
    report['limitation'] = 'Summed stems can hide an individual delayed stem; equal origin is not independently certified.'
    return report


def write_midi(charts, duration, bpm, output):
    tempo = mido.bpm2tempo(bpm)
    seconds_per_tick = tempo/1e6/PPQ
    tick = lambda seconds: round(seconds/seconds_per_tick)
    end_tick = tick(duration)
    midi = mido.MidiFile(type=1, ticks_per_beat=PPQ)
    midi.tracks.append(make_track('TEMPO', [(0, mido.MetaMessage('set_tempo', tempo=tempo)),
                              (0, mido.MetaMessage('time_signature', numerator=4, denominator=4))], end_tick))
    midi.tracks.append(make_track('EVENTS', [(0, mido.MetaMessage('text', text='[section Inicio]')),
                              (end_tick, mido.MetaMessage('text', text='[end]'))], end_tick))
    for instrument in INSTRUMENTS:
        combined = []
        for level, difficulty in enumerate(DIFFICULTIES):
            events = []
            if instrument == 'keys':
                events = [(0, mido.Message('note_on', note=0, velocity=100)),
                          (end_tick, mido.Message('note_off', note=0))]
            for start, end, lane in charts[instrument][difficulty]:
                note = lane if instrument == 'keys' else (60, 72, 84, 96)[level]+lane
                begin, stop = tick(start), max(tick(start)+1, tick(end))
                events.extend([(begin, mido.Message('note_on', note=note, velocity=100)),
                               (stop, mido.Message('note_off', note=note, velocity=0))])
            if instrument == 'keys':
                midi.tracks.append(make_track('PART REAL_KEYS_'+('E', 'M', 'H', 'X')[level], events, end_tick))
            else:
                combined.extend(events)
        if instrument != 'keys':
            midi.tracks.append(make_track('PART '+instrument.upper(), combined, end_tick))
    validate(midi, duration, seconds_per_tick)
    midi.save(output)
    counts = validate(mido.MidiFile(output), duration, seconds_per_tick)
    return {'roundtrip': 'passed', 'track_note_counts': counts,
            'clock_bpm': bpm, 'time_signature': '4/4 placeholder; meter not inferred',
            'timestamp_rounding_max_ms': seconds_per_tick*500,
            'source_midi_used': False}


def export_audio(raw, work, output):
    frames = len(raw['guitar'])
    maximum = 0.
    reconstruction = 0.
    residual = None
    if 'mix' in raw:
        residual = np.memmap(work/'song.f32', dtype='<f4', mode='w+', shape=(frames, 2))
    for start in range(0, frames, 262144):
        stop = min(frames, start+262144)
        total = sum(raw[i][start:stop] for i in INSTRUMENTS)
        for i in INSTRUMENTS:
            maximum = max(maximum, float(np.max(abs(raw[i][start:stop]))))
        if residual is not None:
            residual[start:stop] = raw['mix'][start:stop]-total
            reconstruction = max(reconstruction, float(np.max(abs(total+residual[start:stop]-raw['mix'][start:stop]))))
            maximum = max(maximum, float(np.max(abs(residual[start:stop]))), float(np.max(abs(raw['mix'][start:stop]))))
        else:
            maximum = max(maximum, float(np.max(abs(total))))
    if residual is not None:
        residual.flush()
    gain = min(1., .90/max(maximum, 1e-9))
    files = list(INSTRUMENTS)+(['song'] if residual is not None else [])
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    checks = {}
    for i in files:
        destination = output/(i+'.ogg')
        command([ffmpeg, '-v', 'error', '-n', '-f', 'f32le', '-ar', '44100', '-ac', '2',
                 '-i', work/(i+'.f32'), '-af', f'volume={gain},asetpts=N/SR/TB',
                 '-c:a', 'libvorbis', '-q:a', '7', destination])
        check = work/(i+'.check.f32')
        command([ffmpeg, '-v', 'error', '-xerror', '-i', destination, '-ac', '2', '-ar', '44100',
                 '-f', 'f32le', '-n', check])
        decoded_frames = check.stat().st_size//8
        if abs(decoded_frames-frames) > 1103:
            raise ValueError(f'Export duration mismatch: {destination}')
        decoded = np.memmap(check, dtype='<f4', mode='r')
        peak = float(np.max(abs(decoded)))
        if not np.isfinite(decoded).all():
            raise ValueError(f'Non-finite OGG decode: {destination}')
        checks[i] = {'full_decode': 'passed', 'samples': decoded_frames, 'decoded_peak': peak,
                     'duration_difference_ms': (decoded_frames-frames)/44.1}
        del decoded
        check.unlink()
    return {'gain': gain, 'files': checks, 'residual_reconstruction_max_error': reconstruction if residual is not None else None,
            'background': 'mix minus four stems' if residual is not None else 'No mix: only the four supplied instruments',
            'clipping_warning': any(c['decoded_peak'] > 1 for c in checks.values())}


def midi_summary(path):
    """For AFTER-generation comparisons only, never an analysis input."""
    midi = mido.MidiFile(path)
    # Iterate the merged tempo map to compare songs with different MIDI clocks.
    tempo_changes = [(0., 500000)]
    elapsed = 0
    for msg in mido.merge_tracks(midi.tracks):
        elapsed += msg.time
        if msg.type == 'set_tempo':
            tempo_changes.append((float(elapsed), msg.tempo))
    tempo_changes.sort()
    def seconds(tick):
        result, last, tempo = 0., 0., 500000
        for boundary, new_tempo in tempo_changes:
            if boundary > tick:
                break
            result += (boundary-last)*tempo/1e6/midi.ticks_per_beat
            last, tempo = boundary, new_tempo
        return result+(tick-last)*tempo/1e6/midi.ticks_per_beat
    result = {}
    for instrument in INSTRUMENTS:
        for level, difficulty in enumerate(DIFFICULTIES):
            target = 'PART REAL_KEYS_'+('E', 'M', 'H', 'X')[level] if instrument == 'keys' else 'PART '+instrument.upper()
            notes = []
            for track in midi.tracks:
                if track.name != target:
                    continue
                tick = 0
                for msg in track:
                    tick += msg.time
                    if msg.type == 'note_on' and msg.velocity:
                        if instrument == 'keys' and msg.note in (48, 50, 52, 53, 55, 57, 59):
                            notes.append((seconds(tick), msg.note))
                        elif instrument != 'keys' and (60, 72, 84, 96)[level] <= msg.note <= (64, 76, 88, 100)[level]:
                            notes.append((seconds(tick), msg.note-(60, 72, 84, 96)[level]))
            result[(instrument, difficulty)] = notes
    return result


def compare_charts(old_path, new_path, analyses):
    old, new = midi_summary(old_path), midi_summary(new_path)
    comparison = {'previous_chart': str(old_path), 'old_sha256': digest(old_path),
                  'comparison_only_not_note_source': True, 'instruments': {},
                  'limitation': 'The old chart is not ground truth. Counts and onset coverage are regression signals, not accuracy scores.'}
    for instrument in INSTRUMENTS:
        levels = {}
        for difficulty in DIFFICULTIES:
            a, b = old[(instrument, difficulty)], new[(instrument, difficulty)]
            old_times, new_times = np.unique([n[0] for n in a]), np.unique([n[0] for n in b])
            onsets = np.asarray(analyses[instrument]['diagnostics']['independent_onsets'])
            def coverage(times):
                return float(np.mean([np.min(abs(times-t), initial=999.) < .08 for t in onsets])) if len(onsets) else None
            coverage_old, coverage_new = coverage(old_times), coverage(new_times)
            levels[difficulty] = {'old_notes': len(a), 'new_notes': len(b),
                                 'old_attacks': len(old_times), 'new_attacks': len(new_times),
                                 'old_lane_counts': dict(collections.Counter(n[1] for n in a)),
                                 'new_lane_counts': dict(collections.Counter(n[1] for n in b)),
                                 'old_onset_coverage': coverage_old, 'new_onset_coverage': coverage_new}
            if difficulty == 'Expert':
                levels[difficulty]['possible_regressions'] = [name for name, condition in (
                    ('large density loss', len(b) < len(a)*.60),
                    ('large density increase; check false notes', len(b) > max(30, len(a)*1.8)),
                    ('onset coverage loss', coverage_old is not None and coverage_new < coverage_old-.10)) if condition]
        comparison['instruments'][instrument] = levels
    return comparison


def process(folder, args, work, implementation):
    started = time.monotonic()
    stems, mix, settings = identify_folder(folder)
    sources = {i: str(p) for i, p in stems.items()}
    hashes = {i: digest(p) for i, p in stems.items()}
    if mix:
        sources['mix'], hashes['mix'] = str(mix), digest(mix)
    library = Library(args.output, songs=getattr(args, 'library_dir', None))
    active, entry = library.active(folder)
    legacy = [p for p in legacy_candidates(args.output, folder) if artifacts_valid(p)] if active is None else []
    prior = active if active and artifacts_valid(active) else (legacy[0] if legacy else None)
    inherited_artist = metadata(active or prior)[1] if (active or prior) else 'Unknown'
    name = settings.get('name', folder.name)
    artist = settings.get('artist', args.artist if args.artist is not None else inherited_artist)
    for value in (name, artist):
        if not isinstance(value, str) or any(c in value for c in '\n\r\x00'):
            raise ValueError('Metadata must be single-line text.')
    payload = {'version': VERSION, 'implementation': implementation, 'hashes': hashes,
               'settings': settings, 'artist': artist, 'name': name}
    saved_options = read_json(prior/'analysis.json').get('chart_options', {}) if prior else {}
    selected_difficulty = getattr(args, 'difficulty', None) or saved_options.get('difficulty', 'all')
    drum_order = getattr(args, 'drum_order', None) or saved_options.get('drum_order', 'snare,hihat,tom,crash')
    if selected_difficulty != 'all' or drum_order != 'snare,hihat,tom,crash':
        payload['chart_options'] = {'difficulty': selected_difficulty, 'drum_order': drum_order}
    signature = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    organize_only = getattr(args, 'organize_existing', False)
    if organize_only or (args.resume and not args.instrument and active is None and prior is not None):
        if prior is None:
            raise ValueError('No valid previous chart to organize; no audio will be processed in this mode.')
        old_report = read_json(prior/'analysis.json')
        if old_report['source_hashes'] != hashes:
            raise ValueError('Previous chart uses different audio; organize mode will not relabel stale charts.')
        if metadata(prior) != (name, artist):
            raise ValueError('Metadata differs; organize mode preserves the original chart. Generate a revision instead.')
        # Preserve the original completion signature and all copied file bytes.
        old_signature = read_json(prior/'complete.json')['signature']
        output, copied = library.adopt(prior, folder, name, artist, old_signature, work)
        if copied:
            audit = audit_legacy(args.output, folder)
            audit['main_output'] = str(output)
            timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            dump(args.output/f'organization-audit-{source_id(folder)[:12]}-{timestamp}.json', audit)
        active, entry = library.active(folder)
        prior = active
        if organize_only:
            return {'source': str(folder), 'status': 'organized_existing' if copied else 'already_organized',
                    'output': str(output), 'audio_processed': False}
    if args.resume and not args.instrument and active is not None and artifacts_valid(active):
        if read_json(active/'complete.json').get('signature') == signature:
            return {'source': str(folder), 'status': 'skipped_complete', 'output': str(active)}
    if args.instrument and prior is None:
        raise ValueError('--instrument requires an earlier complete chart generated by this system.')
    prior_report = read_json(prior/'analysis.json') if prior else None
    if args.instrument:
        for i in hashes:
            if i != args.instrument and prior_report['source_hashes'].get(i) != hashes[i]:
                raise ValueError(f'Unselected source {i} changed; generate a full revision.')
        if prior_report['implementation_hash'] != implementation:
            raise ValueError('Analysis/policy code changed; generate a full revision before partial reprocessing.')
    raw = {i: decode_stereo(p, work/(i+'.f32')) for i, p in stems.items()}
    if mix:
        raw['mix'] = decode_stereo(mix, work/'mix.f32')
    alignment_report = alignment(raw)
    duration = len(raw['guitar'])/44100
    if duration < .5:
        raise ValueError('Song is shorter than 0.5 seconds.')
    analyses, charts, checks = {}, {}, {}
    if args.instrument and args.instrument != 'drums':
        beat = prior_report['beat_analysis']
    else:
        beat = beat_analysis(mono(raw['drums']))
    cache_directory = args.output/'.analysis-cache'
    cache_directory.mkdir(exist_ok=True)
    for instrument in INSTRUMENTS:
        print(f'[{folder.name}] {instrument}: '+('reusing prior analysis' if args.instrument and instrument != args.instrument else 'analyzing WAV'), flush=True)
        audio = None
        cache_key = hashlib.sha256((hashes[instrument]+implementation+instrument).encode()).hexdigest()
        cache_path = cache_directory/(cache_key+'.json')
        if args.instrument and instrument != args.instrument:
            analyses[instrument] = read_json(prior/(instrument+'.analysis.json'))
            charts[instrument] = prior_report['charts'][instrument]
            if instrument == 'drums' and saved_options.get('drum_order', 'snare,hihat,tom,crash') != 'snare,hihat,tom,crash':
                canonical = {'snare': 1, 'hihat': 2, 'tom': 3, 'crash': 4}
                restore = {0: 0, **{lane: canonical[kind] for lane, kind in enumerate(saved_options['drum_order'].split(','), 1)}}
                for event in analyses[instrument]['events']:
                    event['pitches'] = [restore[p] for p in event['pitches']]
                charts[instrument] = {d: [[s, e, restore[l]] for s, e, l in notes] for d, notes in charts[instrument].items()}
            checks[instrument] = prior_report['musical_checks'][instrument]
            continue
        # Cache is an optimization, not authority: verify its signature/checksum.
        cached = None
        if args.resume and not args.instrument and cache_path.is_file():
            try:
                wrapper = read_json(cache_path)
                serialized = json.dumps(wrapper['analysis'], sort_keys=True)
                if wrapper['key'] == cache_key and wrapper['sha256'] == hashlib.sha256(serialized.encode()).hexdigest():
                    cached = wrapper['analysis']
            except (OSError, ValueError, KeyError):
                pass
        audio = mono(raw[instrument])
        analyses[instrument] = cached or analyze(audio, instrument)
        if cached is None:
            value = analyses[instrument]
            pending = cache_path.with_suffix('.pending')
            dump(pending, {'key': cache_key, 'analysis': value,
                           'sha256': hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()})
            pending.replace(cache_path)
        charts[instrument] = difficulty_charts(analyses[instrument], beat)
        checks[instrument] = musical_checks(analyses[instrument], charts[instrument], audio)
        if checks[instrument]['structural_errors']:
            raise ValueError(f'{instrument}: chart policy violations: {checks[instrument]["structural_errors"][:8]}')
        del audio
    # Apply output preferences to charts and event lanes together so validation
    # still compares the rendered lanes to their detected percussion events.
    if drum_order != 'snare,hihat,tom,crash':
        canonical = {'snare': 1, 'hihat': 2, 'tom': 3, 'crash': 4}
        remap = {0: 0, **{canonical[kind]: lane for lane, kind in enumerate(drum_order.split(','), 1)}}
        analyses['drums'] = json.loads(json.dumps(analyses['drums']))
        for event in analyses['drums']['events']:
            event['pitches'] = [remap[p] for p in event['pitches']]
        charts['drums'] = {d: [[s, e, remap[lane]] for s, e, lane in notes]
                           for d, notes in charts['drums'].items()}
    for instrument in INSTRUMENTS:
        if selected_difficulty != 'all':
            charts[instrument] = {d: notes if d == selected_difficulty else []
                                  for d, notes in charts[instrument].items()}
        checks[instrument] = musical_checks(analyses[instrument], charts[instrument], mono(raw[instrument]))
        if checks[instrument]['structural_errors']:
            raise ValueError(f'{instrument}: chart policy violations after output mapping')
    # Stage the entire song first. Incomplete exports are never library entries.
    staging = work/'song-output'
    staging.mkdir()
    midi_report = write_midi(charts, duration, beat['bpm'], staging/'notes.mid')
    if args.instrument and hashes == prior_report['source_hashes']:
        for path in prior.glob('*.ogg'):
            shutil.copy2(path, staging/path.name)
        audio_report = prior_report['audio_export']
    else:
        audio_report = export_audio(raw, work, staging)
    report = {'version': VERSION, 'implementation_hash': implementation, 'sources': sources,
              'source_folder': str(folder.resolve()), 'source_identity': source_id(folder),
              'name': name, 'artist': artist,
              'chart_options': {'difficulty': selected_difficulty, 'drum_order': drum_order},
              'source_hashes': hashes, 'source_midi_used': False,
              'duration_seconds': duration, 'alignment': alignment_report,
              'beat_analysis': beat, 'charts': charts, 'musical_checks': checks,
              'midi_validation': midi_report, 'audio_export': audio_report,
              'instrument_analysis': {i: analyses[i]['diagnostics'] for i in INSTRUMENTS},
              'reprocessed_instrument': args.instrument, 'previous_revision': str(prior) if prior else None,
              'in_game_test': 'not run', 'listening_validation': 'not run',
              'musical_correctness_certified': False,
              'elapsed_seconds': time.monotonic()-started}
    comparison = args.compare or (prior/'notes.mid' if args.instrument else None)
    if comparison:
        if comparison.is_dir():
            comparison = comparison/'notes.mid'
        dump(staging/'comparison.json', compare_charts(comparison, staging/'notes.mid', analyses))
    dump(staging/'analysis.json', report)
    for i in INSTRUMENTS:
        dump(staging/(i+'.analysis.json'), analyses[i])
    ranks = {i: (3 if any(charts[i].values()) else -1) for i in INSTRUMENTS}
    (staging/'song.ini').write_text(f'''[song]
name = {name} (WAV direto)
artist = {artist}
charter = Shredder WAV analyzer
song_length = {round(duration*1000)}
preview_start_time = {min(30000, round(duration*300))}
delay = 0
diff_guitar = {ranks['guitar']}
diff_bass = {ranks['bass']}
diff_drums = {ranks['drums']}
diff_keys_real = {ranks['keys']}
pro_drums = False
five_lane_drums = False
loading_phrase = Chart automatico experimental. Pro Keys 7K. Requer revisao musical.
''', encoding='utf-8')
    (staging/'LEIA-ME.txt').write_text(
        'Chart gerado diretamente dos quatro WAVs. Nenhum MIDI fonte foi utilizado.\n'
        f'Bateria: quatro pads ({drum_order}) + bumbo; teclado: sete teclas brancas.\n'
        f'Dificuldade: {selected_difficulty}.\n'
        'Abra analysis.json e os *.analysis.json para revisar notas, trechos ausentes e incertezas.\n'
        'Validacao estrutural e evidencias espectrais nao provam fidelidade musical.\n'
        'Nao testado em jogo ou validado por escuta.\n', encoding='utf-8')
    # Verify inputs did not change while processing (also protects partial reuse).
    for i, path in sources.items():
        if digest(path) != hashes[i]:
            raise ValueError(f'Source changed while analyzing: {path}')
    marker = {'signature': signature, 'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'files': {p.name: digest(p) for p in staging.iterdir() if p.is_file()}}
    dump(staging/'complete.json', marker)
    # Never overwrite a chart: rename its whole folder into backups BEFORE
    # activating the new staged result at the stable main path.
    output, backup = library.publish(staging, folder, name, artist, signature)
    return {'source': str(folder), 'status': 'generated', 'output': str(output),
            'previous_backup': str(backup) if backup else None,
            'elapsed_seconds': report['elapsed_seconds'],
            'expert_notes': {i: len(charts[i]['Expert']) for i in INSTRUMENTS}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='song folder or parent containing song subfolders')
    parser.add_argument('--output', type=Path, default=Path('musicas'), help='playable songs directory (default: musicas)')
    parser.add_argument('--state-dir', type=Path, help='cache, reports and backups directory outside the songs library')
    parser.add_argument('--song', help='exact folder name or path; run only one song')
    parser.add_argument('--artist', default=None, help='fallback; song.json or the existing chart supplies it if omitted')
    parser.add_argument('--resume', action='store_true', help='skip verified complete songs; reuse hashed analyses')
    parser.add_argument('--difficulty', choices=['all', *DIFFICULTIES], help='render only the selected difficulty; inherit existing preference on resume')
    parser.add_argument('--drum-order', choices=['snare,hihat,tom,crash', 'hihat,snare,tom,crash'], help='four pads from left to right; inherit existing preference on resume')
    parser.add_argument('--instrument', choices=INSTRUMENTS, help='re-analyze one instrument; archive previous revision outside library')
    parser.add_argument('--organize-existing', action='store_true', help='copy latest valid legacy chart into library; never analyze audio')
    parser.add_argument('--compare', type=Path, help='old song folder/notes.mid; comparison only, requires --song')
    parser.add_argument('--list', action='store_true', help='show detected song folders without processing')
    args = parser.parse_args()
    if (args.instrument or args.compare or args.organize_existing) and not args.song:
        parser.error('--instrument/--compare/--organize-existing requires --song.')
    if args.organize_existing and args.instrument:
        parser.error('--organize-existing cannot reprocess an instrument.')
    args.library_dir = args.output.resolve()
    args.output = (args.state_dir or args.library_dir.parent/'chart-backups'/(args.library_dir.name+'-state')).resolve()
    try:
        folders = discover(args.source, args.song)
        source = args.source.resolve()
        if args.library_dir == source or source in args.library_dir.parents:
            raise ValueError('Output must be outside the input tree so exports are never rediscovered as sources.')
        if args.output == args.library_dir or args.library_dir in args.output.parents:
            raise ValueError('State directory must be outside the songs library.')
        if args.output == source or source in args.output.parents:
            raise ValueError('State directory must be outside the input tree.')
    except ValueError as error:
        parser.error(str(error))
    if args.list:
        print(json.dumps([str(p) for p in folders], indent=2, ensure_ascii=False))
        return 0
    args.output.mkdir(parents=True, exist_ok=True)
    lock = args.output/'.batch.lock'
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        parser.error(f'Another batch owns {lock}; if a crashed process left it, check that process before removing the lock.')
    os.write(descriptor, str(os.getpid()).encode())
    os.close(descriptor)
    rows = []
    try:
        implementation = implementation_hash()
        for folder in folders:
            try:
                with tempfile.TemporaryDirectory(prefix='.chart-work-', dir=args.output) as temporary:
                    row = process(folder, args, Path(temporary), implementation)
            except Exception as error:
                row = {'source': str(folder), 'status': 'error', 'error': str(error),
                       'traceback': traceback.format_exc()}
            rows.append(row)
            print(json.dumps({k: v for k, v in row.items() if k != 'traceback'}, ensure_ascii=False), flush=True)
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        dump(args.output/('batch-report-'+timestamp+'.json'), {'version': VERSION, 'songs': rows})
    finally:
        lock.unlink()
    return 1 if any(r['status'] == 'error' for r in rows) else 0


if __name__ == '__main__':
    raise SystemExit(main())
