import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTO_DIR = path.join(ROOT, 'public', 'photos');
const META_FILE = path.join(PHOTO_DIR, 'photo-meta.json');
const PHOTOS_FILE = path.join(ROOT, 'data', 'photos.json');
const MANIFEST_FILE = path.join(PHOTO_DIR, 'manifest.json');
const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

fs.mkdirSync(PHOTO_DIR, { recursive: true });
const meta = readJson(META_FILE, {});
const photos = fs.readdirSync(PHOTO_DIR)
  .filter((file) => SUPPORTED.has(path.extname(file).toLowerCase()))
  .filter((file) => meta[file]?.kind === 'portfolio' || (!meta[file]?.kind && file.includes('portfolio-photo')))
  .sort((a, b) => a.localeCompare(b))
  .map((file) => ({
    filename: file,
    src: `/photos/${file}`,
    title: meta[file]?.title || titleFromFilename(file),
    alt: meta[file]?.alt || meta[file]?.title || titleFromFilename(file)
  }));

fs.writeFileSync(PHOTOS_FILE, `${JSON.stringify(photos, null, 2)}\n`);
fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(photos, null, 2)}\n`);
console.log(`Generated landing-site photo manifest with ${photos.length} photo(s).`);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function titleFromFilename(filename) {
  return path.parse(filename).name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
