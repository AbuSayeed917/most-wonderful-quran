# Most Wonderful Quran

Learn the Quran slowly, softly, one word at a time — an ASMR-style learning experience.

We begin with **Surah Al-Fatiha** (The Opening).

## What it does

- **Listen** — each word is recited on its own, glowing gold as it is spoken, with a gentle breath between words. Switch to *Full verse* to hear the whole ayah flowing. Listen mode drifts into the next verse by itself.
- **Learn** — every word shows its meaning beneath it. Tap a word for its transliteration, root letters and to hear it again.
- **Memorise** — the words are veiled. Recite from the heart, then tap a word to check yourself.
- **Soft rain** — optional ambience generated in the browser (no music).

## Run it

It is a plain static site — no build step.

```bash
python3 -m http.server 4719
```

Then open http://localhost:4719.

## Audio

- Word-by-word recitation: [Quran.com](https://quran.com) word audio (`audio.qurancdn.com/wbw`).
- Full verses: Mishary Rashid Alafasy via [EveryAyah](https://everyayah.com).

Translations and reflections in `data/fatiha.js` are plain-English renderings written for learners.

## Scenes

Each ayah has its own painted scene, moving from night to dawn as the surah opens the day. They were generated with [Magnific](https://www.magnific.com) and live in `images/`. They are landscapes and architecture only: no figures and no text.
