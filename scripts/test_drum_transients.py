"""Fresh drum timbre, moderate selection and single-instrument revision isolation."""
import unittest
import numpy as np

from drum_transient_refinement import packet_identity,moderate_drums,refine_packets,LANES
from wav_chart_analysis import SAMPLE_RATE


class FreshDrumTests(unittest.TestCase):
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
