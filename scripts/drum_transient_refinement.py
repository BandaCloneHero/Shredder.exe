"""Separate fresh percussion attacks from ringing bodies in a separated WAV."""
import collections
import numpy as np

from wav_chart_analysis import DT, SAMPLE_RATE, stft

PROFILE='fresh-drum-packets-v4'
LANES={'kick':0,'hihat':1,'snare':2,'tom':3,'crash':4}


def packet_identity(f,energy,tail_ratio):
    """Classify NEW energy, using a multi-bin body peak instead of one FFT bin."""
    total=max(float(energy.sum()),1e-12)
    def fraction(lo,hi):return float(energy[(f>=lo)&(f<hi)].sum()/total)
    low=fraction(35,160);body=fraction(160,650);middle=fraction(650,3500);bright=fraction(3500,10000)
    band=(f>=120)&(f<650);indices=np.flatnonzero(band)
    peak=int(indices[np.argmax(energy[band])])
    concentration=float(energy[max(0,peak-2):peak+3][band[max(0,peak-2):peak+3]].sum()/max(float(energy[band].sum()),1e-12))
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
    snare_bodies=[e['dominant_frequency'] for e in analysis['diagnostics'].get('learned_templates',[])
                  if e['class']=='snare' and e['confidence']>=.65 and e['examples']>=8 and 160<=e['dominant_frequency']<=650]
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
        # Some recordings have a loud tuned snare body and comparatively quiet
        # rattle. Rescue ambiguous diffuse bodies only near a snare frequency
        # independently learned by this recording's attack clustering.
        if (kind=='unknown' and features['body']>.40 and features['low']<.30
            and features['middle']+features['bright']>.075 and features['body_peak_concentration']<.60
            and any(abs(np.log2(features['body_peak_hz']/hz))<.08 for hz in snare_bodies)):
            kind='snare'
        if kind=='tom' and features['middle']+features['bright']>.11 and features['low']<.30:
            # A low tuned snare can resemble a tom in the residual spectrum.
            # Require dominant learned snare evidence AND fresh rattle; tonal
            # bodies or equally represented tom families keep their identity.
            votes={'snare':0.,'tom':0.}
            for template in analysis['diagnostics'].get('learned_templates',[]):
                label=template['class'];hz=template['dominant_frequency']
                if label in votes and hz>0 and abs(np.log2(features['body_peak_hz']/hz))<.08:
                    votes[label]+=template['examples']*template['confidence']
            if votes['snare']>=20 and votes['snare']>4*max(votes['tom'],1.):kind='snare'
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
                'strength':c['energy']/reference})
        packets.append({k:v for k,v in c.items() if k!='fresh'})
    # A quiet cymbal can disappear in total-energy subtraction under a louder
    # body. Recover only independently detected, newly rising high-band hits.
    high_power=power[f>=3500].sum(axis=0)
    high_reference=max(float(np.quantile(high_power,.90)),1e-12)
    recovered=[]
    for original in analysis['events']:
        if original['kind'] not in ('hihat','crash') or original['confidence']<.45:continue
        start=original['start'];frame=round(start/DT)
        if frame+5>=len(times):continue
        peak=float(high_power[frame:frame+5].max(initial=0))
        before=float(np.median(high_power[max(0,frame-8):max(1,frame-3)]))
        fresh=max(0.,peak-before)
        if fresh<high_reference*.12 or fresh/max(peak,1e-12)<.35:continue
        if any(e['kind'] in ('hihat','crash') and abs(e['start']-start)<.080 for e in events):continue
        tail=float(np.mean(high_power[frame+16:min(frame+28,len(times))])) if frame+28<len(times) else 0.
        following=any(start+.06<e['start']<start+.28 and e['kind'] in ('hihat','crash') for e in analysis['events'])
        kind='crash' if not following and max(0.,tail-before)/max(fresh,1e-12)>.45 and fresh>high_reference*1.25 else 'hihat'
        events.append({'start':start,'end':min(start+.035,len(audio)/SAMPLE_RATE-.005),
            'pitches':[LANES[kind]],'kind':kind,'confidence':max(.5,original['confidence']),
            'strength':float(min(1.5,fresh/high_reference))})
        recovered.append({'time':start,'kind':kind,'fresh_high_ratio':fresh/max(peak,1e-12)})
    # Correlated novelty peaks of the same packet are not extra strikes.
    unique=[]
    for e in sorted(events,key=lambda e:e['strength'],reverse=True):
        if not any(e['kind']==old['kind'] and abs(e['start']-old['start'])<.080 for old in unique):unique.append(e)
    unique.sort(key=lambda e:(e['start'],e['pitches']))
    report={'profile':PROFILE,'method':'subtract preceding spectrum; multi-bin tonal body; fresh broadband/treble attacks',
        'before_class_counts':dict(collections.Counter(e['kind'] for e in analysis['events'])),
        'after_class_counts':dict(collections.Counter(e['kind'] for e in unique)),
        'packet_count':len(packets),'packets':packets,'artificial_hits':0,
        'recovered_cymbal_attacks':recovered,
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
    foot_gap=max(.26,min(.34,60/max(60,bpm)*.70))
    kept_feet=[]
    strength={e['start']:e['strength'] for e in events if e['kind']=='kick'}
    for note in sorted((n for n in notes if n[2]==0),key=lambda n:(-strength[n[0]],n[0])):
        if all(abs(note[0]-old[0])>=foot_gap for old in kept_feet):kept_feet.append(note)
    removed_feet=sum(n[2]==0 for n in notes)-len(kept_feet)
    notes=[n for n in notes if n[2]!=0]+kept_feet
    return sorted(notes),{'before_notes':len(events),'after_notes':len(notes),'minimum_group_gap_seconds':gap,
        'max_hand_strokes':1,'max_hits_including_kick':2,'artificial_hits':0,
        'minimum_kick_gap_seconds':foot_gap,'rapid_kicks_removed':removed_feet,
        'lane_counts':dict(collections.Counter(n[2] for n in notes)),'selection':'fresh transient strength; no snare priority'}
