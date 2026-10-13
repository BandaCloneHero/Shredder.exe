"""Simplify only Pro Keys and add explicit rhythmic gameplay accompaniment."""
import argparse
import datetime
import json
from pathlib import Path
import shutil
import tempfile

import mido

from chart_difficulty_profile import easy_medium_notes
from chart_library import atomic_json, digest, artifacts_valid
from chart_playability import accompany_keys
from create_mp3_test_chart import make_track
from enrich_pack_chart import absolute_events
from generate_charts_batch import decode_stereo, mono
from revise_chart_difficulty import extract, tempo_map

WHITE=(48,50,52,53,55,57,59)
PROFILE='linear-accompaniment-v1'


def linear_keyboard(notes,analyses,beat,mix):
    simple=easy_medium_notes('keys',notes,beat['bpm'])
    # Passing a single level selects the slower every-other-beat accompaniment.
    expanded,accompaniment=accompany_keys({'Medium':simple},analyses,beat,mix,max_gap=4.)
    proposed=accompaniment.get('added_notes',{}).get('Medium',[])
    additions=[]
    for entry in proposed:
        start=entry['time']
        if any(abs(start-n[0])<.32 or n[0]<=start<n[1]+.06 for n in simple):continue
        if any(abs(start-e['time'])<.32 for e in additions):continue
        additions.append(entry)
    combined=sorted([list(n) for n in simple]+[[e['time'],e['end'],e['lane']] for e in additions])
    previous=None;remapped=0
    for note in combined:
        index=WHITE.index(note[2])
        if previous is not None:
            adjusted=max(previous-1,min(previous+1,index))
            remapped+=adjusted!=index;index=adjusted
        note[2]=WHITE[index];previous=index
    for note,following in zip(combined,combined[1:]):note[1]=min(note[1],following[0]-.012)
    assert all(b[0]-a[0]>=.319 for a,b in zip(combined,combined[1:]))
    assert all(a[1]<b[0] for a,b in zip(combined,combined[1:]))
    added_times={round(e['time'],6) for e in additions}
    for note in combined:
        if round(note[0],6) in added_times:
            entry=next(e for e in additions if round(e['time'],6)==round(note[0],6))
            entry['lane']=note[2];entry['end']=note[1]
    return combined,{'profile':PROFILE,'previous_notes':len(notes),'simplified_detected_notes':len(simple),
        'synthetic_accompaniment_notes':len(additions),'final_notes':len(combined),
        'maximum_simultaneous_keys':1,'maximum_white_key_step':1,'remapped_for_linear_motion':remapped,
        'minimum_attack_gap_seconds':min((b[0]-a[0] for a,b in zip(combined,combined[1:])),default=None),
        'maximum_internal_attack_gap_seconds':max((b[0]-a[0] for a,b in zip(combined,combined[1:])),default=None),
        'first_attack_seconds':combined[0][0] if combined else None,
        'accompaniment':additions,'synthetic_gameplay_adaptation':True,
        'limitation':'Added keyboard notes are rhythmic gameplay accompaniment, not WAV transcription.'}


def track_chunks(path):
    data=path.read_bytes();offset=8+int.from_bytes(data[4:8],'big');chunks=[]
    while offset<len(data):
        size=int.from_bytes(data[offset+4:offset+8],'big');chunks.append(data[offset:offset+8+size]);offset+=8+size
    return chunks


def verify_keyboard(track,seconds,expected):
    actual=sorted(extract(track,set(range(48,73)),lambda n:n,seconds))
    assert len(actual)==len(expected)
    errors=[abs(n[i]-e[i]) for n,e in zip(actual,expected) for i in (0,1)]
    assert max(errors,default=0)<.003
    assert all(n[2]==e[2] and n[2] in WHITE for n,e in zip(actual,expected))
    assert all(a[1]<b[0] and b[0]-a[0]>=.317 for a,b in zip(actual,actual[1:]))
    assert all(abs(WHITE.index(a[2])-WHITE.index(b[2]))<=1 for a,b in zip(actual,actual[1:]))
    return {'notes':len(actual),'maximum_timestamp_rounding_error_seconds':max(errors,default=0),
            'maximum_simultaneous_keys':1,'maximum_internal_attack_gap_seconds':max((b[0]-a[0] for a,b in zip(actual,actual[1:])),default=None),
            'first_attack_seconds':actual[0][0] if actual else None}


def revise(song):
    marker=song/'keyboard-revision.json'
    if marker.exists():
        old=json.loads(marker.read_text())
        if old['profile']==PROFILE and old['notes_sha256']==digest(song/'notes.mid'):
            return {'status':'skipped_complete','folder':str(song)}
        raise ValueError('Keyboard revision was modified; preserve/review it before revising again')
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
    source_notes=[[(a-shift)/scale,(b-shift)/scale,n] for a,b,n in before]
    analyses={i:json.loads((source/(i+'.analysis.json')).read_text()) for i in ('guitar','bass','drums')}
    backup_root=Path('chart-backups/keyboard-revisions').resolve();backup_root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.keyboard-',dir=backup_root) as tmp:
        work=Path(tmp);mix=mono(decode_stereo(mix_path,work/'mix.f32'))
        final,keyboard_report=linear_keyboard(source_notes,analyses,analysis['beat_analysis'],mix)
        mapped=[[a*scale+shift,b*scale+shift,n] for a,b,n in final]
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
