// Procedural radio for VERDE BAY: three stations, all synthesized live with
// WebAudio — no audio files, no network. Each station is a small step
// sequencer: a bass line, a plucked lead and a hat, from its own scale, root
// and tempo. The game starts audio on the first user gesture (Enter/click),
// as browsers require; until then the sound object sits idle.

const STATIONS = [
  {
    name: 'SOL FM',
    tag: 'synthwave',
    bpm: 112,
    root: 45, // A2
    scale: [0, 3, 5, 7, 10, 12, 15],
    wave: 'sawtooth',
    bassWave: 'triangle',
  },
  {
    name: 'VERDE 88',
    tag: 'lo-fi jazz',
    bpm: 76,
    root: 48, // C3
    scale: [0, 3, 5, 7, 10, 12],
    wave: 'sine',
    bassWave: 'sine',
  },
  {
    name: 'LATINA 101',
    tag: 'latin pop',
    bpm: 124,
    root: 50, // D3
    scale: [0, 2, 4, 7, 9, 12],
    wave: 'square',
    bassWave: 'triangle',
  },
];

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function createSound() {
  const sound = {
    stations: STATIONS.map((s) => s.name),
    station: 0,
    muted: false,
    ready: false,
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    step: 0,
    nextTime: 0,
    timer: null,
  };

  sound.ensure = function ensure() {
    if (sound.ready) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      sound.ctx = new Ctx();
      sound.master = sound.ctx.createGain();
      sound.master.gain.value = 0.5;
      sound.master.connect(sound.ctx.destination);
      sound.musicGain = sound.ctx.createGain();
      sound.musicGain.gain.value = 0.16;
      sound.musicGain.connect(sound.master);
      sound.sfxGain = sound.ctx.createGain();
      sound.sfxGain.gain.value = 0.5;
      sound.sfxGain.connect(sound.master);
      sound.ready = true;
      sound.nextTime = sound.ctx.currentTime + 0.1;
      sound.step = 0;
      sound.timer = setInterval(() => sound.schedule(), 40);
    } catch {
      sound.ready = false;
    }
  };

  sound.schedule = function schedule() {
    if (!sound.ready || sound.muted) return;
    const st = STATIONS[sound.station];
    const stepDur = 60 / st.bpm / 2; // eighth notes
    while (sound.nextTime < sound.ctx.currentTime + 0.15) {
      sound.playStep(st, sound.step, sound.nextTime, stepDur);
      sound.nextTime += stepDur;
      sound.step = (sound.step + 1) % 32;
    }
  };

  sound.playStep = function playStep(st, step, when, dur) {
    const ctx = sound.ctx;
    // Bass on beats 0, 4, 8... walks the scale.
    if (step % 4 === 0) {
      const deg = [0, 0, 3, 4][((step / 4) | 0) % 4] % st.scale.length;
      const osc = ctx.createOscillator();
      osc.type = st.bassWave;
      osc.frequency.value = midiToFreq(st.root - 12 + st.scale[deg]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, when);
      g.gain.exponentialRampToValueAtTime(0.01, when + dur * 3.5);
      osc.connect(g);
      g.connect(sound.musicGain);
      osc.start(when);
      osc.stop(when + dur * 4);
    }
    // Lead pluck on a sparse pattern.
    if (step % 2 === 0 && (step * 7 + 3) % 5 < 3) {
      const deg = (step * 3 + 5) % st.scale.length;
      const osc = ctx.createOscillator();
      osc.type = st.wave;
      osc.frequency.value = midiToFreq(st.root + 12 + st.scale[deg]);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, when);
      g.gain.exponentialRampToValueAtTime(0.01, when + dur * 1.8);
      osc.connect(g);
      g.connect(sound.musicGain);
      osc.start(when);
      osc.stop(when + dur * 2);
    }
    // Hat tick on off-beats.
    if (step % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      src.connect(g);
      g.connect(sound.musicGain);
      src.start(when);
    }
  };

  sound.setStation = function setStation(i) {
    sound.station = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    sound.step = 0;
    if (sound.ctx) sound.nextTime = sound.ctx.currentTime + 0.05;
  };

  sound.toggleMute = function toggleMute() {
    sound.muted = !sound.muted;
    if (sound.master) sound.master.gain.value = sound.muted ? 0 : 0.5;
    return sound.muted;
  };

  // Short effects: pickup chime, cash, crash thud, siren blip.
  sound.blip = function blip(freq, dur, type, vol) {
    if (!sound.ready || sound.muted) return;
    const ctx = sound.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    osc.connect(g);
    g.connect(sound.sfxGain);
    osc.start(t);
    osc.stop(t + dur);
  };

  sound.cash = function cash() {
    sound.blip(880, 0.12, 'sine', 0.3);
    setTimeout(() => sound.blip(1318, 0.18, 'sine', 0.3), 70);
  };

  sound.thud = function thud() {
    sound.blip(70, 0.25, 'triangle', 0.5);
  };

  sound.siren = function siren() {
    sound.blip(660, 0.3, 'square', 0.08);
    setTimeout(() => sound.blip(520, 0.3, 'square', 0.08), 150);
  };

  return sound;
}
