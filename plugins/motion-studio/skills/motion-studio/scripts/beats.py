#!/usr/bin/env python3
"""Beat grid for a motion-studio timeline. numpy + ffmpeg only (no librosa).

  python3 beats.py track.mp3 > beats.json            measure a supplied or generated track
  python3 beats.py --bpm 120 --dur 30 [--offset 0]   exact grid for music you will synthesize at that tempo

Output: {"bpm", "beats": [...], "downbeats": [...], "hits": [...]} in seconds.
State changes go on beats, big moments on downbeats, sound effects on hits."""
import json, subprocess, sys
import numpy as np

SR, HOP, NFFT = 22050, 256, 1024


def grid(bpm, dur, offset=0.0):
    beats = np.arange(offset, dur, 60.0 / bpm)
    return {'bpm': bpm, 'beats': beats.round(3).tolist(), 'downbeats': beats[::4].round(3).tolist(), 'hits': [], 'source': 'grid'}


def onset_envelope(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, np.float32).astype(np.float64)
    n = 1 + (len(y) - NFFT) // HOP
    frames = np.lib.stride_tricks.as_strided(y, (n, NFFT), (y.strides[0] * HOP, y.strides[0])) * np.hanning(NFFT)
    mag = np.log1p(100 * np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(0, np.diff(mag, axis=0)).sum(1)                  # spectral flux: energy that just arrived
    flux = np.convolve(flux - np.convolve(flux, np.ones(32) / 32, 'same'), np.ones(3) / 3, 'same')
    t = ((np.arange(len(flux)) + 1) * HOP + NFFT / 2) / SR             # stamp each flux value at the later frame's window centre
    return np.maximum(flux, 0) / (flux.max() + 1e-9), len(y) / SR, t


def measure(path):
    env, dur, t_env = onset_envelope(path)
    fps = SR / HOP
    # tempo: autocorrelation of the onset envelope, 60-200 BPM, gently weighted toward ~120
    ac = np.correlate(env, env, 'full')[len(env) - 1:]
    lags = np.arange(int(fps * 60 / 200), int(fps * 60 / 60) + 1)
    bpms = 60 * fps / lags
    score = ac[lags] * np.exp(-0.5 * (np.log2(bpms / 120) / 0.9) ** 2)
    i = int(np.argmax(score)); lag = float(lags[i])
    if 0 < i < len(lags) - 1:                                          # parabolic refinement
        a, b, c = score[i - 1], score[i], score[i + 1]; lag += 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    period = lag / fps; bpm = 60 / period
    # phase: the offset whose beat positions collect the most onset energy
    offs = np.linspace(0, period, 64, endpoint=False)
    sums = [np.interp(np.arange(o, dur, period), t_env, env).sum() for o in offs]
    beats = np.arange(offs[int(np.argmax(sums))], dur, period)
    # downbeat: which of the 4 beat positions in a bar is strongest
    strength = np.interp(beats, t_env, env)
    k = int(np.argmax([strength[j::4].sum() for j in range(4)]))
    # hits: prominent onsets, at least 0.1 s apart
    thr = env.mean() + 1.5 * env.std(); hits = []
    for j in range(1, len(env) - 1):
        if env[j] > thr and env[j] >= env[j - 1] and env[j] >= env[j + 1] and (not hits or t_env[j] - hits[-1] > 0.1): hits.append(t_env[j])
    return {'bpm': round(bpm, 2), 'beats': beats.round(3).tolist(), 'downbeats': beats[k::4].round(3).tolist(), 'hits': np.round(hits, 3).tolist(), 'source': path}


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    if a[0] == '--bpm':
        opt = dict(zip(a[::2], a[1::2])); out = grid(float(opt['--bpm']), float(opt.get('--dur', 30)), float(opt.get('--offset', 0)))
    else:
        out = measure(a[0])
    json.dump(out, sys.stdout, indent=1)
