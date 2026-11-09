import json, subprocess, os
D = os.path.dirname(os.path.abspath(__file__))
os.chdir(D)
M = json.load(open('marks.json')); L = json.load(open('layout.json'))
FPS = 30
def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: print(r.stderr[-1500:]); raise SystemExit(1)

def card(img, dur, out, zoom=True):
    n = round(dur * FPS)
    vf = (f"zoompan=z='1+0.035*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1080x1920:fps={FPS}" if zoom else f"fps={FPS}")
    run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', img, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
         '-vf', vf + ',format=yuv420p', '-t', f'{n/FPS:.3f}', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-shortest', out])

def scene(clip, t0, t1, cap, out):
    dur = round((t1 - t0) * FPS) / FPS
    fc = (f"[1:v]trim=start={t0:.3f}:end={t1:.3f},setpts=PTS-STARTPTS,fps={FPS},crop=390:844:0:0,scale={L['w']}:{L['h']}:flags=lanczos,eq=contrast=1.04:saturation=1.06,format=rgba[ph];"
          f"[2:v]format=gray,crop={L['w']}:{L['h']}:{L['x']}:{L['y']}[m];[ph][m]alphamerge[phm];"
          f"[0:v][phm]overlay={L['x']}:{L['y']}:shortest=0[v1];"
          f"[3:v]format=rgba,fade=t=in:st=0:d=0.25:alpha=1[c];[v1][c]overlay=0:0,format=yuv420p[v]")
    run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-t', f'{dur:.3f}', '-i', 'bg.png', '-i', f'clips/{clip}.webm', '-loop', '1', '-t', f'{dur:.3f}', '-i', 'mask.png',
         '-loop', '1', '-t', f'{dur:.3f}', '-i', cap, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
         '-filter_complex', fc, '-map', '[v]', '-map', '4:a', '-t', f'{dur:.3f}', '-r', str(FPS), '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', out])

os.makedirs('seg', exist_ok=True)
segs = []
card('hook.png', 2.2, 'seg/00.mp4'); segs.append('seg/00.mp4')
c = M['calc']; scene('calc', c['start'] - 0.2, c['end'] - 0.3, 'cap-calc.png', 'seg/01.mp4'); segs.append('seg/01.mp4')
c = M['copy']; scene('copy', c['start'] - 0.1, c['end'], 'cap-copy.png', 'seg/02.mp4'); segs.append('seg/02.mp4')
c = M['hunter']; scene('hunter', c['start'], c['submit'] + 0.9, 'cap-hunt1.png', 'seg/03.mp4'); segs.append('seg/03.mp4')
scene('hunter', c['result'] - 0.2, c['end'] - 0.2, 'cap-hunt2.png', 'seg/04.mp4'); segs.append('seg/04.mp4')
c = M['picks']; scene('picks', c['start'] - 0.1, c['end'], 'cap-picks.png', 'seg/05.mp4'); segs.append('seg/05.mp4')
card('cta.png', 3.2, 'seg/06.mp4'); segs.append('seg/06.mp4')
open('list.txt', 'w').write(''.join(f"file '{s}'\n" for s in segs))
run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'yeshdeal-reel.mp4'])
print('done')
