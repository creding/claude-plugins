#!/usr/bin/env python3
"""ElevenLabs + mixing helpers for motion-studio projects. Import it from a project's audio script,
or use the CLI:

  python3 audio_tools.py voices [search]             list voices on the account
  python3 audio_tools.py transcribe clip.mp3         word timestamps (Scribe) + audio events
  python3 audio_tools.py check-take clip.mp3 "text"  exit 1 unless the clip says exactly "text" with no laughs/noises
  python3 audio_tools.py loudness video.mp4          integrated LUFS and true peak (ffmpeg ebur128)
  python3 audio_tools.py balance mix.wav             share of energy below 150 Hz (phone speakers can't play it)

Key: ELEVENLABS_API_KEY (must start with sk_; the 64-hex "key ID" is NOT the key), or a file named by
ELEVENLABS_ENV_FILE containing ELEVENLABS_API_KEY=sk_..., or ~/.config/motion-studio/elevenlabs.key.
Every generation is cached in $MOTION_AUDIO_CACHE (default ./audio_cache) keyed by its request, so re-mixing is free.
Library functions needing numpy (no scipy): synth (osc, noise, env, lp, hp, bp, karplus) for the no-API path,
and decode, place, sidechain, master_wav for mixing."""
import hashlib, json, os, re, subprocess, sys, urllib.error, urllib.request, uuid

API = 'https://api.elevenlabs.io'
CACHE = os.environ.get('MOTION_AUDIO_CACHE', os.path.join(os.getcwd(), 'audio_cache'))
SR = 48000


def api_key():
    k = os.environ.get('ELEVENLABS_API_KEY', '')
    for src in (os.environ.get('ELEVENLABS_ENV_FILE'), os.path.expanduser('~/.config/motion-studio/elevenlabs.key')):
        if k.startswith('sk_') or not src or not os.path.exists(src):
            continue
        for line in open(src):
            line = line.strip()
            if line.startswith('ELEVENLABS_API_KEY='): k = line.split('=', 1)[1].strip().strip('"\'')
            elif line.startswith('sk_'): k = line
    if k and not k.startswith('sk_'):
        sys.exit('ElevenLabs key does not start with sk_ - that is probably the key ID. Create a new key and copy the sk_ value.')
    return k or None


def _post(path, body, accept_json=False, fmt=None):
    key = api_key()
    if not key: raise RuntimeError('no ElevenLabs key')
    url = API + path + (f'?output_format={fmt}' if fmt else '')
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST', headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r: return json.load(r) if accept_json else r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'ElevenLabs {path} -> HTTP {e.code}: {e.read()[:300]!r}') from None


def _cached(kind, body, make):
    os.makedirs(CACHE, exist_ok=True)
    tag = hashlib.sha1((kind + json.dumps(body, sort_keys=True)).encode()).hexdigest()[:16]
    path = os.path.join(CACHE, f'{kind}_{tag}.mp3')
    if not os.path.exists(path): open(path, 'wb').write(make())
    return path


def sfx(text, seconds, influence=0.5, loop=False):
    """Sound effect, 0.5-30 s. Describe the physical event, the material and the distance."""
    body = {'text': text, 'duration_seconds': round(float(seconds), 2), 'prompt_influence': influence, 'model_id': 'eleven_text_to_sound_v2'}
    if loop: body['loop'] = True
    return _cached('sfx', body, lambda: _post('/v1/sound-generation', body, fmt='mp3_44100_128'))


def music_sections(sections, model='music_v2_5', negative=('vocals', 'lyrics', 'singing', 'choir', 'spoken word')):
    """Score composed to the edit. sections: [(name, seconds, [styles...])]. Each section must be >= 3.0 s;
    on v2 models section lengths are enforced, so put a section boundary exactly on the most important cut."""
    chunks = []
    for name, secs, styles in sections:
        if secs < 3.0: raise ValueError(f'music section "{name}" is {secs:.2f}s; the API minimum is 3.0s - merge it with a neighbour')
        chunks.append({'text': f'[{name}]', 'duration_ms': int(round(secs * 1000)), 'positive_styles': list(styles), 'negative_styles': list(negative), 'context_adherence': 'high'})
    body = {'composition_plan': {'chunks': chunks}, 'model_id': model}
    return _cached('music', body, lambda: _post('/v1/music', body, fmt='mp3_44100_128'))


def tts(text, voice_id, stability=0.6, style=0.15, speed=1.05, seed=1, model='eleven_multilingual_v2'):
    """One narration take. Steady settings (stability ~0.6, low style) read as trustworthy; low stability + high style
    reads as dramatic and can sound unsettling for a local-business ad."""
    body = {'text': text, 'model_id': model, 'seed': seed,
            'voice_settings': {'stability': stability, 'similarity_boost': 0.82, 'style': style, 'use_speaker_boost': True, 'speed': speed}}
    return _cached('tts', dict(body, voice_id=voice_id), lambda: _post(f'/v1/text-to-speech/{voice_id}', body, fmt='mp3_44100_128'))


def transcribe(path):
    """Scribe word timestamps (cached next to the clip). Returns the API JSON: text, words[{text,start,end,type}]."""
    jp = path.rsplit('.', 1)[0] + '.words.json'
    if os.path.exists(jp): return json.load(open(jp))
    key = api_key(); bnd = uuid.uuid4().hex; data = open(path, 'rb').read()
    parts = [f'--{bnd}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n',
             f'--{bnd}\r\nContent-Disposition: form-data; name="tag_audio_events"\r\n\r\ntrue\r\n',
             f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n']
    body = ''.join(parts).encode() + data + f'\r\n--{bnd}--\r\n'.encode()
    req = urllib.request.Request(API + '/v1/speech-to-text', data=body, method='POST', headers={'xi-api-key': key, 'Content-Type': f'multipart/form-data; boundary={bnd}'})
    with urllib.request.urlopen(req, timeout=180) as r: out = json.load(r)
    json.dump(out, open(jp, 'w')); return out


NUMBER_WORDS = {'0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '10': 'ten', '60': 'sixty', '100': 'hundred'}
def words_of(text): return [NUMBER_WORDS.get(w, w) for w in re.findall(r"[a-z0-9']+", text.lower().replace('-', ''))]


def check_take(path, text):
    """(ok, heard, events). ok only if the words match the script and no audio events (laughs, breaths, noises) were tagged."""
    tr = transcribe(path); events = [w['text'] for w in tr.get('words', []) if w.get('type') == 'audio_event']
    return words_of(tr.get('text', '')) == words_of(text) and not events, tr.get('text', ''), events


def good_take(text, voice_id, tries=5, **settings):
    """Generate takes with seeds 1..tries until one passes check_take. Returns dict(path, words=[(word, start, end)])
    with times relative to the clip start; trim the clip to words[0].start-0.04 .. words[-1].end+0.28 before placing."""
    for seed in range(1, tries + 1):
        p = tts(text, voice_id, seed=seed, **settings)
        ok, heard, events = check_take(p, text)
        if ok:
            ws = [(w['text'], w['start'], w['end']) for w in transcribe(p)['words'] if w.get('type') == 'word']
            return {'path': p, 'seed': seed, 'words': ws}
        print(f'  rejected take {seed} of "{text}": heard {heard!r} {events or ""}')
    raise RuntimeError(f'no clean take for "{text}" in {tries} tries - change the wording or the voice')


def anchor_offset(take, word, edge, target):
    """Clip start time so that `word`'s start (edge='start') or end (edge='end') lands on `target` seconds."""
    w = next((w for w in take['words'] if words_of(w[0]) == words_of(word)), take['words'][0])
    return target - (w[1] if edge == 'start' else w[2])


# ---------- synthesis (numpy only; for a procedural bed and cues when there's no API key) ----------
def _t(sec): import numpy as np; return np.arange(int(sec * SR)) / SR
def osc(freq, sec, shape='sine', detune=0.0):
    import numpy as np; ph = (_t(sec) * freq * (1 + detune)) % 1
    return {'sine': np.sin(2 * np.pi * ph), 'saw': 2 * ph - 1, 'square': np.sign(np.sin(2 * np.pi * ph)), 'tri': 2 * np.abs(2 * ph - 1) - 1}[shape]
def noise(sec, seed=0): import numpy as np; return np.random.default_rng(seed).standard_normal(int(sec * SR))   # seeded: same mix every run
def env(sec, attack=0.005, decay=None, hold=0.0):
    import numpy as np; t = _t(sec); e = np.minimum(1, t / max(attack, 1e-4))
    return e if decay is None else e * np.where(t < attack + hold, 1, np.exp(-(t - attack - hold) / decay))
def _fft_filter(x, gain):
    import numpy as np; X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X * gain(np.maximum(f, 1e-3)), len(x))
def lp(x, fc, order=2): return _fft_filter(x, lambda f: 1 / (1 + (f / fc) ** (2 * order)) ** 0.5)
def hp(x, fc, order=2): return _fft_filter(x, lambda f: 1 / (1 + (fc / f) ** (2 * order)) ** 0.5)
def bp(x, lo, hi, order=2): return lp(hp(x, lo, order), hi, order)
def karplus(freq, sec, bright=0.5, decay=0.996, seed=0):
    """Plucked string (block-vectorised Karplus-Strong): far more natural than a decaying saw."""
    import numpy as np; P = max(2, int(SR / freq)); n = int(sec * SR); y = np.zeros(n + P)
    y[:P] = lp(np.random.default_rng(seed).uniform(-1, 1, P * 8), 2000 + 8000 * bright)[:P]
    for i in range(P, n + P, P): prev = y[i - P:i]; blk = decay * 0.5 * (prev + np.roll(prev, -1)); m = min(P, n + P - i); y[i:i + m] = blk[:m]
    return y[P:] * env(sec, 0.001, sec * 0.5)

# ---------- mixing (numpy) ----------
def decode(path):
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def place(bus, clip, at, gain=1.0):
    """Add a stereo clip into bus (N x 2) starting at `at` seconds."""
    i = int(at * SR)
    if i < 0: clip = clip[-i:]; i = 0
    n = min(len(clip), len(bus) - i)
    if n > 0: bus[i:i + n] += clip[:n] * gain


def sidechain(voice_bus, depth=0.68, window=0.2):
    """Gain curve (N,) that dips other buses while the voice speaks. Multiply music/SFX buses by it."""
    import numpy as np
    e = np.abs(voice_bus).max(1); k = max(1, int(window * SR)); e = np.convolve(e, np.ones(k) / k, mode='same')
    return 1 - depth * np.clip(e / (e.max() + 1e-9) * 4, 0, 1)


def master_wav(mix, path, fade_out=0.3, highpass=40):
    """High-pass (sub energy phones can't play only eats loudness), soft-clip, peak-normalise to -0.5 dBFS,
    write 16-bit 48 kHz. Final loudness is set at encode (loudnorm)."""
    import numpy as np, wave
    mix = np.stack([hp(mix[:, c], highpass, 3) for c in range(mix.shape[1])], 1) if highpass else mix.copy()
    n = int(fade_out * SR); mix[-n:] *= np.linspace(1, 0, n)[:, None]
    mix = np.tanh(mix * 1.15) / np.tanh(1.15); mix /= np.abs(mix).max() / 0.95
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())


def balance(path, split=150):
    """Fraction of spectral energy below `split` Hz. Phone-first mixes read best around 0.3-0.5; above ~0.6 is bass-heavy."""
    import numpy as np; x = decode(path).mean(1); P = np.abs(np.fft.rfft(x)) ** 2; f = np.fft.rfftfreq(len(x), 1 / SR)
    return float(P[f < split].sum() / P.sum())


def loudness(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', r); tp = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r)
    return (float(i[-1]) if i else None, float(tp[-1]) if tp else None)


def _cli():
    a = sys.argv[1:]
    if not a: print(__doc__); return
    if a[0] == 'voices':
        req = urllib.request.Request(API + '/v2/voices?page_size=100' + (f'&search={a[1]}' if len(a) > 1 else ''), headers={'xi-api-key': api_key()})
        for v in json.load(urllib.request.urlopen(req))['voices']:
            l = v.get('labels', {}); print(v['voice_id'], '|', v['name'], '|', l.get('gender'), l.get('age'), l.get('accent'), l.get('use_case'))
    elif a[0] == 'transcribe':
        tr = transcribe(a[1]); print(tr.get('text'))
        for w in tr.get('words', []):
            if w.get('type') != 'spacing': print(f"  {w['start']:6.2f}-{w['end']:6.2f}  {w['text']}" + ('  [event]' if w.get('type') == 'audio_event' else ''))
    elif a[0] == 'check-take':
        ok, heard, ev = check_take(a[1], a[2]); print('OK' if ok else f'MISMATCH: heard {heard!r} {ev or ""}'); sys.exit(0 if ok else 1)
    elif a[0] == 'loudness':
        i, tp = loudness(a[1]); print(f'integrated {i} LUFS, true peak {tp} dBTP')
    elif a[0] == 'balance':
        b = balance(a[1]); print(f'{b:.0%} of energy below 150 Hz' + ('  (bass-heavy for phone speakers)' if b > 0.6 else ''))
    else: print(__doc__)


if __name__ == '__main__':
    _cli()
