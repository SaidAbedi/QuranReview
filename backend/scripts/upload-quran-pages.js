#!/usr/bin/env node
/**
 * Upload pre-generated Quran page PNGs to Supabase Storage.
 *
 * Prerequisites:
 *   1. Run quran.com-images Docker to generate 604 PNGs:
 *        docker run --rm -v "$(pwd)/output:/output" qurancom/quran-images \
 *          --width 1300 --pages 1..604 --output /output
 *      Output files are named 1.png … 604.png in ./output/
 *
 *   2. Run migration 008:
 *        node scripts/run-migration.js database/migrations/008_quran_pages_storage_path.sql
 *
 *   3. Run this script:
 *        node scripts/upload-quran-pages.js [--output-dir ./output] [--dry-run]
 *
 * What it does:
 *   - Reads each PNG from the output directory
 *   - Parses page dimensions from the PNG IHDR header
 *   - Uploads to quran-page-images/mushaf-madani/page-NNN.png (zero-padded)
 *   - Upserts quran_pages: storage_path, width, height
 *
 * The bucket must be PUBLIC. This script creates it if AUTO_CREATE_STORAGE_BUCKETS
 * is on (default dev behavior), or it must already exist in production.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'quran-page-images';
const MUSHAF_PREFIX = 'mushaf-madani';
const PROVIDER_MUSHAF_ID = parseInt(process.env.QURAN_FOUNDATION_DEFAULT_MUSHAF_ID ?? '1', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Parse --output-dir and --dry-run flags
const args = process.argv.slice(2);
const outputDirArg = args.includes('--output-dir')
  ? args[args.indexOf('--output-dir') + 1]
  : './output';
const dryRun = args.includes('--dry-run');
const outputDir = path.resolve(process.cwd(), outputDirArg);

if (!fs.existsSync(outputDir)) {
  console.error(`Output directory not found: ${outputDir}`);
  process.exit(1);
}

/**
 * Read width and height from a PNG file's IHDR chunk.
 * PNG structure: 8-byte signature, then IHDR chunk at offset 8.
 * IHDR: 4 bytes length, 4 bytes 'IHDR', 4 bytes width, 4 bytes height.
 */
function getPngDimensions(filePath) {
  const buffer = Buffer.alloc(24);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 24, 0);
  fs.closeSync(fd);

  // Verify PNG signature (first 8 bytes)
  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== PNG_SIG[i]) throw new Error(`Not a PNG file: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/** Zero-pad page number to 3 digits: 1 → "001", 42 → "042" */
function padPage(n) {
  return String(n).padStart(3, '0');
}

async function ensureBucket() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`Bucket "${BUCKET}" already exists.`);
    return;
  }
  console.log(`Creating bucket "${BUCKET}" (public)…`);
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10485760,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/json'],
  });
  if (error && !error.message.includes('already exists')) {
    throw new Error(`Failed to create bucket: ${error.message}`);
  }
  console.log(`Bucket "${BUCKET}" created.`);
}

async function uploadPage(pageNumber, filePath) {
  const { width, height } = getPngDimensions(filePath);
  const storagePath = `${MUSHAF_PREFIX}/page-${padPage(pageNumber)}.png`;
  const objectPath = storagePath; // path within the bucket

  if (dryRun) {
    console.log(`[dry-run] page ${pageNumber}: ${storagePath} (${width}×${height})`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload failed for page ${pageNumber}: ${uploadError.message}`);
  }

  const { error: dbError } = await supabase
    .from('quran_pages')
    .upsert(
      {
        provider: 'quran_foundation',
        provider_mushaf_id: PROVIDER_MUSHAF_ID,
        mushaf_id: 'qcf_v2',
        page_number: pageNumber,
        storage_path: storagePath,
        width,
        height,
      },
      { onConflict: 'provider,provider_mushaf_id,page_number' },
    );

  if (dbError) {
    throw new Error(`DB upsert failed for page ${pageNumber}: ${dbError.message}`);
  }

  console.log(`[${pageNumber}/604] uploaded page-${padPage(pageNumber)}.png (${width}×${height})`);
}

async function main() {
  console.log(`Output directory: ${outputDir}`);
  console.log(`Bucket: ${BUCKET}/${MUSHAF_PREFIX}`);
  if (dryRun) console.log('DRY RUN — no uploads or DB writes.');

  const files = fs.readdirSync(outputDir).filter((f) => /^\d+\.png$/i.test(f));
  if (files.length === 0) {
    console.error('No PNG files found matching pattern NNN.png in', outputDir);
    process.exit(1);
  }

  // Sort numerically
  const pages = files
    .map((f) => parseInt(path.basename(f, '.png'), 10))
    .filter((n) => n >= 1 && n <= 604)
    .sort((a, b) => a - b);

  console.log(`Found ${pages.length} page(s): ${pages[0]}–${pages[pages.length - 1]}`);

  if (!dryRun) await ensureBucket();

  let succeeded = 0;
  let failed = 0;

  for (const pageNumber of pages) {
    const filePath = path.join(outputDir, `${pageNumber}.png`);
    try {
      await uploadPage(pageNumber, filePath);
      succeeded++;
    } catch (err) {
      console.error(`ERROR page ${pageNumber}:`, err.message);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} uploaded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
