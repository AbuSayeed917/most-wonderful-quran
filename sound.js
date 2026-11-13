/*
 * Soundscape: every sound here is synthesised in the browser.
 * No music and no sample files, so learners who avoid instruments can listen freely.
 */
(function () {
  "use strict";

  const MASTER_LEVEL = 0.9;
  const WIND_LEVEL = 0.05;
  const CRICKET_LEVEL = 0.01;
  const TICK_LEVEL = 0.16;

  let context = null;
  let master = null;
  let tickBuffer = null;
  let ambience = null;
  let isEnabled = true;
  let nightLevel = 1;

  function ensureContext() {
    if (context) return context;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = MASTER_LEVEL;
    master.connect(context.destination);
    tickBuffer = createTickBuffer(context);
    return context;
  }

  // Brown noise (integrated white noise) has the low, round hush of air moving.
  function createBrownNoise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < samples.length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      samples[i] = last * 3.5;
    }
    return buffer;
  }

  // A tiny burst of noise that dies away fast reads to the ear as a soft key press.
  function createTickBuffer(ctx) {
    const length = Math.floor(ctx.sampleRate * 0.045);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 7));
    }
    return buffer;
  }

  function startWind(ctx, destination) {
    const source = ctx.createBufferSource();
    source.buffer = createBrownNoise(ctx, 6);
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 420;

    const gain = ctx.createGain();
    gain.gain.value = WIND_LEVEL;

    // A very slow swell so the breeze rises and settles like breathing.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.06;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = WIND_LEVEL * 0.6;
    swell.connect(swellDepth).connect(gain.gain);

    source.connect(lowpass).connect(gain).connect(destination);
    source.start();
    swell.start();
    return {
      stop() {
        source.stop();
        swell.stop();
      }
    };
  }

  function startCricket(ctx, destination, frequency, pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(destination);
    let timer = null;

    function chirp(at) {
      const pulses = 3 + Math.floor(Math.random() * 2);
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency * (0.99 + Math.random() * 0.02);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(panner);
      for (let k = 0; k < pulses; k += 1) {
        const t = at + k * 0.048;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(CRICKET_LEVEL, t + 0.008);
        gain.gain.linearRampToValueAtTime(0, t + 0.032);
      }
      osc.start(at);
      osc.stop(at + pulses * 0.048 + 0.05);
    }

    function scheduleNext() {
      timer = setTimeout(() => {
        const now = ctx.currentTime + 0.05;
        chirp(now);
        if (Math.random() < 0.4) chirp(now + 0.32);
        scheduleNext();
      }, 900 + Math.random() * 1900);
    }

    scheduleNext();
    return {
      stop() {
        clearTimeout(timer);
        panner.disconnect();
      }
    };
  }

  function start() {
    if (!isEnabled || ambience) return;
    const ctx = ensureContext();
    ctx.resume().catch((error) => console.error("Soundscape could not resume audio:", error));

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 2.5);

    const crickets = ctx.createGain();
    crickets.gain.value = nightLevel;
    crickets.connect(bus);

    ambience = {
      bus,
      crickets,
      parts: [
        startWind(ctx, bus),
        startCricket(ctx, crickets, 4600, -0.6),
        startCricket(ctx, crickets, 5250, 0.55)
      ]
    };
  }

  function stop() {
    if (!ambience) return;
    const { bus, parts } = ambience;
    ambience = null;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.8);
    setTimeout(() => {
      parts.forEach((part) => part.stop());
      bus.disconnect();
    }, 3000);
  }

  function tick() {
    if (!isEnabled) return;
    const ctx = ensureContext();
    const now = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = tickBuffer;
    noise.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2200 + Math.random() * 1400;
    band.Q.value = 1.1;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = TICK_LEVEL;
    noise.connect(band).connect(noiseGain).connect(master);
    noise.start(now);

    // A low, short body under the click gives it the soft "thock" of a felt key.
    const body = ctx.createOscillator();
    body.frequency.value = 130 + Math.random() * 40;
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(TICK_LEVEL * 0.35, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.07);
  }

  function setNightLevel(level) {
    nightLevel = Math.max(0, Math.min(1, level));
    if (ambience) ambience.crickets.gain.setTargetAtTime(nightLevel, context.currentTime, 1.2);
  }

  function setEnabled(shouldEnable) {
    isEnabled = shouldEnable;
    if (shouldEnable) start();
    else stop();
  }

  window.Soundscape = {
    start,
    tick,
    setNightLevel,
    setEnabled,
    isEnabled: () => isEnabled
  };
})();
