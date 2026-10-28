#!/usr/bin/env python3
"""
Soundtrack und Klangeffekte fuer das Einfuehrungsvideo - komplett synthetisch,
ohne Samples, damit nichts lizenziert werden muss.

Musik: 120 BPM, a-Moll (Am - F - C - G), Vorspann ohne Schlagzeug, ab den
fuenf Bereichen Beat, Aufbau vor dem Abschluss mit Drop, ruhiges Ende.
Effekte: kommen aus audio/cues.json (erzeugt mit `node render.mjs cues`) -
jeder Fingertipp, jede XP-Plakette, jeder Schnitt hat seinen Klang.

    pip install numpy scipy
    python3 audio/soundtrack.py          -> audio/soundtrack.wav
    python3 audio/soundtrack.py action   -> audio/soundtrack-action.wav

Der Action-Schnitt (`node render.mjs cues --cut action`) bringt sein eigenes
Tempo mit (150 BPM) und spielt durchgehend mit vollem Beat und Fills vor
jedem Kapitel.
"""
import json
import os
import sys
import wave

import numpy as np
from scipy import ndimage, signal

HERE = os.path.dirname(os.path.abspath(__file__))
CUT = sys.argv[1] if len(sys.argv) > 1 else ""
SUFFIX = f"-{CUT}" if CUT else ""
ACTION = CUT == "action"
SR = 48000
rng = np.random.default_rng(2026)

with open(os.path.join(HERE, f"cues{SUFFIX}.json"), encoding="utf-8") as f:
    INFO = json.load(f)
BPM = INFO.get("bpm", 120)
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = INFO["duration"] + 0.6
N = int(DUR * SR)
SCENES = {s["id"]: s["start"] for s in INFO["scenes"]}
DROP = next(c["t"] for c in INFO["cues"] if c["kind"] == "drop")
OUTRO = SCENES["outro"]
OUTRO_HIT = [c["t"] for c in INFO["cues"] if c["kind"] == "impact"][-1]

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
kick_env = np.zeros(N)  # fuer das Ducking


# ----------------------------------------------------------------- Werkzeug

def t_axis(n):
    return np.arange(n) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    """ADSR ueber n Proben; hold = Dauer bis zum Loslassen (Sekunden)."""
    t = t_axis(n)
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where((t >= a + d) & (t < hold), s, e)
    rel = np.clip((t - hold) / max(r, 1e-6), 0, 1)
    e = np.where(t >= hold, s * (1 - rel), e)
    return np.clip(e, 0, 1)


def lp(x, fc, order=2):
    sos = signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, "high", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def saw(freq, n, phase=0.0):
    ph = np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR + phase
    return 2 * (ph % 1.0) - 1


def tri(freq, n):
    return 2 * np.abs(saw(freq, n)) - 1


def sine(freq, n, phase=0.0):
    ph = np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR
    return np.sin(2 * np.pi * ph + phase)


def noise(n):
    return rng.standard_normal(n)


def add(buf, x, t0, gain=1.0, pan=0.0):
    """Mono oder Stereo an Sekunde t0 einmischen; pan -1 links .. 1 rechts."""
    i = int(round(t0 * SR))
    if i >= N:
        return
    if x.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], axis=1) * np.sqrt(2)
    if i < 0:
        x = x[-i:]
        i = 0
    j = min(N, i + len(x))
    buf[i:j] += x[: j - i] * gain


def reverb_ir(seconds=2.4, decay=3.2, bright=6000):
    n = int(seconds * SR)
    t = t_axis(n)
    ir = np.stack([noise(n), noise(n)], axis=1) * np.exp(-decay * t)[:, None]
    ir = lp(ir, bright)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt(np.sum(ir ** 2, axis=0))


IR = reverb_ir()
IR_SHORT = reverb_ir(0.9, 6.0, 9000)


def reverb(x, ir=IR, mix=0.3):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    wet = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix


def delay(x, seconds, feedback=0.35, mix=0.25, pingpong=True):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    d = int(seconds * SR)
    out = x.copy()
    tap = x.copy()
    for k in range(1, 6):
        tap = np.roll(tap, d, axis=0)
        tap[:d] = 0
        tap = tap * feedback
        if pingpong:
            tap = tap[:, ::-1]
        out += tap * mix / feedback
    return out


# ----------------------------------------------------------------- Harmonie

# a-Moll: Am - F - C - G, ein Takt je Akkord
CHORDS = [
    [57, 60, 64],  # Am
    [53, 57, 60],  # F
    [48, 52, 55],  # C
    [55, 59, 62],  # G
]
ROOTS = [45, 41, 48, 43]


def chord_at(t):
    return int((t // BAR) % 4)


# ----------------------------------------------------------- Arrangement

def part(t):
    """Teil des Stuecks an Sekunde t: intro, logo, lift, verse, full, build, drop, end."""
    S = SCENES
    if t < S["logo"]:
        return "intro"
    if t < S["tabs"]:
        return "logo"
    if t < S["gebiete"]:
        return "lift"
    if t < S["klinken"]:
        return "full" if ACTION else "verse"
    if t < S["termine"]:
        return "full"
    if t < S["abschluss"]:
        return "full" if ACTION else "verse"
    if t < DROP:
        return "build"
    if t < S["visitenkarte"]:
        return "drop"
    if t < S["kunden"]:
        return "full"
    if t < S["farben"]:
        return "full" if ACTION else "verse"
    if t < OUTRO:
        return "full"
    if t < OUTRO_HIT - 0.1:
        return "build"
    return "end"


LEVEL = {"intro": 0.7, "logo": 0.85, "lift": 0.92, "verse": 0.85, "full": 1.0, "build": 0.9, "drop": 1.15, "end": 0.8}


def section(t):
    """Welche Instrumente an Sekunde t spielen."""
    p_ = part(t)
    pre_drop = DROP - BAR <= t < DROP
    gap = DROP - BEAT <= t < DROP
    return {
        "part": p_,
        "level": LEVEL[p_],
        "arp": p_ not in ("intro", "logo", "end"),
        "kick": p_ in ("lift", "verse", "full", "build", "drop") and not gap,
        "hats": p_ in ("lift", "verse", "full", "build", "drop") and not gap,
        "hats16": p_ in (("full", "drop", "build") if ACTION else ("full", "drop")),
        "clap": p_ in ("full", "drop", "verse") and not pre_drop,
        "bass": p_ in ("verse", "full", "build", "drop") and not gap,
        "lead": p_ == "drop",
        "hot": p_ == "drop",
        "stab": p_ in ("full", "drop"),
    }


# ----------------------------------------------------------------- Musik

def make_pad():
    """Akkordflaeche: verstimmte Saegezaehne, weich gefiltert, je Takt."""
    out = np.zeros((N, 2))
    bars = int(DUR // BAR) + 1
    for b in range(bars):
        t0 = b * BAR
        if t0 >= DUR:
            break
        ch = CHORDS[b % 4]
        n = int((BAR + 0.6) * SR)
        voice = np.zeros((n, 2))
        for m in ch + [ch[0] + 12]:
            for k, det in enumerate([-0.11, -0.04, 0.04, 0.11]):
                f = mtof(m + det)
                ph = rng.random()
                w = saw(f, n, ph)
                pan = -0.6 + 1.2 * (k / 3)
                voice[:, 0] += w * np.cos((pan + 1) * np.pi / 4)
                voice[:, 1] += w * np.sin((pan + 1) * np.pi / 4)
        e = env_adsr(n, a=0.35, d=0.4, s=0.85, r=0.6, hold=BAR)
        voice *= e[:, None]
        # Filter oeffnet sich mit der Dichte des Stuecks
        sec = section(t0)
        cutoff = {"intro": 900, "logo": 1600, "lift": 2000, "verse": 2200, "full": 2800, "drop": 4200, "end": 1800}.get(sec["part"], 2400)
        if sec["part"] == "build":
            k = np.clip((t0 - SCENES["abschluss"]) / max(DROP - SCENES["abschluss"], 1), 0, 1)
            cutoff = 900 + 3000 * k
        voice = lp(voice, cutoff, 2)
        add(out, voice, t0, 0.03 * sec["level"])
    return reverb(out, IR, 0.35)


def make_arp():
    out = np.zeros((N, 2))
    step = BEAT / 4
    pattern = [0, 1, 2, 3, 2, 1, 0, 2]
    n = int(0.22 * SR)
    t = t_axis(n)
    for i in range(int(DUR / step)):
        t0 = i * step
        if not section(t0)["arp"]:
            continue
        ch = CHORDS[chord_at(t0)]
        tones = ch + [ch[0] + 12]
        m = tones[pattern[i % 8]] + 12
        f = mtof(m)
        x = 0.6 * saw(f, n) + 0.4 * tri(f * 2, n)
        x *= np.exp(-t * 16)
        sec = section(t0)
        x = lp(x, 3600 + 2400 * sec["hot"])
        accent = 1.0 if i % 4 == 0 else 0.65
        add(out, x, t0, 0.075 * accent * sec["level"], pan=0.35 * np.sin(i * 0.7))
    return delay(out, BEAT * 0.75, 0.38, 0.35)


def kick(n=None):
    n = n or int(0.45 * SR)
    t = t_axis(n)
    f = 45 + 110 * np.exp(-t * 32)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    click = noise(n) * np.exp(-t * 400) * 0.25
    return np.tanh((x + lp(click, 6000)) * 1.6)


def clap():
    n = int(0.35 * SR)
    t = t_axis(n)
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) * 90) * (0.8 if k < 2 else 1.0)
    e += np.exp(-t * 18) * 0.35
    x = bp(noise(n), 900, 3200) * e
    return x


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = t_axis(n)
    x = lp(hp(noise(n), 7500, 4), 13000, 2) * np.exp(-t * (14 if open_ else 70))
    return x


def crash():
    n = int(2.2 * SR)
    t = t_axis(n)
    return lp(hp(noise(n), 4500, 2), 12000, 2) * np.exp(-t * 2.2) + bp(noise(n), 2500, 6000) * np.exp(-t * 6) * 0.4


CRASH = None
CHAPTER_STARTS = []


def make_drums():
    global CRASH, CHAPTER_STARTS
    CRASH = crash()
    CHAPTER_STARTS = [round(SCENES[k] / BEAT) * BEAT for k in SCENES if k not in ("open", "logo")] + [DROP]
    out = np.zeros((N, 2))
    K = kick()
    C = clap()
    H = hat()
    HO = hat(True)
    beats = int(DUR / BEAT)
    for b in range(beats):
        t0 = b * BEAT
        sec = section(t0)
        if sec["kick"]:
            g = 0.32 if sec["part"] == "lift" else 0.46
            g *= sec["level"]
            add(out, K, t0, g)
            i = int(t0 * SR)
            ln = int(0.32 * SR)
            if i < N:
                j = min(N, i + ln)
                kick_env[i:j] = np.maximum(kick_env[i:j], np.exp(-np.arange(j - i) / SR * 9))
        if sec["clap"] and b % 2 == 1:
            add(out, C, t0, 0.42 * sec["level"])
        if sec["hats"]:
            add(out, H, t0 + BEAT / 2, 0.2 * sec["level"], pan=0.25)
            if sec["hats16"]:
                add(out, H, t0 + BEAT / 4, 0.08, pan=-0.2)
                add(out, H, t0 + 3 * BEAT / 4, 0.08, pan=-0.2)
            if b % 8 == 7:
                add(out, HO, t0 + BEAT / 2, 0.13, pan=0.3)
        # Becken am Anfang jedes Kapitels
        if any(abs(t0 - st) < 1e-6 for st in CHAPTER_STARTS):
            add(out, CRASH, t0, 0.22)
    # Wirbel vor dem Drop
    roll_start = DROP - BAR
    for k in range(32):
        tk = roll_start + k * (BAR / 32)
        n = int(0.08 * SR)
        tt = t_axis(n)
        x = (bp(noise(n), 1200, 6000) * 0.8 + 0.4 * sine(190, n)) * np.exp(-tt * 40)
        add(out, x, tk, 0.06 + 0.25 * (k / 31) ** 2, pan=0.2 * np.sin(k))
    if ACTION:
        # Fill auf dem letzten Schlag vor jedem Kapitel: Sechzehntel, lauter werdend
        for st in CHAPTER_STARTS:
            if abs(st - DROP) < 1e-6 or st < SCENES["gebiete"] - 1e-6:
                continue
            for k in range(4):
                add(out, C, st - BEAT + k * BEAT / 4, 0.16 + 0.1 * k, pan=-0.3 + 0.2 * k)
    return reverb(out, IR_SHORT, 0.12)


def make_bass():
    out = np.zeros(N)
    step = BEAT / 2
    n = int(step * SR * 0.95)
    t = t_axis(n)
    for i in range(int(DUR / step)):
        t0 = i * step
        if not section(t0)["bass"]:
            continue
        root = ROOTS[chord_at(t0)]
        off = i % 2 == 1  # Achtel auf der Zaehlzeit "und" lauter (Pumpen)
        f = mtof(root)
        x = 0.7 * saw(f, n) + 0.5 * sine(f / 2, n)
        x = lp(x, 560 if not section(t0)["hot"] else 800, 4) * section(t0)["level"]
        e = np.minimum(1, t / 0.005) * np.exp(-t * (5 if off else 9))
        add_mono = x * e * (1.0 if off else 0.55)
        i0 = int(t0 * SR)
        j0 = min(N, i0 + n)
        out[i0:j0] += add_mono[: j0 - i0]
    st = np.stack([out, out], axis=1) * 0.12
    return st


def make_lead():
    """Kleine Melodie im Drop: Saegezahn mit Delay."""
    out = np.zeros((N, 2))
    melody = [
        (0, 76, 1), (1, 74, 0.5), (1.5, 72, 0.5), (2, 72, 1), (3, 71, 1),
        (4, 72, 1), (5, 74, 0.5), (5.5, 76, 0.5), (6, 79, 1.5), (7.5, 76, 0.5),
    ]
    t_bar0 = DROP
    loops = int((SCENES["visitenkarte"] - DROP) // (8 * BEAT)) + 1
    for L in range(loops):
        for beat, m, length in melody:
            t0 = t_bar0 + L * 8 * BEAT + beat * BEAT
            if not section(t0)["lead"]:
                continue
            n = int(length * BEAT * SR)
            tt = t_axis(n)
            f = mtof(m)
            vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt) * np.clip(tt / 0.3, 0, 1)
            x = sum(saw(f * vib * (1 + d), n, rng.random()) for d in (-0.006, 0, 0.006)) / 3
            x = lp(x, 3800, 2) * env_adsr(n, 0.01, 0.15, 0.7, 0.12)
            add(out, x, t0, 0.11)
    return reverb(delay(out, BEAT * 0.75, 0.4, 0.4), IR, 0.25)


def make_stabs():
    """Akkordschlaege im Offbeat - fuellen die Mitten in den vollen Teilen."""
    out = np.zeros((N, 2))
    n = int(0.28 * SR)
    t = t_axis(n)
    for b in range(int(DUR / BEAT)):
        t0 = b * BEAT + BEAT / 2
        sec = section(t0)
        if not sec["stab"]:
            continue
        ch = CHORDS[chord_at(t0)]
        x = sum(saw(mtof(m + 12), n, rng.random()) + saw(mtof(m + 12) * 1.004, n, rng.random()) for m in ch)
        x = lp(x, 2400 + 1600 * sec["hot"], 2) * np.exp(-t * 11) * np.minimum(1, t / 0.004)
        add(out, x, t0, 0.028 * sec["level"], pan=0.0)
    return reverb(out, IR, 0.3)


# ------------------------------------------------------------------- Effekte

def fx_click(n_ms=40, f=2400):
    n = int(n_ms / 1000 * SR)
    t = t_axis(n)
    x = sine(f, n) * np.exp(-t * 160) * 0.6 + bp(noise(n), 2000, 9000) * np.exp(-t * 400) * 0.5
    return x


def fx_whoosh(length=0.6, up=True, lo=300, hi=6000):
    """Rauschen, dessen Band gleitet (zeitvariabler Filter ueber STFT)."""
    n = int(length * SR)
    x = noise(n)
    f, tt, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
    frac = np.clip(tt / length, 0, 1)
    if not up:
        frac = 1 - frac
    fc = lo * (hi / lo) ** frac
    band = np.exp(-0.5 * (np.log(np.maximum(f[:, None], 1) / fc[None, :]) / 0.35) ** 2)
    _, y = signal.istft(Z * band, SR, nperseg=1024, noverlap=768)
    y = y[:n]
    if len(y) < n:
        y = np.pad(y, (0, n - len(y)))
    t = t_axis(n)
    e = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 1.5
    y = y / (np.max(np.abs(y)) + 1e-9)
    return y * e


def fx_boom(length=2.5, f0=60):
    n = int(length * SR)
    t = t_axis(n)
    f = f0 * 0.5 + f0 * np.exp(-t * 6)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    crash = hp(noise(n), 3000) * np.exp(-t * 3) * 0.25
    return np.tanh(x * 1.8) + crash


def fx_bell(f, length=1.2, bright=1.0):
    n = int(length * SR)
    t = t_axis(n)
    x = (
        sine(f, n) * np.exp(-t * 3)
        + 0.5 * sine(f * 2.01, n) * np.exp(-t * 5) * bright
        + 0.25 * sine(f * 3.02, n) * np.exp(-t * 8) * bright
        + 0.12 * sine(f * 4.2, n) * np.exp(-t * 12) * bright
    )
    return x * np.minimum(1, t / 0.002)


def fx_riser(length=2.0):
    n = int(length * SR)
    t = t_axis(n)
    k = t / length
    x = hp(noise(n), 600) * k ** 2
    tone = saw(200 * 2 ** (k * 3), n) * k ** 2 * 0.3
    return lp(x * 0.6 + tone, 9000) * (1 - np.clip((k - 0.98) / 0.02, 0, 1))


def fx_pop(f=600):
    n = int(0.12 * SR)
    t = t_axis(n)
    fr = f * (1 + 1.5 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 30)


def fx_sparkles(length=1.6, count=40, seed=1):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    out = np.zeros((n, 2))
    for _ in range(count):
        t0 = r.random() * length * 0.9
        f = mtof(r.choice([84, 86, 88, 91, 93, 96, 98]))
        b = fx_bell(f, 0.35, 0.6) * 0.3
        add_local = np.zeros((n, 2))
        i = int(t0 * SR)
        j = min(n, i + len(b))
        pan = r.uniform(-0.9, 0.9)
        add_local[i:j, 0] = b[: j - i] * np.cos((pan + 1) * np.pi / 4)
        add_local[i:j, 1] = b[: j - i] * np.sin((pan + 1) * np.pi / 4)
        out += add_local * (1 - t0 / length)
    return out


def arpeggio(notes, step=0.07, length=0.6, bright=0.8):
    n = int((step * len(notes) + length) * SR)
    out = np.zeros(n)
    for k, m in enumerate(notes):
        b = fx_bell(mtof(m), length, bright)
        i = int(k * step * SR)
        out[i : i + len(b)] += b[: n - i]
    return out


PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]


def render_cue(c):
    k = c["kind"]
    t = c["t"]
    n_idx = c.get("n", 0)
    if k == "tap":
        add(sfx, fx_click(30, 2600), t, 0.18)
    elif k == "key":
        add(sfx, fx_click(18, 3400 + rng.random() * 600), t, 0.07, pan=rng.uniform(-0.3, 0.3))
    elif k == "tick":
        add(sfx, fx_click(20, 4200), t, 0.08, pan=rng.uniform(-0.5, 0.5))
    elif k in ("whoosh", "whoosh-in", "whoosh-light", "swoosh-back", "rise", "sheet"):
        length = {"whoosh": 0.7, "whoosh-in": 0.6, "whoosh-light": 0.9, "swoosh-back": 0.5, "rise": 0.5, "sheet": 0.4}[k]
        up = k not in ("swoosh-back",)
        start = t - length * 0.5 if k in ("whoosh", "whoosh-light") else t
        g = {"whoosh": 0.5, "whoosh-in": 0.38, "whoosh-light": 0.5, "swoosh-back": 0.35, "rise": 0.3, "sheet": 0.22}[k]
        add(sfx, fx_whoosh(length, up), start, g, pan=0.0)
    elif k == "hit":
        add(sfx, fx_boom(1.0, 70), t, 0.32)
        add(sfx, fx_click(60, 1800), t, 0.18)
    elif k == "hit-big":
        add(sfx, fx_boom(1.8, 60), t, 0.5)
        add(sfx, reverb(fx_bell(mtof(81), 1.5)), t, 0.25)
    elif k == "dot":
        add(sfx, reverb(fx_bell(mtof(88), 1.6, 0.4)), t, 0.25)
    elif k == "sweep":
        n = int(1.0 * SR)
        tt = t_axis(n)
        x = sine(mtof(64) * 2 ** (tt * 2), n) * np.sin(np.pi * tt / 1.0) * 0.5
        add(sfx, reverb(x), t, 0.25)
    elif k == "impact":
        add(sfx, fx_boom(3.0, 55), t, 1.0)
        add(sfx, reverb(fx_whoosh(0.8, True, 800, 12000)[::-1].copy()), t - 0.8, 0.35)
    elif k == "shimmer":
        add(sfx, reverb(fx_sparkles(1.4, 24, 3), IR, 0.5), t, 0.5)
    elif k in ("riser-short", "riser"):
        # Riser enden auf dem Treffer: Laenge folgt dem Tempo
        length = (1.0 if k == "riser-short" else 2.0) * 120 / BPM
        add(sfx, fx_riser(length), t, 0.3 if k == "riser-short" else 0.45)
    elif k == "pop":
        add(sfx, fx_pop(500 + n_idx * 90), t, 0.3, pan=-0.3 + 0.15 * n_idx)
    elif k == "close":
        add(sfx, reverb(arpeggio([76, 83], 0.08, 0.6)), t, 0.22)
    elif k == "scan":
        n = int(1.8 * SR)
        tt = t_axis(n)
        x = sine(900 + 500 * np.sin(2 * np.pi * 6 * tt), n) * 0.25 * np.sin(np.pi * tt / 1.8)
        x += hp(noise(n), 5000) * 0.1 * np.sin(np.pi * tt / 1.8)
        add(sfx, reverb(x, IR_SHORT, 0.3), t, 0.35)
    elif k == "split":
        for i in range(3):
            add(sfx, fx_pop(700 + i * 150), t + i * 0.09, 0.3, pan=-0.5 + 0.5 * i)
    elif k == "route":
        n = int(2.2 * SR)
        tt = t_axis(n)
        x = sine(mtof(76) * (1 + 0.5 * tt / 2.2), n) * np.sin(np.pi * tt / 2.2) * 0.2
        add(sfx, reverb(x), t, 0.35)
    elif k == "xp":
        add(sfx, reverb(arpeggio([88, 95], 0.06, 0.5, 1.0), IR_SHORT, 0.25), t, 0.22)
    elif k == "folder":
        add(sfx, fx_whoosh(0.35, True), t, 0.25)
        add(sfx, fx_click(30, 1800), t + 0.25, 0.15)
    elif k == "locate":
        add(sfx, reverb(fx_bell(mtof(84), 1.5, 0.3), IR, 0.45), t, 0.3)
        add(sfx, reverb(fx_bell(mtof(84), 1.5, 0.3), IR, 0.45), t + 0.45, 0.15)
    elif k == "sent":
        n = int(0.35 * SR)
        tt = t_axis(n)
        x = sine(mtof(79) * (1 + 1.2 * tt / 0.35), n) * np.exp(-tt * 8)
        add(sfx, reverb(x, IR_SHORT, 0.3), t, 0.25)
    elif k == "push":
        add(sfx, reverb(arpeggio([84, 88], 0.12, 0.8, 0.6)), t, 0.25)
    elif k == "drop":
        add(sfx, fx_boom(4.0, 50), t, 1.1)
        add(sfx, reverb(fx_bell(mtof(69), 3.0, 1.0), IR, 0.5), t, 0.25)
        add(sfx, reverb(fx_bell(mtof(76), 3.0, 1.0), IR, 0.5), t, 0.18)
    elif k == "confetti":
        add(sfx, reverb(fx_sparkles(2.4, 70, 9), IR, 0.4), t, 0.6)
        add(sfx, hp(noise(int(1.2 * SR)), 4000) * np.exp(-t_axis(int(1.2 * SR)) * 3), t, 0.06)
    elif k == "levelup":
        add(sfx, reverb(arpeggio([72, 76, 79, 84, 88], 0.08, 0.9, 1.0)), t, 0.25)
    elif k == "like":
        add(sfx, fx_pop(900 + rng.random() * 300), t, 0.16, pan=rng.uniform(-0.4, 0.4))
    elif k == "build":
        add(sfx, reverb(fx_sparkles(1.2, 18, 5)), t, 0.35)
    elif k == "chime":
        add(sfx, reverb(arpeggio([79, 83, 86], 0.07, 0.8)), t, 0.22)
    elif k == "switch":
        add(sfx, fx_click(25, 1500), t, 0.22)
        add(sfx, fx_click(25, 2300), t + 0.05, 0.15)
    elif k == "count":
        for i in range(14):
            add(sfx, fx_click(15, 3000 + i * 120), t + i * 0.1 * (1 - i / 30), 0.05)
    elif k == "ring":
        add(sfx, reverb(fx_bell(mtof(PENTA[3 + int(rng.random() * 3)]), 0.9, 0.7)), t + 0.8, 0.18)
    elif k == "medal":
        add(sfx, reverb(fx_bell(mtof(PENTA[min(10, 4 + n_idx)]), 1.2, 1.2), IR, 0.35), t + 0.15, 0.22, pan=-0.6 + 0.3 * n_idx)
    elif k == "color":
        add(sfx, reverb(fx_bell(mtof(PENTA[n_idx % len(PENTA)]), 0.6, 0.9), IR_SHORT, 0.3), t, 0.22, pan=-0.6 + 0.12 * n_idx)
    elif k == "sign":
        n = int(1.1 * SR)
        tt = t_axis(n)
        x = bp(noise(n), 2500, 7000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 7 * tt))) * np.sin(np.pi * tt / 1.1)
        add(sfx, x, t, 0.06)
    elif k == "cut":
        add(sfx, fx_whoosh(0.9, True, 250, 9000), t - 0.5, 0.42)
        add(sfx, fx_boom(0.7, 85), t, 0.28 if ACTION else 0.16)
    elif k == "outro":
        pass


# ------------------------------------------------------------------- Mischen

def limiter(x, ceiling, look=0.004, release=0.12):
    """Spitzenbegrenzer mit kurzer Vorschau: Verstaerkung sinkt vor jeder Spitze."""
    peak = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    w = int(look * SR)
    g = ndimage.minimum_filter1d(g, 2 * w + 1)
    # Erholung: langsam zurueck nach oben (einpolig), Absenkung sofort
    rel = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else g[i] + (cur - g[i]) * rel
        out[i] = cur
    out = ndimage.uniform_filter1d(out, w)
    y = x * out[:, None]
    return np.clip(y, -ceiling, ceiling)


def main():
    print("Musik …")
    pad = make_pad()
    arp = make_arp()
    drums = make_drums()
    bass = make_bass()
    lead = make_lead()
    stabs = make_stabs()
    # Ducking: alles Melodische atmet mit der Bassdrum
    duck = 1 - 0.55 * kick_env
    duck = np.convolve(duck, np.ones(48) / 48, mode="same")
    for layer in (pad, arp, bass, lead, stabs):
        layer *= duck[:, None]
    mix = pad + arp + drums + bass + lead + stabs
    # Intro-Flaeche: tiefer Ton, der zum Logo anschwillt
    n = int(SCENES["logo"] * SR + 1.6 * SR)
    tt = t_axis(n)
    drone = (sine(mtof(33), n) + 0.5 * sine(mtof(45), n) + 0.2 * saw(mtof(57), n)) * np.clip(tt / 3.0, 0, 1)
    drone = lp(drone, 500) * np.exp(-np.clip(tt - SCENES["logo"] - 1.4, 0, None) * 6)
    add(mix, drone, 0, 0.07)
    # Ende: Drums raus, letzte Flaeche klingt aus
    t_end = t_axis(N)
    fade = np.clip((DUR - 0.8 - t_end) / 2.6, 0, 1)
    mix *= fade[:, None]

    print("Effekte …")
    cuts = [c["t"] for c in INFO["cues"] if c["kind"] == "cut"]
    for c in INFO["cues"]:
        # am Kapitelschnitt spielt nur der Schnitt-Wisch, keine zweiten Whooshes
        if c["kind"] in ("whoosh", "whoosh-in") and any(abs(c["t"] - x) < 0.9 for x in cuts):
            continue
        render_cue(c)
    # Schlussakkord nach dem Logo
    n = int(5.5 * SR)
    tt = t_axis(n)
    final = sum(sine(mtof(m), n) * (0.5 if m > 60 else 1) for m in (45, 57, 64, 69, 72)) * np.exp(-tt * 0.8) * np.minimum(1, tt / 0.02)
    add(sfx, reverb(lp(final, 2500), IR, 0.5), OUTRO_HIT, 0.12)

    out = mix * 0.9 + sfx * 0.8
    out = hp(out, 28)
    # Master: auf Ziel-Lautheit bringen, dann Begrenzer mit Vorschau (-1 dBFS)
    main = out[int(SCENES["gebiete"] * SR) : int(OUTRO * SR)]
    rms = np.sqrt(np.mean(main ** 2))
    out *= 10 ** (-14.6 / 20) / rms
    out = limiter(out, 10 ** (-1.5 / 20))
    # weiche Blende am Anfang/Ende
    ramp = int(0.02 * SR)
    out[:ramp] *= np.linspace(0, 1, ramp)[:, None]
    out[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))[:, None]
    rms = np.sqrt(np.mean(out ** 2))
    print(f"Spitze -1 dBFS, RMS {20 * np.log10(rms):.1f} dBFS, {DUR:.1f} s")
    pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
    path = os.path.join(HERE, f"soundtrack{SUFFIX}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(path)


if __name__ == "__main__":
    main()
