(function () {
  "use strict";

  const surah = window.SURAH_FATIHA;
  if (!surah || !Array.isArray(surah.ayahs) || surah.ayahs.length === 0) {
    throw new Error("Surah data failed to load: expected window.SURAH_FATIHA with ayahs.");
  }

  const WORD_GAP_MS = 420;
  const VERSE_GAP_MS = 1800;
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  const MODE_HINTS = {
    listen: "Tap play and let each word arrive. Tap any word to hear it alone.",
    learn: "Tap a word to open its meaning and its root.",
    memorise: "The words are veiled. Recite from the heart, then tap a word to check yourself."
  };

  const $ = (selector) => document.querySelector(selector);
  const ui = {
    screens: document.querySelectorAll("[data-screen]"),
    room: $('[data-screen="room"]'),
    scenes: $(".scenes"),
    stars: $(".stars"),
    verseNumber: $(".verse__number"),
    verseArabic: $(".verse__arabic"),
    verseTranslation: $(".verse__translation"),
    modeHint: $(".verse__mode-hint"),
    reflection: $(".reflection"),
    play: $('[data-action="play"]'),
    ambience: $('[data-action="ambience"]'),
    audio: $(".reciter"),
    sheet: $(".sheet"),
    sheetArabic: $(".sheet__arabic"),
    sheetTranslit: $(".sheet__translit"),
    sheetMeaning: $(".sheet__meaning"),
    sheetRoot: $(".sheet__root"),
    sheetPlace: $(".sheet__place")
  };

  const state = {
    ayahIndex: 0,
    mode: "listen",
    pace: "slow",
    isPlaying: false,
    playbackId: 0,
    sheetWordIndex: null
  };

  /* ---------- Pure helpers ---------- */

  const pad3 = (n) => String(n).padStart(3, "0");
  const toArabicNumber = (n) => String(n).split("").map((d) => ARABIC_DIGITS[Number(d)]).join("");
  const wordAudioUrl = (ayah, wordNumber) =>
    `https://audio.qurancdn.com/wbw/${pad3(surah.number)}_${pad3(ayah)}_${pad3(wordNumber)}.mp3`;
  const verseAudioUrl = (ayah) =>
    `https://everyayah.com/data/Alafasy_128kbps/${pad3(surah.number)}${pad3(ayah)}.mp3`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  /* ---------- Rendering ---------- */

  function renderStars() {
    const items = surah.ayahs.map((ayah, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "star";
      button.setAttribute("aria-label", `Verse ${ayah.number}`);
      button.addEventListener("click", () => goToAyah(index));
      li.append(button);
      return li;
    });
    ui.stars.replaceChildren(...items);
  }

  function renderScenes() {
    const images = surah.ayahs.map((ayah) => {
      const img = document.createElement("img");
      img.className = "scene";
      img.src = `images/ayah-${ayah.number}.jpg`;
      img.alt = "";
      img.width = 720;
      img.height = 1280;
      img.decoding = "async";
      return img;
    });
    ui.scenes.replaceChildren(...images);
  }

  function updateScene() {
    ui.scenes.querySelectorAll(".scene").forEach((img, index) => {
      img.classList.toggle("is-active", index === state.ayahIndex);
    });
  }

  function updateStars() {
    ui.stars.querySelectorAll(".star").forEach((star, index) => {
      star.classList.toggle("is-current", index === state.ayahIndex);
      star.classList.toggle("is-done", index < state.ayahIndex);
      star.setAttribute("aria-current", index === state.ayahIndex ? "step" : "false");
    });
  }

  function renderVerse() {
    const ayah = surah.ayahs[state.ayahIndex];

    const numberGlyph = document.createElement("span");
    numberGlyph.textContent = toArabicNumber(ayah.number);
    ui.verseNumber.replaceChildren(numberGlyph);

    const wordButtons = ayah.words.map((word, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "word";
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `${word.transliteration}, ${word.meaning}`);
      // Dynamic stagger so words drift in one after another, right to left.
      button.style.animationDelay = `${0.25 + index * 0.22}s`;

      const arabic = document.createElement("span");
      arabic.textContent = word.arabic;
      const gloss = document.createElement("span");
      gloss.className = "word__gloss";
      gloss.textContent = word.meaning;

      button.append(arabic, gloss);
      button.addEventListener("click", () => handleWordTap(index));
      return button;
    });

    ui.verseArabic.replaceChildren(...wordButtons);
    ui.verseTranslation.textContent = ayah.translation;
    // Re-trigger the translation's fade each time a verse changes.
    ui.verseTranslation.style.animation = "none";
    void ui.verseTranslation.offsetWidth;
    ui.verseTranslation.style.animation = "";

    ui.reflection.textContent = ayah.reflection;
    ui.modeHint.textContent = MODE_HINTS[state.mode];
    updateStars();
    updateScene();
  }

  function wordElements() {
    return Array.from(ui.verseArabic.querySelectorAll(".word"));
  }

  function highlightWord(activeIndex) {
    wordElements().forEach((el, index) => {
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
    ui.modeHint.textContent = "The reciter couldn't be reached. Check your connection and try again.";
  }

  /* ---------- Audio side effects ---------- */

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
    const playbackId = state.playbackId;
    setPlaying(true);

    try {
      const isFinished = state.pace === "slow"
        ? await playVerseWordByWord(playbackId)
        : await playVerseFlowing(playbackId);
      if (!isFinished) return;

      highlightWord(null);
      wordElements().forEach((el) => el.classList.add("is-heard"));

      const isLastAyah = state.ayahIndex === surah.ayahs.length - 1;
      if (state.mode !== "listen" || isLastAyah) {
        setPlaying(false);
        return;
      }
      await wait(VERSE_GAP_MS);
      if (playbackId !== state.playbackId) return;
      state.ayahIndex += 1;
      renderVerse();
      await wait(1200);
      if (playbackId !== state.playbackId) return;
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
    ui.sheetPlace.textContent = occurrences > 1
      ? `${occurrences} times in Al-Fatiha`
      : `Verse ${ayah.number}`;
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

  function goToAyah(index) {
    if (index < 0 || index >= surah.ayahs.length) return;
    stopPlayback();
    state.ayahIndex = index;
    renderVerse();
  }

  function setMode(mode) {
    if (!MODE_HINTS[mode]) throw new Error(`Unknown mode: ${mode}`);
    stopPlayback();
    state.mode = mode;
    ui.room.dataset.mode = mode;
    document.querySelectorAll("[data-mode]").forEach((btn) => {
      if (btn === ui.room) return;
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    renderVerse();
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

  function showScreen(name) {
    ui.screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.screen === name));
    ui.scenes.classList.toggle("is-visible", name === "room");
  }

  /* ---------- Soft rain (generated, no music) ---------- */

  const rain = { context: null, gain: null };

  function createRain() {
    const context = new AudioContext();
    const seconds = 4;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const samples = buffer.getChannelData(0);
    // Brown noise: integrated white noise gives the low, round hush of rain on a window.
    let last = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      samples[i] = last * 3.5;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1400;

    const gain = context.createGain();
    gain.gain.value = 0;

    source.connect(lowpass).connect(gain).connect(context.destination);
    source.start();
    return { context, gain };
  }

  function toggleRain() {
    if (!rain.context) Object.assign(rain, createRain());
    const isOn = ui.ambience.getAttribute("aria-pressed") === "true";
    const target = isOn ? 0 : 0.16;
    const now = rain.context.currentTime;
    rain.gain.gain.cancelScheduledValues(now);
    rain.gain.gain.setTargetAtTime(target, now, 1.2);
    ui.ambience.setAttribute("aria-pressed", String(!isOn));
  }

  /* ---------- Floating light motes ---------- */

  function startMotes() {
    const canvas = $(".motes");
    const ctx = canvas.getContext("2d");
    const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let motes = [];

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      motes = Array.from({ length: Math.round(window.innerWidth / 18) }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.6 + 0.3,
        speed: Math.random() * 0.18 + 0.04,
        phase: Math.random() * Math.PI * 2
      }));
    }

    function draw(time) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      motes.forEach((m) => {
        const twinkle = 0.35 + 0.35 * Math.sin(time / 1600 + m.phase);
        const y = isReducedMotion ? m.y : (m.y - (time / 16) * m.speed) % window.innerHeight;
        const drawY = y < 0 ? y + window.innerHeight : y;
        const drift = isReducedMotion ? 0 : Math.sin(time / 4000 + m.phase) * 12;
        ctx.beginPath();
        ctx.fillStyle = `rgba(233, 201, 139, ${twinkle})`;
        ctx.shadowColor = "rgba(233, 201, 139, 0.8)";
        ctx.shadowBlur = 8;
        ctx.arc(m.x + drift, drawY, m.r, 0, Math.PI * 2);
        ctx.fill();
      });
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
      renderVerse();
    });
    $('[data-action="home"]').addEventListener("click", () => {
      stopPlayback();
      showScreen("welcome");
    });
    $('[data-action="prev"]').addEventListener("click", () => goToAyah(state.ayahIndex - 1));
    $('[data-action="next"]').addEventListener("click", () => goToAyah(state.ayahIndex + 1));
    ui.play.addEventListener("click", () => (state.isPlaying ? stopPlayback() : startPlayback()));
    ui.ambience.addEventListener("click", toggleRain);
    $('[data-action="hear-word"]').addEventListener("click", () => {
      if (state.sheetWordIndex !== null) playSingleWord(state.sheetWordIndex);
    });

    document.querySelectorAll("button[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => setMode(btn.dataset.mode))
    );
    document.querySelectorAll("[data-pace]").forEach((btn) =>
      btn.addEventListener("click", () => setPace(btn.dataset.pace))
    );

    document.addEventListener("keydown", (event) => {
      const isRoomOpen = ui.room.classList.contains("is-active");
      if (!isRoomOpen || ui.sheet.open) return;
      // Arabic reads right to left, so the left arrow moves forward through the surah.
      if (event.key === "ArrowLeft") goToAyah(state.ayahIndex + 1);
      if (event.key === "ArrowRight") goToAyah(state.ayahIndex - 1);
    });
  }

  ui.room.dataset.mode = state.mode;
  renderScenes();
  renderStars();
  bindEvents();
  startMotes();
})();
