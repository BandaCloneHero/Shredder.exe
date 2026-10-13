"""Preserve a pack guitar chart and add WAV-derived parts on its audio timeline."""
import argparse
import collections
import configparser
import datetime
import json
from pathlib import Path
import re
import shutil
import tempfile

import mido
import numpy as np
from scipy import ndimage, optimize, signal

from chart_library import atomic_json, digest, artifacts_valid
from create_mp3_test_chart import make_track
from generate_charts_batch import decode_stereo
from revise_chart_difficulty import extract, tempo_map

LEVELS = ('Easy', 'Medium', 'Hard', 'Expert')


def read_chart(path):
    text = path.read_text(encoding='utf-8-sig')
    return dict(re.findall(r'\[([^]]+)\]\s*\{([^}]*)\}', text, re.S))


def convert_guitar(path):
    sections = read_chart(path)
    resolution = int(re.search(r'Resolution\s*=\s*(\d+)', sections['Song'])[1])
    offset = float(re.search(r'Offset\s*=\s*([-\d.]+)', sections['Song'])[1])
    if offset:
        raise ValueError('Nonzero chart Offset requires explicit handling; refusing to change guitar timing.')
    tempo_events = []
    for tick, kind, payload in re.findall(r'(\d+)\s*=\s*(B|TS|A)\s+([^\r\n]+)', sections['SyncTrack']):
        tick = int(tick)
        if kind == 'B':
            tempo_events.append((tick, mido.MetaMessage('set_tempo', tempo=round(60e9/int(payload)))))
        elif kind == 'TS':
            parts = [int(p) for p in payload.split()]
            tempo_events.append((tick, mido.MetaMessage('time_signature', numerator=parts[0], denominator=2**parts[1] if len(parts)>1 else 4)))
        else:
            raise ValueError('Anchored chart tempo requires explicit handling.')
    if not any(t==0 and m.type=='set_tempo' for t,m in tempo_events):
        raise ValueError('No initial tempo in guitar chart')
    midi = mido.MidiFile(type=1, ticks_per_beat=resolution)
    midi.tracks.append(make_track('TEMPO', tempo_events, 0))
    global_events = [(int(t), mido.MetaMessage('text', text='['+s+']'))
                     for t,s in re.findall(r'(\d+)\s*=\s*E\s+"([^"]+)"', sections.get('Events',''))]
    guitar_events, report, phrase_sets, solos = [], {}, [], set()
    end_tick = 0
    for level,difficulty in enumerate(LEVELS):
        body = sections.get(difficulty+'Single','')
        entries = [(int(t),int(n),int(length)) for t,n,length in re.findall(r'(\d+)\s*=\s*N\s+(\d+)\s+(\d+)',body)]
        if any(n not in range(7) for _,n,_ in entries):
            raise ValueError('Open/unknown guitar chart notes require explicit handling.')
        groups = collections.defaultdict(list)
        for tick,n,length in entries:
            groups[tick].append((n,length))
        gems=[];types=[];previous=None;base=(60,72,84,96)[level]
        threshold=resolution*65//192
        for tick,members in sorted(groups.items()):
            frets=[(n,length) for n,length in members if n<5]
            if not frets:
                raise ValueError('Guitar flag without a playable note')
            flags={n for n,_ in members if n>=5}
            natural=(len(frets)==1 and previous is not None and
                     (len(previous[1])>1 or frets[0][0]!=previous[1][0][0]) and tick-previous[0]<=threshold)
            note_type='tap' if 6 in flags else 'hopo' if natural != (5 in flags) else 'strum'
            types.append([tick,note_type])
            for n,length in frets:
                gems.append([tick,length,n]);stop=tick+max(1,length);end_tick=max(end_tick,stop)
                guitar_events.extend([(tick,mido.Message('note_on',note=base+n,velocity=100)),
                                      (stop,mido.Message('note_off',note=base+n))])
            if note_type=='tap':
                for t,value in ((tick,1),(tick+1,0)):
                    guitar_events.append((t,mido.Message('sysex',data=(80,83,0,0,level,4,value))))
            else:
                marker=base+(5 if note_type=='hopo' else 6)
                guitar_events.extend([(tick,mido.Message('note_on',note=marker,velocity=100)),
                                      (tick+1,mido.Message('note_off',note=marker))])
            previous=(tick,frets)
        phrases={(int(t),int(kind),int(length)) for t,kind,length in re.findall(r'(\d+)\s*=\s*S\s+(\d+)\s+(\d+)',body)}
        phrase_sets.append(phrases)
        solo_start=None
        for tick,value in re.findall(r'(\d+)\s*=\s*E\s+([^\r\n]+)',body):
            value=value.strip().strip('"');tick=int(tick)
            if value=='solo':solo_start=tick
            elif value=='soloend' and solo_start is not None:solos.add((solo_start,tick));solo_start=None
            else:raise ValueError('Unsupported guitar text event: '+value)
        report[difficulty]={'gems':gems,'types':types,'notes':len(gems),'tap_attacks':sum(t=='tap' for _,t in types)}
    canonical = {}
    for phrases in phrase_sets:
        for start,kind,length in phrases:
            canonical[start,kind] = max(canonical.get((start,kind),0),length)
    # MIDI phrases are shared across difficulties. Choose a common endpoint
    # that preserves the awarded gems in every level, even if lengths differ.
    for start,kind in canonical:
        lower=start+1;upper=float('inf')
        for difficulty,phrases in zip(LEVELS,phrase_sets):
            matches=[length for t,k,length in phrases if (t,k)==(start,kind)]
            if len(matches)!=1:raise ValueError('Different per-difficulty phrase positions cannot be silently merged')
            end=start+matches[0];ticks={t for t,_,_ in report[difficulty]['gems']}
            lower=max(lower,max((t+1 for t in ticks if start<=t<end),default=start+1))
            upper=min(upper,min((t for t in ticks if t>=end),default=float('inf')))
        if lower>upper:raise ValueError('No shared MIDI phrase can preserve star power membership')
        canonical[start,kind]=int(max(lower,min(start+canonical[start,kind],upper))-start)
    for difficulty,phrases in zip(LEVELS,phrase_sets):
        if {(start,kind) for start,kind,_ in phrases} != set(canonical):
            raise ValueError('Different per-difficulty phrase positions cannot be silently merged')
        for start,kind,length in phrases:
            ticks={t for t,_,_ in report[difficulty]['gems']}
            original={t for t in ticks if start<=t<start+length}
            merged={t for t in ticks if start<=t<start+canonical[start,kind]}
            if original!=merged:
                raise ValueError('Phrase conversion would change which guitar notes award star power')
    report['phrase_conversion']={'membership_preserved':True, 'original_lengths_by_level':[sorted(p) for p in phrase_sets],
                                 'canonical':[list(k)+[length] for k,length in sorted(canonical.items())]}
    for (start,kind),length in canonical.items():
        note={0:105,1:106,2:116}.get(kind)
        if note is None:raise ValueError('Unknown phrase kind')
        guitar_events.extend([(start,mido.Message('note_on',note=note,velocity=100)),
                              (start+length,mido.Message('note_off',note=note))])
        end_tick=max(end_tick,start+length)
    for start,stop in solos:
        guitar_events.extend([(start,mido.Message('note_on',note=103,velocity=100)),
                              (stop,mido.Message('note_off',note=103))])
        end_tick=max(end_tick,stop)
    midi.tracks.append(make_track('EVENTS',global_events,end_tick))
    midi.tracks.append(make_track('PART GUITAR',guitar_events,end_tick))
    return midi,report


def features(raw):
    y=signal.resample_poly(raw.mean(axis=1),1,2)
    f,t,z=signal.stft(y,22050,nperseg=1024,noverlap=804)
    magnitude=abs(z)
    values=np.array([np.log1p(np.sqrt(np.sum(magnitude[(f>=lo)&(f<hi)]**2,axis=0))*100)
                     for lo,hi in ((40,160),(160,650),(650,1500),(1500,3500),(3500,8000))])
    return t,values-ndimage.gaussian_filter1d(values,100,axis=1)


def fit_recordings(pack_audio,original,work):
    target=decode_stereo(pack_audio,work/'pack.f32');source=decode_stereo(original,work/'source.f32')
    ta,fa=features(target);tb,fb=features(source);dt=220/22050
    duration=min(len(source),len(target))/44100
    probes=[]
    for offset in np.linspace(10,max(10,duration-40),8):
        lo=round(offset/dt);hi=round((offset+25)/dt);x=fa[:,lo:hi];y=fb[:,lo:hi]
        corr=sum(signal.correlate(u,v,method='fft') for u,v in zip(x,y))
        lags=signal.correlation_lags(x.shape[1],y.shape[1]);allowed=np.flatnonzero(abs(lags)*dt<8)
        lag=int(lags[allowed[np.argmax(corr[allowed])]])
        left=max(0,lag);right=max(0,-lag);n=min(x.shape[1]-left,y.shape[1]-right)
        xx=x[:,left:left+n];yy=y[:,right:right+n]
        norm=np.linalg.norm(xx)*np.linalg.norm(yy)
        score=float(np.sum(xx*yy)/norm) if norm else 0.
        probes.append({'source_time':float(offset+12.5),'lag_seconds':lag*dt,'correlation':score})
    if min(p['correlation'] for p in probes)<.80:
        raise ValueError('Pack/source audio identity not sufficiently supported')
    t=np.array([p['source_time'] for p in probes]);lag=np.array([p['lag_seconds'] for p in probes])
    slope,offset=np.polyfit(t,lag,1)
    use=(tb>12)&(tb<duration-12);times=tb[use][::2];reference=fb[:,use][:,::2]
    reference=reference/np.maximum(np.linalg.norm(reference,axis=1)[:,None],1e-12)
    def loss(parameters):
        scale,shift=parameters
        aligned=np.array([np.interp(times*scale+shift,ta,row) for row in fa])
        aligned/=np.maximum(np.linalg.norm(aligned,axis=1)[:,None],1e-12)
        return -float(np.sum(aligned*reference)/len(aligned))
    fit=optimize.minimize(loss,[1+slope,offset],method='Nelder-Mead',options={'xatol':1e-9,'fatol':1e-9,'maxiter':300})
    scale,offset=map(float,fit.x);error=float(np.max(abs(t*scale+offset-t-lag)))
    if not fit.success or abs(scale-1)>.02 or error>.020 or -fit.fun<.90:
        raise ValueError('Audio drift cannot be represented reliably by one linear time transform')
    # Holdout windows: independent local lag estimates, not used by the optimizer.
    holdouts=[]
    for center in np.linspace(30,duration-30,5):
        sample=np.arange(center-4,center+4,dt);ref=np.array([np.interp(sample,tb,row) for row in fb])
        ref/=np.maximum(np.linalg.norm(ref,axis=1)[:,None],1e-12)
        def local(delta):
            aligned=np.array([np.interp(sample*scale+offset+delta,ta,row) for row in fa])
            aligned/=np.maximum(np.linalg.norm(aligned,axis=1)[:,None],1e-12)
            return -float(np.sum(ref*aligned)/len(ref))
        match=optimize.minimize_scalar(local,bounds=(-.06,.06),method='bounded')
        holdouts.append({'source_time':float(center),'residual_ms':float(match.x*1000),'correlation':float(-match.fun)})
    if any(abs(p['residual_ms'])>15 or p['correlation']<.90 for p in holdouts):
        raise ValueError('Audio alignment holdout validation failed')
    return {'method':'five-band audio envelopes; affine fit and local holdouts','scale':scale,'offset_seconds':offset,
            'feature_correlation':float(-fit.fun),'max_probe_residual_ms':error*1000,'probes':probes,'holdouts':holdouts,
            'pack_duration':len(target)/44100,'source_duration':len(source)/44100,
            'limitation':'Envelope alignment supports this recording; it is not a listening validation.'}


def easier_drums(notes,events,bpm):
    """Keep WAV attack timestamps, main accents and at most one hand plus kick."""
    gap=max(.16,min(.22,60/max(60,bpm)*.42));groups=[]
    for note in sorted(notes):
        matches=[e for e in events if note[2] in e['pitches'] and abs(e['start']-note[0])<=.040]
        evidence=max(matches,key=lambda e:e['confidence'],default=None)
        if evidence is None or evidence['confidence']<.40:continue
        item=(list(note),evidence)
        if groups and note[0]-groups[-1][0][0][0]<=.035:groups[-1].append(item)
        else:groups.append([item])
    def priority(group):
        lanes={n[2] for n,_ in group}
        return (4 if 0 in lanes else 0)+(5 if 2 in lanes else 0)+max(e['confidence'] for _,e in group)
    selected=[]
    for group in sorted(groups,key=priority,reverse=True):
        start=group[0][0][0]
        if all(abs(start-old[0][0][0])>=gap for old in selected):selected.append(group)
    result=[]
    for group in sorted(selected,key=lambda g:g[0][0][0]):
        kick=[n for n,_ in group if n[2]==0]
        pads=[item for item in group if item[0][2]!=0]
        if kick:result.append(kick[0])
        if pads:
            chosen=max(pads,key=lambda item:(item[0][2]==2,item[1]['confidence'],item[1]['strength']))[0]
            result.append(chosen)
    return sorted(result),{'before_notes':len(notes),'after_notes':len(result),'minimum_group_gap_seconds':gap,
            'max_hand_strokes':1,'max_hits_including_kick':2,'artificial_hits':0,'lane_counts':dict(collections.Counter(n[2] for n in result))}


def validate_export(midi_path,guitar_report,added,timing):
    midi=mido.MidiFile(midi_path);seconds,_,_=tempo_map(midi);tracks={t.name:t for t in midi.tracks}
    assert midi.ticks_per_beat>0
    for level,difficulty in enumerate(LEVELS):
        base=(60,72,84,96)[level];notes=extract(tracks['PART GUITAR'],set(range(base,base+5)),lambda n:n-base,lambda t:t)
        actual=sorted([[int(a),int(b-a),n] for a,b,n in notes]);expected=sorted([[t,max(1,length),n] for t,length,n in guitar_report[difficulty]['gems']])
        assert actual==expected,'Guitar timing/frets/holds changed'
        messages=[(t,m) for t,m in absolute_events(tracks['PART GUITAR'])]
        types={t:('hopo' if m.note==base+5 else 'strum') for t,m in messages if m.type=='note_on' and m.velocity and m.note in (base+5,base+6)}
        for t,m in messages:
            if m.type=='sysex' and tuple(m.data[:6])==(80,83,0,0,level,4) and m.data[6]==1:types[t]='tap'
        assert sorted(types.items())==[(t,kind) for t,kind in guitar_report[difficulty]['types']]
    stats={};timestamp_errors=[]
    for instrument,notes in added.items():
        name={'bass':'PART BASS','drums':'PART DRUMS','keys':'PART REAL_KEYS_M'}[instrument]
        valid=set(range(48,73)) if instrument=='keys' else set(range(72,77))
        actual=sorted(extract(tracks[name],valid,lambda n:n if instrument=='keys' else n-72,seconds))
        assert len(actual)==len(notes)
        # Quantization may tie two chord releases and change end/lane sorting.
        # Compare within physical lanes so the same notes remain paired.
        ordered=sorted(actual,key=lambda n:(n[2],n[0],n[1]))
        expected=sorted(notes,key=lambda n:(n[2],n[0],n[1]))
        assert all(n[2]==e[2] and abs(n[0]-e[0])<.003 and abs(n[1]-e[1])<.003 for n,e in zip(ordered,expected)), instrument
        timestamp_errors.extend(abs(n[index]-e[index]) for n,e in zip(ordered,expected) for index in (0,1))
        for m in tracks[name]:
            if instrument!='keys' and m.type=='note_on' and m.velocity:assert m.note in valid
        if instrument=='drums':
            starts=sorted(set(n[0] for n in actual));maximum=max((sum(abs(n[0]-t)<=.035 for n in actual) for t in starts),default=0)
            assert maximum<=2,'Excess near-simultaneous drums'
            assert all(n[1]-n[0]<.060 for n in actual),'Drum sustains'
        lanes=collections.defaultdict(list)
        for start,stop,lane in actual:lanes[lane].append((start,stop))
        for lane,spans in lanes.items():
            assert all(a[1]<b[0] and b[0]-a[0]>=.033 for a,b in zip(spans,spans[1:]))
        stats[instrument]={'notes':len(actual),'lane_counts':dict(collections.Counter(n[2] for n in actual))}
    return {'guitar_gems_holds_types_all_difficulties_preserved':True,'added_notes_roundtrip':'passed',
            'timestamp_error_limit_seconds':.003,'maximum_observed_timestamp_error_seconds':max(timestamp_errors,default=0.),'parts':stats,'in_game_test':'not run','listening_validation':'not run'}


def absolute_events(track):
    tick=0
    for message in track:
        tick+=message.time
        yield tick,message


def enrich(pack,source):
    marker=pack/'enrichment-report.json'
    if marker.exists():
        old=json.loads(marker.read_text())
        if digest(pack/'notes.mid')==old['notes_sha256'] and digest(pack/'song.ogg')==old['pack_audio_sha256']:
            return {'status':'skipped_complete','folder':str(pack)}
        raise ValueError('Modified enriched chart: preserve/review it before another revision')
    if not artifacts_valid(source):raise ValueError('Invalid WAV-generated source chart')
    analysis=json.loads((source/'analysis.json').read_text())
    if analysis['source_midi_used'] or analysis['chart_options']['playability_profile']!='realistic':raise ValueError('Requires direct WAV realistic analysis')
    if analysis['chart_options']['drum_order']!='hihat,snare,tom,crash':raise ValueError('Expected HH/snare/tom/crash mapping')
    if analysis['instrument_analysis']['drums']['groove_refinement']['forced_pattern_hits']:raise ValueError('Artificial drum pulses in analysis')
    for instrument,filename in analysis['sources'].items():
        if digest(Path(filename))!=analysis['source_hashes'][instrument]:raise ValueError('WAV/source hashes changed')
    if (pack/'notes.mid').exists():raise ValueError('Refusing to overwrite an existing pack MIDI')
    midi,guitar_report=convert_guitar(pack/'notes.chart')
    backup_root=Path('chart-backups/pack-enrichment').resolve();backup_root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.enrichment-',dir=backup_root) as tmp:
        work=Path(tmp);timing=fit_recordings(pack/'song.ogg',Path(analysis['sources']['mix']),work)
        seconds,ticks,_=tempo_map(midi);end_tick=ticks(timing['pack_duration'])
        drums,drum_report=easier_drums(analysis['charts']['drums']['Medium'],json.loads((source/'drums.analysis.json').read_text())['events'],analysis['beat_analysis']['bpm'])
        added={};cropped={}
        for instrument in ('bass','drums','keys'):
            notes=drums if instrument=='drums' else analysis['charts'][instrument]['Medium']
            mapped=[];dropped=0
            for start,stop,lane in notes:
                start=start*timing['scale']+timing['offset_seconds'];stop=stop*timing['scale']+timing['offset_seconds']
                if start>=timing['pack_duration']-.01:dropped+=1;continue
                stop=min(stop,timing['pack_duration']-.005)
                if stop<=start:raise ValueError('Invalid aligned hold')
                mapped.append([start,stop,lane])
            added[instrument]=mapped;cropped[instrument]=dropped
            events=[]
            if instrument=='keys':events=[(0,mido.Message('note_on',note=0,velocity=100)),(end_tick,mido.Message('note_off',note=0))]
            for start,stop,lane in mapped:
                note=lane if instrument=='keys' else 72+lane;begin=ticks(start);end=max(begin+1,ticks(stop))
                events.extend([(begin,mido.Message('note_on',note=note,velocity=100)),(end,mido.Message('note_off',note=note))])
            midi.tracks.append(make_track({'bass':'PART BASS','drums':'PART DRUMS','keys':'PART REAL_KEYS_M'}[instrument],events,end_tick))
        staging=work/'song';shutil.copytree(pack,staging)
        midi.save(staging/'notes.mid')
        validation=validate_export(staging/'notes.mid',guitar_report,added,timing)
        ini=configparser.ConfigParser(interpolation=None,strict=False);ini.read(pack/'song.ini',encoding='utf-8-sig')
        section=next(s for s in ini.sections() if s.lower()=='song')
        for key,value in {'diff_bass':'3','diff_drums':'1','diff_keys_real':'3','five_lane_drums':'False','pro_drums':'False'}.items():ini.set(section,key,value)
        ini.set(section,'charter',ini.get(section,'charter',fallback='')+' + Shredder (baixo, bateria e teclado)')
        with (staging/'song.ini').open('w',encoding='utf-8') as stream:ini.write(stream)
        audio_hash=digest(pack/'song.ogg');assert audio_hash==digest(staging/'song.ogg')
        (staging/'notes.chart').unlink()  # only staging copy; original moves intact to backup below
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');archive=backup_root/(pack.name+'-'+stamp)
        report={'pack_song':str(pack.resolve()),'wav_analysis':str(source.resolve()),'source_midi_used_for_added_notes':False,
                'source_hashes':analysis['source_hashes'],'original_chart_sha256':digest(pack/'notes.chart'),
                'pack_audio_sha256':audio_hash,'notes_sha256':digest(staging/'notes.mid'),'audio_unchanged':True,
                'alignment':timing,'drum_easing':drum_report,'guitar':guitar_report,'validation':validation,
                'tail_attacks_omitted_beyond_pack_audio':cropped,'previous_backup':str(archive),
                'source_musical_warnings':{i:analysis['musical_checks'][i]['warnings'] for i in ('bass','drums','keys')},
                'musical_correctness_certified':False}
        atomic_json(staging/'enrichment-report.json',report)
        pack.rename(archive)
        try:staging.rename(pack)
        except Exception:archive.rename(pack);raise
    return {'status':'generated','folder':str(pack),'backup':str(archive),'drums':drum_report,'validation':validation}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack-song',required=True,type=Path)
    parser.add_argument('--wav-chart',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(enrich(args.pack_song.resolve(),args.wav_chart.resolve()),ensure_ascii=False))
