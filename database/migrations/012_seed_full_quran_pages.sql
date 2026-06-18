-- ============================================================
-- 012_seed_full_quran_pages.sql
-- Populate quran_page_mappings with all 604 pages (Hafs Uthmani / QCF V2)
--
-- Maps each page to its surah number and juz number.
-- Uses fixed Medina Mushaf standard layout.
-- ============================================================

DO $$
DECLARE
  v_page_id UUID;
  v_surah_number INT;
  v_juz_number INT;
  v_page_number INT;
  v_last_surah INT := 0;
BEGIN

-- First, ensure quran_pages exist for pages 1-604
INSERT INTO quran_pages (page_number, provider_mushaf_id, image_url)
SELECT
  page_no,
  1 as provider_mushaf_id,
  NULL as image_url
FROM generate_series(1, 604) AS page_no
ON CONFLICT DO NOTHING;

-- Now populate quran_page_mappings with all pages and their surah/juz assignments
-- Surah page boundaries (start page for each surah, indexed by surah_number 1-114)
WITH surah_starts AS (
  SELECT * FROM (
    VALUES
      (1, 1),       -- Surah 1 starts page 1
      (2, 2),       -- Surah 2 starts page 2
      (3, 50),      -- Surah 3 starts page 50
      (4, 77),      (5, 106),    (6, 128),    (7, 151),    (8, 177),
      (9, 187),     (10, 208),   (11, 221),   (12, 235),   (13, 249),
      (14, 255),    (15, 262),   (16, 267),   (17, 282),   (18, 293),
      (19, 305),    (20, 312),   (21, 322),   (22, 332),   (23, 342),
      (24, 350),    (25, 359),   (26, 367),   (27, 377),   (28, 385),
      (29, 396),    (30, 404),   (31, 411),   (32, 415),   (33, 418),
      (34, 428),    (35, 434),   (36, 440),   (37, 446),   (38, 453),
      (39, 458),    (40, 467),   (41, 477),   (42, 483),   (43, 489),
      (44, 496),    (45, 499),   (46, 502),   (47, 507),   (48, 511),
      (49, 515),    (50, 518),   (51, 520),   (52, 523),   (53, 526),
      (54, 528),    (55, 531),   (56, 534),   (57, 537),   (58, 542),
      (59, 545),    (60, 549),   (61, 551),   (62, 553),   (63, 554),
      (64, 556),    (65, 558),   (66, 560),   (67, 562),   (68, 564),
      (69, 566),    (70, 568),   (71, 570),   (72, 572),   (73, 574),
      (74, 575),    (75, 577),   (76, 578),   (77, 580),   (78, 582),
      (79, 583),    (80, 585),   (81, 586),   (82, 587),   (83, 587),
      (84, 589),    (85, 590),   (86, 591),   (87, 591),   (88, 592),
      (89, 593),    (90, 594),   (91, 595),   (92, 595),   (93, 596),
      (94, 596),    (95, 597),   (96, 597),   (97, 598),   (98, 598),
      (99, 599),    (100, 599),  (101, 600),  (102, 600),  (103, 601),
      (104, 601),   (105, 601),  (106, 602),  (107, 602),  (108, 602),
      (109, 603),   (110, 603),  (111, 603),  (112, 604),  (113, 604),
      (114, 604)
  ) AS t(surah_number, start_page)
),
page_to_surah AS (
  -- For each page, find the surah number by finding the max surah_number where start_page <= page
  SELECT
    p.page_no as page_number,
    MAX(ss.surah_number) as surah_number
  FROM generate_series(1, 604) AS p(page_no)
  CROSS JOIN surah_starts ss
  WHERE ss.start_page <= p.page_no
  GROUP BY p.page_no
),
page_with_metadata AS (
  SELECT
    p.page_number,
    p.surah_number,
    -- Juz calculation: pages 1-20 = Juz 1, 21-40 = Juz 2, etc. (capped at 30)
    LEAST(30, ((p.page_number - 1) / 20) + 1) as juz_number
  FROM page_to_surah p
)
INSERT INTO quran_page_mappings (
  quran_page_id,
  provider,
  provider_mushaf_id,
  page_number,
  surah_number,
  juz_number,
  source_payload
)
SELECT
  qp.id,
  'quran_foundation' as provider,
  1 as provider_mushaf_id,
  pwm.page_number,
  pwm.surah_number,
  pwm.juz_number,
  jsonb_build_object(
    'source', 'seed_data',
    'mushaf', 'Hafs Uthmani - QCF V2',
    'total_pages', 604
  ) as source_payload
FROM page_with_metadata pwm
JOIN quran_pages qp ON qp.page_number = pwm.page_number
  AND qp.provider_mushaf_id = 1
ON CONFLICT DO NOTHING;

RAISE NOTICE 'Seeded quran_page_mappings for all 604 pages (30 juzs, 114 surahs)';

END $$;
