// Canonical 114-surah metadata for the Madani (QCF V2, 604-page) mushaf.
// This is static reference data — it never changes — so it is bundled in the
// app rather than fetched, avoiding a network round-trip on the Quran browser.
// startPage = the mushaf page on which each surah begins.

export interface SurahMeta {
  number: number;
  arabic: string;
  english: string;
  ayahs: number;
  startPage: number;
}

export const SURAHS: SurahMeta[] = [
  { number: 1,   arabic: 'الفاتحة',    english: 'Al-Fatiha',      ayahs: 7,   startPage: 1 },
  { number: 2,   arabic: 'البقرة',     english: 'Al-Baqarah',     ayahs: 286, startPage: 2 },
  { number: 3,   arabic: 'آل عمران',   english: 'Ali Imran',      ayahs: 200, startPage: 50 },
  { number: 4,   arabic: 'النساء',     english: 'An-Nisa',        ayahs: 176, startPage: 77 },
  { number: 5,   arabic: 'المائدة',    english: 'Al-Maidah',      ayahs: 120, startPage: 106 },
  { number: 6,   arabic: 'الأنعام',    english: 'Al-Anam',        ayahs: 165, startPage: 128 },
  { number: 7,   arabic: 'الأعراف',    english: 'Al-Araf',        ayahs: 206, startPage: 151 },
  { number: 8,   arabic: 'الأنفال',    english: 'Al-Anfal',       ayahs: 75,  startPage: 177 },
  { number: 9,   arabic: 'التوبة',     english: 'At-Tawbah',      ayahs: 129, startPage: 187 },
  { number: 10,  arabic: 'يونس',       english: 'Yunus',          ayahs: 109, startPage: 208 },
  { number: 11,  arabic: 'هود',        english: 'Hud',            ayahs: 123, startPage: 221 },
  { number: 12,  arabic: 'يوسف',       english: 'Yusuf',          ayahs: 111, startPage: 235 },
  { number: 13,  arabic: 'الرعد',      english: 'Ar-Rad',         ayahs: 43,  startPage: 249 },
  { number: 14,  arabic: 'إبراهيم',    english: 'Ibrahim',        ayahs: 52,  startPage: 255 },
  { number: 15,  arabic: 'الحجر',      english: 'Al-Hijr',        ayahs: 99,  startPage: 262 },
  { number: 16,  arabic: 'النحل',      english: 'An-Nahl',        ayahs: 128, startPage: 267 },
  { number: 17,  arabic: 'الإسراء',    english: 'Al-Isra',        ayahs: 111, startPage: 282 },
  { number: 18,  arabic: 'الكهف',      english: 'Al-Kahf',        ayahs: 110, startPage: 293 },
  { number: 19,  arabic: 'مريم',       english: 'Maryam',         ayahs: 98,  startPage: 305 },
  { number: 20,  arabic: 'طه',         english: 'Ta-Ha',          ayahs: 135, startPage: 312 },
  { number: 21,  arabic: 'الأنبياء',   english: 'Al-Anbiya',      ayahs: 112, startPage: 322 },
  { number: 22,  arabic: 'الحج',       english: 'Al-Hajj',        ayahs: 78,  startPage: 332 },
  { number: 23,  arabic: 'المؤمنون',   english: 'Al-Muminun',     ayahs: 118, startPage: 342 },
  { number: 24,  arabic: 'النور',      english: 'An-Nur',         ayahs: 64,  startPage: 350 },
  { number: 25,  arabic: 'الفرقان',    english: 'Al-Furqan',      ayahs: 77,  startPage: 359 },
  { number: 26,  arabic: 'الشعراء',    english: 'Ash-Shuara',     ayahs: 227, startPage: 367 },
  { number: 27,  arabic: 'النمل',      english: 'An-Naml',        ayahs: 93,  startPage: 377 },
  { number: 28,  arabic: 'القصص',      english: 'Al-Qasas',       ayahs: 88,  startPage: 385 },
  { number: 29,  arabic: 'العنكبوت',   english: 'Al-Ankabut',     ayahs: 69,  startPage: 396 },
  { number: 30,  arabic: 'الروم',      english: 'Ar-Rum',         ayahs: 60,  startPage: 404 },
  { number: 31,  arabic: 'لقمان',      english: 'Luqman',         ayahs: 34,  startPage: 411 },
  { number: 32,  arabic: 'السجدة',     english: 'As-Sajdah',      ayahs: 30,  startPage: 415 },
  { number: 33,  arabic: 'الأحزاب',    english: 'Al-Ahzab',       ayahs: 73,  startPage: 418 },
  { number: 34,  arabic: 'سبأ',        english: 'Saba',           ayahs: 54,  startPage: 428 },
  { number: 35,  arabic: 'فاطر',       english: 'Fatir',          ayahs: 45,  startPage: 434 },
  { number: 36,  arabic: 'يس',         english: 'Ya-Sin',         ayahs: 83,  startPage: 440 },
  { number: 37,  arabic: 'الصافات',    english: 'As-Saffat',      ayahs: 182, startPage: 446 },
  { number: 38,  arabic: 'ص',          english: 'Sad',            ayahs: 88,  startPage: 453 },
  { number: 39,  arabic: 'الزمر',      english: 'Az-Zumar',       ayahs: 75,  startPage: 458 },
  { number: 40,  arabic: 'غافر',       english: 'Ghafir',         ayahs: 85,  startPage: 467 },
  { number: 41,  arabic: 'فصلت',       english: 'Fussilat',       ayahs: 54,  startPage: 477 },
  { number: 42,  arabic: 'الشورى',     english: 'Ash-Shura',      ayahs: 53,  startPage: 483 },
  { number: 43,  arabic: 'الزخرف',     english: 'Az-Zukhruf',     ayahs: 89,  startPage: 489 },
  { number: 44,  arabic: 'الدخان',     english: 'Ad-Dukhan',      ayahs: 59,  startPage: 496 },
  { number: 45,  arabic: 'الجاثية',    english: 'Al-Jathiyah',    ayahs: 37,  startPage: 499 },
  { number: 46,  arabic: 'الأحقاف',    english: 'Al-Ahqaf',       ayahs: 35,  startPage: 502 },
  { number: 47,  arabic: 'محمد',       english: 'Muhammad',       ayahs: 38,  startPage: 507 },
  { number: 48,  arabic: 'الفتح',      english: 'Al-Fath',        ayahs: 29,  startPage: 511 },
  { number: 49,  arabic: 'الحجرات',    english: 'Al-Hujurat',     ayahs: 18,  startPage: 515 },
  { number: 50,  arabic: 'ق',          english: 'Qaf',            ayahs: 45,  startPage: 518 },
  { number: 51,  arabic: 'الذاريات',   english: 'Adh-Dhariyat',   ayahs: 60,  startPage: 520 },
  { number: 52,  arabic: 'الطور',      english: 'At-Tur',         ayahs: 49,  startPage: 523 },
  { number: 53,  arabic: 'النجم',      english: 'An-Najm',        ayahs: 62,  startPage: 526 },
  { number: 54,  arabic: 'القمر',      english: 'Al-Qamar',       ayahs: 55,  startPage: 528 },
  { number: 55,  arabic: 'الرحمن',     english: 'Ar-Rahman',      ayahs: 78,  startPage: 531 },
  { number: 56,  arabic: 'الواقعة',    english: 'Al-Waqiah',      ayahs: 96,  startPage: 534 },
  { number: 57,  arabic: 'الحديد',     english: 'Al-Hadid',       ayahs: 29,  startPage: 537 },
  { number: 58,  arabic: 'المجادلة',   english: 'Al-Mujadila',    ayahs: 22,  startPage: 542 },
  { number: 59,  arabic: 'الحشر',      english: 'Al-Hashr',       ayahs: 24,  startPage: 545 },
  { number: 60,  arabic: 'الممتحنة',   english: 'Al-Mumtahanah',  ayahs: 13,  startPage: 549 },
  { number: 61,  arabic: 'الصف',       english: 'As-Saff',        ayahs: 14,  startPage: 551 },
  { number: 62,  arabic: 'الجمعة',     english: 'Al-Jumuah',      ayahs: 11,  startPage: 553 },
  { number: 63,  arabic: 'المنافقون',  english: 'Al-Munafiqun',   ayahs: 11,  startPage: 554 },
  { number: 64,  arabic: 'التغابن',    english: 'At-Taghabun',    ayahs: 18,  startPage: 556 },
  { number: 65,  arabic: 'الطلاق',     english: 'At-Talaq',       ayahs: 12,  startPage: 558 },
  { number: 66,  arabic: 'التحريم',    english: 'At-Tahrim',      ayahs: 12,  startPage: 560 },
  { number: 67,  arabic: 'الملك',      english: 'Al-Mulk',        ayahs: 30,  startPage: 562 },
  { number: 68,  arabic: 'القلم',      english: 'Al-Qalam',       ayahs: 52,  startPage: 564 },
  { number: 69,  arabic: 'الحاقة',     english: 'Al-Haqqah',      ayahs: 52,  startPage: 566 },
  { number: 70,  arabic: 'المعارج',    english: 'Al-Maarij',      ayahs: 44,  startPage: 568 },
  { number: 71,  arabic: 'نوح',        english: 'Nuh',            ayahs: 28,  startPage: 570 },
  { number: 72,  arabic: 'الجن',       english: 'Al-Jinn',        ayahs: 28,  startPage: 572 },
  { number: 73,  arabic: 'المزمل',     english: 'Al-Muzzammil',   ayahs: 20,  startPage: 574 },
  { number: 74,  arabic: 'المدثر',     english: 'Al-Muddaththir', ayahs: 56,  startPage: 575 },
  { number: 75,  arabic: 'القيامة',    english: 'Al-Qiyamah',     ayahs: 40,  startPage: 577 },
  { number: 76,  arabic: 'الإنسان',    english: 'Al-Insan',       ayahs: 31,  startPage: 578 },
  { number: 77,  arabic: 'المرسلات',   english: 'Al-Mursalat',    ayahs: 50,  startPage: 580 },
  { number: 78,  arabic: 'النبأ',      english: 'An-Naba',        ayahs: 40,  startPage: 582 },
  { number: 79,  arabic: 'النازعات',   english: 'An-Naziat',      ayahs: 46,  startPage: 583 },
  { number: 80,  arabic: 'عبس',        english: 'Abasa',          ayahs: 42,  startPage: 585 },
  { number: 81,  arabic: 'التكوير',    english: 'At-Takwir',      ayahs: 29,  startPage: 586 },
  { number: 82,  arabic: 'الانفطار',   english: 'Al-Infitar',     ayahs: 19,  startPage: 587 },
  { number: 83,  arabic: 'المطففين',   english: 'Al-Mutaffifin',  ayahs: 36,  startPage: 587 },
  { number: 84,  arabic: 'الانشقاق',   english: 'Al-Inshiqaq',    ayahs: 25,  startPage: 589 },
  { number: 85,  arabic: 'البروج',     english: 'Al-Buruj',       ayahs: 22,  startPage: 590 },
  { number: 86,  arabic: 'الطارق',     english: 'At-Tariq',       ayahs: 17,  startPage: 591 },
  { number: 87,  arabic: 'الأعلى',     english: 'Al-Ala',         ayahs: 19,  startPage: 591 },
  { number: 88,  arabic: 'الغاشية',    english: 'Al-Ghashiyah',   ayahs: 26,  startPage: 592 },
  { number: 89,  arabic: 'الفجر',      english: 'Al-Fajr',        ayahs: 30,  startPage: 593 },
  { number: 90,  arabic: 'البلد',      english: 'Al-Balad',       ayahs: 20,  startPage: 594 },
  { number: 91,  arabic: 'الشمس',      english: 'Ash-Shams',      ayahs: 15,  startPage: 595 },
  { number: 92,  arabic: 'الليل',      english: 'Al-Layl',        ayahs: 21,  startPage: 595 },
  { number: 93,  arabic: 'الضحى',      english: 'Ad-Duha',        ayahs: 11,  startPage: 596 },
  { number: 94,  arabic: 'الشرح',      english: 'Ash-Sharh',      ayahs: 8,   startPage: 596 },
  { number: 95,  arabic: 'التين',      english: 'At-Tin',         ayahs: 8,   startPage: 597 },
  { number: 96,  arabic: 'العلق',      english: 'Al-Alaq',        ayahs: 19,  startPage: 597 },
  { number: 97,  arabic: 'القدر',      english: 'Al-Qadr',        ayahs: 5,   startPage: 598 },
  { number: 98,  arabic: 'البينة',     english: 'Al-Bayyinah',    ayahs: 8,   startPage: 598 },
  { number: 99,  arabic: 'الزلزلة',    english: 'Az-Zalzalah',    ayahs: 8,   startPage: 599 },
  { number: 100, arabic: 'العاديات',   english: 'Al-Adiyat',      ayahs: 11,  startPage: 599 },
  { number: 101, arabic: 'القارعة',    english: 'Al-Qariah',      ayahs: 11,  startPage: 600 },
  { number: 102, arabic: 'التكاثر',    english: 'At-Takathur',    ayahs: 8,   startPage: 600 },
  { number: 103, arabic: 'العصر',      english: 'Al-Asr',         ayahs: 3,   startPage: 601 },
  { number: 104, arabic: 'الهمزة',     english: 'Al-Humazah',     ayahs: 9,   startPage: 601 },
  { number: 105, arabic: 'الفيل',      english: 'Al-Fil',         ayahs: 5,   startPage: 601 },
  { number: 106, arabic: 'قريش',       english: 'Quraysh',        ayahs: 4,   startPage: 602 },
  { number: 107, arabic: 'الماعون',    english: 'Al-Maun',        ayahs: 7,   startPage: 602 },
  { number: 108, arabic: 'الكوثر',     english: 'Al-Kawthar',     ayahs: 3,   startPage: 602 },
  { number: 109, arabic: 'الكافرون',   english: 'Al-Kafirun',     ayahs: 6,   startPage: 603 },
  { number: 110, arabic: 'النصر',      english: 'An-Nasr',        ayahs: 3,   startPage: 603 },
  { number: 111, arabic: 'المسد',      english: 'Al-Masad',       ayahs: 5,   startPage: 603 },
  { number: 112, arabic: 'الإخلاص',    english: 'Al-Ikhlas',      ayahs: 4,   startPage: 604 },
  { number: 113, arabic: 'الفلق',      english: 'Al-Falaq',       ayahs: 5,   startPage: 604 },
  { number: 114, arabic: 'الناس',      english: 'An-Nas',         ayahs: 6,   startPage: 604 },
];

// Start page of each of the 30 juz in the Madani mushaf.
export const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182,
  202, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

export const TOTAL_PAGES = 604;

// Inclusive [firstPage, lastPage] page range covered by a juz (1–30).
export function juzPageRange(juz: number): [number, number] {
  const start = JUZ_START_PAGES[juz - 1];
  const end = juz < 30 ? JUZ_START_PAGES[juz] - 1 : TOTAL_PAGES;
  return [start, end];
}

// Which juz a given mushaf page falls in (1–30).
export function juzForPage(page: number): number {
  let juz = 1;
  for (let i = 0; i < JUZ_START_PAGES.length; i++) {
    if (page >= JUZ_START_PAGES[i]) juz = i + 1;
    else break;
  }
  return juz;
}

// Which surah a given mushaf page belongs to (the last surah that started
// on or before this page).
export function surahForPage(page: number): SurahMeta {
  let found = SURAHS[0];
  for (const s of SURAHS) {
    if (s.startPage <= page) found = s;
    else break;
  }
  return found;
}
