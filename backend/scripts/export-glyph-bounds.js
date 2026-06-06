#!/usr/bin/env node
/**
 * Convert the TSV glyph bounds export from MySQL to a page-indexed JSON file
 * and upload it to Supabase Storage at:
 *   quran-page-images/mushaf-madani/glyph-bounds.json
 *
 * Input TSV columns: page, surah, ayah, word, x0_px, x1_px, y0_px, y1_px
 * All coordinates are pixel values at img_width=1300.
 *
 * Output JSON structure (normalized 0–1):
 * {
 *   "v": 1,
 *   "imgWidth": 1300,
 *   "imgHeight": 2103,
 *   "pages": {
 *     "1": [[surah, ayah, word, x0, y0, x1, y1], ...],
 *     ...
 *   }
 * }
 *
 * Usage: node scripts/export-glyph-bounds.js [--tsv /tmp/glyph-bounds.tsv]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const IMG_WIDTH  = 1300;
const IMG_HEIGHT = 2103;
const BUCKET     = 'quran-page-images';
const OBJECT_PATH = 'mushaf-madani/glyph-bounds.json';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const tsvPath = args.includes('--tsv')
  ? args[args.indexOf('--tsv') + 1]
  : '/tmp/glyph-bounds.tsv';

if (!fs.existsSync(tsvPath)) {
  console.error('TSV file not found:', tsvPath);
  process.exit(1);
}

console.log('Reading TSV from:', tsvPath);
const lines = fs.readFileSync(tsvPath, 'utf8').trim().split('\n');
console.log(`Parsing ${lines.length} word records…`);

// Group by page
const pages = {};

for (const line of lines) {
  const [page, surah, ayah, word, x0, x1, y0, y1] = line.split('\t').map(Number);
  if (!page) continue;

  const key = String(page);
  if (!pages[key]) pages[key] = [];

  // Normalize to 0–1 and round to 5 decimal places to keep file size down
  const r = (v, max) => Math.round((v / max) * 100000) / 100000;

  pages[key].push([
    surah, ayah, word,
    r(x0, IMG_WIDTH),  // x0 (left)
    r(y0, IMG_HEIGHT), // y0 (top)
    r(x1, IMG_WIDTH),  // x1 (right)
    r(y1, IMG_HEIGHT), // y1 (bottom)
  ]);
}

const totalWords = Object.values(pages).reduce((s, p) => s + p.length, 0);
console.log(`Pages: ${Object.keys(pages).length}, total words: ${totalWords}`);

const output = {
  v: 1,
  imgWidth: IMG_WIDTH,
  imgHeight: IMG_HEIGHT,
  pages,
};

const json = JSON.stringify(output);
console.log(`JSON size: ${(json.length / 1024 / 1024).toFixed(2)} MB`);

// Upload to Supabase Storage
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

(async () => {
  console.log(`Uploading to ${BUCKET}/${OBJECT_PATH}…`);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, Buffer.from(json), {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) {
    console.error('Upload failed:', error.message);
    process.exit(1);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT_PATH}`;
  console.log('Done. Public URL:', publicUrl);
})();
