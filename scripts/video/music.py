# Original 120 BPM track synthesized from scratch (royalty-free): kick, clap, hats, bass, riser→impact, whooshes, pops.
import json, wave, numpy as np, os
D = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(D, 'timeline.json')))
SR = 48000; DUR = TL['DUR']; N = int(SR * DUR); BPM = 120; B = 60 / BPM
rng = np.random.default_rng(7)
mix = np.zeros((N, 2))
def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); j = min(N, i + len(sig))
    if i >= N: return
    s = sig[: j - i] * gain
    mix[i:j, 0] += s * (1 - max(0, pan)); mix[i:j, 1] += s * (1 + min(0, pan))
def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR; return np.minimum(1, t / a) * np.exp(-t / d)
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.045); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(n, 0.001, 0.13) + 0.25 * np.tanh(4 * np.sin(ph)) * env(n, 0.001, 0.03)
def clap():
    n = int(0.25 * SR); x = rng.standard_normal(n)
    x = np.convolve(x, np.ones(6) / 6, 'same') - np.convolve(x, np.ones(40) / 40, 'same')
    e = sum(env(n, 0.0005, 0.012) * (np.arange(n) >= int(k * SR)) for k in (0, 0.01, 0.02)) + env(n, 0.001, 0.09)
    return x * e * 0.9
def hat(o=False):
    n = int((0.18 if o else 0.05) * SR); x = rng.standard_normal(n); x = x - np.convolve(x, np.ones(3) / 3, 'same')
    return x * env(n, 0.0005, 0.06 if o else 0.012) * 0.5
def bass(freq, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) + 0.15 * np.sign(np.sin(2 * np.pi * freq * t))
    return np.tanh(1.6 * s) * env(n, 0.004, dur * 0.7) * 0.55
def whoosh(dur=0.45):
    n = int(dur * SR); x = rng.standard_normal(n); t = np.arange(n) / SR
    out = np.zeros(n); y = 0
    for i in range(n):  # sweeping one-pole lowpass
        a = 0.02 + 0.5 * (t[i] / dur); y += a * (x[i] - y); out[i] = y
    return out * np.sin(np.pi * t / dur) ** 2 * 1.2
def pop():
    n = int(0.12 * SR); t = np.arange(n) / SR; f = 900 + 1400 * np.exp(-t / 0.02)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.0008, 0.035) * 0.6
def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
    y = np.zeros(n); v = 0
    for i in range(n):
        a = 0.01 + 0.35 * (t[i] / dur) ** 2; v += a * (x[i] - v); y[i] = v
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / dur) ** 2) / SR) * 0.25
    return (y + tone) * (t / dur) ** 1.6 * 0.9
def impact():
    n = int(1.2 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * np.cumsum(60 * np.exp(-t / 0.4) + 30) / SR) * env(n, 0.001, 0.35) + rng.standard_normal(n) * env(n, 0.001, 0.08) * 0.4) * 0.9

KICK, CLAP, HAT, OHAT = kick(), clap(), hat(), hat(True)
roots = [55.0, 43.65, 65.41, 49.0]  # A1 F1 C2 G1 – i–VI–III–VII
drop = TL['S'][1]['t0']; end = TL['S'][-1]['t0']
# intro (hook): filtered pulse + riser into the drop
for k in range(int(drop / (B / 2))):
    add(HAT, k * B / 2, 0.35)
add(KICK, 0, 0.8); add(KICK, B * 2, 0.5)
add(riser(drop - 0.2), 0.2, 0.7)
add(impact(), drop, 0.9)
# main groove
t = drop
while t < end - 1e-6:
    beat = round((t - drop) / B)
    add(KICK, t, 1.0)
    if beat % 2 == 1: add(CLAP, t, 0.65)
    add(HAT, t + B / 2, 0.45, pan=0.3); add(OHAT if beat % 4 == 3 else HAT, t + B / 4 * 3, 0.25, pan=-0.3)
    r = roots[(beat // 4) % 4]
    add(bass(r, B / 2 * 0.95), t + B / 2, 0.85)
    if beat % 4 == 2: add(bass(r * 2, B / 4), t + B / 4 * 3, 0.5)
    t += B
# outro: big hit + tail
add(impact(), end, 0.8); add(KICK, end, 1.0)
for k in range(3): add(HAT, end + 0.5 + k * B, 0.3 * (1 - k / 3))
# sound design on the edit: whoosh into each cut, pop on stickers
for s in TL['S'][1:]:
    add(whoosh(), max(0, s['t0'] - 0.32), 0.45)
    st = s.get('sticker')
    if st: add(pop(), s['t0'] + st['at'], 0.8)
    if s.get('punch') is not None: add(impact()[: int(0.4 * SR)] * 0.6, s['t0'] + s['punch'], 0.5)
# master: gentle glue + limiter, peak −1 dBFS, fade tail
mix = np.tanh(mix * 1.15)
fade = np.ones(N); fl = int(0.6 * SR); fade[-fl:] = np.linspace(1, 0, fl); mix *= fade[:, None]
mix *= (10 ** (-1 / 20)) / max(1e-9, np.abs(mix).max())
with wave.open(os.path.join(D, 'music.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('music ok', DUR)
