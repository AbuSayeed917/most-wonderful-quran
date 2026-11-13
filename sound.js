/*
 * Soundscape: every ambient sound here is synthesised in the browser.
 * No music and no sample files, so learners who avoid instruments can listen freely.
 *
 * Three places to sit: a desert night, soft rain, or a gentle stream. Each is layered noise
 * shaped by filters, with small random events, sent through a generated open-air reverb.
 * The recitation is routed through here too, for soft fades and to read the reciter's voice level.
 */
(function () {
  "use strict";

  const MASTER_LEVEL = 0.85;
  const SCAPE_LEVEL = 0.9;
  const REVERB_SEND = 0.5;
  const TICK_LEVEL = 0.11;
  const VOICE_FADE_IN = 0.12;
  const VOICE_FADE_OUT = 0.14;
  const SCAPES = ["night", "rain", "stream"];

  let context = null;
  let master = null;
  let reverb = null;
  let buffers = null;
  let active = null;
  let scape = "night";
  let isEnabled = true;
  let nightLevel = 1;
  const voices = new Map();

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

    buffers = {
      brownA: createBrownNoise(context, 8),
      brownB: createBrownNoise(context, 8),
      pinkA: createPinkNoise(context, 6),
      pinkB: createPinkNoise(context, 6),
      white: createWhiteNoise(context, 4)
    };
    return context;
  }

  function resume() {
    const ctx = ensureContext();
    if (ctx.state === "running") return Promise.resolve();
    return ctx.resume().catch((error) => console.error("Soundscape could not resume audio:", error));
  }

  /* ---------- Raw materials ---------- */

  function createWhiteNoise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

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

  // Pink noise (Paul Kellet's filter) sounds like fine grains and running water.
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
    source.start(0, Math.random() * buffer.duration);
    return source;
  }

  function filter(ctx, type, frequency, q) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    if (q !== undefined) node.Q.value = q;
    return node;
  }

  function gainNode(ctx, value) {
    const node = ctx.createGain();
    node.gain.value = value;
    return node;
  }

  function panNode(ctx, value) {
    const node = ctx.createStereoPanner();
    node.pan.value = value;
    return node;
  }

  // Runs `task` again and again after a random rest, until stopped.
  function every(minMs, maxMs, task) {
    let timer = null;
    const loop = () => {
      timer = setTimeout(() => {
        task();
        loop();
      }, minMs + Math.random() * (maxMs - minMs));
    };
    loop();
    return () => clearTimeout(timer);
  }

  /* ---------- Night: wind, sand, distant crickets ---------- */

  function windLayer(ctx, buffer, pan, out) {
    const source = loopSource(ctx, buffer);
    const band = filter(ctx, "bandpass", 320, 0.6);
    const gain = gainNode(ctx, 0.05);
    source.connect(band).connect(filter(ctx, "lowpass", 900)).connect(gain).connect(panNode(ctx, pan)).connect(out);
    // Gusts wander at random instead of swelling on a fixed sine, which is what makes them feel real.
    const stop = every(3000, 9000, () => {
      const now = ctx.currentTime;
      gain.gain.setTargetAtTime(0.03 + Math.random() * 0.07, now, 1.6);
      band.frequency.setTargetAtTime(200 + Math.random() * 380, now, 2.4);
    });
    return () => { stop(); source.stop(); };
  }

  function sandLayer(ctx, out) {
    const source = loopSource(ctx, buffers.pinkA);
    const gain = gainNode(ctx, 0.006);
    source.connect(filter(ctx, "highpass", 3200)).connect(filter(ctx, "lowpass", 9000)).connect(gain).connect(out);
    const stop = every(3000, 7000, () => gain.gain.setTargetAtTime(0.002 + Math.random() * 0.008, ctx.currentTime, 2.5));
    return () => { stop(); source.stop(); };
  }

  function cricket(ctx, out, pitch, pan, level) {
    const lowpass = filter(ctx, "lowpass", 5600);
    lowpass.connect(panNode(ctx, pan)).connect(out);
    const chirp = (at) => {
      const pulses = 2 + Math.floor(Math.random() * 3);
      const gap = 0.042 + Math.random() * 0.01;
      const osc = ctx.createOscillator();
      osc.frequency.value = pitch * (0.985 + Math.random() * 0.03);
      const gain = gainNode(ctx, 0);
      osc.connect(gain).connect(lowpass);
      const peak = level * (0.5 + Math.random() * 0.5);
      for (let k = 0; k < pulses; k += 1) {
        const t = at + k * gap;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.00001, t + 0.03);
      }
      osc.start(at);
      osc.stop(at + pulses * gap + 0.05);
    };
    const stop = every(700, 2600, () => {
      // Real crickets rest sometimes; skipping a beat keeps the night from feeling like a metronome.
      if (Math.random() < 0.15) return;
      const now = ctx.currentTime + 0.03;
      chirp(now);
      if (Math.random() < 0.5) chirp(now + 0.26 + Math.random() * 0.1);
    });
    return () => { stop(); lowpass.disconnect(); };
  }

  function startNight(ctx, bus) {
    const crickets = gainNode(ctx, nightLevel);
    // Crickets go mostly to the reverb so they sit far off, behind the wind.
    crickets.connect(gainNode(ctx, 0.35)).connect(bus);
    crickets.connect(reverb);
    const stops = [
      windLayer(ctx, buffers.brownA, -0.55, bus),
      windLayer(ctx, buffers.brownB, 0.55, bus),
      sandLayer(ctx, bus),
      cricket(ctx, crickets, 4400, -0.7, 0.0045),
      cricket(ctx, crickets, 5100, 0.6, 0.0035),
      cricket(ctx, crickets, 4750, 0.1, 0.0022)
    ];
    return { crickets, stop: () => { stops.forEach((s) => s()); crickets.disconnect(); } };
  }

  /* ---------- Rain: a soft wash with drops landing all around ---------- */

  function startRain(ctx, bus) {
    const washes = [buffers.pinkA, buffers.pinkB].map((buffer, i) => {
      const source = loopSource(ctx, buffer);
      const gain = gainNode(ctx, 0.05);
      source
        .connect(filter(ctx, "highpass", 500))
        .connect(filter(ctx, "lowpass", 5200))
        .connect(gain)
        .connect(panNode(ctx, i === 0 ? -0.6 : 0.6))
        .connect(bus);
      const stop = every(2500, 6000, () => gain.gain.setTargetAtTime(0.035 + Math.random() * 0.03, ctx.currentTime, 1.5));
      return () => { stop(); source.stop(); };
    });

    const rumble = loopSource(ctx, buffers.brownA);
    rumble.connect(filter(ctx, "lowpass", 180)).connect(gainNode(ctx, 0.05)).connect(bus);

    const dropBus = gainNode(ctx, 1);
    dropBus.connect(bus);
    dropBus.connect(gainNode(ctx, 0.6)).connect(reverb);
    const drop = () => {
      const at = ctx.currentTime + Math.random() * 0.05;
      const source = ctx.createBufferSource();
      source.buffer = buffers.white;
      const band = filter(ctx, "bandpass", 1800 + Math.random() * 3800, 4 + Math.random() * 6);
      const gain = gainNode(ctx, 0);
      gain.gain.setValueAtTime(0.012 + Math.random() * 0.03, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.03);
      source.connect(band).connect(gain).connect(panNode(ctx, Math.random() * 2 - 1)).connect(dropBus);
      source.start(at, Math.random() * 3, 0.08);
    };
    const stopDrops = every(30, 110, drop);

    return {
      crickets: null,
      stop: () => { washes.forEach((s) => s()); stopDrops(); rumble.stop(); dropBus.disconnect(); }
    };
  }

  /* ---------- Stream: water moving over stones, with the odd bubble ---------- */

  function startStream(ctx, bus) {
    const source = loopSource(ctx, buffers.pinkB);
    const bands = [380, 900, 2100].map((frequency, i) => {
      const band = filter(ctx, "bandpass", frequency, 2.5);
      const gain = gainNode(ctx, 0.08 - i * 0.02);
      source.connect(band).connect(gain).connect(panNode(ctx, [-0.4, 0.35, 0][i])).connect(bus);
      return band;
    });
    // Water burbles because its resonances shift constantly; wander each band a little, quickly.
    const stopBurble = every(90, 260, () => {
      const now = ctx.currentTime;
      bands.forEach((band, i) => {
        const centre = [380, 900, 2100][i];
        band.frequency.setTargetAtTime(centre * (0.75 + Math.random() * 0.5), now, 0.08);
      });
    });

    const bed = loopSource(ctx, buffers.brownB);
    bed.connect(filter(ctx, "lowpass", 400)).connect(gainNode(ctx, 0.035)).connect(bus);

    const bubble = () => {
      const at = ctx.currentTime + 0.02;
      const osc = ctx.createOscillator();
      const start = 280 + Math.random() * 260;
      osc.frequency.setValueAtTime(start, at);
      osc.frequency.exponentialRampToValueAtTime(start * (2 + Math.random()), at + 0.05);
      const gain = gainNode(ctx, 0);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.008 + Math.random() * 0.01, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      osc.connect(gain).connect(panNode(ctx, Math.random() * 1.4 - 0.7)).connect(bus);
      osc.start(at);
      osc.stop(at + 0.09);
    };
    const stopBubbles = every(180, 900, bubble);

    return { crickets: null, stop: () => { stopBurble(); stopBubbles(); source.stop(); bed.stop(); } };
  }

  const SCAPE_BUILDERS = { night: startNight, rain: startRain, stream: startStream };

  /* ---------- Ambience controls ---------- */

  function start() {
    if (!isEnabled || active) return;
    const ctx = ensureContext();
    resume();
    const bus = gainNode(ctx, 0);
    bus.connect(master);
    bus.connect(gainNode(ctx, REVERB_SEND)).connect(reverb);
    bus.gain.setTargetAtTime(SCAPE_LEVEL, ctx.currentTime, 2);
    active = { bus, ...SCAPE_BUILDERS[scape](ctx, bus) };
  }

  function stop() {
    if (!active) return;
    const { bus, stop: stopLayers } = active;
    active = null;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.7);
    setTimeout(() => { stopLayers(); bus.disconnect(); }, 3200);
  }

  function setScape(name) {
    if (!SCAPES.includes(name)) throw new Error(`Unknown soundscape: ${name}`);
    scape = name;
    if (!isEnabled) return;
    stop();
    start();
  }

  function setEnabled(shouldEnable) {
    isEnabled = shouldEnable;
    if (shouldEnable) start();
    else stop();
  }

  function setNightLevel(level) {
    nightLevel = Math.max(0, Math.min(1, level));
    if (active && active.crickets) active.crickets.gain.setTargetAtTime(nightLevel, context.currentTime, 1.2);
  }

  /* ---------- The typing tap ---------- */

  function playClick(ctx, at, level, centre) {
    const source = ctx.createBufferSource();
    source.buffer = buffers.white;
    const gain = gainNode(ctx, 0);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    source.connect(filter(ctx, "bandpass", centre, 1.4)).connect(gain);
    gain.connect(master);
    gain.connect(gainNode(ctx, 0.25)).connect(reverb);
    source.start(at, Math.random() * 3, 0.04);
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
    body.frequency.value = 110 + Math.random() * 30;
    const bodyGain = gainNode(ctx, 0);
    bodyGain.gain.setValueAtTime(TICK_LEVEL * 0.45, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    body.connect(bodyGain).connect(master);
    body.start(now);
    body.stop(now + 0.06);
  }

  /* ---------- The reciter's voice ---------- */

  // Routes an <audio> element (which must have crossOrigin set) through a fader and a level meter.
  function attachVoice(element) {
    if (voices.has(element)) return voices.get(element);
    const ctx = ensureContext();
    const source = ctx.createMediaElementSource(element);
    const fader = gainNode(ctx, 0);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(fader).connect(analyser);
    fader.connect(ctx.destination);
    const samples = new Float32Array(analyser.fftSize);
    let smoothed = 0;

    const voice = {
      fadeIn() {
        fader.gain.cancelScheduledValues(ctx.currentTime);
        fader.gain.setValueAtTime(fader.gain.value, ctx.currentTime);
        fader.gain.setTargetAtTime(1, ctx.currentTime, VOICE_FADE_IN);
      },
      fadeOut() {
        fader.gain.cancelScheduledValues(ctx.currentTime);
        fader.gain.setTargetAtTime(0, ctx.currentTime, VOICE_FADE_OUT);
      },
      // Loudness of the voice right now, eased so the light swells rather than jitters.
      level() {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        smoothed += (Math.min(1, rms * 4.5) - smoothed) * 0.18;
        return smoothed;
      }
    };
    voices.set(element, voice);
    return voice;
  }

  window.Soundscape = {
    SCAPES,
    resume,
    start,
    tick,
    setScape,
    getScape: () => scape,
    setNightLevel,
    setEnabled,
    isEnabled: () => isEnabled,
    attachVoice
  };
})();
