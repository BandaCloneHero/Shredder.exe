"""Fresh drum timbre, moderate selection and single-instrument revision isolation."""
import unittest
import numpy as np

from drum_transient_refinement import packet_identity,moderate_drums,refine_packets,LANES
from wav_chart_analysis import SAMPLE_RATE,difficulty_charts


class FreshDrumTests(unittest.TestCase):
    def test_tuned_snare_body_requires_dominant_learned_family_and_fresh_rattle(self):
        t=np.arange(SAMPLE_RATE)/SAMPLE_RATE;start=.2;u=np.maximum(t-start,0)
        y=(np.sin(2*np.pi*215*u)+.32*np.sin(2*np.pi*1400*u)+.32*np.sin(2*np.pi*6000*u))*np.exp(-u/.10)*(t>=start)
        source={'instrument':'drums','duration':1.,'events':[],
                'diagnostics':{'independent_onsets':[start]}}
        without,_=refine_packets(source,y)
        self.assertTrue(any(e['kind']=='tom' for e in without['events']))
        source['diagnostics']['learned_templates']=[
            {'class':'snare','confidence':.9,'examples':100,'dominant_frequency':215.},
            {'class':'tom','confidence':.9,'examples':1,'dominant_frequency':215.}]
        supported,_=refine_packets(source,y)
        self.assertTrue(any(e['kind']=='snare' for e in supported['events']))
        source['diagnostics']['learned_templates'][1]['examples']=100
        ambiguous,_=refine_packets(source,y)
        self.assertTrue(any(e['kind']=='tom' for e in ambiguous['events']))

    def test_quiet_snare_rattle_requires_this_recordings_learned_body_frequency(self):
        t=np.arange(SAMPLE_RATE)/SAMPLE_RATE;start=.2;u=np.maximum(t-start,0)
        y=(np.sin(2*np.pi*226*u)+.75*np.sin(2*np.pi*315*u)+.75*np.sin(2*np.pi*440*u)
           +.35*np.sin(2*np.pi*1400*u)+.35*np.sin(2*np.pi*6000*u))*np.exp(-u/.10)*(t>=start)
        source={'instrument':'drums','duration':1.,'events':[],
                'diagnostics':{'independent_onsets':[start]}}
        without,_=refine_packets(source,y)
        self.assertFalse(any(e['kind']=='snare' for e in without['events']))
        source['diagnostics']['learned_templates']=[{'class':'snare','confidence':.9,'examples':20,'dominant_frequency':226.}]
        learned,_=refine_packets(source,y)
        self.assertTrue(any(e['kind']=='snare' for e in learned['events']))

    def test_moderate_foot_does_not_require_fast_repeated_kicks(self):
        events=[{'start':i*.18,'end':i*.18+.035,'kind':'kick','strength':1.,'pitches':[0]} for i in range(20)]
        notes,report=moderate_drums(events,160)
        self.assertLess(len(notes),len(events))
        self.assertTrue(all(b[0]-a[0]>=.26 for a,b in zip(notes,notes[1:])))
        self.assertTrue(all(n[0] in [e['start'] for e in events] for n in notes))

    def test_quiet_fresh_cymbal_under_strong_tonal_body_survives_subtraction(self):
        t=np.arange(SAMPLE_RATE*2)/SAMPLE_RATE;start=.5;u=np.maximum(t-start,0)
        active=t>=start
        body=np.sin(2*np.pi*215*u)*np.exp(-u/.10)*active
        hat=.08*np.sin(2*np.pi*6000*u)*np.exp(-u/.025)*active
        event={'start':start,'end':start+.035,'pitches':[1],'kind':'hihat','strength':1.,'confidence':.9}
        source={'instrument':'drums','duration':2.,'events':[event],
                'diagnostics':{'independent_onsets':[start]}}
        result,report=refine_packets(source,body+hat)
        cymbals=[e for e in result['events'] if e['kind'] in ('hihat','crash')]
        self.assertEqual(len(cymbals),1)
        self.assertEqual(cymbals[0]['start'],start)
        self.assertEqual(cymbals[0]['kind'],'hihat')
        self.assertEqual(report['artificial_hits'],0)

    def test_refined_events_are_compatible_with_full_chart_generator(self):
        t=np.arange(SAMPLE_RATE)/SAMPLE_RATE
        y=np.zeros(len(t));start=.2;active=t>=start
        y[active]=np.sin(2*np.pi*65*(t[active]-start))*np.exp(-(t[active]-start)/.05)
        analysis={'instrument':'drums','duration':1.,'events':[],
                  'diagnostics':{'independent_onsets':[start]}}
        result,_=refine_packets(analysis,y)
        self.assertTrue(result['events'])
        charts=difficulty_charts(result,{'bpm':120.,'beats':[0,.5]})
        self.assertTrue(charts['Expert'])

    def test_wide_fft_peak_of_tonal_tom_is_not_broadband_snare(self):
        f=np.arange(0,11025,22050/2048);energy=np.zeros(len(f))
        center=np.argmin(abs(f-215));energy[center-2:center+3]=[.2,.6,1,.6,.2]
        kind,features=packet_identity(f,energy,.2)
        self.assertEqual(kind,'tom');self.assertGreater(features['body_peak_concentration'],.9)

    def test_snare_hat_crash_and_kick_have_distinct_fresh_spectra(self):
        f=np.arange(0,11025,22050/2048)
        hat=np.where(f>4000,1.,0.)
        self.assertEqual(packet_identity(f,hat,.2)[0],'hihat')
        self.assertEqual(packet_identity(f,hat,.8)[0],'crash')
        kick=np.exp(-((f-65)/20)**2)
        self.assertEqual(packet_identity(f,kick,.2)[0],'kick')
        snare=np.where((f>160)&(f<8000),1.,0.)
        snare[(f>160)&(f<650)]*=8
        self.assertEqual(packet_identity(f,snare,.2)[0],'snare')

    def test_close_strong_hat_not_replaced_by_weak_snare_and_no_third_hit(self):
        def event(t,kind,strength):return {'start':t,'end':t+.035,'kind':kind,'strength':strength,'pitches':[LANES[kind]]}
        events=[event(1.,'snare',.1),event(1.1,'hihat',1.),event(2.,'kick',1.),event(2.,'tom',.8),event(2.,'snare',.2)]
        notes,report=moderate_drums(events,160)
        self.assertIn([1.1,1.135,1],notes)
        self.assertNotIn([1.,1.035,2],notes)
        self.assertEqual({n[2] for n in notes if n[0]==2.},{0,3})
        self.assertEqual(report['artificial_hits'],0)

    def test_no_new_attacks_without_independent_wav_onsets(self):
        analysis={'events':[],'diagnostics':{'independent_onsets':[]}}
        result,report=refine_packets(analysis,np.zeros(SAMPLE_RATE))
        self.assertEqual(result['events'],[])


if __name__=='__main__':unittest.main(verbosity=2)
