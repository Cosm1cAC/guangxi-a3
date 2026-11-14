// Procedural card effects and river ambience; licensed CC0 music uses the queue.
import { createBrowserMusicPlayer } from './music';
type Settings = { sfx: boolean; music: boolean; ambient: boolean; volume: number };
const KEY = 'a3-sound';
const PENTA = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.26, 739.99]; // D 宫调

export class SoundEngine {
  settings: Settings = { sfx: true, music: true, ambient: true, volume: .8 };
  private ctx?: AudioContext;
  private master!: GainNode; private sfxBus!: GainNode; private musicBus!: GainNode; private ambBus!: GainNode; private verb!: ConvolverNode; private verbSend!: GainNode;
  private noise!: AudioBuffer; private plucks = new Map<number, AudioBuffer>();
  readonly musicPlayer = createBrowserMusicPlayer();
  private ambNodes: AudioNode[] = []; private insectTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    try {
      const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
      for(const key of ['sfx','music','ambient'] as const)if(typeof saved?.[key]==='boolean')this.settings[key]=saved[key];
      if(typeof saved?.volume==='number'&&Number.isFinite(saved.volume))this.settings.volume=Math.max(0,Math.min(1,saved.volume));
    }catch{/* Defaults work without storage. */}
    this.musicPlayer.settings.enabled=this.settings.music;this.musicPlayer.setMasterVolume(this.settings.volume);
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  save() { try{localStorage.setItem(KEY, JSON.stringify(this.settings));}catch{/* Audio still works without storage. */}this.apply(); }

  /** Must be called from a user gesture. */
  unlock() {
    this.musicPlayer.setEnabled(this.settings.music);
    this.musicPlayer.setMasterVolume(this.settings.volume);
    this.musicPlayer.activate();
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
      this.master = ctx.createGain(); this.master.connect(comp);
      this.sfxBus = ctx.createGain(); this.musicBus = ctx.createGain(); this.ambBus = ctx.createGain();
      [this.sfxBus, this.musicBus, this.ambBus].forEach(b => b.connect(this.master));
      this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(3.2); this.verbSend = ctx.createGain(); this.verbSend.gain.value = .9;
      this.verbSend.connect(this.verb); this.verb.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      PENTA.forEach(f => this.plucks.set(f, this.karplus(f)));
      this.apply();
    }
    void this.ctx.resume();
  }

  private apply() {
    this.musicPlayer.setMasterVolume(this.settings.volume);
    this.musicPlayer.setEnabled(this.settings.music);
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.settings;
    this.master.gain.setTargetAtTime(s.volume, t, .1);
    this.sfxBus.gain.setTargetAtTime(s.sfx ? 1 : 0, t, .05);
    this.musicBus.gain.setTargetAtTime(s.music ? .55 : 0, t, .4);
    this.ambBus.gain.setTargetAtTime(s.ambient ? .5 : 0, t, .4);
    if (s.ambient) this.startAmbient(); else this.stopAmbient();
  }

  private impulse(sec: number) {
    const ctx = this.ctx!, len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2; }
    return b;
  }
  private karplus(freq: number) {
    const ctx = this.ctx!, sr = ctx.sampleRate, len = Math.floor(sr * 3.2), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const N = Math.round(sr / freq), buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = (Math.random() * 2 - 1) * (1 - i / N * .5);
    let prev = 0, idx = 0; const decay = .9965 - (freq > 400 ? .0015 : 0);
    for (let i = 0; i < len; i++) {
      const cur = buf[idx]; const nxt = (cur + prev) * .5 * decay; prev = cur; buf[idx] = nxt; idx = (idx + 1) % N;
      // pluck body: blend in a little of the raw string with a soft attack
      d[i] = cur * Math.min(1, i / 60);
    }
    return b;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  private out(pan = 0, wet = 0) {
    const ctx = this.ctx!, g = ctx.createGain(), p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfxBus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verbSend); }
    return g;
  }
  private noiseHit(t: number, opts: { type: BiquadFilterType; freq: number; q?: number; peak: number; attack?: number; decay: number; pan?: number; wet?: number; rate?: number; dest?: AudioNode }) {
    const ctx = this.ctx!, src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = opts.rate ?? 1;
    const f = ctx.createBiquadFilter(); f.type = opts.type; f.frequency.value = opts.freq; f.Q.value = opts.q ?? 1;
    const g = opts.dest ? ctx.createGain() : this.out(opts.pan, opts.wet); if (opts.dest) g.connect(opts.dest);
    src.connect(f); f.connect(g); this.env(g, t, opts.peak, opts.attack ?? .002, opts.decay);
    src.start(t, Math.random() * 1.5); src.stop(t + (opts.attack ?? .002) + opts.decay + .05);
  }
  private tone(t: number, freq: number, opts: { type?: OscillatorType; peak: number; attack?: number; decay: number; pan?: number; wet?: number; glide?: number; dest?: AudioNode }) {
    const ctx = this.ctx!, o = ctx.createOscillator(); o.type = opts.type ?? 'sine'; o.frequency.setValueAtTime(freq, t);
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(opts.glide, t + (opts.attack ?? .005) + opts.decay);
    const g = opts.dest ? ctx.createGain() : this.out(opts.pan, opts.wet); if (opts.dest) g.connect(opts.dest);
    o.connect(g); this.env(g, t, opts.peak, opts.attack ?? .005, opts.decay); o.start(t); o.stop(t + (opts.attack ?? .005) + opts.decay + .05);
  }
  private pluck(t: number, freq: number, gain: number, pan = 0, dest?: AudioNode) {
    const ctx = this.ctx!, buf = this.plucks.get(freq) ?? [...this.plucks.entries()].sort((a, b) => Math.abs(a[0] - freq) - Math.abs(b[0] - freq))[0][1];
    const src = ctx.createBufferSource(); src.buffer = buf; if (!this.plucks.has(freq)) src.playbackRate.value = freq / [...this.plucks.keys()].sort((a, b) => Math.abs(a - freq) - Math.abs(b - freq))[0];
    const g = ctx.createGain(); g.gain.value = gain; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp); lp.connect(g); g.connect(p); p.connect(dest ?? this.sfxBus);
    const w = ctx.createGain(); w.gain.value = .35; p.connect(w); w.connect(this.verbSend);
    src.start(t);
  }
  private get t() { return this.ctx!.currentTime; }
  private can() { return this.ready && this.settings.sfx; }

  // ---------------- SFX ----------------
  flick(pan = 0, delay = 0) { if (!this.can()) return; const t = this.t + delay; this.noiseHit(t, { type: 'bandpass', freq: 2600 + Math.random() * 1600, q: .9, peak: .32, decay: .07, pan }); this.noiseHit(t + .012, { type: 'highpass', freq: 5000, peak: .08, decay: .03, pan }); }
  place(pan = 0, delay = 0, heavy = false) {
    if (!this.can()) return; const t = this.t + delay;
    this.noiseHit(t, { type: 'lowpass', freq: heavy ? 700 : 1200, peak: heavy ? .55 : .35, decay: heavy ? .16 : .09, pan, wet: .1 });
    this.tone(t, heavy ? 95 : 150, { peak: heavy ? .35 : .15, decay: heavy ? .18 : .07, glide: heavy ? 55 : 90, pan });
  }
  deal(count: number, spacing: number) { if (!this.can()) return; for (let i = 0; i < count; i++) this.flick([0, .6, 0, -.6][i % 4] * .7, .2 + i * spacing / 1000); }
  shuffle() {
    if (!this.can()) return; const t = this.t;
    for (let i = 0; i < 46; i++) { const k = i / 46; this.noiseHit(t + k * .7, { type: 'bandpass', freq: 3000 + Math.sin(k * 9) * 800, q: 1.4, peak: .07 + .1 * Math.sin(k * Math.PI), decay: .02, pan: Math.sin(i) * .3 }); }
    this.place(0, .78);
  }
  select(up: boolean) { if (!this.can()) return; const t = this.t; this.tone(t, up ? 1320 : 990, { type: 'triangle', peak: .06, decay: .06, glide: up ? 1760 : 760 }); this.noiseHit(t, { type: 'bandpass', freq: 4200, peak: .06, decay: .025 }); }
  hover() { if (!this.can()) return; this.tone(this.t, 2400 + Math.random() * 300, { peak: .012, decay: .03 }); }
  button() { if (!this.can()) return; const t = this.t; this.tone(t, 680, { type: 'triangle', peak: .07, decay: .05 }); this.noiseHit(t, { type: 'bandpass', freq: 1800, q: 3, peak: .05, decay: .03 }); }
  /** 木鱼 woodblock knock for passing. */
  pass(pan = 0) {
    if (!this.can()) return; const t = this.t;
    for (const [d, f] of [[0, 780], [.13, 640]] as const) { this.tone(t + d, f, { peak: .22, decay: .07, pan, wet: .15, glide: f * .96 }); this.noiseHit(t + d, { type: 'bandpass', freq: f * 2.2, q: 6, peak: .12, decay: .025, pan }); }
  }
  /** Bronze bell for "your turn". */
  bell(base = 880, peak = .09) {
    if (!this.can()) return; const t = this.t;
    [[1, 1], [2.01, .5], [2.76, .35], [5.4, .18], [8.93, .08]].forEach(([r, a], i) => this.tone(t, base * r, { peak: peak * a, attack: .003, decay: 1.6 - i * .2, wet: .5 }));
  }
  /** Big bronze gong for five-card power plays. */
  gong(peak = .32) {
    if (!this.can()) return; const t = this.t;
    [[1, 1], [1.48, .6], [2.07, .5], [2.63, .4], [3.13, .3], [4.24, .2]].forEach(([r, a], i) => this.tone(t, 98 * r * (1 + (Math.random() - .5) * .006), { peak: peak * a, attack: .01 + i * .01, decay: 3.4 - i * .3, wet: .7, glide: 98 * r * .985 }));
    this.noiseHit(t, { type: 'lowpass', freq: 420, peak: .35, attack: .004, decay: .5, wet: .4 });
  }
  reveal() { if (!this.can()) return; this.bell(1318, .07); setTimeout(() => this.bell(1760, .05), 120); }
  error() { if (!this.can()) return; const t = this.t; this.tone(t, 196, { type: 'triangle', peak: .12, decay: .1 }); this.tone(t + .11, 165, { type: 'triangle', peak: .12, decay: .14 }); }
  /** 报单 warning: two quick high plucks. */
  alarm() { if (!this.can()) return; const t = this.t; this.pluck(t, 739.99, .5); this.pluck(t + .12, 739.99, .45); }
  /** Incoming chat: two soft high plucks. */
  chat() { if (!this.can()) return; const t = this.t; this.pluck(t, PENTA[10], .22, .3); this.pluck(t + .09, PENTA[12], .18, .3); }
  /** Tribute card handed over: a whoosh into a low pluck. */
  tribute(pan = 0) { if (!this.can()) return; const t = this.t; this.noiseHit(t, { type: 'bandpass', freq: 1800, q: .7, peak: .12, attack: .25, decay: .3, pan }); this.pluck(t + .6, PENTA[2], .4, pan); this.place(pan, .62); }
  finish() { if (!this.can()) return; const t = this.t; [5, 7, 9, 10].forEach((d, i) => this.pluck(t + i * .09, PENTA[d], .5)); }
  win() {
    if (!this.can()) return; const t = this.t;
    [0, 2, 4, 5, 7, 9, 10, 12].forEach((d, i) => this.pluck(t + i * .085, PENTA[d], .55, (i / 7 - .5) * .6));
    setTimeout(() => this.gong(.25), 700);
    [12, 9, 12].forEach((d, i) => this.pluck(t + 1.1 + i * .3, PENTA[d], .5));
  }
  lose() { if (!this.can()) return; const t = this.t; [9, 7, 5, 4, 2].forEach((d, i) => this.pluck(t + i * .32, PENTA[d], .45)); }
  firework(delay = 0) {
    if (!this.can()) return; const t = this.t + delay;
    this.tone(t, 1600, { type: 'sine', peak: .03, decay: .6, glide: 400, attack: .3 });
    this.noiseHit(t + .9, { type: 'lowpass', freq: 900, peak: .4, decay: .5, wet: .6 });
    for (let i = 0; i < 18; i++) this.noiseHit(t + 1 + Math.random() * .8, { type: 'highpass', freq: 3000, peak: .05, decay: .03, pan: Math.random() - .5 });
  }

  // ---------------- Ambient: river, breeze, insects ----------------
  private startAmbient() {
    if (this.ambNodes.length || !this.ctx) return;
    const ctx = this.ctx;
    const mk = (freq: number, type: BiquadFilterType, gain: number, lfoRate: number, lfoDepth: number) => {
      const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = .5 + Math.random() * .1;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = .6;
      const g = ctx.createGain(); g.gain.value = gain; const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate; const lg = ctx.createGain(); lg.gain.value = lfoDepth;
      lfo.connect(lg); lg.connect(g.gain); src.connect(f); f.connect(g); g.connect(this.ambBus); src.start(); lfo.start();
      this.ambNodes.push(src, lfo);
    };
    mk(420, 'lowpass', .22, .11, .08);   // river body
    mk(1400, 'bandpass', .05, .23, .03); // ripples
    mk(260, 'lowpass', .1, .05, .06);    // breeze
    const insect = () => {
      if (!this.ctx || !this.ambNodes.length) return;
      const t = ctx.currentTime, f = 4200 + Math.random() * 1600, pan = Math.random() * 1.6 - .8, n = 3 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(); o.frequency.value = f; p.pan.value = pan; o.connect(g); g.connect(p); p.connect(this.ambBus); const s = t + i * .09; g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(.012, s + .01); g.gain.exponentialRampToValueAtTime(0.0001, s + .06); o.start(s); o.stop(s + .07); }
      this.insectTimer = setTimeout(insect, 1800 + Math.random() * 4500);
    };
    this.insectTimer = setTimeout(insect, 1500);
  }
  private stopAmbient() { this.ambNodes.forEach(n => { try { (n as AudioScheduledSourceNode).stop(); } catch { /* already stopped */ } }); this.ambNodes = []; clearTimeout(this.insectTimer); }
}
