(function () {
  "use strict";

  const surah = window.SURAH_FATIHA;
  if (!surah || !Array.isArray(surah.ayahs) || surah.ayahs.length === 0) {
    throw new Error("Surah data failed to load: expected window.SURAH_FATIHA with ayahs.");
  }
  const hasCompleteWordData = surah.ayahs.every((ayah) =>
    Array.isArray(ayah.timings) && ayah.timings.length === ayah.words.length &&
    Array.isArray(ayah.tajweed) && ayah.tajweed.length === ayah.words.length
  );
  if (!hasCompleteWordData) {
    throw new Error("Surah data is incomplete: every ayah needs timings and tajweed for each word.");
  }
  // Quranic text must never show stray markup: refuse to render if any tajweed piece still carries a tag.
  const leakedMarkup = surah.ayahs.flatMap((ayah) => ayah.tajweed.flat()).find(([text]) => /[<>]/.test(text));
  if (leakedMarkup) {
    throw new Error(`Tajweed data contains markup in the text: "${leakedMarkup[0]}". Re-import the tajweed data.`);
  }
  const sound = window.Soundscape;
  if (!sound) throw new Error("Soundscape failed to load: expected window.Soundscape from sound.js.");

  const LAST_AYAH = surah.ayahs.length - 1;
  const LAST_STOP = surah.ayahs.length; // the closing "Ameen" screen sits after the last ayah
  const GLIDE_MS = 1150;
  const IMMERSE_AFTER_MS = 3200;
  const WHEEL_THRESHOLD = 6;
  const SWIPE_THRESHOLD = 36;
  const WHEEL_SETTLE_MS = 200;
  const LONG_PRESS_MS = 480;
  const FIRST_WORD_DELAY_MS = 260;
  const WORD_ARRIVAL_MS = 110;
  const GLINT_MS = 420;
  const VERSE_GAP_MS = 380;
  const REPEAT_GAP_MS = 700;
  const REPEAT_COUNT = 3;
  const VOICE_FADE_OUT_MS = 380;
  const NOW_FADE_MS = 140;
  const QUIZ_LENGTH = 5;
  const QUIZ_NEXT_MS = 1500;
  const RING_LENGTH = 188.5;
  const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

  // Each painting gets the living details that match what is drawn in it, on the layer they belong to.
  const SCENE_EFFECTS = {
    1: { sky: ["stars"], ground: ["lantern"] },
    2: { sky: ["stars"], ground: ["water"] },
    5: { sky: ["rays"], ground: [] },
    6: { sky: ["rays"], ground: ["path"] },
    7: { sky: ["rays", "sun"], ground: [] }
  };

  const TAJWEED_RULES = [
    { id: "ham_wasl", name: "Hamzat al-waṣl · silent when joined", short: "Silent hamza", colour: "var(--tj-silent)" },
    { id: "laam_shamsiyah", name: "Lām shamsiyyah · silent lām", short: "Silent lām", colour: "var(--tj-silent)" },
    { id: "madda_normal", name: "Natural madd · 2 counts", short: "Madd · 2", colour: "var(--tj-madd-natural)" },
    { id: "madda_permissible", name: "Permissible madd · 2, 4 or 6", short: "Madd · 2–6", colour: "var(--tj-madd-permissible)" },
    { id: "madda_necessary", name: "Necessary madd · 6 counts", short: "Madd · 6", colour: "var(--tj-madd-necessary)" }
  ];

  const $ = (selector) => document.querySelector(selector);
  const ui = {
    root: document.documentElement,
    screens: document.querySelectorAll("[data-screen]"),
    room: $('[data-screen="room"]'),
    journey: $(".journey"),
    scenes: $(".scenes"),
    voiceLight: $(".voice-light"),
    sweep: $(".sweep"),
    verseNav: $(".dock__verses"),
    nextVerse: $('[data-action="next"]'),
    soundLabel: $("[data-sound-label]"),
    tajweedQuick: $('[data-action="tajweed-quick"]'),
    cue: $(".cue"),
    status: $(".status"),
    legend: $(".legend"),
    play: $('[data-action="play"]'),
    ring: $(".play__ring-fill"),
    repeat: $('[data-action="repeat"]'),
    soundMenu: $('[data-action="soundmenu"]'),
    soundPanel: $(".sound-panel"),
    haptics: $('[data-action="haptics"]'),
    wordVoice: $(".word-voice"),
    sheet: $(".sheet"),
    sheetArabic: $(".sheet__arabic"),
    sheetTranslit: $(".sheet__translit"),
    sheetMeaning: $(".sheet__meaning"),
    sheetRoot: $(".sheet__root"),
    sheetPlace: $(".sheet__place"),
    family: $(".family"),
    familyList: $(".family__list"),
    quiz: $(".quiz"),
    quizProgress: $(".quiz__progress"),
    quizWord: $(".quiz__word"),
    quizOptions: $(".quiz__options"),
    quizFeedback: $(".quiz__feedback"),
    quizScore: $(".quiz__score")
  };

  const dom = { track: null, stops: [], inners: [], nows: [], counts: [], sceneFrames: [], verseButtons: [], legendItems: [] };

  // How strongly each motion clip shows over each ayah's painting (0 to 1), blended as you glide between them.
  const MOTION_LEVELS = [
    { gold: 0.55, dust: 0, mist: 0.12 },    // 1 · Milky Way: warm motes like lantern sparks
    { gold: 0.6, dust: 0, mist: 0.22 },     // 2 · Oasis: firefly-like glow over mist on the water
    { gold: 0, dust: 0.18, mist: 0.38 },    // 3 · Violet dunes: mist rolling between the dunes
    { gold: 0, dust: 0.12, mist: 0.45 },    // 4 · Storm clouds: heavier mist, solemn
    { gold: 0.2, dust: 0.55, mist: 0.1 },   // 5 · Arch: dust floating in the light
    { gold: 0.15, dust: 0.35, mist: 0.2 },  // 6 · Path: dust lifting off the path
    { gold: 0.25, dust: 0.3, mist: 0.08 }   // 7 · Garden: soft morning motes
  ];
  const RAIN_LEVEL = 0.5;

  const SCAPE_LABELS = { night: "Night", rain: "Rain", stream: "Stream", off: "Silent" };

  // One audio element per verse so the next verse can buffer while this one plays.
  const verseClips = surah.ayahs.map((ayah) => {
    const clip = new Audio();
    clip.crossOrigin = "anonymous"; // lets the Web Audio graph read the voice level
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
    isTajweedOn: false,
    isRepeatOn: false,
    isHapticsOn: true,
    isPlaying: false,
    playbackId: 0,
    arrival: Promise.resolve(true),
    arrivalId: 0,
    spokenIndex: null,
    sheetWord: null,
    quiz: null
  };

  /* ---------- Pure helpers ---------- */

  function pad3(n) { return String(n).padStart(3, "0"); }
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const toArabicNumber = (n) => String(n).split("").map((d) => ARABIC_DIGITS[Number(d)]).join("");
  const wordAudioUrl = (ayah, wordNumber) =>
    `https://audio.qurancdn.com/wbw/${pad3(surah.number)}_${pad3(ayah)}_${pad3(wordNumber)}.mp3`;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // A sine ease leaves and lands more gently than a cubic one: the glide feels like an exhale.
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const shuffle = (items) => items
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);

  function findSpokenWord(timings, ms) {
    const index = timings.findIndex(([start, end]) => ms >= start && ms < end);
    if (index !== -1) return index;
    // In the tiny gaps between words, keep the previous word lit rather than flickering off.
    const before = timings.filter(([start]) => start <= ms).length - 1;
    return before >= 0 ? before : null;
  }

  function wordFill(timing, ms) {
    const [start, end] = timing;
    return clamp((ms - start) / Math.max(1, end - start), 0, 1);
  }

  const allWords = surah.ayahs.flatMap((ayah) =>
    ayah.words.map((word, index) => ({ ...word, ayahNumber: ayah.number, wordNumber: index + 1 }))
  );

  function rootFamily(word) {
    if (!word.root || word.root === "—") return [];
    const seen = new Set([word.arabic]);
    return allWords.filter((other) => {
      if (other.root !== word.root || seen.has(other.arabic)) return false;
      seen.add(other.arabic);
      return true;
    });
  }

  /* ---------- Small DOM helpers ---------- */

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function vibrate(ms) {
    if (!state.isHapticsOn || typeof navigator.vibrate !== "function") return;
    // Browsers refuse vibration until the visitor has interacted with the page; don't ask before then.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(ms);
  }

  function retrigger(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // force a reflow so the same animation can play again
    el.classList.add(className);
  }

  /* ---------- Building the scenes ---------- */

  function createEffect(kind) {
    const el = element("div", `fx fx-${kind}`);
    if (kind === "stars") {
      for (let i = 0; i < 26; i += 1) {
        const star = element("span");
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
        const ripple = element("span");
        ripple.style.left = `${(i * 23) % 70}%`;
        ripple.style.top = `${i * 14}%`;
        ripple.style.width = `${16 + (i % 3) * 9}%`;
        ripple.style.animationDelay = `${-i * 0.9}s`;
        el.append(ripple);
      }
    }
    if (kind === "path") {
      for (let i = 0; i < 3; i += 1) {
        const light = element("span");
        light.style.animationDelay = `${i * 1.8}s`;
        el.append(light);
      }
    }
    return el;
  }

  function createLayer(depth, src, effects) {
    const layer = element("div", `scene__layer scene__layer--${depth}`);
    const img = element("img");
    img.src = src;
    img.alt = "";
    img.width = 720;
    img.height = 1280;
    img.decoding = "async";
    layer.append(img, ...effects.map(createEffect));
    return layer;
  }

  function buildScenes() {
    const frames = surah.ayahs.map((ayah, index) => {
      const effects = SCENE_EFFECTS[ayah.number] || { sky: [], ground: [] };
      const src = `images/ayah-${ayah.number}.jpg`;
      const frame = element("div", "scene");
      const stage = element("div", "scene__stage");
      stage.style.setProperty("--breathe", `${22 + index * 2}s`);
      // One painting layer per scene: a second masked copy for depth doubled the GPU work on every frame.
      stage.append(createLayer("sky", src, [...effects.sky, ...effects.ground]));
      frame.append(stage);
      return frame;
    });
    ui.scenes.replaceChildren(...frames);
    dom.sceneFrames = frames;
  }

  /* ---------- Building the journey ---------- */

  // Quran.com's tajweed markup carries a kashida (U+0640) and an alef with wavy hamza (U+0672) where the
  // plain Uthmani text has a dagger alif. Both are shaping choices, not letters, so render the standard form.
  const normaliseTajweedText = (text) => text.replace(/ـ/g, "").replace(/ٲ/g, "ٰ");

  function buildTajweedWord(pieces) {
    const span = element("span", "word__tj");
    span.append(...pieces.map(([text, rule]) =>
      element("span", rule ? `tj tj--${rule}` : "tj", normaliseTajweedText(text))
    ));
    return span;
  }

  function buildWord(word, index, tajweed) {
    const button = element("button", "word");
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `${word.transliteration}, ${word.meaning}`);
    button.append(element("span", "word__ar", word.arabic), buildTajweedWord(tajweed), element("span", "word__gloss", word.meaning));
    button.addEventListener("click", () => {
      if (button.dataset.longPressed === "true") {
        delete button.dataset.longPressed;
        return;
      }
      handleWordTap(index);
    });
    bindLongPress(button, () => {
      button.dataset.longPressed = "true";
      openWordSheet(index);
    });
    return button;
  }

  function buildAyahSection(ayah) {
    const section = element("section", ayah.words.length > 6 ? "ayah ayah--long" : "ayah");
    section.setAttribute("aria-label", `Verse ${ayah.number}`);
    const inner = element("div", "ayah__inner");

    const meta = element("p", "ayah__meta");
    const count = element("span", "ayah__count");
    meta.append(element("span", "", `Ayah ${ayah.number} of ${surah.ayahs.length}`), count);

    const arabic = element("p", "ayah__arabic");
    arabic.lang = "ar";
    arabic.dir = "rtl";
    // The end-of-ayah sign (U+06DD) encloses the verse number that follows it, as on a mushaf page.
    const endMark = element("span", "ayah__end", `۝${toArabicNumber(ayah.number)}`);
    endMark.setAttribute("aria-hidden", "true");
    const words = ayah.words.map((word, index) => buildWord(word, index, ayah.tajweed[index]));
    // The last word and the end-of-ayah sign never separate, so the sign can't wrap onto a line alone.
    const lastGroup = element("span", "word-group");
    lastGroup.append(words[words.length - 1], endMark);
    arabic.append(...words.slice(0, -1), lastGroup);

    const now = element("p", "now");
    now.setAttribute("aria-hidden", "true");
    now.append(element("span", "now__translit"), element("span", "now__dash"), element("span", "now__meaning"));

    const panel = element("div", "panel");
    panel.append(...["tl", "tr", "bl", "br"].map((corner) => {
      const star = element("span", `panel__corner panel__corner--${corner}`);
      star.setAttribute("aria-hidden", "true");
      return star;
    }));
    panel.append(arabic, now, buildDivider(), element("p", "ayah__translation", ayah.translation));

    if (ayah.number === 1) inner.append(buildSurahHeader());
    inner.append(meta, panel);
    section.append(inner);
    return { section, inner, now, count };
  }

  function buildDivider() {
    const divider = element("span", "divider");
    divider.setAttribute("aria-hidden", "true");
    divider.append(element("i", "divider__line"), element("i", "divider__rosette"), element("i", "divider__line"));
    return divider;
  }

  // The illuminated cartouche that opens a surah in a printed mushaf, drawn as a simple geometric frame.
  function buildSurahHeader() {
    const header = element("div", "surah-head");
    header.innerHTML = `
      <svg class="surah-head__frame" viewBox="0 0 320 60" aria-hidden="true" preserveAspectRatio="none">
        <path d="M4 30 L30 4 H290 L316 30 L290 56 H30 Z" />
        <path d="M14 30 L34 10 H286 L306 30 L286 50 H34 Z" />
        <path class="surah-head__gem" d="M4 30 l6 -6 l6 6 l-6 6 Z M304 30 l6 -6 l6 6 l-6 6 Z" />
      </svg>`;
    const name = element("h2", "surah-head__name", "سُورَةُ ٱلْفَاتِحَةِ");
    name.lang = "ar";
    name.dir = "rtl";
    header.append(name);
    return header;
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
    const test = element("button", "btn btn--ghost", "Test yourself");
    test.type = "button";
    test.addEventListener("click", openQuiz);
    const memorise = element("button", "btn btn--primary", "Recite from the heart");
    memorise.type = "button";
    memorise.addEventListener("click", () => {
      setMode("memorise");
      glideTo(0);
    });
    const actions = element("div", "ameen__actions");
    actions.append(again, test, memorise);

    // Āmīn is said after Al-Fatiha but is not one of its verses; say so, so no one mistakes it for Quran.
    const note = element("p", "ameen__note", "Said after Al-Fatiha, not part of the surah. It means “O Allah, answer us.”");
    inner.append(arabic, note, element("p", "ameen__line", "The day has opened."), actions);
    section.append(inner);
    return { section, inner, now: null, count: null };
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
    dom.counts = built.map((b) => b.count);
  }

  function buildRail() {
    dom.verseButtons = surah.ayahs.map((ayah, index) => {
      const button = element("button", "verse-pill", toArabicNumber(ayah.number));
      button.type = "button";
      button.setAttribute("aria-label", `Go to verse ${ayah.number}`);
      button.addEventListener("click", () => glideTo(index));
      return button;
    });
    ui.verseNav.insertBefore(element("span", "verse-pills"), ui.nextVerse).append(...dom.verseButtons);
  }

  function buildLegend() {
    dom.legendItems = TAJWEED_RULES.map((rule) => {
      const item = element("li");
      item.dataset.rule = rule.id;
      const swatch = element("i");
      swatch.style.background = rule.colour;
      item.title = rule.name;
      item.append(swatch, element("span", "legend__full", rule.name), element("span", "legend__short", rule.short));
      return item;
    });
    ui.legend.replaceChildren(...dom.legendItems);
  }

  function updateLegend() {
    const present = new Set(surah.ayahs[state.ayahIndex].tajweed.flat().map(([, rule]) => rule).filter(Boolean));
    dom.legendItems.forEach((item) => item.classList.toggle("is-present", present.has(item.dataset.rule)));
    // The guide lives inside the current verse's panel, in normal flow, so it can never overlap the text.
    dom.stops[state.ayahIndex].querySelector(".panel").append(ui.legend);
  }

  /* ---------- Sizing: one verse per real screen height, on every device ---------- */

  function measureStop() {
    // innerHeight follows the visible area as mobile browser bars show and hide, unlike 100vh.
    ui.root.style.setProperty("--stop-h", `${window.innerHeight}px`);
    applyPosition(state.position);
  }

  /* ---------- Rendering one frame of the glide ---------- */

  function applyPosition(position) {
    if (!dom.track) return;
    const height = window.innerHeight;
    const scenePosition = Math.min(position, LAST_AYAH);

    dom.track.style.transform = `translate3d(0, ${(-position * height).toFixed(2)}px, 0)`;

    dom.sceneFrames.forEach((frame, index) => {
      const presence = clamp(1 - Math.abs(scenePosition - index), 0, 1);
      frame.style.opacity = presence.toFixed(4);
      frame.style.visibility = presence === 0 ? "hidden" : "visible";
      const shift = isReducedMotion ? 0 : (index - scenePosition) * 70;
      frame.style.setProperty("--shift", shift.toFixed(2));
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

    ui.cue.style.opacity = state.isPlaying ? "0" : clamp(1 - position * 3, 0, 1).toFixed(3);
    sound.setNightLevel(1 - scenePosition / 4);
    ui.root.style.setProperty("--dawn", clamp((scenePosition - 2) / 4, 0, 1).toFixed(3));
    applyMotion(scenePosition);
  }

  /* ---------- Stock motion overlays ---------- */

  const motionClips = Object.fromEntries(
    [...document.querySelectorAll(".motion__clip")].map((clip) => [clip.dataset.clip, clip])
  );

  // Only opacity changes during a glide: starting or stopping a video's decoder mid-glide caused 50 ms hitches.
  function setClipLevel(clip, level) {
    clip.style.opacity = level.toFixed(3);
  }

  // The clips are small, so they all run while the verses are on screen and all rest on the welcome screen.
  function setMotionRunning(isRunning) {
    Object.values(motionClips).forEach((clip) => {
      if (isRunning && !isReducedMotion) {
        clip.play().catch((error) => console.error("Motion clip could not play:", error));
        return;
      }
      clip.pause();
    });
  }

  function applyMotion(scenePosition) {
    const index = Math.floor(scenePosition);
    const blend = scenePosition - index;
    const from = MOTION_LEVELS[index];
    const to = MOTION_LEVELS[Math.min(index + 1, LAST_AYAH)];
    ["gold", "dust", "mist"].forEach((name) => {
      setClipLevel(motionClips[name], from[name] + (to[name] - from[name]) * blend);
    });
  }

  function setRainMotion(isRaining) {
    setClipLevel(motionClips.rain, isRaining ? RAIN_LEVEL : 0);
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
      state.position = from + (target - from) * easeInOutSine(progress);
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
    window.addEventListener("resize", measureStop);
    if (hasFinePointer && !isReducedMotion) bindPointerDepth();
  }

  // On desktops, the layers lean gently away from the pointer, like looking through a window.
  function bindPointerDepth() {
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let isAnimating = false;
    function ease() {
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      ui.scenes.style.setProperty("--tilt-x", current.x.toFixed(4));
      ui.scenes.style.setProperty("--tilt-y", current.y.toFixed(4));
      const isSettled = Math.abs(target.x - current.x) < 0.001 && Math.abs(target.y - current.y) < 0.001;
      if (isSettled) {
        isAnimating = false;
        return;
      }
      requestAnimationFrame(ease);
    }
    window.addEventListener("pointermove", (event) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
      if (isAnimating) return;
      isAnimating = true;
      requestAnimationFrame(ease);
    });
  }

  function bindLongPress(el, onLongPress) {
    let timer = null;
    const cancel = () => clearTimeout(timer);
    el.addEventListener("pointerdown", () => {
      cancel();
      timer = setTimeout(onLongPress, LONG_PRESS_MS);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) => el.addEventListener(type, cancel));
    el.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  /* ---------- Words arriving, one soft key at a time ---------- */

  function wordElements(index = state.ayahIndex) {
    return Array.from(dom.stops[index].querySelectorAll(".word"));
  }

  function setWordFill(el, fill) {
    el.querySelector(".word__ar").style.setProperty("--fill", fill.toFixed(3));
  }

  function resetAyah(index) {
    dom.stops[index].classList.remove("is-recited");
    wordElements(index).forEach((el) => {
      el.classList.remove("is-arrived", "is-glinting", "is-heard", "is-spoken");
      el.querySelector(".word__ar").style.removeProperty("--fill");
    });
    dom.nows[index].classList.remove("is-showing");
    dom.counts[index].textContent = "";
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
      vibrate(6);
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
    dom.verseButtons.forEach((dot, i) => {
      dot.setAttribute("aria-current", i === index ? "step" : "false");
      dot.classList.toggle("is-passed", i < index);
    });
    updateLegend();
    if (!isReducedMotion) retrigger(ui.sweep, "is-sweeping");
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
      if (index !== wordIndex) el.querySelector(".word__ar").style.removeProperty("--fill");
    });
    showNow(state.ayahIndex, wordIndex);
    if (wordIndex === null) return;
    if (!isReducedMotion) retrigger(ui.voiceLight, "is-pulse");
    vibrate(8);
  }

  function setRing(progress) {
    ui.ring.style.strokeDashoffset = (RING_LENGTH * (1 - clamp(progress, 0, 1))).toFixed(2);
  }

  function setVoiceLevel(level) {
    ui.root.style.setProperty("--voice", level.toFixed(3));
  }

  function setPlaying(isPlaying) {
    state.isPlaying = isPlaying;
    ui.room.classList.toggle("is-reciting", isPlaying);
    ui.play.classList.toggle("is-playing", isPlaying);
    ui.play.setAttribute("aria-label", isPlaying ? "Pause" : "Play along with the recitation");
    if (!isPlaying) setVoiceLevel(0);
    wakeChrome();
    applyPosition(state.position);
  }

  /* ---------- Immersion: quiet the controls while reciting ---------- */

  let immerseTimer = null;
  function wakeChrome() {
    ui.room.classList.remove("is-immersed");
    clearTimeout(immerseTimer);
    if (!state.isPlaying) return;
    immerseTimer = setTimeout(() => {
      const isPanelOpen = !ui.soundPanel.hidden;
      const hasFocusInChrome = document.activeElement && document.activeElement.closest(".topbar, .dock");
      if (state.isPlaying && !isPanelOpen && !hasFocusInChrome) ui.room.classList.add("is-immersed");
    }, IMMERSE_AFTER_MS);
  }

  function showError(message, error) {
    console.error(message, error);
    ui.status.textContent = "The reciter couldn't be reached. Check your connection and try again.";
  }

  function stopPlayback() {
    state.playbackId += 1;
    verseClips.forEach((clip) => {
      if (clip.paused) return;
      // Let the voice fall away softly instead of cutting mid-breath.
      sound.attachVoice(clip).fadeOut();
      setTimeout(() => clip.pause(), VOICE_FADE_OUT_MS);
    });
    ui.wordVoice.pause();
    setPlaying(false);
  }

  // Follows the reciter with Quran.com's word timings, checked every frame for a tight, smooth highlight.
  function reciteVerse(index, playbackId) {
    return new Promise((resolve, reject) => {
      const clip = verseClips[index];
      const voice = sound.attachVoice(clip);
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
        const ms = clip.currentTime * 1000;
        const spoken = findSpokenWord(timings, ms);
        highlightWord(spoken);
        if (spoken !== null) setWordFill(wordElements()[spoken], wordFill(timings[spoken], ms));
        setVoiceLevel(voice.level());
        if (clip.duration) setRing((index + clip.currentTime / clip.duration) / surah.ayahs.length);
        frame = requestAnimationFrame(follow);
      };
      const onEnded = () => { cleanUp(); resolve(playbackId === state.playbackId); };
      const onError = () => { cleanUp(); reject(new Error(`Could not load ${clip.src}`)); };

      clip.addEventListener("ended", onEnded);
      clip.addEventListener("error", onError);
      clip.currentTime = 0;
      clip.play()
        .then(() => {
          voice.fadeIn();
          frame = requestAnimationFrame(follow);
        })
        .catch((error) => { cleanUp(); reject(error); });
    });
  }

  function finishVerse(index) {
    highlightWord(null);
    wordElements(index).forEach((el) => el.classList.add("is-heard"));
    dom.stops[index].classList.add("is-recited");
  }

  async function startPlayAlong() {
    stopPlayback();
    await sound.resume();
    ui.status.textContent = "";
    const playbackId = state.playbackId;
    setPlaying(true);

    try {
      for (let index = state.ayahIndex; index <= LAST_AYAH; index += 1) {
        if (index !== state.ayahIndex) glideTo(index, true);
        await state.arrival;
        if (playbackId !== state.playbackId) return;

        const repeats = state.isRepeatOn ? REPEAT_COUNT : 1;
        for (let round = 1; round <= repeats; round += 1) {
          dom.counts[index].textContent = repeats > 1 ? `· ${round} of ${repeats}` : "";
          if (round > 1) {
            wordElements(index).forEach((el) => el.classList.remove("is-heard"));
            state.spokenIndex = null;
          }
          const isFinished = await reciteVerse(index, playbackId);
          if (!isFinished) return;
          finishVerse(index);
          await wait(round < repeats ? REPEAT_GAP_MS : VERSE_GAP_MS);
          if (playbackId !== state.playbackId) return;
        }
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
    if (state.stop > LAST_AYAH) glideTo(LAST_AYAH, true);
    resetAyah(state.ayahIndex);
    wordElements().forEach((el) => el.classList.add("is-arrived"));
    state.arrival = Promise.resolve(true);
    startPlayAlong();
  }

  async function playWord(ayahNumber, wordNumber) {
    ui.wordVoice.src = wordAudioUrl(ayahNumber, wordNumber);
    await ui.wordVoice.play();
    await new Promise((resolve) => ui.wordVoice.addEventListener("ended", resolve, { once: true }));
  }

  async function playSingleWord(wordIndex) {
    stopPlayback();
    const playbackId = state.playbackId;
    const ayah = surah.ayahs[state.ayahIndex];
    highlightWord(wordIndex);
    setWordFill(wordElements()[wordIndex], 1);
    try {
      await playWord(ayah.number, wordIndex + 1);
      if (playbackId === state.playbackId) highlightWord(null);
    } catch (error) {
      if (playbackId === state.playbackId) showError("Word audio failed:", error);
    }
  }

  /* ---------- Word sheet ---------- */

  function countOccurrences(arabic) {
    return allWords.filter((w) => w.arabic === arabic).length;
  }

  function openWordSheet(wordIndex) {
    const ayah = surah.ayahs[state.ayahIndex];
    const word = { ...ayah.words[wordIndex], ayahNumber: ayah.number, wordNumber: wordIndex + 1 };
    const occurrences = countOccurrences(word.arabic);
    state.sheetWord = word;
    ui.sheetArabic.textContent = word.arabic;
    ui.sheetTranslit.textContent = word.transliteration;
    ui.sheetMeaning.textContent = word.meaning;
    ui.sheetRoot.textContent = word.root;
    ui.sheetPlace.textContent = occurrences > 1 ? `${occurrences} times in Al-Fatiha` : `Verse ${ayah.number}`;

    const family = rootFamily(word);
    ui.family.hidden = family.length === 0;
    ui.familyList.replaceChildren(...family.map((member) => {
      const item = element("li");
      const ar = element("span", "family__ar", member.arabic);
      ar.lang = "ar";
      ar.dir = "rtl";
      item.append(ar, element("span", "family__en", member.meaning));
      return item;
    }));

    if (!ui.sheet.open) ui.sheet.showModal();
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

  /* ---------- Quiz ---------- */

  function buildQuizRounds() {
    const unique = [];
    const seen = new Set();
    allWords.forEach((word) => {
      if (seen.has(word.meaning)) return;
      seen.add(word.meaning);
      unique.push(word);
    });
    return shuffle(unique).slice(0, QUIZ_LENGTH).map((word) => {
      const distractors = shuffle(unique.filter((other) => other.meaning !== word.meaning)).slice(0, 2);
      return { word, options: shuffle([word, ...distractors]).map((w) => w.meaning) };
    });
  }

  function renderQuizRound() {
    const { rounds, current } = state.quiz;
    const round = rounds[current];
    ui.quiz.classList.remove("is-finished");
    ui.quizProgress.textContent = `Question ${current + 1} of ${rounds.length}`;
    ui.quizWord.textContent = round.word.arabic;
    ui.quizFeedback.textContent = "";
    ui.quizOptions.replaceChildren(...round.options.map((meaning) => {
      const button = element("button", "", meaning);
      button.type = "button";
      button.addEventListener("click", () => answerQuiz(button, meaning));
      return button;
    }));
  }

  async function answerQuiz(button, meaning) {
    const quiz = state.quiz;
    const round = quiz.rounds[quiz.current];
    const isRight = meaning === round.word.meaning;
    ui.quizOptions.querySelectorAll("button").forEach((option) => {
      option.disabled = true;
      if (option.textContent === round.word.meaning) option.classList.add("is-right");
    });
    if (!isRight) button.classList.add("is-wrong");
    if (isRight) quiz.score += 1;
    ui.quizFeedback.textContent = isRight
      ? `Beautiful. ${round.word.transliteration} means “${round.word.meaning}”.`
      : `${round.word.transliteration} means “${round.word.meaning}”.`;
    sound.tick();
    vibrate(isRight ? 10 : 24);
    try {
      await playWord(round.word.ayahNumber, round.word.wordNumber);
    } catch (error) {
      console.error("Quiz word audio failed:", error);
    }
    await wait(QUIZ_NEXT_MS);
    if (state.quiz !== quiz || !ui.quiz.open) return;
    quiz.current += 1;
    if (quiz.current < quiz.rounds.length) {
      renderQuizRound();
      return;
    }
    ui.quiz.classList.add("is-finished");
    ui.quizProgress.textContent = "Complete";
    ui.quizScore.textContent = `${quiz.score} of ${quiz.rounds.length} — ${quiz.score === quiz.rounds.length ? "every word is yours." : "keep listening, it will settle."}`;
  }

  function openQuiz() {
    stopPlayback();
    state.quiz = { rounds: buildQuizRounds(), current: 0, score: 0 };
    renderQuizRound();
    if (!ui.quiz.open) ui.quiz.showModal();
  }

  /* ---------- Settings ---------- */

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

  function toggleTajweed() {
    state.isTajweedOn = !state.isTajweedOn;
    ui.room.dataset.tajweed = state.isTajweedOn ? "on" : "off";
    ui.tajweedQuick.setAttribute("aria-pressed", String(state.isTajweedOn));
  }

  function toggleRepeat() {
    state.isRepeatOn = !state.isRepeatOn;
    ui.repeat.setAttribute("aria-pressed", String(state.isRepeatOn));
  }

  function setSoundPanelOpen(isOpen) {
    ui.soundPanel.hidden = !isOpen;
    ui.soundMenu.setAttribute("aria-expanded", String(isOpen));
  }

  function chooseScape(choice) {
    document.querySelectorAll("[data-scape]").forEach((option) => {
      option.setAttribute("aria-checked", String(option.dataset.scape === choice));
    });
    const label = document.querySelector(`[data-scape="${choice}"]`).textContent;
    ui.soundMenu.setAttribute("aria-label", `Soundscape: ${label.toLowerCase()}`);
    ui.soundLabel.textContent = SCAPE_LABELS[choice];
    ui.soundMenu.dataset.currentScape = choice;
    setRainMotion(choice === "rain");
    setSoundPanelOpen(false);
    if (choice === "off") {
      sound.setEnabled(false);
      return;
    }
    sound.setScape(choice);
    sound.setEnabled(true);
  }

  function showScreen(name) {
    ui.screens.forEach((screen) => screen.classList.toggle("is-active", screen.dataset.screen === name));
    ui.scenes.classList.toggle("is-visible", name === "room");
    document.querySelector(".motion").classList.toggle("is-visible", name === "room");
    setMotionRunning(name === "room");
  }

  function togglePlay() {
    if (state.isPlaying) {
      stopPlayback();
      return;
    }
    if (state.stop > LAST_AYAH) glideTo(0, true);
    startPlayAlong();
  }

  function handleKeydown(event) {
    const isRoomOpen = ui.room.classList.contains("is-active");
    const isDialogOpen = ui.sheet.open || ui.quiz.open;
    if (!isRoomOpen || isDialogOpen) return;
    if (event.key === "Escape" && !ui.soundPanel.hidden) {
      setSoundPanelOpen(false);
      ui.soundMenu.focus();
      return;
    }
    const isOnControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement;
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
      // Scale the dust with the screen so a phone and a wide monitor feel equally full.
      motes = Array.from({ length: Math.round(Math.sqrt(width * height) / 16) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 9 + 4,
        speed: Math.random() * 0.014 + 0.007,
        phase: Math.random() * Math.PI * 2
      }));
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height);
      const voiceLift = Number(ui.root.style.getPropertyValue("--voice")) || 0;
      motes.forEach((m) => {
        const rise = isReducedMotion ? 0 : time * m.speed;
        const y = ((m.y - rise) % (height + 40) + height + 40) % (height + 40) - 20;
        const sway = isReducedMotion ? 0 : Math.sin(time / 3800 + m.phase) * 14;
        ctx.globalAlpha = Math.min(1, 0.22 + 0.33 * (0.5 + 0.5 * Math.sin(time / 1700 + m.phase)) + voiceLift * 0.35);
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
      measureStop();
      updateInert();
      activateAyah(state.ayahIndex);
    });
    $('[data-action="home"]').addEventListener("click", () => {
      stopPlayback();
      state.arrivalId += 1;
      setSoundPanelOpen(false);
      showScreen("welcome");
    });
    ui.play.addEventListener("click", togglePlay);
    $('[data-action="replay"]').addEventListener("click", replayVerse);
    $('[data-action="prev"]').addEventListener("click", () => glideTo(state.stop - 1));
    ui.nextVerse.addEventListener("click", () => glideTo(state.stop + 1));
    ui.tajweedQuick.addEventListener("click", toggleTajweed);
    ui.repeat.addEventListener("click", toggleRepeat);
    $('[data-action="quiz"]').addEventListener("click", openQuiz);
    $('[data-action="quiz-again"]').addEventListener("click", openQuiz);
    ui.quiz.addEventListener("close", () => { state.quiz = null; });
    ui.soundMenu.addEventListener("click", () => setSoundPanelOpen(ui.soundPanel.hidden));
    document.querySelectorAll("[data-scape]").forEach((option) =>
      option.addEventListener("click", () => chooseScape(option.dataset.scape))
    );
    ui.haptics.addEventListener("change", () => { state.isHapticsOn = ui.haptics.checked; });
    document.addEventListener("pointerdown", (event) => {
      if (ui.soundPanel.hidden) return;
      if (ui.soundPanel.contains(event.target) || ui.soundMenu.contains(event.target)) return;
      setSoundPanelOpen(false);
    });
    $('[data-action="hear-word"]').addEventListener("click", () => {
      if (!state.sheetWord) return;
      playWord(state.sheetWord.ayahNumber, state.sheetWord.wordNumber)
        .catch((error) => showError("Word audio failed:", error));
    });
    document.querySelectorAll("button[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => setMode(btn.dataset.mode))
    );
    document.addEventListener("keydown", handleKeydown);
    ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach((type) =>
      document.addEventListener(type, wakeChrome, { passive: true })
    );
  }

  buildScenes();
  buildJourney();
  buildRail();
  buildLegend();
  bindGestures();
  bindEvents();
  measureStop();
  startMotes();
})();
