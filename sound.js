/*
 * Soundscape: every sound here is synthesised in the browser.
 * No music and no sample files, so learners who avoid instruments can listen freely.
 *
 * A quiet desert night: two stereo layers of gusting wind, a faint hiss of drifting sand,
 * and distant crickets, all sent through a generated open-air reverb so the space feels wide.
 */
(function () {
  "use strict";

  const MASTER_LEVEL = 0.85;
  const AMBIENCE_LEVEL = 0.9;
  const REVERB_SEND = 0.55;
  const TICK_LEVEL = 0.11;

  let context = null;
  let master = null;
  let reverb = null;
  let noiseBuffers = null;
  let ambience = null;
  let isEnabled = true;
  let nightLevel = 1;

  function ensureContext() {
    if (context) return context;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = MASTER_LEVEL;
    master.connect(context.destination);

    reverb = context.createConvolver();
    reverb.buffer = createImpulse(context, 3.2, 2.6);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.9;
    reverb.connect(reverbReturn).connect(master);

    noiseBuffers = {
      brownLeft: createBrownNoise(context, 8),
      brownRight: createBrownNoise(context, 8),
      pink: createPinkNoise(context, 6)
    };
    return context;
  }

  /* ---------- Raw materials ---------- */

  // Brown noise has the round, low hush of air moving over open ground.
  function createBrownNoise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    return buffer;
  }

  // Pink noise (Paul Kellet's filter) sounds like fine grains: used for the sand.
  function createPinkNoise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  // Decaying stereo noise is an impulse response for a wide, open space with no walls nearby.
  function createImpulse(ctx, seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  function loopSource(ctx, buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.random() * 2;
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  /* ---------- Layers ---------- */

  // Wind gusts wander at random instead of swelling on a fixed sine, which is what makes them feel real.
  function startWindLayer(ctx, buffer, pan, destination) {
    const source = loopSource(ctx, buffer);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.6;
    band.frequency.value = 320;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(band).connect(lowpass).connect(gain).connect(panner).connect(destination);

    let timer = null;
    function gust() {
      const now = ctx.currentTime;
      const length = 3 + Math.random() * 6;
      gain.gain.setTargetAtTime(0.03 + Math.random() * 0.07, now, length / 3);
      band.frequency.setTargetAtTime(200 + Math.random() * 380, now, length / 2);
      timer = setTimeout(gust, length * 1000);
    }
    gust();
    return { stop() { clearTimeout(timer); source.stop(); } };
  }

  function startSand(ctx, destination) {
    const source = loopSource(ctx, noiseBuffers.pink);
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 3200;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 9000;
    const gain = ctx.createGain();
    gain.gain.value = 0.006;
    source.connect(highpass).connect(lowpass).connect(gain).connect(destination);

    let timer = null;
    function drift() {
      gain.gain.setTargetAtTime(0.002 + Math.random() * 0.008, ctx.currentTime, 2.5);
      timer = setTimeout(drift, 3000 + Math.random() * 4000);
    }
    drift();
    return { stop() { clearTimeout(timer); source.stop(); } };
  }

  // A cricket chirp is a few fast pulses of one pitch; a lowpass and the reverb push it far away.
  function startCricket(ctx, destination, pitch, pan, level) {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 5600;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    lowpass.connect(panner).connect(destination);
    let timer = null;

    function chirp(at) {
      const pulses = 2 + Math.floor(Math.random() * 3);
      const pulseGap = 0.042 + Math.random() * 0.01;
      const osc = ctx.createOscillator();
      osc.frequency.value = pitch * (0.985 + Math.random() * 0.03);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(lowpass);
      const peak = level * (0.5 + Math.random() * 0.5);
      for (let k = 0; k < pulses; k += 1) {
        const t = at + k * pulseGap;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.00001, t + 0.03);
      }
      osc.start(at);
      osc.stop(at + pulses * pulseGap + 0.05);
    }

    function scheduleNext() {
      // Real crickets rest sometimes; long pauses keep the night from feeling like a metronome.
      const rest = Math.random() < 0.15 ? 5000 + Math.random() * 6000 : 700 + Math.random() * 1800;
      timer = setTimeout(() => {
        const now = ctx.currentTime + 0.03;
        chirp(now);
        if (Math.random() < 0.5) chirp(now + 0.26 + Math.random() * 0.1);
        scheduleNext();
      }, rest);
    }
    scheduleNext();
    return { stop() { clearTimeout(timer); lowpass.disconnect(); } };
  }

  /* ---------- Public controls ---------- */

  function start() {
    if (!isEnabled || ambience) return;
    const ctx = ensureContext();
    ctx.resume().catch((error) => console.error("Soundscape could not resume audio:", error));

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    const send = ctx.createGain();
    send.gain.value = REVERB_SEND;
    bus.connect(send).connect(reverb);
    bus.gain.setTargetAtTime(AMBIENCE_LEVEL, ctx.currentTime, 2.5);

    const crickets = ctx.createGain();
    crickets.gain.value = nightLevel;
    // Crickets go mostly to the reverb so they sit far off, behind the wind.
    const cricketDry = ctx.createGain();
    cricketDry.gain.value = 0.35;
    crickets.connect(cricketDry).connect(bus);
    crickets.connect(reverb);

    ambience = {
      bus,
      crickets,
      parts: [
        startWindLayer(ctx, noiseBuffers.brownLeft, -0.55, bus),
        startWindLayer(ctx, noiseBuffers.brownRight, 0.55, bus),
        startSand(ctx, bus),
        startCricket(ctx, crickets, 4400, -0.7, 0.0045),
        startCricket(ctx, crickets, 5100, 0.6, 0.0035),
        startCricket(ctx, crickets, 4750, 0.1, 0.0022)
      ]
    };
  }

  function stop() {
    if (!ambience) return;
    const { bus, crickets, parts } = ambience;
    ambience = null;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.8);
    crickets.gain.setTargetAtTime(0, context.currentTime, 0.8);
    setTimeout(() => {
      parts.forEach((part) => part.stop());
      bus.disconnect();
      crickets.disconnect();
    }, 3500);
  }

  function playClick(ctx, at, level, centre) {
    const length = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 9));
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = centre;
    band.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(band).connect(gain);
    gain.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    gain.connect(send).connect(reverb);
    source.start(at);
  }

  // A soft felt key: a muted press, a low body, then a quieter release a moment later.
  function tick() {
    if (!isEnabled) return;
    const ctx = ensureContext();
    const now = ctx.currentTime + 0.005;
    const centre = 1500 + Math.random() * 900;
    playClick(ctx, now, TICK_LEVEL, centre);
    playClick(ctx, now + 0.055 + Math.random() * 0.02, TICK_LEVEL * 0.35, centre * 1.25);

    const body = ctx.createOscillator();
    body.type = "sine";
    body.frequency.value = 110 + Math.random() * 30;
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(TICK_LEVEL * 0.45, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.06);
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
