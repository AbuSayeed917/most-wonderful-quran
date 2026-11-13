(function () {
  "use strict";

  const surah = window.SURAH_FATIHA;
  if (!surah || !Array.isArray(surah.ayahs) || surah.ayahs.length === 0) {
    throw new Error("Surah data failed to load: expected window.SURAH_FATIHA with ayahs.");
  }
  const sound = window.Soundscape;
  if (!sound) throw new Error("Soundscape failed to load: expected window.Soundscape from sound.js.");

  const LAST_AYAH = surah.ayahs.length - 1;
  const LAST_STOP = surah.ayahs.length; // the closing "Ameen" screen sits after the last ayah
  const GLIDE_MS = 1700;
  const WHEEL_THRESHOLD = 6;
  const SWIPE_THRESHOLD = 36;
  const WHEEL_SETTLE_MS = 220;
  const FIRST_WORD_DELAY_MS = 900;
  const WORD_ARRIVAL_MS = 440;
  const GLINT_MS = 750;
  const WORD_GAP_MS = 420;
  const VERSE_GAP_MS = 1600;
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const MODE_HINTS = {
    listen: "Press play and let each word arrive. Tap a word to hear it alone.",
    learn: "Tap a word to open its meaning and its root.",
    memorise: "The words are veiled. Recite from the heart, then tap a word to check."
  };

  // Each painting gets the living details that match what is drawn in it.
  const SCENE_EFFECTS = {
    1: ["stars", "lantern"],
    2: ["stars", "water"],
    5: ["rays"],
    6: ["rays", "path"],
    7: ["rays", "sun"]
  };

  const $ = (selector) => document.querySelector(selector);
  const ui = {
    screens: document.querySelectorAll("[data-screen]"),
    room: $('[data-screen="room"]'),
    journey: $(".journey"),
    scenes: $(".scenes"),
    rail: $(".rail"),
    railFill: $(".rail__fill"),
    cue: $(".cue"),
    hint: $(".hint"),
    play: $('[data-action="play"]'),
    soundToggle: $('[data-action="sound"]'),
    audio: $(".reciter"),
    sheet: $(".sheet"),
    sheetArabic: $(".sheet__arabic"),
    sheetTranslit: $(".sheet__translit"),
    sheetMeaning: $(".sheet__meaning"),
    sheetRoot: $(".sheet__root"),
    sheetPlace: $(".sheet__place")
  };

  const dom = { track: null, stops: [], inners: [], sceneFrames: [], railDots: [] };

  const state = {
    position: 0,
    stop: 0,
    ayahIndex: 0,
    isGliding: false,
    wheelQuietUntil: 0,
    mode: "listen",
    pace: "slow",
    isPlaying: false,
    playbackId: 0,
    arrivalId: 0,
    isAutoAdvancing: false,
    sheetWordIndex: null
  };

  /* ---------- Pure helpers ---------- */

  const pad3 = (n) => String(n).padStart(3, "0");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toArabicNumber = (n) => String(n).split("").map((d) => ARABIC_DIGITS[Number(d)]).join("");
  const wordAudioUrl = (ayah, wordNumber) =>
    `https://audio.qurancdn.com/wbw/${pad3(surah.number)}_${pad3(ayah)}_${pad3(wordNumber)}.mp3`;
  const verseAudioUrl = (ayah) =>
    `https://everyayah.com/data/Alafasy_128kbps/${pad3(surah.number)}${pad3(ayah)}.mp3`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Slow at both ends so a glide leaves and lands like a held breath.
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Reciters linger on long words, so letter count is a fair proxy for where each word sits in the verse audio.
  function buildWordTimeline(words) {
    const lengths = words.map((w) => w.arabic.length);
    const total = lengths.reduce((sum, len) => sum + len, 0);
    let running = 0;
    return lengths.map((len) => {
      running += len;
      return running / total;
    });
  }

  /* ---------- Building the journey ---------- */

  function createEffect(kind) {
    const el = document.createElement("div");
    el.className = `fx fx-${kind}`;
    if (kind === "stars") {
      for (let i = 0; i < 26; i += 1) {
        const star = document.createElement("span");
        const size = 1 + (i % 3);
        // Positions are generated, so they are set inline.
        star.style.left = `${(i * 37) % 100}%`;
        star.style.top = `${(i * 53) % 100}%`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.animationDelay = `${-i * 0.6}s`;
        star.style.animationDuration = `${3 + (i % 5)}s`;
        el.append(star);
      }
    }
    if (kind === "water") {
      for (let i = 0; i < 7; i += 1) {
        const ripple = document.createElement("span");
        ripple.style.left = `${(i * 23) % 70}%`;
        ripple.style.top = `${i * 14}%`;
        ripple.style.width = `${16 + (i % 3) * 9}%`;
        ripple.style.animationDelay = `${-i * 0.9}s`;
        el.append(ripple);
      }
    }
    if (kind === "path") {
      for (let i = 0; i < 3; i += 1) {
        const light = document.createElement("span");
        light.style.animationDelay = `${i * 1.8}s`;
        el.append(light);
      }
    }
    return el;
  }

  function buildScenes() {
    const frames = surah.ayahs.map((ayah, index) => {
      const frame = document.createElement("div");
      frame.className = "scene";
      const stage = document.createElement("div");
      stage.className = "scene__stage";
      stage.style.setProperty("--breathe", `${22 + index * 2}s`);
      const img = document.createElement("img");
      img.className = "scene__img";
      img.src = `images/ayah-${ayah.number}.jpg`;
      img.alt = "";
      img.width = 720;
      img.height = 1280;
      img.decoding = "async";
      stage.append(img, ...(SCENE_EFFECTS[ayah.number] || []).map(createEffect));
      frame.append(stage);
      return frame;
    });
    ui.scenes.replaceChildren(...frames);
    dom.sceneFrames = frames;
  }

  function buildWord(word, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "word";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `${word.transliteration}, ${word.meaning}`);
    const arabic = document.createElement("span");
    arabic.textContent = word.arabic;
    const gloss = document.createElement("span");
    gloss.className = "word__gloss";
    gloss.textContent = word.meaning;
    button.append(arabic, gloss);
    button.addEventListener("click", () => handleWordTap(index));
    return button;
  }

  function buildAyahSection(ayah) {
    const section = document.createElement("section");
    section.className = ayah.words.length > 6 ? "ayah ayah--long" : "ayah";
    section.setAttribute("aria-label", `Verse ${ayah.number}`);

    const inner = document.createElement("div");
    inner.className = "ayah__inner";

    const ornament = document.createElement("div");
    ornament.className = "ornament";
    ornament.setAttribute("aria-hidden", "true");
    const glyph = document.createElement("span");
    glyph.textContent = toArabicNumber(ayah.number);
    ornament.append(glyph);

    const arabic = document.createElement("p");
    arabic.className = "ayah__arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.append(...ayah.words.map(buildWord));

    const translation = document.createElement("p");
    translation.className = "ayah__translation";
    translation.textContent = ayah.translation;

    const reflection = document.createElement("p");
    reflection.className = "ayah__reflection";
    reflection.textContent = ayah.reflection;

    inner.append(ornament, arabic, translation, reflection);
    section.append(inner);
    return { section, inner };
  }

  function buildAmeenSection() {
    const section = document.createElement("section");
    section.className = "ameen";
    section.setAttribute("aria-label", "Ameen");
    const inner = document.createElement("div");
    inner.className = "ayah__inner";
    const arabic = document.createElement("p");
    arabic.className = "ameen__arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.textContent = "آمِين";
    const line = document.createElement("p");
    line.className = "ameen__line";
    line.textContent = "The day has opened.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--primary";
    button.textContent = "Recite it from the heart";
    button.addEventListener("click", () => {
      setMode("memorise");
      glideTo(0);
    });
    inner.append(arabic, line, button);
    section.append(inner);
    return { section, inner };
  }

  function buildJourney() {
    const track = document.createElement("div");
    track.className = "journey__track";
    const built = [...surah.ayahs.map(buildAyahSection), buildAmeenSection()];
    track.append(...built.map((b) => b.section));
    ui.journey.replaceChildren(track);
    dom.track = track;
    dom.stops = built.map((b) => b.section);
    dom.inners = built.map((b) => b.inner);
  }

  function buildRail() {
    dom.railDots = surah.ayahs.map((ayah, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "rail__dot";
      dot.style.setProperty("--i", String(index));
      dot.setAttribute("aria-label", `Go to verse ${ayah.number}`);
      dot.addEventListener("click", () => glideTo(index));
      return dot;
    });
    ui.rail.append(...dom.railDots);
  }

  /* ---------- Rendering one frame of the glide ---------- */

  function applyPosition(position) {
    const height = window.innerHeight;
    const scenePosition = Math.min(position, LAST_AYAH);

    dom.track.style.transform = `translate3d(0, ${(-position * height).toFixed(2)}px, 0)`;

    dom.sceneFrames.forEach((frame, index) => {
      const presence = clamp(1 - Math.abs(scenePosition - index), 0, 1);
      frame.style.opacity = presence.toFixed(4);
      frame.style.visibility = presence === 0 ? "hidden" : "visible";
      const drift = isReducedMotion ? 0 : (index - scenePosition) * 80;
      frame.style.transform = `translate3d(0, ${drift.toFixed(2)}px, 0)`;
    });

    dom.inners.forEach((inner, index) => {
      const offset = position - index;
      const distance = Math.abs(offset);
      if (distance > 1.05) {
        inner.style.opacity = "0";
        return;
      }
      inner.style.opacity = clamp(1 - distance * 1.4, 0, 1).toFixed(4);
      if (isReducedMotion) return;
      // Text lags behind the page a little, so it seems to float rather than slide.
      const lag = offset * height * 0.22;
      const scale = 1 - Math.min(distance, 1) * 0.05;
      inner.style.transform = `translate3d(0, ${lag.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    });

    ui.railFill.style.transform = `scaleY(${clamp(position / LAST_AYAH, 0, 1).toFixed(4)})`;
    ui.cue.style.opacity = clamp(1 - position * 2, 0, 1).toFixed(3);
    sound.setNightLevel(1 - scenePosition / 4);
  }

  /* ---------- Gliding between verses ---------- */

  function glideTo(stop) {
    const target = clamp(stop, 0, LAST_STOP);
    if (target === state.stop && !state.isGliding) return;

    const from = state.position;
    const duration = isReducedMotion ? 1 : GLIDE_MS * Math.min(1.6, Math.max(0.8, Math.abs(target - from)));
    const startedAt = performance.now();
    state.stop = target;
    state.isGliding = true;
    state.wheelQuietUntil = startedAt + duration + WHEEL_SETTLE_MS;
    if (target <= LAST_AYAH) activateAyah(target);
    updateInert();

    function step(now) {
      if (state.stop !== target) return;
      const progress = clamp((now - startedAt) / duration, 0, 1);
      state.position = from + (target - from) * easeInOutCubic(progress);
      applyPosition(state.position);
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      state.isGliding = false;
    }
    requestAnimationFrame(step);
  }

  function updateInert() {
    dom.stops.forEach((section, index) => {
      section.inert = index !== state.stop;
    });
  }

  function handleWheel(event) {
    event.preventDefault();
    const now = performance.now();
    // Trackpads keep sending momentum events after a flick; swallow the tail so one gesture moves one verse.
    if (state.isGliding || now < state.wheelQuietUntil) {
      state.wheelQuietUntil = Math.max(state.wheelQuietUntil, now + WHEEL_SETTLE_MS);
      return;
    }
    if (Math.abs(event.deltaY) < WHEEL_THRESHOLD) return;
    glideTo(state.stop + Math.sign(event.deltaY));
  }

  function bindGestures() {
    ui.journey.addEventListener("wheel", handleWheel, { passive: false });

    let touchStartY = null;
    ui.journey.addEventListener("touchstart", (event) => {
      touchStartY = event.touches[0].clientY;
    }, { passive: true });
    ui.journey.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
    ui.journey.addEventListener("touchend", (event) => {
      if (touchStartY === null) return;
      const deltaY = touchStartY - event.changedTouches[0].clientY;
      touchStartY = null;
      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      glideTo(state.stop + Math.sign(deltaY));
    });

    window.addEventListener("resize", () => applyPosition(state.position));
  }

  /* ---------- Words arriving, one soft key at a time ---------- */

  function wordElements(index = state.ayahIndex) {
    return Array.from(dom.stops[index].querySelectorAll(".word"));
  }

  function resetWords(index) {
    wordElements(index).forEach((el) => el.classList.remove("is-arrived", "is-glinting", "is-heard", "is-spoken"));
  }

  async function arriveWords(index) {
    state.arrivalId += 1;
    const arrivalId = state.arrivalId;
    const words = wordElements(index);
    for (let i = 0; i < words.length; i += 1) {
      await wait(i === 0 ? FIRST_WORD_DELAY_MS : WORD_ARRIVAL_MS);
      if (arrivalId !== state.arrivalId) return false;
      const word = words[i];
      word.classList.add("is-arrived", "is-glinting");
      sound.tick();
      setTimeout(() => word.classList.remove("is-glinting"), GLINT_MS);
    }
    return true;
  }

  function activateAyah(index) {
    if (!state.isAutoAdvancing) stopPlayback();
    dom.stops.forEach((section, i) => {
      section.classList.toggle("is-current", i === index);
      if (i !== index) resetWords(i);
    });
    state.ayahIndex = index;
    dom.railDots.forEach((dot, i) => {
      dot.setAttribute("aria-current", i === index ? "step" : "false");
      dot.classList.toggle("is-passed", i < index);
    });
    arriveWords(index);
  }

  /* ---------- Recitation ---------- */

  function highlightWord(activeIndex) {
    wordElements().forEach((el, index) => {
      el.classList.add("is-arrived");
      el.classList.toggle("is-spoken", index === activeIndex);
      el.classList.toggle("is-heard", activeIndex !== null && index < activeIndex);
    });
  }

  function setPlaying(isPlaying) {
    state.isPlaying = isPlaying;
    ui.play.classList.toggle("is-playing", isPlaying);
    ui.play.setAttribute("aria-label", isPlaying ? "Pause" : "Play this verse");
  }

  function showAudioError(error) {
    console.error("Recitation audio failed:", error);
    ui.hint.textContent = "The reciter couldn't be reached. Check your connection and try again.";
  }

  function playClip(url) {
    return new Promise((resolve, reject) => {
      const audio = ui.audio;
      const cleanUp = () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
      const onEnded = () => { cleanUp(); resolve(); };
      const onError = () => { cleanUp(); reject(new Error(`Could not load ${url}`)); };
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);
      audio.src = url;
      audio.play().catch((error) => { cleanUp(); reject(error); });
    });
  }

  function stopPlayback() {
    state.playbackId += 1;
    state.isAutoAdvancing = false;
    ui.audio.pause();
    ui.audio.ontimeupdate = null;
    setPlaying(false);
  }

  async function playVerseWordByWord(playbackId) {
    const ayah = surah.ayahs[state.ayahIndex];
    for (let index = 0; index < ayah.words.length; index += 1) {
      if (playbackId !== state.playbackId) return false;
      highlightWord(index);
      await playClip(wordAudioUrl(ayah.number, index + 1));
      await wait(WORD_GAP_MS);
    }
    return playbackId === state.playbackId;
  }

  async function playVerseFlowing(playbackId) {
    const ayah = surah.ayahs[state.ayahIndex];
    const timeline = buildWordTimeline(ayah.words);
    ui.audio.ontimeupdate = () => {
      if (!ui.audio.duration) return;
      const progress = ui.audio.currentTime / ui.audio.duration;
      const index = timeline.findIndex((end) => progress <= end);
      highlightWord(index === -1 ? timeline.length - 1 : index);
    };
    await playClip(verseAudioUrl(ayah.number));
    ui.audio.ontimeupdate = null;
    return playbackId === state.playbackId;
  }

  async function startPlayback() {
    stopPlayback();
    state.arrivalId += 1;
    const playbackId = state.playbackId;
    setPlaying(true);

    try {
      const isFinished = state.pace === "slow"
        ? await playVerseWordByWord(playbackId)
        : await playVerseFlowing(playbackId);
      if (!isFinished) return;

      highlightWord(null);
      wordElements().forEach((el) => el.classList.add("is-heard"));

      if (state.mode !== "listen" || state.ayahIndex === LAST_AYAH) {
        setPlaying(false);
        return;
      }
      await wait(VERSE_GAP_MS);
      if (playbackId !== state.playbackId) return;

      // Drift on to the next verse, let its words arrive, then keep reciting.
      const next = state.ayahIndex + 1;
      state.isAutoAdvancing = true;
      glideTo(next);
      await wait(GLIDE_MS * 0.6 + FIRST_WORD_DELAY_MS + surah.ayahs[next].words.length * WORD_ARRIVAL_MS);
      if (playbackId !== state.playbackId || state.ayahIndex !== next) return;
      startPlayback();
    } catch (error) {
      if (playbackId !== state.playbackId) return;
      setPlaying(false);
      showAudioError(error);
    }
  }

  async function playSingleWord(wordIndex) {
    stopPlayback();
    const playbackId = state.playbackId;
    const ayah = surah.ayahs[state.ayahIndex];
    highlightWord(wordIndex);
    try {
      await playClip(wordAudioUrl(ayah.number, wordIndex + 1));
      if (playbackId === state.playbackId) highlightWord(null);
    } catch (error) {
      if (playbackId === state.playbackId) showAudioError(error);
    }
  }

  /* ---------- Interactions ---------- */

  function countOccurrences(arabic) {
    return surah.ayahs.reduce(
      (count, ayah) => count + ayah.words.filter((w) => w.arabic === arabic).length,
      0
    );
  }

  function openWordSheet(wordIndex) {
    const ayah = surah.ayahs[state.ayahIndex];
    const word = ayah.words[wordIndex];
    const occurrences = countOccurrences(word.arabic);
    state.sheetWordIndex = wordIndex;
    ui.sheetArabic.textContent = word.arabic;
    ui.sheetTranslit.textContent = word.transliteration;
    ui.sheetMeaning.textContent = word.meaning;
    ui.sheetRoot.textContent = word.root;
    ui.sheetPlace.textContent = occurrences > 1 ? `${occurrences} times in Al-Fatiha` : `Verse ${ayah.number}`;
    ui.sheet.showModal();
    playSingleWord(wordIndex);
  }

  function handleWordTap(wordIndex) {
    if (state.mode === "learn") {
      openWordSheet(wordIndex);
      return;
    }
    if (state.mode === "memorise") {
      wordElements()[wordIndex].classList.add("is-revealed");
    }
    playSingleWord(wordIndex);
  }

  function setMode(mode) {
    if (!MODE_HINTS[mode]) throw new Error(`Unknown mode: ${mode}`);
    stopPlayback();
    state.mode = mode;
    ui.room.dataset.mode = mode;
    document.querySelectorAll("button[data-mode]").forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    document.querySelectorAll(".word.is-revealed").forEach((el) => el.classList.remove("is-revealed"));
    ui.hint.textContent = MODE_HINTS[mode];
  }

  function setPace(pace) {
    stopPlayback();
    state.pace = pace;
    document.querySelectorAll("[data-pace]").forEach((btn) => {
      const isActive = btn.dataset.pace === pace;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  function toggleSound() {
    const shouldEnable = !sound.isEnabled();
    sound.setEnabled(shouldEnable);
    ui.soundToggle.setAttribute("aria-pressed", String(shouldEnable));
  }

  function showScreen(name) {
    ui.screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.screen === name));
    ui.scenes.classList.toggle("is-visible", name === "room");
  }

  function handleKeydown(event) {
    const isRoomOpen = ui.room.classList.contains("is-active");
    if (!isRoomOpen || ui.sheet.open) return;
    const isOnControl = event.target instanceof HTMLButtonElement;
    const forwardKeys = ["ArrowDown", "PageDown", "ArrowLeft"];
    const backKeys = ["ArrowUp", "PageUp", "ArrowRight"];
    // Arabic reads right to left, so the left arrow also moves forward through the surah.
    if (forwardKeys.includes(event.key) || (event.key === " " && !isOnControl)) {
      event.preventDefault();
      glideTo(state.stop + 1);
    }
    if (backKeys.includes(event.key)) {
      event.preventDefault();
      glideTo(state.stop - 1);
    }
  }

  /* ---------- Rising gold dust ---------- */

  function createMoteSprite() {
    const sprite = document.createElement("canvas");
    sprite.width = 32;
    sprite.height = 32;
    const ctx = sprite.getContext("2d");
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255, 236, 196, 1)");
    glow.addColorStop(0.25, "rgba(246, 217, 160, 0.8)");
    glow.addColorStop(1, "rgba(246, 217, 160, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
    return sprite;
  }

  function startMotes() {
    const canvas = $(".motes");
    const ctx = canvas.getContext("2d");
    // Drawing a pre-rendered glow is far cheaper per frame than canvas shadowBlur.
    const sprite = createMoteSprite();
    let motes = [];
    let width = 0;
    let height = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      motes = Array.from({ length: Math.round(width / 22) + 12 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 9 + 4,
        speed: Math.random() * 0.012 + 0.006,
        phase: Math.random() * Math.PI * 2
      }));
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      motes.forEach((m) => {
        const rise = isReducedMotion ? 0 : time * m.speed;
        const y = ((m.y - rise) % (height + 40) + height + 40) % (height + 40) - 20;
        const sway = isReducedMotion ? 0 : Math.sin(time / 3800 + m.phase) * 14;
        ctx.globalAlpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time / 1700 + m.phase));
        ctx.drawImage(sprite, m.x + sway - m.size / 2, y - m.size / 2, m.size, m.size);
      });
      ctx.globalAlpha = 1;
      if (!isReducedMotion) requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  /* ---------- Wiring ---------- */

  function bindEvents() {
    $('[data-action="begin"]').addEventListener("click", () => {
      showScreen("room");
      sound.start();
      ui.journey.focus({ preventScroll: true });
      applyPosition(state.position);
      updateInert();
      activateAyah(state.ayahIndex);
    });
    $('[data-action="home"]').addEventListener("click", () => {
      stopPlayback();
      state.arrivalId += 1;
      showScreen("welcome");
    });
    ui.play.addEventListener("click", () => (state.isPlaying ? stopPlayback() : startPlayback()));
    ui.soundToggle.addEventListener("click", toggleSound);
    $('[data-action="hear-word"]').addEventListener("click", () => {
      if (state.sheetWordIndex !== null) playSingleWord(state.sheetWordIndex);
    });
    document.querySelectorAll("button[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => setMode(btn.dataset.mode))
    );
    document.querySelectorAll("[data-pace]").forEach((btn) =>
      btn.addEventListener("click", () => setPace(btn.dataset.pace))
    );
    document.addEventListener("keydown", handleKeydown);
  }

  buildScenes();
  buildJourney();
  buildRail();
  bindGestures();
  bindEvents();
  ui.hint.textContent = MODE_HINTS[state.mode];
  startMotes();
})();
