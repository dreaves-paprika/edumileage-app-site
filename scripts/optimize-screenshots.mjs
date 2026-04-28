// Converts public/screenshots/*.png to .webp at quality 82.
// Run: node scripts/optimize-screenshots.mjs
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, extname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'public', 'screenshots');

const entries = await readdir(dir);
for (const entry of entries) {
  if (extname(entry).toLowerCase() !== '.png') continue;
  const src = resolve(dir, entry);
  const out = resolve(dir, basename(entry, '.png') + '.webp');
  await sharp(src).webp({ quality: 82 }).toFile(out);
  console.log(`  ${entry} -> ${basename(out)}`);
}
