/**
 * Audio: everything is synthesised with the Web Audio API — no sample files, no licences.
 *
 * Bus layout:  voices → [sfx | ambience | music | ui] gains → master → compressor → output
 * Continuous layers (wind, slide scrape, wall-run scrape) are driven every frame from the
 * player's speed and state; one-shots are short synthesised voices with pitch variation.
 */
import type { Settings } from '../settings/settings';

type Bus = 'sfx' | 'ambience' | 'music' | 'ui';

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private wind?: { gain: GainNode; filter: BiquadFilterNode };
  private slide?: { gain: GainNode; filter: BiquadFilterNode };
  private wall?: { gain: GainNode; filter: BiquadFilterNode };
  private pad?: { gain: GainNode; oscs: OscillatorNode[]; filter: BiquadFilterNode };
  private music?: Music;
  private settings: Settings | null = null;
  private seed = 7;
  private muted = false;

  /** Must be called from a user gesture (the "click to start" gate). */
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.connect(comp).connect(ctx.destination);
    this.buses = {
      sfx: ctx.createGain(),
      ambience: ctx.createGain(),
      music: ctx.createGain(),
      ui: ctx.createGain(),
    };
    for (const b of Object.values(this.buses)) b.connect(this.master);

    // 2 s of white noise, reused by every noise-based voice
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = this.rnd() * 2 - 1;

    this.wind = this.loop('ambience', 'bandpass', 400, 0.6);
    this.slide = this.loop('sfx', 'bandpass', 1400, 1.2);
    this.wall = this.loop('sfx', 'highpass', 2200, 0.7);
    this.music = new Music(ctx, this.buses.music);
    if (this.settings) this.applySettings(this.settings);
  }

  private rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private loop(bus: Bus, type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.buses[bus]);
    src.start();
    return { gain, filter };
  }

  applySettings(s: Settings) {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : s.volMaster, t, 0.03);
    this.buses.sfx.gain.setTargetAtTime(s.volSfx, t, 0.03);
    this.buses.ambience.gain.setTargetAtTime(s.volAmbience, t, 0.03);
    this.buses.music.gain.setTargetAtTime(s.volMusic * 0.8, t, 0.03);
    this.buses.ui.gain.setTargetAtTime(s.volUi, t, 0.03);
  }

  /** Duck everything while paused / tab hidden. */
  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.settings)
      this.master.gain.setTargetAtTime(m ? 0 : this.settings.volMaster, this.ctx.currentTime, 0.05);
  }

  // ----- continuous layers ---------------------------------------------------------------
  /** Called every frame while playing. speed in m/s. */
  update(speed: number, sliding: boolean, wallRunning: boolean, airborne: boolean, intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / 30);
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(0.03 + k * k * 0.75 + (airborne ? 0.06 : 0), t, 0.08);
      this.wind.filter.frequency.setTargetAtTime(260 + k * 2100, t, 0.1);
    }
    if (this.slide) {
      this.slide.gain.gain.setTargetAtTime(sliding ? 0.14 + k * 0.4 : 0, t, sliding ? 0.03 : 0.07);
      this.slide.filter.frequency.setTargetAtTime(700 + k * 2600, t, 0.05);
    }
    if (this.wall) this.wall.gain.gain.setTargetAtTime(wallRunning ? 0.1 + k * 0.12 : 0, t, 0.04);
    this.music?.setIntensity(intensity);
  }

  silenceLoops() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind?.gain.gain.setTargetAtTime(0.02, t, 0.1);
    this.slide?.gain.gain.setTargetAtTime(0, t, 0.05);
    this.wall?.gain.gain.setTargetAtTime(0, t, 0.05);
  }

  // ----- voice helpers --------------------------------------------------------------------
  private tone(bus: Bus, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.buses[bus]);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(
    bus: Bus,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    q = 1,
    delay = 0,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + this.rnd() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.buses[bus]);
    src.start(t, this.rnd() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private vary(amount = 0.08) {
    return 1 + (this.rnd() * 2 - 1) * amount;
  }

  // ----- one-shots ------------------------------------------------------------------------
  footstep(speed: number, wall: boolean) {
    const v = 0.1 + Math.min(1, speed / 14) * 0.16;
    if (wall) {
      this.burst('sfx', 'bandpass', 1900 * this.vary(0.15), 900, 0.07, v * 1.1, 2.2);
      this.tone('sfx', 'triangle', 240 * this.vary(), 150, 0.06, v * 0.5);
    } else {
      this.burst('sfx', 'lowpass', 900 * this.vary(0.2), 200, 0.08, v * 1.4, 0.8);
      this.tone('sfx', 'sine', 110 * this.vary(), 60, 0.07, v * 0.8);
    }
  }
  jump() {
    this.tone('sfx', 'sine', 190 * this.vary(), 330, 0.13, 0.22);
    this.burst('sfx', 'bandpass', 700, 1700, 0.12, 0.16, 0.9);
  }
  doubleJump() {
    this.tone('sfx', 'triangle', 440 * this.vary(0.04), 880, 0.16, 0.24);
    this.tone('sfx', 'sine', 660 * this.vary(0.04), 1320, 0.2, 0.14, 0.03);
    this.burst('sfx', 'highpass', 2500, 6000, 0.2, 0.14);
  }
  dash() {
    this.burst('sfx', 'bandpass', 500, 4200, 0.28, 0.55, 0.7);
    this.tone('sfx', 'sine', 95, 38, 0.3, 0.6);
    this.tone('sfx', 'sawtooth', 220 * this.vary(0.03), 660, 0.14, 0.08);
  }
  land(impact: number) {
    const k = Math.min(1, impact / 26);
    this.tone('sfx', 'sine', 120 - k * 40, 38, 0.14 + k * 0.16, 0.25 + k * 0.5);
    this.burst('sfx', 'lowpass', 1200 + k * 900, 180, 0.12 + k * 0.1, 0.18 + k * 0.3, 0.7);
  }
  slideStart() {
    this.burst('sfx', 'bandpass', 2400, 900, 0.22, 0.3, 1.4);
  }
  wallStart() {
    this.burst('sfx', 'bandpass', 1500, 2600, 0.12, 0.26, 2);
    this.tone('sfx', 'triangle', 300, 380, 0.1, 0.12);
  }
  wallJump() {
    this.tone('sfx', 'square', 210 * this.vary(), 420, 0.1, 0.1);
    this.burst('sfx', 'bandpass', 900, 2600, 0.14, 0.3, 1.2);
  }
  vault() {
    this.burst('sfx', 'lowpass', 1400, 400, 0.1, 0.3);
    this.tone('sfx', 'sine', 160, 90, 0.1, 0.2, 0.04);
  }
  bump() {
    this.tone('sfx', 'sine', 90, 45, 0.12, 0.35);
    this.burst('sfx', 'lowpass', 700, 150, 0.1, 0.25);
  }
  boost() {
    this.tone('sfx', 'sawtooth', 180, 900, 0.3, 0.12);
    this.burst('sfx', 'bandpass', 600, 5000, 0.35, 0.35, 0.8);
  }
  jumpPad() {
    this.tone('sfx', 'sine', 260, 1040, 0.28, 0.3);
    this.tone('sfx', 'triangle', 390, 1560, 0.3, 0.14, 0.02);
  }
  death() {
    this.tone('sfx', 'sawtooth', 300, 40, 0.35, 0.22);
    this.burst('sfx', 'lowpass', 3000, 100, 0.35, 0.4);
  }
  respawn() {
    this.tone('sfx', 'sine', 300, 600, 0.12, 0.14);
  }
  /** Telegraph: terrain about to move / collapse. */
  warn() {
    for (let i = 0; i < 3; i++) this.tone('sfx', 'square', 520, 500, 0.07, 0.09, i * 0.14);
  }
  /** A crusher is about to drop: a short mechanical double tick, quieter with distance (0..1). */
  hazardWarn(near: number) {
    const g = 0.03 + 0.06 * Math.max(0, Math.min(1, near));
    this.tone('sfx', 'square', 300, 240, 0.05, g);
    this.tone('sfx', 'square', 300, 240, 0.05, g, 0.18);
  }
  // ----- sword ----------------------------------------------------------------------------
  /** Steel leaving the scabbard: a rising scrape and a ring. */
  swordDraw() {
    this.burst('sfx', 'bandpass', 2200 * this.vary(0.1), 5200, 0.22, 0.16, 3.5);
    this.tone('sfx', 'triangle', 1580 * this.vary(0.03), 1620, 0.35, 0.05, 0.12);
  }
  swordSheathe() {
    this.burst('sfx', 'bandpass', 4200 * this.vary(0.1), 1900, 0.26, 0.14, 3);
    this.tone('sfx', 'square', 260, 200, 0.05, 0.08, 0.27); // the hilt seats with a click
  }
  /** A swing through the air: heavier swings are lower and longer. kind 0..4, power 0..1. */
  slash(kind: number, power: number) {
    const base = [2600, 1700, 2200, 2000, 2900][kind] ?? 2400;
    const dur = 0.12 + power * 0.08;
    this.burst('sfx', 'bandpass', base * this.vary(0.08), base * 0.35, dur, 0.2 + power * 0.16, 1.8);
    this.burst('sfx', 'highpass', 5200, 3200, dur * 0.6, 0.06 + power * 0.05, 0.7);
    if (kind === 1) this.tone('sfx', 'sine', 140, 60, 0.18, 0.18); // the finisher has weight
  }
  /** The blade going through something, by material. */
  cut(mat: string, power: number) {
    const v = 0.6 + power * 0.4;
    switch (mat) {
      case 'wood':
        this.burst('sfx', 'bandpass', 900 * this.vary(0.12), 380, 0.16, 0.42 * v, 1.6);
        this.tone('sfx', 'triangle', 190 * this.vary(), 120, 0.1, 0.22 * v);
        this.burst('sfx', 'highpass', 3000, 1500, 0.08, 0.12 * v, 1, 0.05); // splinters
        break;
      case 'stone':
        this.burst('sfx', 'lowpass', 1500, 160, 0.4, 0.42 * v, 0.8);
        this.tone('sfx', 'sine', 95 * this.vary(), 48, 0.35, 0.36 * v);
        this.tone('sfx', 'triangle', 880, 860, 0.5, 0.05 * v, 0.03); // a struck-stone ring
        break;
      case 'metal':
        this.tone('sfx', 'square', 1240 * this.vary(0.04), 1180, 0.32, 0.08 * v);
        this.tone('sfx', 'triangle', 1870 * this.vary(0.04), 1800, 0.45, 0.07 * v);
        this.burst('sfx', 'highpass', 6000, 3000, 0.1, 0.18 * v);
        break;
      case 'glass':
        for (let i = 0; i < 4; i++)
          this.tone(
            'sfx',
            'sine',
            (2400 + i * 620) * this.vary(0.08),
            2000,
            0.12 + i * 0.04,
            0.05 * v,
            i * 0.028,
          );
        this.burst('sfx', 'highpass', 7000, 4000, 0.2, 0.2 * v);
        break;
      case 'energy':
        this.tone('sfx', 'sawtooth', 120, 1400, 0.22, 0.1 * v);
        this.burst('sfx', 'bandpass', 600, 7000, 0.35, 0.3 * v, 0.9);
        this.tone('sfx', 'sine', 880, 220, 0.4, 0.12 * v, 0.04);
        break;
    }
  }
  /** Running straight through something: a duller crash, no blade ring. */
  smash(mat: string) {
    this.burst('sfx', 'lowpass', mat === 'glass' ? 5000 : 1100, 140, 0.26, 0.4, 0.7);
    this.tone('sfx', 'sine', 80, 40, 0.18, 0.3);
    if (mat === 'glass') this.burst('sfx', 'highpass', 6000, 3500, 0.25, 0.16);
  }
  /** Bullseye on a training target. */
  bullseye() {
    this.tone('sfx', 'sine', 1320, 1320, 0.25, 0.1, 0.06);
    this.tone('sfx', 'sine', 1980, 1980, 0.3, 0.08, 0.12);
  }

  collapse() {
    this.burst('sfx', 'lowpass', 900, 80, 0.7, 0.55, 0.6);
    this.tone('sfx', 'sine', 70, 28, 0.6, 0.5);
  }
  checkpoint() {
    this.tone('ui', 'sine', 660, 660, 0.12, 0.2);
    this.tone('ui', 'sine', 990, 990, 0.22, 0.2, 0.09);
  }
  collect() {
    [880, 1175, 1568].forEach((f, i) => this.tone('ui', 'triangle', f, f, 0.16, 0.16, i * 0.06));
  }
  finish(medal: number) {
    const base = [523, 659, 784, 1047];
    base.forEach((f, i) => this.tone('ui', 'triangle', f, f, 0.5, 0.2, i * 0.1));
    if (medal >= 3) this.tone('ui', 'sine', 1568, 1568, 0.9, 0.16, 0.45);
    this.burst('ui', 'highpass', 3000, 9000, 0.9, 0.12, 0.5, 0.35);
  }
  medal(tier: number) {
    const f = [0, 392, 523, 659, 880][tier] ?? 523;
    this.tone('ui', 'triangle', f, f, 0.35, 0.22);
    this.tone('ui', 'sine', f * 1.5, f * 1.5, 0.5, 0.14, 0.08);
  }
  achievement() {
    [659, 880, 1319].forEach((f, i) => this.tone('ui', 'sine', f, f, 0.3, 0.16, i * 0.09));
  }
  uiHover() {
    this.tone('ui', 'sine', 1250, 1350, 0.035, 0.05);
  }
  uiClick() {
    this.tone('ui', 'triangle', 620, 930, 0.07, 0.14);
    this.burst('ui', 'highpass', 4000, 7000, 0.04, 0.05);
  }
  uiBack() {
    this.tone('ui', 'triangle', 620, 410, 0.08, 0.12);
  }

  // ----- music ----------------------------------------------------------------------------
  playMusic(preset: string) {
    this.music?.play(preset);
  }
  stopMusic() {
    this.music?.stop();
  }
}

/**
 * Generative music: a pad chord, a pulsing bass and an arpeggio stepped by a look-ahead scheduler.
 * `intensity` (0..1, from the player's speed) opens the filter and brings in the arp and hats,
 * so the track swells as the player builds momentum.
 */
const PRESETS: Record<
  string,
  { bpm: number; root: number; scale: number[]; chords: number[][]; wave: OscillatorType }
> = {
  menu: {
    bpm: 84,
    root: 50,
    scale: [0, 2, 3, 7, 9],
    chords: [
      [0, 7, 14],
      [-4, 3, 10],
      [-2, 5, 12],
      [-5, 2, 9],
    ],
    wave: 'triangle',
  },
  training: {
    bpm: 104,
    root: 48,
    scale: [0, 2, 4, 7, 9],
    chords: [
      [0, 7, 16],
      [-3, 4, 12],
      [5, 12, 16],
      [-5, 2, 11],
    ],
    wave: 'triangle',
  },
  awakening: {
    bpm: 112,
    root: 50,
    scale: [0, 2, 4, 7, 9, 11],
    chords: [
      [0, 7, 16],
      [5, 12, 21],
      [-3, 4, 12],
      [7, 14, 19],
    ],
    wave: 'triangle',
  },
  verticality: {
    bpm: 124,
    root: 45,
    scale: [0, 2, 3, 7, 8, 10],
    chords: [
      [0, 7, 15],
      [-4, 3, 12],
      [-2, 5, 14],
      [3, 10, 19],
    ],
    wave: 'sawtooth',
  },
  momentum: {
    bpm: 140,
    root: 43,
    scale: [0, 3, 5, 7, 10],
    chords: [
      [0, 7, 15],
      [-2, 5, 14],
      [3, 10, 17],
      [-4, 3, 10],
    ],
    wave: 'sawtooth',
  },
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private timer: ReturnType<typeof setInterval> | null = null;
  private preset = PRESETS.menu;
  private step = 0;
  private nextTime = 0;
  private intensity = 0;
  private out: GainNode;
  private filter: BiquadFilterNode;
  private name = '';

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.out).connect(dest);
  }

  setIntensity(v: number) {
    this.intensity += (v - this.intensity) * 0.03;
    this.filter.frequency.setTargetAtTime(700 + this.intensity * 5200, this.ctx.currentTime, 0.2);
  }

  play(name: string) {
    if (name === this.name && this.timer) return;
    this.name = name;
    this.preset = PRESETS[name] ?? PRESETS.menu;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.out.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.6);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 60);
  }

  stop() {
    this.name = '';
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule() {
    const p = this.preset;
    const sixteenth = 60 / p.bpm / 4;
    // look-ahead scheduling keeps timing tight regardless of frame rate
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      const t = this.nextTime;
      const s = this.step;
      const bar = Math.floor(s / 16);
      const chord = p.chords[bar % p.chords.length];
      const k = this.intensity;
      if (s % 16 === 0)
        for (const n of chord) this.voice(p.wave, mtof(p.root + 12 + n), t, sixteenth * 16, 0.05, 1.2);
      if (s % 4 === 0)
        this.voice('sine', mtof(p.root - 12 + chord[0]), t, sixteenth * 3, 0.16 + k * 0.1, 0.02);
      else if (s % 4 === 2 && k > 0.3)
        this.voice('sine', mtof(p.root - 12 + chord[0]), t, sixteenth * 1.5, 0.1 * k, 0.02);
      if (k > 0.12 || this.name === 'menu') {
        // arpeggio walks the scale against the chord
        const idx = (s * 3 + bar * 2) % (p.scale.length * 2);
        const oct = Math.floor(idx / p.scale.length);
        const note = p.root + 24 + chord[0] + p.scale[idx % p.scale.length] + oct * 12;
        if (s % 2 === 0 || k > 0.6)
          this.voice('triangle', mtof(note), t, sixteenth * 1.6, 0.035 + k * 0.05, 0.01);
      }
      if (k > 0.45 && s % 2 === 1) this.hat(t, 0.02 + k * 0.03);
      if (k > 0.25 && s % 8 === 0) this.kick(t, 0.2 + k * 0.2);
      this.step++;
      this.nextTime += sixteenth;
    }
  }

  private voice(type: OscillatorType, freq: number, t: number, dur: number, vol: number, attack: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = (freq % 7) - 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.filter);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private kick(t: number, vol: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
  }
  private hat(t: number, vol: number) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 8200;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.05);
  }
}
