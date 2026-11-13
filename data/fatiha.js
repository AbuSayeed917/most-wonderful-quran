/*
 * Surah Al-Fatiha, word by word.
 * Word indices match Quran.com's word-by-word audio (audio.qurancdn.com/wbw/SSS_AAA_WWW.mp3),
 * so every word here can be heard on its own.
 * `tajweed` splits each word (Uthmani script) into [text, rule] pieces from Quran.com's tajweed markup.
 * `timings` are [startMs, endMs] for each word in Mishary Alafasy's verse audio
 * (verses.quran.com/Alafasy/mp3/SSSAAA.mp3), from Quran.com's recitation segments.
 */
window.SURAH_FATIHA = {
  number: 1,
  nameArabic: "الفاتحة",
  nameEnglish: "Al-Fatiha",
  meaning: "The Opening",
  revelation: "Makkah",
  ayahs: [
    {
      number: 1,
      timings: [[60, 610], [620, 1310], [1320, 2450], [2460, 5970]],
      tajweed: [[["بِسۡمِ", null]], [["ٱ", "ham_wasl"], ["للَّهِ", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["رَّحۡمَ", null], ["ـٰ", "madda_normal"], ["نِ", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["رَّح", null], ["ِي", "madda_permissible"], ["مِ", null]]],
      translation: "In the name of Allah, the Most Gracious, the Most Merciful.",
      words: [
        { arabic: "بِسْمِ", transliteration: "bismi", meaning: "In the name", root: "س م و" },
        { arabic: "ٱللَّهِ", transliteration: "l-lāhi", meaning: "of Allah", root: "ء ل ه" },
        { arabic: "ٱلرَّحْمَٰنِ", transliteration: "l-raḥmāni", meaning: "the Most Gracious", root: "ر ح م" },
        { arabic: "ٱلرَّحِيمِ", transliteration: "l-raḥīmi", meaning: "the Most Merciful", root: "ر ح م" }
      ]
    },
    {
      number: 2,
      timings: [[80, 960], [970, 1800], [1810, 2460], [2470, 5140]],
      tajweed: [[["ٱلۡحَمۡدُ", null]], [["لِلَّهِ", null]], [["رَبِّ", null]], [["ٱ", "ham_wasl"], ["لۡعَ", null], ["ـٰ", "madda_normal"], ["لَم", null], ["ِي", "madda_permissible"], ["نَ", null]]],
      translation: "All praise is for Allah, Lord of all the worlds.",
      words: [
        { arabic: "ٱلْحَمْدُ", transliteration: "al-ḥamdu", meaning: "All praise", root: "ح م د" },
        { arabic: "لِلَّهِ", transliteration: "lillāhi", meaning: "is for Allah", root: "ء ل ه" },
        { arabic: "رَبِّ", transliteration: "rabbi", meaning: "the Lord", root: "ر ب ب" },
        { arabic: "ٱلْعَٰلَمِينَ", transliteration: "l-ʿālamīna", meaning: "of the worlds", root: "ع ل م" }
      ]
    },
    {
      number: 3,
      timings: [[40, 1230], [1240, 4160]],
      tajweed: [[["ٱ", null], ["ل", "laam_shamsiyah"], ["رَّحۡمَ", null], ["ـٰ", "madda_normal"], ["نِ", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["رَّح", null], ["ِي", "madda_permissible"], ["مِ", null]]],
      translation: "The Most Gracious, the Most Merciful.",
      words: [
        { arabic: "ٱلرَّحْمَٰنِ", transliteration: "al-raḥmāni", meaning: "The Most Gracious", root: "ر ح م" },
        { arabic: "ٱلرَّحِيمِ", transliteration: "l-raḥīmi", meaning: "the Most Merciful", root: "ر ح م" }
      ]
    },
    {
      number: 4,
      timings: [[60, 840], [850, 1400], [1410, 4280]],
      tajweed: [[["مَ", null], ["ـٰ", "madda_normal"], ["لِكِ", null]], [["يَوۡمِ", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["دّ", null], ["ِي", "madda_permissible"], ["نِ", null]]],
      translation: "Master of the Day of Judgment.",
      words: [
        { arabic: "مَٰلِكِ", transliteration: "māliki", meaning: "Master", root: "م ل ك" },
        { arabic: "يَوْمِ", transliteration: "yawmi", meaning: "of the Day", root: "ي و م" },
        { arabic: "ٱلدِّينِ", transliteration: "l-dīni", meaning: "of Judgment", root: "د ي ن" }
      ]
    },
    {
      number: 5,
      timings: [[30, 970], [980, 1710], [1720, 2870], [2880, 6290]],
      tajweed: [[["إِيَّاكَ", null]], [["نَعۡبُدُ", null]], [["وَإِيَّاكَ", null]], [["نَسۡتَع", null], ["ِي", "madda_permissible"], ["نُ", null]]],
      translation: "You alone we worship, and You alone we ask for help.",
      words: [
        { arabic: "إِيَّاكَ", transliteration: "iyyāka", meaning: "You alone", root: "—" },
        { arabic: "نَعْبُدُ", transliteration: "naʿbudu", meaning: "we worship", root: "ع ب د" },
        { arabic: "وَإِيَّاكَ", transliteration: "wa-iyyāka", meaning: "and You alone", root: "—" },
        { arabic: "نَسْتَعِينُ", transliteration: "nastaʿīnu", meaning: "we ask for help", root: "ع و ن" }
      ]
    },
    {
      number: 6,
      timings: [[30, 670], [680, 1630], [1640, 5120]],
      tajweed: [[["ٱهۡدِنَا", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["صِّر", null], ["ٰ", "madda_normal"], ["طَ", null]], [["ٱ", "ham_wasl"], ["لۡمُسۡتَق", null], ["ِي", "madda_permissible"], ["مَ", null]]],
      translation: "Guide us to the straight path.",
      words: [
        { arabic: "ٱهْدِنَا", transliteration: "ihdinā", meaning: "Guide us", root: "ه د ي" },
        { arabic: "ٱلصِّرَٰطَ", transliteration: "l-ṣirāṭa", meaning: "to the path", root: "ص ر ط" },
        { arabic: "ٱلْمُسْتَقِيمَ", transliteration: "l-mustaqīma", meaning: "the straight", root: "ق و م" }
      ]
    },
    {
      number: 7,
      timings: [[30, 740], [750, 1700], [1710, 2620], [2630, 3590], [3600, 4210], [4220, 5290], [5300, 6320], [6330, 6630], [6640, 12320]],
      tajweed: [[["صِر", null], ["ٰ", "madda_normal"], ["طَ", null]], [["ٱ", "ham_wasl"], ["لَّذِينَ", null]], [["أَنۡعَمۡتَ", null]], [["عَلَيۡهِمۡ", null]], [["غَيۡرِ", null]], [["ٱ", "ham_wasl"], ["لۡمَغۡضُوبِ", null]], [["عَلَيۡهِمۡ", null]], [["وَلَا", null]], [["ٱ", "ham_wasl"], ["ل", "laam_shamsiyah"], ["ضّ", null], ["َا", "madda_necessary"], ["ٓلّ", null], ["ِي", "madda_permissible"], ["نَ", null]]],
      translation: "The path of those You have blessed, not of those who earned anger, nor of those who went astray.",
      words: [
        { arabic: "صِرَٰطَ", transliteration: "ṣirāṭa", meaning: "The path", root: "ص ر ط" },
        { arabic: "ٱلَّذِينَ", transliteration: "alladhīna", meaning: "of those", root: "—" },
        { arabic: "أَنْعَمْتَ", transliteration: "anʿamta", meaning: "You have blessed", root: "ن ع م" },
        { arabic: "عَلَيْهِمْ", transliteration: "ʿalayhim", meaning: "upon them", root: "—" },
        { arabic: "غَيْرِ", transliteration: "ghayri", meaning: "not", root: "غ ي ر" },
        { arabic: "ٱلْمَغْضُوبِ", transliteration: "l-maghḍūbi", meaning: "of those who earned anger", root: "غ ض ب" },
        { arabic: "عَلَيْهِمْ", transliteration: "ʿalayhim", meaning: "upon themselves", root: "—" },
        { arabic: "وَلَا", transliteration: "walā", meaning: "and nor", root: "—" },
        { arabic: "ٱلضَّآلِّينَ", transliteration: "l-ḍāllīna", meaning: "of those who went astray", root: "ض ل ل" }
      ]
    }
  ]
};
