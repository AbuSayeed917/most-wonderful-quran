# Most Wonderful Quran

Learn the Quran slowly, softly, one word at a time — an ASMR-style learning experience.

We begin with **Surah Al-Fatiha** (The Opening).

## What it does

- **Play along** — press play and Mishary Alafasy recites the whole surah. Each word fills with light from right to left exactly as it is spoken (Quran.com word timings), its transliteration and meaning appear live beneath the verse, and a warm light swells with the reciter's voice. Verses glide on by themselves, and the controls fade away while he recites.
- **Repeat ×3** — recite each verse three times before moving on, for memorising.
- **Learn** — every word shows its meaning. Turn on **tajweed colours** (from Quran.com's tajweed data) with a guide to each rule in the verse. Tap a word — or press and hold one in any mode — for its transliteration, root letters, the words in Al-Fatiha that share its root, and to hear it alone.
- **Memorise** — the words are veiled. Recite from the heart, then tap a word to check yourself.
- **Test yourself** — a short quiz: see a word, choose its meaning, hear it recited.
- **A journey from night to dawn** — scroll, swipe or use the arrow keys to glide between verses. Each painting moves in two depth layers (and leans with your mouse on desktop), with drifting mist, a sweep of light on each new verse, and small moving details: a flickering lantern, shimmering water, turning rays of light and a glowing sun.
- **ASMR soundscapes** — desert night (gusting stereo wind, drifting sand, distant crickets), soft rain, or a gentle stream, all in an open-air reverb, plus a soft typing tap as each word arrives and gentle vibration on Android. It is all synthesised in the browser, with no music.
- **Every device** — phones (including notched and small ones), phones held sideways, tablets and large desktops.

## Run it

It is a plain static site — no build step.

```bash
python3 -m http.server 4719
```

Then open http://localhost:4719.

## Audio

- Recitation: Mishary Rashid Alafasy, verse audio from [Quran.com](https://quran.com) (`verses.quran.com`), with word timings from the Quran.com API.
- Single words (tap a word): Quran.com word audio (`audio.qurancdn.com/wbw`).

Translations and reflections in `data/fatiha.js` are plain-English renderings written for learners.

## Scenes

Each ayah has its own painted scene, moving from night to dawn as the surah opens the day. They were generated with [Magnific](https://www.magnific.com) and live in `images/`. They are landscapes and architecture only: no figures and no text.

## Motion

Soft overlays of drifting mist, floating dust and rain are free stock clips from [Pexels](https://www.pexels.com) (free to use, no attribution required), filmed on black and screen-blended over the paintings. They are trimmed to seamless loops, cleaned (large out-of-focus blobs removed, near-blacks crushed) and compressed into `images/motion/`:

- `mist.mp4`: from Pexels video 4320605
- `dust.mp4`: from Pexels video 9665236 (also tinted gold in CSS for the night scenes)
- `rain.mp4`: from Pexels video 36344044 (shown with the Rain soundscape)
