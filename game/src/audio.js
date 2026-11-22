// Shadow Lantern — sound. One clear job: every sound the game makes,
// synthesized live with WebAudio, no audio files. Footsteps, a pickup chime,
// the alarm sting, the caught sting and the victory arpeggio. Muted until the
// player first interacts (browsers require a gesture for audio).

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function ensure() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.12);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  return {
    /** Call from any user gesture so the browser unlocks audio. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
    },
    isMuted() {
      return muted;
    },
    /** A soft footstep; `near` 0..1 scales the volume by distance. */
    footstep(near) {
      noiseBurst(0.07, 0.1 + 0.22 * near, 700);
    },
    /** The player's own step is quieter than a guard's boot. */
    playerStep() {
      noiseBurst(0.05, 0.07, 500);
    },
    pickup() {
      tone(880, 0.12, 'sine', 0.25);
      tone(1318, 0.18, 'sine', 0.2, 0.07);
    },
    unlockExit() {
      tone(523, 0.14, 'triangle', 0.22);
      tone(784, 0.14, 'triangle', 0.22, 0.09);
      tone(1046, 0.22, 'triangle', 0.22, 0.18);
    },
    alert() {
      tone(220, 0.35, 'sawtooth', 0.28, 0, 440);
      tone(233, 0.3, 'sawtooth', 0.2, 0.05, 466);
    },
    calm() {
      tone(392, 0.25, 'sine', 0.14, 0, 311);
    },
    caught() {
      tone(196, 0.5, 'sawtooth', 0.3, 0, 98);
      tone(147, 0.7, 'sawtooth', 0.25, 0.15, 73);
    },
    levelClear() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.1));
    },
    victory() {
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, i * 0.12));
    },
  };
}
