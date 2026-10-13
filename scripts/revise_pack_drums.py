"""Revise only drums from WAV packets; archive the prior song outside the library."""
import argparse
import datetime
import json
from pathlib import Path
import shutil
import tempfile

import mido

from chart_library import atomic_json,digest
from create_mp3_test_chart import make_track
from drum_transient_refinement import refine_packets,moderate_drums,PROFILE
from enrich_pack_chart import absolute_events,validate_export
from enrich_pack_stems import policy_signature,verify_alignment
from generate_charts_batch import decode_stereo,mono
from revise_chart_difficulty import extract,tempo_map
from revise_pack_keyboard import track_chunks


def revise(song):
    report=json.loads((song/'enrichment-report.json').read_text())
    if digest(song/'notes.mid')!=report['notes_sha256']:raise ValueError('Chart modified since enrichment')
    if digest(song/'song.ogg')!=report['pack_audio_sha256']:raise ValueError('Audio changed')
    marker=song/'drum-revision.json'
    if marker.exists():
        previous=json.loads(marker.read_text())
        if previous['profile']==PROFILE and previous['implementation_sha256']==digest(Path(__file__).with_name('drum_transient_refinement.py')):
            if previous['notes_sha256']==report['notes_sha256']:return {'status':'skipped_complete','folder':str(song)}
    source=Path(report['wav_analysis']);analysis=json.loads((source/'analysis.json').read_text())
    wav=Path(analysis['sources']['drums'])
    if digest(wav)!=report['source_hashes']['drums']:raise ValueError('Drum WAV changed')
    raw=json.loads((source/'drums.analysis.json').read_text())
    midi=mido.MidiFile(song/'notes.mid');seconds,ticks,_=tempo_map(midi)
    index=next(i for i,t in enumerate(midi.tracks) if t.name=='PART DRUMS')
    before=extract(midi.tracks[index],set(range(72,77)),lambda n:n-72,seconds)
    backup_root=Path('chart-backups/drum-revisions').resolve();backup_root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.drums-',dir=backup_root) as tmp:
        work=Path(tmp);audio=mono(decode_stereo(wav,work/'drums.f32'))
        mix=mono(decode_stereo(song/'song.ogg',work/'mix.f32'))
        alignment=verify_alignment(mix,{'drums':audio})
        refined,packet_report=refine_packets(raw,audio)
        beat=analysis['beat_analysis'];bpm=beat.get('wav_periodicity',beat)['bpm']
        notes,drum_report=moderate_drums(refined['events'],bpm)
        scale=report['alignment']['scale'];shift=report['alignment']['offset_seconds']
        notes=[[a*scale+shift,b*scale+shift,n] for a,b,n in notes if a*scale+shift<len(mix)/22050-.01]
        messages=list(absolute_events(midi.tracks[index]));end_tick=messages[-1][0]
        kept=[(t,m) for t,m in messages if m.type not in ('track_name','end_of_track') and not (m.type in ('note_on','note_off') and 72<=m.note<=76)]
        for start,stop,lane in notes:
            a=ticks(start);b=max(a+1,ticks(stop));kept.extend([(a,mido.Message('note_on',note=72+lane,velocity=100)),(b,mido.Message('note_off',note=72+lane))])
        midi.tracks[index]=make_track('PART DRUMS',kept,end_tick)
        staging=work/'song';shutil.copytree(song,staging);midi.save(staging/'notes.mid')
        old_chunks=track_chunks(song/'notes.mid');new_chunks=track_chunks(staging/'notes.mid')
        assert len(old_chunks)==len(new_chunks)
        assert all(a==b for i,(a,b) in enumerate(zip(old_chunks,new_chunks)) if i!=index),'Non-drum track changed'
        validation=validate_export(staging/'notes.mid',report['guitar'],{'drums':notes},report['alignment'])
        for p in song.iterdir():
            if p.is_file() and p.name not in ('notes.mid','enrichment-report.json'):
                assert digest(p)==digest(staging/p.name),'Another song file changed'
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');archive=backup_root/(song.name+'-'+stamp)
        revision={'profile':PROFILE,'implementation_sha256':digest(Path(__file__).with_name('drum_transient_refinement.py')),
            'before_notes':len(before),'before_lane_counts':__import__('collections').Counter(n[2] for n in before),
            'after':drum_report,'packet_analysis':packet_report,'alignment':alignment,
            'final_notes':notes,
            'notes_sha256':digest(staging/'notes.mid'),'non_drum_tracks_byte_identical':True,'audio_unchanged':True,
            'previous_backup':str(archive),'validation':validation,'listening_validation':'not run','unity_test':'not run'}
        atomic_json(staging/'drum-revision.json',revision)
        report['notes_sha256']=revision['notes_sha256'];report['drum_revision']=revision;report['drum_easing']=drum_report
        report['policy_signature']=policy_signature();report['validation']['parts']['drums']=validation['parts']['drums']
        report['validation']['drum_revision']=validation
        atomic_json(staging/'enrichment-report.json',report)
        atomic_json(backup_root/('report-'+stamp+'.json'),revision)
        atomic_json(backup_root/('analysis-'+stamp+'.json'),refined)
        song.rename(archive)
        try:staging.rename(song)
        except Exception:archive.rename(song);raise
    return {'status':'generated','folder':str(song),'backup':str(archive),'before':len(before),'after':drum_report,
            'non_drum_tracks_byte_identical':True,'validation':validation}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--song',required=True,type=Path)
    args=parser.parse_args();print(json.dumps(revise(args.song.resolve()),ensure_ascii=False))
