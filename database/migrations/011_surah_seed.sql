-- ============================================================
-- 011_surah_seed.sql
-- Seed all 114 surahs and add primary_surah_name_english to
-- quran_pages so assignment titles can read "Surah — Page N".
--
-- Apply via Supabase Dashboard SQL Editor.
-- ============================================================

-- 1. Add primary surah name column to quran_pages
ALTER TABLE quran_pages
  ADD COLUMN IF NOT EXISTS primary_surah_name_english TEXT;

-- 2. Seed all 114 surahs (idempotent: ON CONFLICT UPDATE)
INSERT INTO surahs (surah_number, name_arabic, name_english, total_ayahs) VALUES
  (1,   'الفاتحة',      'Al-Fatiha',      7),
  (2,   'البقرة',       'Al-Baqarah',     286),
  (3,   'آل عمران',     'Ali ''Imran',    200),
  (4,   'النساء',       'An-Nisa''',      176),
  (5,   'المائدة',      'Al-Ma''idah',    120),
  (6,   'الأنعام',      'Al-An''am',      165),
  (7,   'الأعراف',      'Al-A''raf',      206),
  (8,   'الأنفال',      'Al-Anfal',       75),
  (9,   'التوبة',       'At-Tawbah',      129),
  (10,  'يونس',         'Yunus',          109),
  (11,  'هود',          'Hud',            123),
  (12,  'يوسف',         'Yusuf',          111),
  (13,  'الرعد',        'Ar-Ra''d',       43),
  (14,  'إبراهيم',      'Ibrahim',        52),
  (15,  'الحجر',        'Al-Hijr',        99),
  (16,  'النحل',        'An-Nahl',        128),
  (17,  'الإسراء',      'Al-Isra''',      111),
  (18,  'الكهف',        'Al-Kahf',        110),
  (19,  'مريم',         'Maryam',         98),
  (20,  'طه',           'Ta-Ha',          135),
  (21,  'الأنبياء',     'Al-Anbiya''',    112),
  (22,  'الحج',         'Al-Hajj',        78),
  (23,  'المؤمنون',     'Al-Mu''minun',   118),
  (24,  'النور',        'An-Nur',         64),
  (25,  'الفرقان',      'Al-Furqan',      77),
  (26,  'الشعراء',      'Ash-Shu''ara''', 227),
  (27,  'النمل',        'An-Naml',        93),
  (28,  'القصص',        'Al-Qasas',       88),
  (29,  'العنكبوت',     'Al-''Ankabut',   69),
  (30,  'الروم',        'Ar-Rum',         60),
  (31,  'لقمان',        'Luqman',         34),
  (32,  'السجدة',       'As-Sajdah',      30),
  (33,  'الأحزاب',      'Al-Ahzab',       73),
  (34,  'سبأ',          'Saba''',         54),
  (35,  'فاطر',         'Fatir',          45),
  (36,  'يس',           'Ya-Sin',         83),
  (37,  'الصافات',      'As-Saffat',      182),
  (38,  'ص',            'Sad',            88),
  (39,  'الزمر',        'Az-Zumar',       75),
  (40,  'غافر',         'Ghafir',         85),
  (41,  'فصلت',         'Fussilat',       54),
  (42,  'الشورى',       'Ash-Shura',      53),
  (43,  'الزخرف',       'Az-Zukhruf',     89),
  (44,  'الدخان',       'Ad-Dukhan',      59),
  (45,  'الجاثية',      'Al-Jathiyah',    37),
  (46,  'الأحقاف',      'Al-Ahqaf',       35),
  (47,  'محمد',         'Muhammad',       38),
  (48,  'الفتح',        'Al-Fath',        29),
  (49,  'الحجرات',      'Al-Hujurat',     18),
  (50,  'ق',            'Qaf',            45),
  (51,  'الذاريات',     'Adh-Dhariyat',   60),
  (52,  'الطور',        'At-Tur',         49),
  (53,  'النجم',        'An-Najm',        62),
  (54,  'القمر',        'Al-Qamar',       55),
  (55,  'الرحمن',       'Ar-Rahman',      78),
  (56,  'الواقعة',      'Al-Waqi''ah',    96),
  (57,  'الحديد',       'Al-Hadid',       29),
  (58,  'المجادلة',     'Al-Mujadila',    22),
  (59,  'الحشر',        'Al-Hashr',       24),
  (60,  'الممتحنة',     'Al-Mumtahanah',  13),
  (61,  'الصف',         'As-Saf',         14),
  (62,  'الجمعة',       'Al-Jumu''ah',    11),
  (63,  'المنافقون',    'Al-Munafiqun',   11),
  (64,  'التغابن',      'At-Taghabun',    18),
  (65,  'الطلاق',       'At-Talaq',       12),
  (66,  'التحريم',      'At-Tahrim',      12),
  (67,  'الملك',        'Al-Mulk',        30),
  (68,  'القلم',        'Al-Qalam',       52),
  (69,  'الحاقة',       'Al-Haqqah',      52),
  (70,  'المعارج',      'Al-Ma''arij',    44),
  (71,  'نوح',          'Nuh',            28),
  (72,  'الجن',         'Al-Jinn',        28),
  (73,  'المزمل',       'Al-Muzzammil',   20),
  (74,  'المدثر',       'Al-Muddaththir', 56),
  (75,  'القيامة',      'Al-Qiyamah',     40),
  (76,  'الإنسان',      'Al-Insan',       31),
  (77,  'المرسلات',     'Al-Mursalat',    50),
  (78,  'النبأ',        'An-Naba''',      40),
  (79,  'النازعات',     'An-Nazi''at',    46),
  (80,  'عبس',          'Abasa',          42),
  (81,  'التكوير',      'At-Takwir',      29),
  (82,  'الانفطار',     'Al-Infitar',     19),
  (83,  'المطففين',     'Al-Mutaffifin',  36),
  (84,  'الانشقاق',     'Al-Inshiqaq',    25),
  (85,  'البروج',       'Al-Buruj',       22),
  (86,  'الطارق',       'At-Tariq',       17),
  (87,  'الأعلى',       'Al-A''la',       19),
  (88,  'الغاشية',      'Al-Ghashiyah',   26),
  (89,  'الفجر',        'Al-Fajr',        30),
  (90,  'البلد',        'Al-Balad',       20),
  (91,  'الشمس',        'Ash-Shams',      15),
  (92,  'الليل',        'Al-Layl',        21),
  (93,  'الضحى',        'Ad-Duha',        11),
  (94,  'الشرح',        'Ash-Sharh',      8),
  (95,  'التين',        'At-Tin',         8),
  (96,  'العلق',        'Al-''Alaq',      19),
  (97,  'القدر',        'Al-Qadr',        5),
  (98,  'البينة',       'Al-Bayyinah',    8),
  (99,  'الزلزلة',      'Az-Zalzalah',    8),
  (100, 'العاديات',     'Al-''Adiyat',    11),
  (101, 'القارعة',      'Al-Qari''ah',    11),
  (102, 'التكاثر',      'At-Takathur',    8),
  (103, 'العصر',        'Al-''Asr',       3),
  (104, 'الهمزة',       'Al-Humazah',     9),
  (105, 'الفيل',        'Al-Fil',         5),
  (106, 'قريش',         'Quraysh',        4),
  (107, 'الماعون',      'Al-Ma''un',      7),
  (108, 'الكوثر',       'Al-Kawthar',     3),
  (109, 'الكافرون',     'Al-Kafirun',     6),
  (110, 'النصر',        'An-Nasr',        3),
  (111, 'المسد',        'Al-Masad',       5),
  (112, 'الإخلاص',      'Al-Ikhlas',      4),
  (113, 'الفلق',        'Al-Falaq',       5),
  (114, 'الناس',        'An-Nas',         6)
ON CONFLICT (surah_number) DO UPDATE
  SET name_english = EXCLUDED.name_english,
      name_arabic  = EXCLUDED.name_arabic,
      total_ayahs  = EXCLUDED.total_ayahs;

-- 3. Backfill existing quran_pages rows from quran_page_mappings → surahs
--    (only rows that already have mappings populated; new rows are handled by the backend)
UPDATE quran_pages qp
SET primary_surah_name_english = s.name_english
FROM (
  SELECT DISTINCT ON (qpm.page_number)
    qpm.page_number,
    qpm.provider_mushaf_id,
    s.name_english
  FROM quran_page_mappings qpm
  JOIN surahs s ON s.surah_number = qpm.surah_number
  ORDER BY qpm.page_number, qpm.surah_number ASC
) sub
WHERE qp.page_number            = sub.page_number
  AND qp.provider_mushaf_id     = sub.provider_mushaf_id
  AND qp.primary_surah_name_english IS NULL;
