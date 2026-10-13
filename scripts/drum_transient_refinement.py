"""Separate fresh percussion attacks from ringing bodies in a separated WAV."""
import collections
import numpy as np

from wav_chart_analysis import DT, SAMPLE_RATE, stft

PROFILE='fresh-drum-packets-v1'
LANES={'kick':0,'hihat':1,'snare':2,'tom':3,'crash':4}


def packet_identity(f,energy,tail_ratio):
    """Classify NEW energy, using a multi-bin body peak instead of one FFT bin."""
    total=max(float(energy.sum()),1e-12)
    def fraction(lo,hi):return float(energy[(f>=lo)&(f<hi)].sum()/total)
    low=fraction(35,160);body=fraction(160,650);middle=fraction(650,3500);bright=fraction(3500,10000)
    band=(f>=120)&(f<650);indices=np.flatnonzero(band)
    peak=int(indices[np.argmax(energy[band])])
    concentration=float(energy[max(0,peak-2):peak+3].sum()/max(float(energy[band].sum()),1e-12))
    low_indices=np.flatnonzero(f<650)
    if low>.48 and f[low_indices[np.argmax(energy[low_indices])]]<160:
        kind='kick'
    elif bright>.32 and bright>body*1.3:
        kind='crash' if tail_ratio>.55 else 'hihat'
    elif body+low>.48 and concentration>.60 and middle+bright<.22:
        kind='tom'
    elif body+middle>.35 and middle+bright>.22:
        kind='snare'
    else:kind='unknown'
    return kind,{'low':low,'body':body,'middle':middle,'bright':bright,
                 'body_peak_concentration':concentration,'body_peak_hz':float(f[peak]),'tail_ratio':tail_ratio}


def refine_packets(analysis,audio):
    f,times,mag=stft(audio,2048);power=mag**2
    candidates=[]
    for start in analysis['diagnostics']['independent_onsets']:
        frame=round(start/DT)
        if frame+5>=len(times):continue
        after=np.mean(power[:,frame:frame+5],axis=1)
        before=np.median(power[:,max(0,frame-8):max(1,frame-3)],axis=1)
        fresh=np.maximum(after-before,0)
        ratio=float(fresh.sum()/max(float(after.sum()),1e-12))
        if ratio<.16:continue
        high=f>=3500
        early=float(fresh[high].sum())
        later=np.mean(power[:,frame+8:min(frame+14,len(times))],axis=1)
        tail=float(np.maximum(later-before,0)[high].sum()/max(early,1e-12))
        next_attack=any(start+.065<other<start+.17 for other in analysis['diagnostics']['independent_onsets'])
        kind,features=packet_identity(f,fresh,0. if next_attack else tail)
        candidates.append({'start':float(start),'kind':kind,'features':features,'energy':float(fresh.sum()),
                           'fresh_ratio':ratio,'fresh':fresh})
    if not candidates:return {**analysis,'events':[]},{'profile':PROFILE,'warning':'No fresh packets'}
    reference=max(float(np.quantile([c['energy'] for c in candidates],.90)),1e-12)
    # Preserve evidence of a simultaneous foot stroke independently of the pad.
    kick_reference=max(float(np.quantile([float(c['fresh'][(f>=35)&(f<160)].sum()) for c in candidates],.90)),1e-12)
    bright_reference=max(float(np.quantile([float(c['fresh'][f>=3500].sum()) for c in candidates],.90)),1e-12)
    events=[];packets=[]
    for c in candidates:
        start=c['start'];kind=c['kind'];low=float(c['fresh'][(f>=35)&(f<160)].sum())
        kick_evidence=[e for e in analysis['events'] if 0 in e['pitches'] and abs(e['start']-start)<.040]
        kinds=[]
        if kind=='kick' or (kick_evidence and low>kick_reference*.28 and c['features']['low']>.16):kinds.append('kick')
        if kind not in ('unknown','kick'):kinds.append(kind)
        if kind=='kick':
            # A loud foot stroke must not mask an independently fresh cymbal.
            bright=float(c['fresh'][f>=3500].sum())
            body=float(c['fresh'][(f>=160)&(f<650)].sum())
            if bright>bright_reference*.20 and bright>body*1.3:
                kinds.append('crash' if c['features']['tail_ratio']>.55 else 'hihat')
        if c['energy']<reference*.018:continue
        confidence=min(.98,.50+c['fresh_ratio']*.40)
        for label in kinds:
            events.append({'start':start,'end':min(start+.035,len(audio)/SAMPLE_RATE-.005),
                'pitches':[LANES[label]],'kind':label,'confidence':confidence,
                'strength':c['energy']/reference,'fresh_packet':True})
        packets.append({k:v for k,v in c.items() if k!='fresh'})
    # Correlated novelty peaks of the same packet are not extra strikes.
    unique=[]
    for e in sorted(events,key=lambda e:e['strength'],reverse=True):
        if not any(e['kind']==old['kind'] and abs(e['start']-old['start'])<.080 for old in unique):unique.append(e)
    unique.sort(key=lambda e:(e['start'],e['pitches']))
    report={'profile':PROFILE,'method':'subtract preceding spectrum; multi-bin tonal body; fresh broadband/treble attacks',
        'before_class_counts':dict(collections.Counter(e['kind'] for e in analysis['events'])),
        'after_class_counts':dict(collections.Counter(e['kind'] for e in unique)),
        'packet_count':len(packets),'packets':packets,'artificial_hits':0,
        'limitation':'Instrument identity remains a spectral estimate, not a verified drum sheet.'}
    result={**analysis,'events':unique,'diagnostics':{**analysis['diagnostics'],'fresh_packet_refinement':report}}
    return result,report


def moderate_drums(events,bpm):
    """Keep accented attacks, without always preferring snare to every other pad."""
    gap=max(.16,min(.22,60/max(60,bpm)*.42));groups=[]
    for e in events:
        if groups and e['start']-groups[-1][0]['start']<=.035:groups[-1].append(e)
        else:groups.append([e])
    selected=[]
    def priority(group):
        # Strong WAV transients determine selection; no fixed snare bonus.
        return max(e['strength'] for e in group)+(.12 if any(e['kind']=='kick' for e in group) else 0)
    for group in sorted(groups,key=lambda g:(-priority(g),g[0]['start'])):
        if all(abs(group[0]['start']-old[0]['start'])>=gap for old in selected):selected.append(group)
    notes=[]
    for group in sorted(selected,key=lambda g:g[0]['start']):
        kick=next((e for e in group if e['kind']=='kick'),None)
        pad=max((e for e in group if e['kind']!='kick'),key=lambda e:e['strength'],default=None)
        for e in (kick,pad):
            if e:notes.append([e['start'],e['end'],e['pitches'][0]])
    return sorted(notes),{'before_notes':len(events),'after_notes':len(notes),'minimum_group_gap_seconds':gap,
        'max_hand_strokes':1,'max_hits_including_kick':2,'artificial_hits':0,
        'lane_counts':dict(collections.Counter(n[2] for n in notes)),'selection':'fresh transient strength; no snare priority'}
