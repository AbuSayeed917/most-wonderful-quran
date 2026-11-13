(function () {
  "use strict";

  const surah = window.SURAH_FATIHA;
  if (!surah || !Array.isArray(surah.ayahs) || surah.ayahs.length === 0) {
    throw new Error("Surah data failed to load: expected window.SURAH_FATIHA with ayahs.");
  }
  if (surah.ayahs.some((ayah) => !Array.isArray(ayah.timings) || ayah.timings.length !== ayah.words.length)) {
    throw new Error("Surah data is missing word timings: every ayah needs one [start, end] per word.");
  }
  const sound = window.Soundscape;
  if (!sound) throw new Error("Soundscape failed to load: expected window.Soundscape from sound.js.");

  const LAST_AYAH = surah.ayahs.length - 1;
  const LAST_STOP = surah.ayahs.length; // the closing "Ameen" screen sits after the last ayah
  const GLIDE_MS = 1050;
  const WHEEL_THRESHOLD = 6;
  const SWIPE_THRESHOLD = 36;
  const WHEEL_SETTLE_MS = 200;
  const FIRST_WORD_DELAY_MS = 260;
  const WORD_ARRIVAL_MS = 110;
  const GLINT_MS = 420;
  const VERSE_GAP_MS = 380;
  const NOW_FADE_MS = 140;
  const RING_LENGTH = 188.5;
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    status: $(".status"),
    play: $('[data-action="play"]'),
    ring: $(".play__ring-fill"),
    soundToggle: $('[data-action="sound"]'),
    wordVoice: $(".word-voice"),
    sheet: $(".sheet"),
    sheetArabic: $(".sheet__arabic"),
    sheetTranslit: $(".sheet__translit"),
    sheetMeaning: $(".sheet__meaning"),
    sheetRoot: $(".sheet__root"),
    sheetPlace: $(".sheet__place")
  };

  const dom = { track: null, stops: [], inners: [], nows: [], sceneFrames: [], railDots: [] };

  // One audio element per verse so the next verse can buffer while this one plays.
  const verseClips = surah.ayahs.map((ayah) => {
    const clip = new Audio();
    clip.preload = "none";
    clip.src = `https://verses.quran.com/Alafasy/mp3/${pad3(surah.number)}${pad3(ayah.number)}.mp3`;
    return clip;
  });

  const state = {
    position: 0,
    stop: 0,
    ayahIndex: 0,
    isGliding: false,
    wheelQuietUntil: 0,
    mode: "listen",
    isPlaying: false,
    playbackId: 0,
    arrival: Promise.resolve(true),
    arrivalId: 0,
    spokenIndex: null,
    sheetWordIndex: null
  };

  /* ---------- Pure helpers ---------- */

  function pad3(n) { return String(n).padStart(3, "0"); }
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toArabicNumber = (n) => String(n).split("").map((d) => ARABIC_DIGITS[Number(d)]).join("");
  const wordAudioUrl = (ayah, wordNumber) =>
    `https://audio.qurancdn.com/wbw/${pad3(surah.number)}_${pad3(ayah)}_${pad3(wordNumber)}.mp3`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function findSpokenWord(timings, ms) {
    const index = timings.findIndex(([start, end]) => ms >= start && ms < end);
    if (index !== -1) return index;
    // In the tiny gaps between words, keep the previous word lit rather than flickering off.
    const before = timings.filter(([start]) => start <= ms).length - 1;
    return before >= 0 ? before : null;
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

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function buildWord(word, index) {
    const button = element("button", "word");
    button.type = "button";
    button.setAttribute("aria-label", `${word.transliteration}, ${word.meaning}`);
    button.append(element("span", "", word.arabic), element("span", "word__gloss", word.meaning));
    button.addEventListener("click", () => handleWordTap(index));
    return button;
  }

  function buildAyahSection(ayah) {
    const section = element("section", ayah.words.length > 6 ? "ayah ayah--long" : "ayah");
    section.setAttribute("aria-label", `Verse ${ayah.number}`);
    const inner = element("div", "ayah__inner");

    const meta = element("p", "ayah__meta");
    const ornament = element("span", "ornament");
    ornament.setAttribute("aria-hidden", "true");
    ornament.append(element("span", "", toArabicNumber(ayah.number)));
    meta.append(ornament, element("span", "", `Ayah ${ayah.number} of ${surah.ayahs.length}`));

    const arabic = element("p", "ayah__arabic");
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.append(...ayah.words.map(buildWord));

    const now = element("p", "now");
    now.setAttribute("aria-hidden", "true");
    now.append(element("span", "now__translit"), element("span", "now__dash"), element("span", "now__meaning"));

    inner.append(
      meta,
      arabic,
      now,
      element("p", "ayah__translation", ayah.translation),
      element("p", "ayah__reflection", ayah.reflection)
    );
    section.append(inner);
    return { section, inner, now };
  }

  function buildAmeenSection() {
    const section = element("section", "ameen");
    section.setAttribute("aria-label", "Ameen");
    const inner = element("div", "ayah__inner ameen__inner");
    const arabic = element("p", "ameen__arabic", "آمِين");
    arabic.lang = "ar";
    arabic.dir = "rtl";

    const again = element("button", "btn btn--ghost", "Listen again");
    again.type = "button";
    again.addEventListener("click", () => {
      glideTo(0, true);
      startPlayAlong();
    });
    const memorise = element("button", "btn btn--primary", "Recite from the heart");
    memorise.type = "button";
    memorise.addEventListener("click", () => {
      setMode("memorise");
      glideTo(0);
    });
    const actions = element("div", "ameen__actions");
    actions.append(again, memorise);

    inner.append(arabic, element("p", "ameen__line", "The day has opened."), actions);
    section.append(inner);
    return { section, inner, now: null };
  }

  function buildJourney() {
    const track = element("div", "journey__track");
    const built = [...surah.ayahs.map(buildAyahSection), buildAmeenSection()];
    track.append(...built.map((b) => b.section));
    ui.journey.replaceChildren(track);
    dom.track = track;
    dom.stops = built.map((b) => b.section);
    dom.inners = built.map((b) => b.inner);
    dom.nows = built.map((b) => b.now);
  }

  function buildRail() {
    dom.railDots = surah.ayahs.map((ayah, index) => {
      const dot = element("button", "rail__dot");
      dot.type = "button";
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
      inner.style.opacity = clamp(1 - distance * 1.5, 0, 1).toFixed(4);
      if (isReducedMotion) return;
      // Text lags behind the page a little, so it seems to float rather than slide.
      const lag = offset * height * 0.2;
      const scale = 1 - Math.min(distance, 1) * 0.04;
      inner.style.transform = `translate3d(0, ${lag.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    });

    ui.railFill.style.transform = `scaleY(${clamp(position / LAST_AYAH, 0, 1).toFixed(4)})`;
    ui.cue.style.opacity = state.isPlaying ? "0" : clamp(1 - position * 3, 0, 1).toFixed(3);
    sound.setNightLevel(1 - scenePosition / 4);
  }

  /* ---------- Gliding between verses ---------- */

  // `isPlayAlong` marks glides the recitation makes itself; any other glide is the learner taking over.
  function glideTo(stop, isPlayAlong = false) {
    const target = clamp(stop, 0, LAST_STOP);
    if (!isPlayAlong) stopPlayback();
    if (target === state.stop && !state.isGliding) return;

    const from = state.position;
    const duration = isReducedMotion ? 1 : GLIDE_MS * Math.min(1.5, Math.max(0.85, Math.abs(target - from)));
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

  function resetAyah(index) {
    dom.stops[index].classList.remove("is-recited");
    wordElements(index).forEach((el) => el.classList.remove("is-arrived", "is-glinting", "is-heard", "is-spoken"));
    dom.nows[index].classList.remove("is-showing");
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
    dom.stops.forEach((section, i) => {
      section.classList.toggle("is-current", i === index);
      if (i !== index && i <= LAST_AYAH) resetAyah(i);
    });
    state.ayahIndex = index;
    state.spokenIndex = null;
    dom.railDots.forEach((dot, i) => {
      dot.setAttribute("aria-current", i === index ? "step" : "false");
      dot.classList.toggle("is-passed", i < index);
    });
    state.arrival = arriveWords(index);
  }

  /* ---------- Play-along ---------- */

  function showNow(index, wordIndex) {
    const now = dom.nows[index];
    if (wordIndex === null) {
      now.classList.remove("is-showing");
      return;
    }
    const word = surah.ayahs[index].words[wordIndex];
    now.classList.remove("is-showing");
    // A brief dip before the new word so the explanation breathes instead of snapping.
    setTimeout(() => {
      now.querySelector(".now__translit").textContent = word.transliteration;
      now.querySelector(".now__meaning").textContent = word.meaning;
      now.classList.add("is-showing");
    }, NOW_FADE_MS);
  }

  function highlightWord(wordIndex) {
    if (wordIndex === state.spokenIndex) return;
    state.spokenIndex = wordIndex;
    wordElements().forEach((el, index) => {
      el.classList.add("is-arrived");
      el.classList.toggle("is-spoken", index === wordIndex);
      el.classList.toggle("is-heard", wordIndex !== null && index < wordIndex);
    });
    showNow(state.ayahIndex, wordIndex);
  }

  function setRing(progress) {
    ui.ring.style.strokeDashoffset = (RING_LENGTH * (1 - clamp(progress, 0, 1))).toFixed(2);
  }

  function setPlaying(isPlaying) {
    state.isPlaying = isPlaying;
    ui.play.classList.toggle("is-playing", isPlaying);
    ui.play.setAttribute("aria-label", isPlaying ? "Pause" : "Play along with the recitation");
    applyPosition(state.position);
  }

  function showError(message, error) {
    console.error(message, error);
    ui.status.textContent = "The reciter couldn't be reached. Check your connection and try again.";
  }

  function stopPlayback() {
    state.playbackId += 1;
    verseClips.forEach((clip) => clip.pause());
    ui.wordVoice.pause();
    setPlaying(false);
  }

  // Follows the reciter with Quran.com's word timings, checked every frame for a tight, smooth highlight.
  function reciteVerse(index, playbackId) {
    return new Promise((resolve, reject) => {
      const clip = verseClips[index];
      const timings = surah.ayahs[index].timings;
      const next = verseClips[index + 1];
      if (next) {
        next.preload = "auto";
        next.load();
      }

      let frame = null;
      const cleanUp = () => {
        cancelAnimationFrame(frame);
        clip.removeEventListener("ended", onEnded);
        clip.removeEventListener("error", onError);
      };
      const follow = () => {
        if (playbackId !== state.playbackId) {
          cleanUp();
          resolve(false);
          return;
        }
        highlightWord(findSpokenWord(timings, clip.currentTime * 1000));
        if (clip.duration) setRing((index + clip.currentTime / clip.duration) / surah.ayahs.length);
        frame = requestAnimationFrame(follow);
      };
      const onEnded = () => { cleanUp(); resolve(playbackId === state.playbackId); };
      const onError = () => { cleanUp(); reject(new Error(`Could not load ${clip.src}`)); };

      clip.addEventListener("ended", onEnded);
      clip.addEventListener("error", onError);
      clip.currentTime = 0;
      clip.play()
        .then(() => { frame = requestAnimationFrame(follow); })
        .catch((error) => { cleanUp(); reject(error); });
    });
  }

  async function startPlayAlong() {
    stopPlayback();
    ui.status.textContent = "";
    const playbackId = state.playbackId;
    setPlaying(true);

    try {
      for (let index = state.ayahIndex; index <= LAST_AYAH; index += 1) {
        if (index !== state.ayahIndex) glideTo(index, true);
        await state.arrival;
        if (playbackId !== state.playbackId) return;

        const isFinished = await reciteVerse(index, playbackId);
        if (!isFinished) return;
        highlightWord(null);
        wordElements(index).forEach((el) => el.classList.add("is-heard"));
        dom.stops[index].classList.add("is-recited");
        await wait(VERSE_GAP_MS);
        if (playbackId !== state.playbackId) return;
      }
      setRing(1);
      glideTo(LAST_STOP, true);
      setPlaying(false);
    } catch (error) {
      if (playbackId !== state.playbackId) return;
      setPlaying(false);
      showError("Recitation audio failed:", error);
    }
  }

  function replayVerse() {
    resetAyah(state.ayahIndex);
    wordElements().forEach((el) => el.classList.add("is-arrived"));
    state.arrival = Promise.resolve(true);
    startPlayAlong();
  }

  async function playSingleWord(wordIndex) {
    stopPlayback();
    const playbackId = state.playbackId;
    const ayah = surah.ayahs[state.ayahIndex];
    highlightWord(wordIndex);
    try {
      ui.wordVoice.src = wordAudioUrl(ayah.number, wordIndex + 1);
      await ui.wordVoice.play();
      await new Promise((resolve) => ui.wordVoice.addEventListener("ended", resolve, { once: true }));
      if (playbackId === state.playbackId) highlightWord(null);
    } catch (error) {
      if (playbackId === state.playbackId) showError("Word audio failed:", error);
    }
  }

  /* ---------- Interactions ---------- */

  function countOccurrences(arabic) {
    return surah.ayahs.reduce((count, ayah) => count + ayah.words.filter((w) => w.arabic === arabic).length, 0);
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
    if (state.mode === "memorise") wordElements()[wordIndex].classList.add("is-revealed");
    playSingleWord(wordIndex);
  }

  function setMode(mode) {
    const modes = ["listen", "learn", "memorise"];
    if (!modes.includes(mode)) throw new Error(`Unknown mode: ${mode}`);
    state.mode = mode;
    ui.room.dataset.mode = mode;
    document.querySelectorAll("button[data-mode]").forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    document.querySelectorAll(".word.is-revealed").forEach((el) => el.classList.remove("is-revealed"));
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
    // Arabic reads right to left, so the left arrow also moves forward through the surah.
    if (["ArrowDown", "PageDown", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      glideTo(state.stop + 1);
      return;
    }
    if (["ArrowUp", "PageUp", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      glideTo(state.stop - 1);
      return;
    }
    if (event.key === " " && !isOnControl) {
      event.preventDefault();
      togglePlay();
    }
  }

  function togglePlay() {
    if (state.isPlaying) {
      stopPlayback();
      return;
    }
    if (state.stop > LAST_AYAH) glideTo(0, true);
    startPlayAlong();
  }

  /* ---------- Rising gold dust ---------- */

  function createMoteSprite() {
    const sprite = document.createElement("canvas");
    sprite.width = 32;
    sprite.height = 32;
    const ctx = sprite.getContext("2d");
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255, 236, 196, 1)");
    glow.addColorStop(0.25, "rgba(244, 213, 154, 0.8)");
    glow.addColorStop(1, "rgba(244, 213, 154, 0)");
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
        speed: Math.random() * 0.014 + 0.007,
        phase: Math.random() * Math.PI * 2
      }));
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      motes.forEach((m) => {
        const rise = isReducedMotion ? 0 : time * m.speed;
        const y = ((m.y - rise) % (height + 40) + height + 40) % (height + 40) - 20;
        const sway = isReducedMotion ? 0 : Math.sin(time / 3800 + m.phase) * 14;
        ctx.globalAlpha = 0.22 + 0.33 * (0.5 + 0.5 * Math.sin(time / 1700 + m.phase));
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
    ui.play.addEventListener("click", togglePlay);
    $('[data-action="replay"]').addEventListener("click", replayVerse);
    ui.soundToggle.addEventListener("click", toggleSound);
    $('[data-action="hear-word"]').addEventListener("click", () => {
      if (state.sheetWordIndex !== null) playSingleWord(state.sheetWordIndex);
    });
    document.querySelectorAll("button[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => setMode(btn.dataset.mode))
    );
    document.addEventListener("keydown", handleKeydown);
  }

  buildScenes();
  buildJourney();
  buildRail();
  bindGestures();
  bindEvents();
  startMotes();
})();
