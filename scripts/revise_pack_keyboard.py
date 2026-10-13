"""Simplify only Pro Keys and add explicit rhythmic gameplay accompaniment."""
import argparse
import datetime
import json
from pathlib import Path
import shutil
import tempfile

import mido

from chart_library import atomic_json, digest, artifacts_valid
from chart_playability import accompany_keys
from create_mp3_test_chart import make_track
from enrich_pack_chart import absolute_events
from generate_charts_batch import decode_stereo, mono
from revise_chart_difficulty import extract, tempo_map
from wav_chart_analysis import activity, DT

WHITE=(48,50,52,53,55,57,59)
PROFILE='balanced-chords-accompaniment-v2'


def balanced_keyboard(notes,analyses,beat,mix):
    """Retain rhythmic detail, bounded dyads and varied audible accompaniment."""
    gap=max(.16,min(.22,60/max(60,beat['bpm'])*.42))
    groups=[]
    for note in sorted(notes):
        if groups and note[0]-groups[-1][0][0]<=.035:groups[-1].append(list(note))
        else:groups.append([list(note)])
    # Keep sustained/strong groups ahead of rapid spectral flicker.
    selected=[]
    for group in sorted(groups,key=lambda g:(-max(n[1]-n[0] for n in g),g[0][0])):
        if all(abs(group[0][0]-other[0][0])>=gap for other in selected):selected.append(group)
    genuine=[]
    for group in sorted(selected,key=lambda g:g[0][0]):
        start=group[0][0];by_lane={}
        for note in group:
            if note[2] not in by_lane or note[1]>by_lane[note[2]][1]:by_lane[note[2]]=note
        choices=list(by_lane.values())
        pairs=[(a,b) for i,a in enumerate(choices) for b in choices[i+1:]
               if abs(WHITE.index(a[2])-WHITE.index(b[2]))<=3]
        if pairs:
            chosen=max(pairs,key=lambda pair:sum(n[1]-n[0] for n in pair))
        else:chosen=[max(choices,key=lambda n:n[1]-n[0])]
        for note in chosen:genuine.append([start,min(note[1],start+.65),note[2]])
    genuine.sort()
    # Release both keys before the next attack to avoid accumulating held chords.
    for start in sorted(set(n[0] for n in genuine)):
        following=next((n[0] for n in genuine if n[0]>start),None)
        if following is not None:
            for note in genuine:
                if note[0]==start:note[1]=min(note[1],following-.012)
    _,accompaniment=accompany_keys({'Easy':[],'Medium':genuine},analyses,beat,mix,max_gap=4.)
    proposed=accompaniment.get('added_notes',{}).get('Medium',[])
    rms,floor,reference=activity(mix)
    def permitted(start,end,added):
        if any(abs(start-n[0])<gap or n[0]<=start<n[1]+.06 for n in genuine):return False
        if any(abs(start-e['time'])<gap for e in added):return False
        frame=min(len(rms)-1,max(0,round(start/DT)))
        return end>start and rms[frame]>=max(floor*2,reference*.06)
    additions=[]
    for i,entry in enumerate(proposed):
        start=entry['time']
        if not permitted(start,entry['end'],additions):continue
        # A repeated eight-beat phrase: dyads on accents, a short run on beat 4.
        pattern=(0,0,1,2,0,1,2,1)
        root=max(0,min(6,WHITE.index(entry['lane'])+pattern[i%8]))
        pitches=[WHITE[root]]
        if i%4==0:
            root=min(root,4);pitches=[WHITE[root],WHITE[root+2]]
        item={**entry,'pitches':pitches,'lane':pitches[0], 'basis':'rhythmic phrase adapted from accompaniment pitch',
              'keyboard_audibility_required':False}
        additions.append(item)
        if i%4==3 and i+1<len(proposed) and .25<proposed[i+1]['time']-start<.65:
            offbeat=(start+proposed[i+1]['time'])/2;end=offbeat+.085
            if permitted(offbeat,end,additions):
                additions.append({'time':offbeat,'end':end,'lane':WHITE[min(root+1,6)],
                    'pitches':[WHITE[min(root+1,6)]],'basis':'short offbeat passing note',
                    'keyboard_audibility_required':False})
    combined=sorted(genuine+[[e['time'],e['end'],lane] for e in additions for lane in e['pitches']])
    starts=sorted(set(n[0] for n in combined));previous=None;remapped=0
    for index,start in enumerate(starts):
        chord=[n for n in combined if n[0]==start];root=min(WHITE.index(n[2]) for n in chord)
        target=root if previous is None else max(previous-3,min(previous+3,root))
        target=min(target,6-max(WHITE.index(n[2])-root for n in chord))
        remapped+=target!=root
        for note in chord:
            note[2]=WHITE[target+WHITE.index(note[2])-root]
            if index+1<len(starts):note[1]=min(note[1],starts[index+1]-.012)
        previous=target
    assert all(b-a>=gap-.001 for a,b in zip(starts,starts[1:]))
    for entry in additions:
        chord=[n for n in combined if n[0]==entry['time']]
        entry['pitches']=[n[2] for n in chord];entry['lane']=entry['pitches'][0];entry['end']=min(n[1] for n in chord)
    histogram={str(size):sum(sum(n[0]==t for n in combined)==size for t in starts) for size in (1,2)}
    return combined,{'profile':PROFILE,'detected_source_notes':len(notes),'retained_detected_notes':len(genuine),
        'synthetic_accompaniment_notes':sum(len(e['pitches']) for e in additions),
        'synthetic_accompaniment_attacks':len(additions),'final_notes':len(combined),'final_attacks':len(starts),
        'maximum_simultaneous_keys':max((sum(n[0]==t for n in combined) for t in starts),default=0),
        'maximum_chord_span_white_keys':3,'maximum_root_step_white_keys':3,'chord_size_counts':histogram,
        'remapped_for_playability':remapped,'minimum_attack_gap_seconds':min((b-a for a,b in zip(starts,starts[1:])),default=None),
        'maximum_internal_attack_gap_seconds':max((b-a for a,b in zip(starts,starts[1:])),default=None),
        'first_attack_seconds':starts[0] if starts else None,'accompaniment':additions,
        'synthetic_gameplay_adaptation':True,
        'limitation':'Added keyboard notes are rhythmic gameplay accompaniment, not WAV transcription.'}


def track_chunks(path):
    data=path.read_bytes();offset=8+int.from_bytes(data[4:8],'big');chunks=[]
    while offset<len(data):
        size=int.from_bytes(data[offset+4:offset+8],'big');chunks.append(data[offset:offset+8+size]);offset+=8+size
    return chunks


def verify_keyboard(track,seconds,expected):
    actual=sorted(extract(track,set(range(48,73)),lambda n:n,seconds))
    assert len(actual)==len(expected)
    ordered=sorted(actual,key=lambda n:(n[2],n[0],n[1]));wanted=sorted(expected,key=lambda n:(n[2],n[0],n[1]))
    errors=[abs(n[i]-e[i]) for n,e in zip(ordered,wanted) for i in (0,1)]
    assert max(errors,default=0)<.003
    assert all(n[2]==e[2] and n[2] in WHITE for n,e in zip(ordered,wanted))
    starts=sorted(set(n[0] for n in actual));maximum=0;chords={}
    for start in starts:
        held=[n for n in actual if n[0]<=start<n[1]];maximum=max(maximum,len(held))
        chord=[n for n in actual if n[0]==start];indices=[WHITE.index(n[2]) for n in chord]
        assert len(chord)<=2 and max(indices)-min(indices)<=3
        chords[start]=min(indices)
    assert maximum<=2,'Accumulated held keys exceed two'
    assert all(b-a>=.157 for a,b in zip(starts,starts[1:]))
    assert all(abs(chords[b]-chords[a])<=3 for a,b in zip(starts,starts[1:]))
    for lane in WHITE:
        notes=sorted(n for n in actual if n[2]==lane)
        assert all(a[1]<b[0] for a,b in zip(notes,notes[1:]))
    return {'notes':len(actual),'attacks':len(starts),'maximum_timestamp_rounding_error_seconds':max(errors,default=0),
            'maximum_simultaneous_keys':maximum,'dyad_attacks':sum(sum(n[0]==s for n in actual)==2 for s in starts),
            'maximum_internal_attack_gap_seconds':max((b-a for a,b in zip(starts,starts[1:])),default=None),
            'first_attack_seconds':starts[0] if starts else None}


def revise(song):
    marker=song/'keyboard-revision.json'
    if marker.exists():
        old=json.loads(marker.read_text())
        if old['notes_sha256']!=digest(song/'notes.mid'):
            raise ValueError('Keyboard revision was modified; preserve/review it before revising again')
        if old['profile']==PROFILE:
            return {'status':'skipped_complete','folder':str(song)}
    report=json.loads((song/'enrichment-report.json').read_text())
    if digest(song/'notes.mid')!=report['notes_sha256']:raise ValueError('Pack chart changed since enrichment')
    if digest(song/'song.ogg')!=report['pack_audio_sha256']:raise ValueError('Pack audio changed')
    source=Path(report['wav_analysis'])
    if not artifacts_valid(source):raise ValueError('Invalid source analysis')
    analysis=json.loads((source/'analysis.json').read_text())
    if analysis['source_hashes']!=report['source_hashes']:raise ValueError('Source recording changed')
    mix_path=Path(analysis['sources']['mix'])
    if digest(mix_path)!=report['source_hashes']['mix']:raise ValueError('Original mix changed')
    midi=mido.MidiFile(song/'notes.mid');seconds,ticks,_=tempo_map(midi)
    index=next(i for i,t in enumerate(midi.tracks) if t.name=='PART REAL_KEYS_M')
    before=extract(midi.tracks[index],set(range(48,73)),lambda n:n,seconds)
    timing=report['alignment'];scale=timing['scale'];shift=timing['offset_seconds']
    # Recover the full WAV-derived pool rather than thinning the prior revision again.
    source_notes=analysis['charts']['keys']['Medium']
    analyses={i:json.loads((source/(i+'.analysis.json')).read_text()) for i in ('guitar','bass','drums')}
    backup_root=Path('chart-backups/keyboard-revisions').resolve();backup_root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.keyboard-',dir=backup_root) as tmp:
        work=Path(tmp);mix=mono(decode_stereo(mix_path,work/'mix.f32'))
        final,keyboard_report=balanced_keyboard(source_notes,analyses,analysis['beat_analysis'],mix)
        mapped=[[a*scale+shift,min(b*scale+shift,timing['pack_duration']-.005),n] for a,b,n in final
                if a*scale+shift<timing['pack_duration']-.01]
        keyboard_report['previous_chart_notes']=len(before)
        messages=list(absolute_events(midi.tracks[index]));end_tick=messages[-1][0]
        kept=[(t,m) for t,m in messages if m.type not in ('track_name','end_of_track') and not (m.type in ('note_on','note_off') and 48<=m.note<=72)]
        for start,stop,lane in mapped:
            a=ticks(start);b=max(a+1,ticks(stop));kept.extend([(a,mido.Message('note_on',note=lane,velocity=100)),(b,mido.Message('note_off',note=lane))])
        midi.tracks[index]=make_track('PART REAL_KEYS_M',kept,end_tick)
        staging=work/'song';shutil.copytree(song,staging);midi.save(staging/'notes.mid')
        original_chunks=track_chunks(song/'notes.mid');new_chunks=track_chunks(staging/'notes.mid')
        assert len(original_chunks)==len(new_chunks)
        assert all(a==b for i,(a,b) in enumerate(zip(original_chunks,new_chunks)) if i!=index),'A different instrument/tempo track changed'
        rendered=mido.MidiFile(staging/'notes.mid');validation=verify_keyboard(rendered.tracks[index],seconds,mapped)
        for p in song.iterdir():
            if p.is_file() and p.name not in ('notes.mid','enrichment-report.json'):
                assert digest(p)==digest(staging/p.name),'Another song file changed'
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');archive=backup_root/(song.name+'-'+stamp)
        keyboard_report.update(notes_sha256=digest(staging/'notes.mid'),previous_backup=str(archive),
            audio_unchanged=True,non_keyboard_midi_chunks_byte_identical=True,validation=validation,
            in_game_test='not run',listening_validation='not run',alignment=timing)
        atomic_json(staging/'keyboard-revision.json',keyboard_report)
        report['notes_sha256']=keyboard_report['notes_sha256'];report['keyboard_revision']=keyboard_report
        report['validation']['parts']['keys']={'notes':len(mapped),'profile':PROFILE,'synthetic_gameplay_adaptation':True}
        report['validation']['keyboard_revision']=validation
        atomic_json(staging/'enrichment-report.json',report)
        song.rename(archive)
        try:staging.rename(song)
        except Exception:archive.rename(song);raise
    atomic_json(backup_root/('report-'+stamp+'.json'),keyboard_report)
    return {'status':'generated','folder':str(song),'previous_backup':str(archive),
            'keyboard_before':len(before),'keyboard_after':len(mapped),'accompaniment_added':keyboard_report['synthetic_accompaniment_notes'],
            'non_keyboard_tracks_unchanged':True,'audio_unchanged':True,'validation':validation}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--song',required=True,type=Path)
    args=parser.parse_args();print(json.dumps(revise(args.song.resolve()),ensure_ascii=False))
