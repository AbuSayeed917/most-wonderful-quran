# Most Wonderful Quran

Learn the Quran slowly, softly, one word at a time — an ASMR-style learning experience.

We begin with **Surah Al-Fatiha** (The Opening).

## What it does

- **Play along** — press play and Mishary Alafasy recites the whole surah. Each word lights up exactly as it is spoken, using Quran.com's word timings, and its transliteration and meaning appear live beneath the verse. When a verse ends, the journey glides on to the next one by itself.
- **Learn** — every word shows its meaning beneath it. Tap a word for its transliteration, its root letters, and to hear it on its own.
- **Memorise** — the words are veiled. Recite from the heart, then tap a word to check yourself.
- **A journey from night to dawn** — scroll, swipe or use the arrow keys to glide between verses. Painted scenes crossfade with parallax and small moving details: a flickering lantern, shimmering water, turning rays of light and a glowing sun.
- **ASMR soundscape** — a soft typing tap as each word arrives, over a quiet desert night: gusting stereo wind, drifting sand and distant crickets in an open-air reverb, with the crickets fading as dawn comes. It is all synthesised in the browser, with no music. Toggle it with the moon button.

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
