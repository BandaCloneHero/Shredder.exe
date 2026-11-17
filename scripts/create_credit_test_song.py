from pathlib import Path
import math,struct,wave,random
out=Path(__file__).resolve().parents[1]/'musicas'/'Shredder - Teste de creditos';out.mkdir(parents=True,exist_ok=True)
name='Teste de creditos - Shredder';sr=44100;duration=40;beat=.5
# Original instrumental loop: major/minor triads, bass, melody and a simple drum groove.
chords=[(48,52,55),(45,48,52),(41,45,48),(43,47,50)]
lead=[72,74,76,79,76,74,72,67]
freq=lambda note:440*2**((note-69)/12)
frequencies=[[freq(n) for n in c] for c in chords];bass=[freq(c[0]-12) for c in chords];melody=[freq(n) for n in lead]
rng=random.Random(87)
with wave.open(str(out/'song.wav'),'wb') as f:
 f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr)
 for block in range(duration):
  data=bytearray()
  for i in range(sr):
   t=block+i/sr;active=2<=t<38;v=0.
   if active:
    u=t-2;b=int(u/beat);phase=u%beat;ch=int(u/2)%4
    pad=sum(math.sin(2*math.pi*h*t) for h in frequencies[ch])*.08
    low=math.sin(2*math.pi*bass[ch]*t)*math.exp(-phase*5)*.18
    tune=math.sin(2*math.pi*melody[b%8]*t)*math.exp(-phase*8)*.17
    kick=math.sin(2*math.pi*(48+70*math.exp(-phase*35))*phase)*math.exp(-phase*22)*.20 if b%2==0 else 0
    snare=rng.uniform(-1,1)*math.exp(-phase*35)*.10 if b%2 else 0
    hat=rng.uniform(-1,1)*math.exp(-(u%.25)*100)*.035
    fade=min(1,u,38-t);v=(pad+low+tune+kick+snare+hat)*fade
   data+=struct.pack('<h',round(max(-.95,min(.95,v))*32767))
  f.writeframesraw(data)
def vlq(n):
 r=[n&127];n>>=7
 while n:r.insert(0,(n&127)|128);n>>=7
 return bytes(r)
def track(name,events):
 events=[(0,bytes([255,3,len(name)])+name.encode())]+events
 events.sort(key=lambda e:e[0]);data=bytearray();last=0
 for tick,payload in events:data+=vlq(tick-last)+payload;last=tick
 data+=b'\x00\xff\x2f\x00';return b'MTrk'+struct.pack('>I',len(data))+data
tracks=[track('TEMPO',[(0,b'\xff\x51\x03\x07\xa1\x20'),(0,b'\xff\x58\x04\x04\x02\x18\x08')])]
for part in ['PART GUITAR','PART BASS','PART DRUMS','PART KEYS']:
 events=[]
 for base in [60,72,84,96]:
  for b in range(72):
   tick=1920+b*480;lane=(b%5 if part!='PART DRUMS' else (0 if b%2==0 else 1));note=base+lane
   events.extend([(tick,bytes([144,note,100])),(tick+180,bytes([128,note,0]))])
 tracks.append(track(part,events))
# Also allow Pro Keys without making a separate player slot in the web band.
for difficulty in 'EMHX':
 events=[]
 for b in range(72):
  tick=1920+b*480;note=[48,50,52,53,55,57,59][b%7]
  events.extend([(tick,bytes([144,note,95])),(tick+180,bytes([128,note,0]))])
 tracks.append(track('PART REAL_KEYS_'+difficulty,events))
(out/'notes.mid').write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(tracks),480)+b''.join(tracks))
(out/'song.ini').write_text('[song]\nname = '+name+'\nartist = Shredder.exe\ncharter = Shredder.exe\ngenre = Homologacao\nsong_length = 40000\npreview_start_time = 5000\ndiff_guitar = 1\ndiff_bass = 1\ndiff_drums = 1\ndiff_keys = 1\ndiff_keys_real = 1\n',encoding='utf-8')
(out/'LEIA-ME.md').write_text('''# Teste de créditos — Shredder

Faixa instrumental original de 40 segundos, criada exclusivamente para homologação.
Melodia, acordes, baixo e bateria sintetizados; sem áudio de terceiros.
Tem charts simples nos quatro instrumentos, nas quatro dificuldades, e Pro Keys.
Guitarra/baixo/teclado de cinco botões e bateria têm uma nota por pulso. A grade
segue o pulso, sem pretensão de transcrever cada timbre; não há stems isolados.

Use o modo história, fase 1, com Gepeto. A vitória precisa chegar ao ticket e ser
confirmada por operador oficial. A reserva é de 400: um jogador recebe 400;
quatro com precisão igual recebem 100 cada. Somente a configuração do servidor
pode habilitar a transferência real. Gerar uma build não configura credenciais.
A faixa não é uma das músicas definitivas da campanha; pode ser retirada depois.
''',encoding='utf-8')
print('Faixa original de teste criada:',out.name,'—',duration,'s,',len(tracks),'trilhas MIDI.')
