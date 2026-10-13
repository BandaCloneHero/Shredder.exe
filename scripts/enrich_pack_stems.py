"""Add three WAV instruments to a Lisarb guitar pack using approved Exagerado rules."""
import argparse
import configparser
import datetime
import hashlib
import json
from pathlib import Path
import shutil
import tempfile

import mido
import numpy as np
from scipy import signal

from chart_library import atomic_json, digest
from chart_difficulty_profile import apply_realistic
from chart_playability import refine_groove
from create_mp3_test_chart import make_track
from enrich_pack_chart import convert_guitar, easier_drums, validate_export
from generate_charts_batch import analysis_fingerprint, decode_stereo, mono
from revise_chart_difficulty import tempo_map
from revise_pack_keyboard import balanced_keyboard, verify_keyboard, PROFILE as KEY_PROFILE
from wav_chart_analysis import analyze, beat_analysis, difficulty_charts, musical_checks, SAMPLE_RATE
from drum_transient_refinement import refine_packets, moderate_drums

PROFILE='exagerado-approved-v1'
STATE=Path('chart-backups/pack-stems').resolve()


def identify_stems(folder):
    aliases={'bass':('bass','baixo'), 'drums':('drums','drum','bateria'),
             'keys':('keys','piano','keyboard','teclado')}
    files=list(folder.glob('*.wav'));result={}
    for instrument,names in aliases.items():
        candidates=[p for p in files if p.stem.lower().split('_')[0] in names or p.stem.lower() in names]
        if len(candidates)!=1:raise ValueError(f'{instrument}: expected one WAV, found {len(candidates)}')
        result[instrument]=candidates[0].resolve()
    return result


def verify_alignment(mix,stems):
    """Verify zero origin independently using waveform correlation in five regions.

    Separated stems are not a complete mix: low correlations are recorded but
    cannot establish alignment. Refuse recordings needing shifts or time warp.
    """
    duration=len(mix)/SAMPLE_RATE;reports={}
    if duration<30:raise ValueError('At least 30 seconds required for distributed alignment probes')
    for instrument,y in stems.items():
        if abs(len(y)-len(mix))/SAMPLE_RATE>.020:raise ValueError('Stem/pack durations differ; align explicitly first')
        probes=[]
        for start in np.linspace(20,max(20,duration-46),5):
            a=mix[round(start*SAMPLE_RATE):round((start+8)*SAMPLE_RATE)].astype(np.float64)
            b=y[round(start*SAMPLE_RATE):round((start+8)*SAMPLE_RATE)].astype(np.float64)
            norm=np.linalg.norm(a)*np.linalg.norm(b)
            if norm<1e-10:continue
            correlation=signal.correlate(a,b,method='fft');lags=signal.correlation_lags(len(a),len(b))
            allowed=abs(lags)<SAMPLE_RATE
            index=int(np.flatnonzero(allowed)[np.argmax(correlation[allowed])]);lag=int(lags[index])
            left=max(0,lag);right=max(0,-lag);n=min(len(a)-left,len(b)-right)
            score=float(np.dot(a[left:left+n],b[right:right+n])/
                        max(np.linalg.norm(a[left:left+n])*np.linalg.norm(b[right:right+n]),1e-12))
            probes.append({'start_seconds':float(start),'lag_seconds':lag/SAMPLE_RATE,'correlation':score,
                           'credible':score>=.12})
        credible=[p for p in probes if p['credible']]
        if len(credible)<3 or any(abs(p['lag_seconds'])>.003 for p in credible):
            raise ValueError(f'{instrument}: insufficient consistent alignment evidence: {probes}')
        reports[instrument]={'probes':probes,'duration_seconds':len(y)/SAMPLE_RATE,
                             'credible_probes':len(credible),'low_evidence_probes':len(probes)-len(credible)}
    return {'scale':1.,'offset_seconds':0.,'pack_duration':duration,'method':'independent stem waveform lag probes',
            'instruments':reports,'limitation':'Low-evidence regions do not verify alignment; no listening validation.'}


def cached_analysis(audio,instrument,source_hash,cache):
    key=hashlib.sha256((source_hash+analysis_fingerprint()+instrument).encode()).hexdigest()
    path=cache/(key+'.json')
    if path.exists():
        wrapper=json.loads(path.read_text());value=wrapper['analysis']
        checksum=hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
        if wrapper['key']==key and wrapper['checksum']==checksum:return value,True
    value=analyze(audio,instrument)
    atomic_json(path,{'key':key,'checksum':hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest(),'analysis':value})
    return value,False


def policy_signature():
    names=('enrich_pack_stems.py','enrich_pack_chart.py','revise_pack_keyboard.py',
           'chart_playability.py','chart_difficulty_profile.py','wav_chart_analysis.py','drum_transient_refinement.py')
    return hashlib.sha256(''.join(digest(Path(__file__).parent/n) for n in names).encode()).hexdigest()


def enrich(pack,source):
    stems=identify_stems(source);hashes={i:digest(p) for i,p in stems.items()}
    marker=pack/'enrichment-report.json';signature=policy_signature()
    if marker.exists():
        old=json.loads(marker.read_text())
        if (old.get('profile')==PROFILE and old.get('policy_signature')==signature and old['source_hashes']==hashes
            and old['notes_sha256']==digest(pack/'notes.mid') and old['pack_audio_sha256']==digest(pack/'song.ogg')):
            return {'status':'skipped_complete','folder':str(pack)}
        raise ValueError('Existing enrichment differs; keep it and prepare an explicit backed-up revision')
    if (pack/'notes.mid').exists():raise ValueError('Existing MIDI must be reviewed before enrichment')
    midi,guitar=convert_guitar(pack/'notes.chart');seconds,ticks,_=tempo_map(midi)
    STATE.mkdir(parents=True,exist_ok=True);cache=STATE/'.analysis-cache';cache.mkdir(exist_ok=True)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    # Analysis identity includes absolute source path so equal song names cannot collide.
    identity=hashlib.sha256(str(source.resolve()).encode()).hexdigest()[:12]
    analysis_dir=STATE/(source.name+'-'+identity+'-'+stamp);analysis_dir.mkdir()
    with tempfile.TemporaryDirectory(prefix='.build-',dir=STATE) as tmp:
        work=Path(tmp);mix=mono(decode_stereo(pack/'song.ogg',work/'mix.f32'))
        audio={i:mono(decode_stereo(p,work/(i+'.f32'))) for i,p in stems.items()}
        timing=verify_alignment(mix,audio);analyses={};cache_hits={}
        raw_beat=beat_analysis(audio['drums'])
        # The pack's tempo map prevents generated accompaniment accumulating drift.
        tempo_messages=[m for m in midi.tracks[0] if m.type=='set_tempo']
        bpm=60e6/tempo_messages[0].tempo
        beat_ticks=np.arange(0,ticks(timing['pack_duration']),midi.ticks_per_beat)
        beat={**raw_beat,'bpm':bpm,'beats':[seconds(int(t)) for t in beat_ticks],
              'grid_source':'original pack tempo map','wav_periodicity':raw_beat}
        for instrument in ('bass','drums','keys'):
            print('Analyzing '+instrument,flush=True)
            analyses[instrument],cache_hits[instrument]=cached_analysis(audio[instrument],instrument,hashes[instrument],cache)
        analyses['drums']=refine_groove(analyses['drums'],audio['drums'],beat,standard_pulses=False)
        for event in analyses['drums']['events']:
            event['pitches']=[{0:0,1:2,2:1,3:3,4:4}[p] for p in event['pitches']]
        analyses['drums'],packet_report=refine_packets(analyses['drums'],audio['drums'])
        pools={i:difficulty_charts(a,beat) for i,a in analyses.items()}
        charts,_=apply_realistic(pools)
        added={i:charts[i]['Medium'] for i in charts}
        added['drums'],drum_report=moderate_drums(analyses['drums']['events'],raw_beat['bpm'])
        drum_report['packet_refinement']=packet_report
        # Pack guitar frets supply rhythm only; bass WAV supplies actual harmony.
        analyses['guitar']={'events':[{'start':seconds(t),'end':seconds(t+max(1,length)),
            'pitches':[],'confidence':1.,'strength':1.} for t,length,lane in guitar['Expert']['gems']]}
        added['keys'],keyboard=balanced_keyboard(added['keys'],analyses,beat,mix)
        checks={i:musical_checks(analyses[i],charts[i],audio[i],fidelity_difficulty='Medium')
                for i in ('bass','drums','keys')}
        # These diagnostics describe the detection pool, not just MIDI validity.
        for i in ('bass','drums','keys'):atomic_json(analysis_dir/(i+'.analysis.json'),analyses[i])
        atomic_json(analysis_dir/'analysis.json',{'sources':{i:str(p) for i,p in stems.items()},'source_hashes':hashes,
            'source_midi_used':False,'profile':PROFILE,'beat_analysis':beat,'alignment':timing,
            'charts':charts,'final_charts':added,'musical_checks_detection_pool':checks,'cache_hits':cache_hits})
        end_tick=ticks(timing['pack_duration']);cropped={}
        for instrument,notes in added.items():
            cropped[instrument]=sum(a>=timing['pack_duration']-.01 for a,b,n in notes)
            notes[:]=[[a,min(b,timing['pack_duration']-.005),n] for a,b,n in notes if a<timing['pack_duration']-.01]
            if any(a<0 or b<=a for a,b,n in notes):raise ValueError('Invalid chart duration')
            events=[]
            if instrument=='keys':events=[(0,mido.Message('note_on',note=0,velocity=100)),(end_tick,mido.Message('note_off',note=0))]
            for start,stop,lane in notes:
                note=lane if instrument=='keys' else 72+lane;a=ticks(start);b=max(a+1,ticks(stop))
                events.extend([(a,mido.Message('note_on',note=note,velocity=100)),(b,mido.Message('note_off',note=note))])
            midi.tracks.append(make_track({'bass':'PART BASS','drums':'PART DRUMS','keys':'PART REAL_KEYS_M'}[instrument],events,end_tick))
        staging=work/'song';shutil.copytree(pack,staging);midi.save(staging/'notes.mid')
        validation=validate_export(staging/'notes.mid',guitar,added,timing)
        rendered=mido.MidiFile(staging/'notes.mid')
        validation['keyboard']=verify_keyboard(next(t for t in rendered.tracks if t.name=='PART REAL_KEYS_M'),seconds,added['keys'])
        ini=configparser.ConfigParser(interpolation=None,strict=False);ini.read(pack/'song.ini',encoding='utf-8-sig')
        section=next(s for s in ini.sections() if s.lower()=='song')
        for k,v in {'diff_bass':'3','diff_drums':'1','diff_keys_real':'3','five_lane_drums':'False','pro_drums':'False'}.items():ini.set(section,k,v)
        ini.set(section,'charter',ini.get(section,'charter',fallback='')+' + Shredder (baixo, bateria e teclado)')
        with (staging/'song.ini').open('w',encoding='utf-8') as f:ini.write(f)
        for p in pack.iterdir():
            if p.is_file() and p.name not in ('song.ini','notes.chart'):assert digest(p)==digest(staging/p.name)
        (staging/'notes.chart').unlink() # Original remains in the complete backup.
        archive=STATE/(pack.name+'-original-'+stamp)
        report={'profile':PROFILE,'reference_song':'Cazuza - Exagerado (Lisarb; approved balanced keyboard v2)',
            'policy_signature':signature,'source_hashes':hashes,'wav_analysis':str(analysis_dir),
            'source_midi_used_for_added_notes':False,'pack_audio_sha256':digest(pack/'song.ogg'),
            'notes_sha256':digest(staging/'notes.mid'),'original_chart_sha256':digest(pack/'notes.chart'),
            'audio_unchanged':True,'guitar':guitar,'alignment':timing,'drum_easing':drum_report,
            'keyboard_revision':keyboard,'validation':validation,'previous_backup':str(archive),
            'tail_attacks_omitted_beyond_pack_audio':cropped,
            'source_musical_warnings':{i:checks[i]['warnings'] for i in checks},'musical_correctness_certified':False}
        atomic_json(staging/'enrichment-report.json',report)
        atomic_json(analysis_dir/'validation.json',report)
        pack.rename(archive)
        try:staging.rename(pack)
        except Exception:archive.rename(pack);raise
    return {'status':'generated','folder':str(pack),'backup':str(archive),'drums':drum_report,
            'keyboard':{k:v for k,v in keyboard.items() if k!='accompaniment'},'validation':validation}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack-song',required=True,type=Path)
    parser.add_argument('--stems',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(enrich(args.pack_song.resolve(),args.stems.resolve()),ensure_ascii=False))
