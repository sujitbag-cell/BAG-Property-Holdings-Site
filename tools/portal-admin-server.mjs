import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTO_DIR = path.join(ROOT, 'public', 'photos');
const META_FILE = path.join(PHOTO_DIR, 'photo-meta.json');
const PORTAL_FILE = path.join(ROOT, 'data', 'portal.json');
const SITES_FILE = path.join(ROOT, 'data', 'sites.json');
const PORT = Number(readEnv('ADMIN_PORT', '4175'));
const USERNAME = readEnv('ADMIN_USERNAME', 'admin');
const PASSWORD = readEnv('ADMIN_PASSWORD', 'admin123');
const COOKIE_NAME = 'bag_portal_admin';
const SESSION_VALUE = crypto.createHash('sha256').update(`${USERNAME}|${PASSWORD}|bag-portal-admin`).digest('hex');
const MAX_UPLOAD_MB = 25;
const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif']
]);

fs.mkdirSync(PHOTO_DIR, { recursive: true });
ensureJson(META_FILE, {});
ensureJson(PORTAL_FILE, {});
ensureJson(SITES_FILE, []);
regenerateManifest();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/styles.css') return send(res, 200, 'text/css; charset=utf-8', styles());
    if (url.pathname.startsWith('/photos/')) return servePhoto(res, url.pathname.replace('/photos/', ''));

    if (url.pathname === '/login' && req.method === 'POST') {
      const form = new URLSearchParams((await readBody(req)).toString('utf8'));
      if (safeEqual(form.get('username') || '', USERNAME) && safeEqual(form.get('password') || '', PASSWORD)) {
        res.setHeader('Set-Cookie', `${COOKIE_NAME}=${SESSION_VALUE}; Path=/; HttpOnly; SameSite=Strict`);
        return redirect(res, '/?message=Logged%20in');
      }
      return send(res, 401, 'text/html; charset=utf-8', loginPage('Incorrect username or password.'));
    }

    if (url.pathname === '/logout') {
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
      return redirect(res, '/');
    }

    if (!isAuthenticated(req)) return send(res, 200, 'text/html; charset=utf-8', loginPage());

    if (url.pathname === '/portal' && req.method === 'POST') {
      const form = new URLSearchParams((await readBody(req)).toString('utf8'));
      const portal = readJson(PORTAL_FILE, {});
      portal.companyName = clean(form.get('companyName'), 120) || portal.companyName || 'BAG Property Holdings';
      portal.headline = clean(form.get('headline'), 180) || portal.headline || '';
      portal.subheadline = clean(form.get('subheadline'), 420) || portal.subheadline || '';
      portal.contactEmail = clean(form.get('contactEmail'), 160) || portal.contactEmail || '';
      portal.contactPhone = clean(form.get('contactPhone'), 80) || '';
      portal.notice = clean(form.get('notice'), 420) || portal.notice || '';
      writeJson(PORTAL_FILE, portal);
      return redirect(res, '/?message=Landing%20page%20settings%20saved');
    }

    if (url.pathname === '/site' && req.method === 'POST') {
      const form = new URLSearchParams((await readBody(req)).toString('utf8'));
      const id = cleanId(form.get('id'));
      const sites = readJson(SITES_FILE, []);
      const site = sites.find((item) => item.id === id);
      if (!site) return notFound(res);
      site.badge = clean(form.get('badge'), 60) || site.badge || 'Property';
      site.title = clean(form.get('title'), 220) || site.title || '';
      site.location = clean(form.get('location'), 180) || site.location || '';
      site.summary = clean(form.get('summary'), 520) || site.summary || '';
      site.price = clean(form.get('price'), 120) || site.price || '';
      site.availability = clean(form.get('availability'), 120) || site.availability || '';
      site.siteUrl = cleanUrl(form.get('siteUrl')) || '#update-link-in-admin';
      site.features = [form.get('feature1'), form.get('feature2'), form.get('feature3')]
        .map((value) => clean(value, 90))
        .filter(Boolean);
      writeJson(SITES_FILE, sites);
      return redirect(res, '/?message=Property%20card%20updated');
    }

    if (url.pathname === '/toggle' && req.method === 'POST') {
      const form = new URLSearchParams((await readBody(req)).toString('utf8'));
      const id = cleanId(form.get('id'));
      const sites = readJson(SITES_FILE, []);
      const site = sites.find((item) => item.id === id);
      if (!site) return notFound(res);
      site.enabled = !site.enabled;
      writeJson(SITES_FILE, sites);
      return redirect(res, `/?message=${encodeURIComponent(site.enabled ? 'Property card enabled' : 'Property card hidden')}`);
    }

    if (url.pathname === '/upload-cover' && req.method === 'POST') {
      const parsed = await parseMultipart(req);
      const id = cleanId(parsed.fields.siteId);
      const upload = parsed.files.cover;
      const sites = readJson(SITES_FILE, []);
      const site = sites.find((item) => item.id === id);
      if (!site) return notFound(res);
      if (!upload?.buffer?.length) return redirect(res, '/?message=Choose%20a%20cover%20photo%20first');
      if (!ALLOWED.has(upload.contentType)) return redirect(res, '/?message=Unsupported%20cover%20image%20format');
      const filename = writeUploadedPhoto(upload, `${id}-cover`);
      site.coverImage = `/photos/${filename}`;
      writeJson(SITES_FILE, sites);
      addPhotoMeta(filename, `${site.title} cover image`, `${site.title} property cover`, 'cover', site.id);
      regenerateManifest();
      return redirect(res, '/?message=Cover%20photo%20uploaded');
    }

    if (url.pathname === '/upload-gallery' && req.method === 'POST') {
      const parsed = await parseMultipart(req);
      const id = cleanId(parsed.fields.siteId);
      const sites = readJson(SITES_FILE, []);
      const site = sites.find((item) => item.id === id);
      if (!site) return notFound(res);
      const existing = Array.isArray(site.galleryImages) ? site.galleryImages : [];
      const remaining = Math.max(0, 10 - existing.length);
      if (remaining === 0) return redirect(res, '/?message=This%20property%20already%20has%2010%20gallery%20photos');
      const uploads = normalizeFileList(parsed.files.gallery)
        .filter((upload) => upload?.buffer?.length && ALLOWED.has(upload.contentType))
        .slice(0, remaining);
      if (!uploads.length) return redirect(res, '/?message=Choose%20supported%20gallery%20photos%20first');
      const nextImages = [...existing];
      uploads.forEach((upload, index) => {
        const filename = writeUploadedPhoto(upload, `${id}-gallery`);
        const photoNumber = existing.length + index + 1;
        const title = `${site.title} gallery photo ${photoNumber}`;
        const alt = `${site.title} property photo ${photoNumber}`;
        nextImages.push({ src: `/photos/${filename}`, title, alt });
        addPhotoMeta(filename, title, alt, 'gallery', site.id);
      });
      site.galleryImages = nextImages.slice(0, 10);
      writeJson(SITES_FILE, sites);
      regenerateManifest();
      return redirect(res, `/?message=${encodeURIComponent(`${uploads.length} gallery photo(s) uploaded`)}`);
    }

    if (url.pathname === '/remove-gallery-photo' && req.method === 'POST') {
      const form = new URLSearchParams((await readBody(req)).toString('utf8'));
      const id = cleanId(form.get('siteId'));
      const index = Number.parseInt(form.get('index') || '-1', 10);
      const sites = readJson(SITES_FILE, []);
      const site = sites.find((item) => item.id === id);
      if (!site || !Array.isArray(site.galleryImages) || index < 0 || index >= site.galleryImages.length) return notFound(res);
      const [removed] = site.galleryImages.splice(index, 1);
      removePhotoAsset(removed?.src);
      writeJson(SITES_FILE, sites);
      regenerateManifest();
      return redirect(res, '/?message=Gallery%20photo%20removed');
    }

    if (url.pathname === '/upload-portfolio-photo' && req.method === 'POST') {
      const parsed = await parseMultipart(req);
      const upload = parsed.files.photo;
      if (!upload?.buffer?.length) return redirect(res, '/?message=Choose%20a%20portfolio%20photo%20first');
      if (!ALLOWED.has(upload.contentType)) return redirect(res, '/?message=Unsupported%20portfolio%20image%20format');
      const title = clean(parsed.fields.title, 120) || 'Portfolio image';
      const alt = clean(parsed.fields.alt, 180) || title;
      const filename = writeUploadedPhoto(upload, 'portfolio-photo');
      addPhotoMeta(filename, title, alt, 'portfolio', '');
      regenerateManifest();
      return redirect(res, '/?message=Portfolio%20photo%20uploaded');
    }

    if (url.pathname === '/') {
      const message = clean(url.searchParams.get('message'), 240);
      return send(res, 200, 'text/html; charset=utf-8', dashboardPage(message));
    }

    return notFound(res);
  } catch (error) {
    console.error(error);
    return send(res, 500, 'text/plain; charset=utf-8', 'The BAG landing-page admin encountered an error. Check the terminal output.');
  }
});

server.listen(PORT, () => {
  console.log(`BAG landing-page admin running at http://localhost:${PORT}`);
  console.log('Use this admin locally, then rebuild and redeploy the static site.');
  console.log(`Username: ${USERNAME}`);
});

function dashboardPage(message = '') {
  const portal = readJson(PORTAL_FILE, {});
  const sites = readJson(SITES_FILE, []);
  const photos = readJson(path.join(ROOT, 'data', 'photos.json'), []);
  const cards = sites.map((site) => sitePanel(site)).join('');
  const photoList = photos.length
    ? photos.slice(0, 12).map((photo) => `<figure><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || photo.title || 'Portfolio photo')}" /><figcaption>${escapeHtml(photo.title || photo.filename || 'Uploaded photo')}</figcaption></figure>`).join('')
    : '<p class="muted">No uploaded portfolio images yet. The public hero uses a placeholder until one is added.</p>';

  return layout(`
    <header class="bar panel">
      <div>
        <p class="eyebrow">BAG Property Holdings</p>
        <h1>Landing-page admin control</h1>
        <p class="muted">Edit public portal copy, update property cards, show or hide sites, and upload images before static deployment.</p>
      </div>
      <div class="bar-actions"><a href="http://localhost:3000" target="_blank" rel="noreferrer">Open local preview</a><a href="/logout">Log out</a></div>
    </header>
    ${message ? `<div class="notice panel">${escapeHtml(message)}</div>` : ''}
    <section class="grid-two">
      <article class="panel">
        <p class="eyebrow">Landing page copy</p>
        <h2>Portal settings</h2>
        <form method="post" action="/portal" class="stack">
          <label>Company name<input name="companyName" value="${escapeHtml(portal.companyName || '')}" /></label>
          <label>Headline<input name="headline" value="${escapeHtml(portal.headline || '')}" /></label>
          <label>Subheadline<textarea name="subheadline">${escapeHtml(portal.subheadline || '')}</textarea></label>
          <label>Contact email<input name="contactEmail" value="${escapeHtml(portal.contactEmail || '')}" /></label>
          <label>Contact phone<input name="contactPhone" value="${escapeHtml(portal.contactPhone || '')}" /></label>
          <label>Notice<textarea name="notice">${escapeHtml(portal.notice || '')}</textarea></label>
          <button type="submit">Save landing page settings</button>
        </form>
      </article>
      <article class="panel">
        <p class="eyebrow">Portfolio media</p>
        <h2>Upload a hero / portfolio photo</h2>
        <p class="muted">The first uploaded portfolio photo becomes the public hero image. Property cover and gallery photos stay attached to their own cards.</p>
        <form method="post" action="/upload-portfolio-photo" enctype="multipart/form-data" class="stack">
          <label>Image file<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" required /></label>
          <label>Title<input name="title" placeholder="Portfolio hero image" /></label>
          <label>Alt text<input name="alt" placeholder="Accessibility description" /></label>
          <button type="submit">Upload portfolio photo</button>
        </form>
        <div class="mini-gallery">${photoList}</div>
      </article>
    </section>
    <section class="panel section-shell">
      <div class="section-head">
        <div>
          <p class="eyebrow">Connected property sites</p>
          <h2>Manage visible property cards</h2>
        </div>
        <p class="muted">Add each deployed property-page URL when ready. Hidden sites remain in the project data but do not display publicly.</p>
      </div>
      <div class="site-grid">${cards}</div>
    </section>
    <section class="panel deployment-note">
      <h2>After editing</h2>
      <ol>
        <li>Run <code>npm run build</code> to refresh the static export.</li>
        <li>Commit and push to GitHub Pages, or upload the <code>out/</code> folder to your static host.</li>
        <li>Your landing page updates while remaining a static public site.</li>
      </ol>
    </section>
  `);
}

function sitePanel(site) {
  const features = site.features || [];
  const galleryImages = Array.isArray(site.galleryImages) ? site.galleryImages.slice(0, 10) : [];
  const galleryCount = galleryImages.length;
  const galleryTiles = galleryCount
    ? galleryImages.map((image, index) => `
        <figure class="gallery-admin-item">
          <img src="${escapeHtml(image.src || '')}" alt="${escapeHtml(image.alt || `${site.title || 'Property'} gallery photo ${index + 1}`)}" />
          <figcaption>Photo ${index + 1}</figcaption>
          <form method="post" action="/remove-gallery-photo">
            <input type="hidden" name="siteId" value="${escapeHtml(site.id)}" />
            <input type="hidden" name="index" value="${index}" />
            <button class="remove-photo" type="submit">Remove</button>
          </form>
        </figure>`).join('')
    : '<p class="muted gallery-empty">No gallery photos uploaded yet.</p>';
  const status = site.enabled ? 'Visible on public landing page' : 'Hidden from public landing page';
  return `
    <article class="site-card">
      <div class="site-preview">
        <img src="${escapeHtml(site.coverImage || '/photos/mississauga-placeholder.svg')}" alt="${escapeHtml(site.title || 'Property card cover')}" />
        <span class="status ${site.enabled ? 'on' : 'off'}">${status}</span>
      </div>
      <div class="site-body">
        <h3>${escapeHtml(site.title || site.id)}</h3>
        <form method="post" action="/toggle"><input type="hidden" name="id" value="${escapeHtml(site.id)}" /><button class="toggle" type="submit">${site.enabled ? 'Hide from landing page' : 'Show on landing page'}</button></form>
        <form method="post" action="/site" class="stack compact">
          <input type="hidden" name="id" value="${escapeHtml(site.id)}" />
          <label>Badge<input name="badge" value="${escapeHtml(site.badge || '')}" /></label>
          <label>Title<input name="title" value="${escapeHtml(site.title || '')}" /></label>
          <label>Location<input name="location" value="${escapeHtml(site.location || '')}" /></label>
          <label>Summary<textarea name="summary">${escapeHtml(site.summary || '')}</textarea></label>
          <label>Price<input name="price" value="${escapeHtml(site.price || '')}" /></label>
          <label>Availability<input name="availability" value="${escapeHtml(site.availability || '')}" /></label>
          <label>Published property-site URL<input name="siteUrl" value="${escapeHtml(site.siteUrl || '')}" placeholder="https://..." /></label>
          <div class="feature-grid">
            <label>Feature 1<input name="feature1" value="${escapeHtml(features[0] || '')}" /></label>
            <label>Feature 2<input name="feature2" value="${escapeHtml(features[1] || '')}" /></label>
            <label>Feature 3<input name="feature3" value="${escapeHtml(features[2] || '')}" /></label>
          </div>
          <button type="submit">Save property card</button>
        </form>
        <form method="post" action="/upload-cover" enctype="multipart/form-data" class="stack compact upload-box">
          <input type="hidden" name="siteId" value="${escapeHtml(site.id)}" />
          <label>Cover photo<input name="cover" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" required /></label>
          <button type="submit">Upload card cover image</button>
        </form>
        <section class="gallery-manager upload-box">
          <p class="eyebrow">Card photo gallery</p>
          <h4>${galleryCount}/10 photos uploaded</h4>
          <p class="muted">Upload several photos at once. The public card resizes them responsively for desktop, tablet, and mobile.</p>
          <form method="post" action="/upload-gallery" enctype="multipart/form-data" class="stack compact">
            <input type="hidden" name="siteId" value="${escapeHtml(site.id)}" />
            <label>Gallery photos<input name="gallery" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple ${galleryCount >= 10 ? 'disabled' : 'required'} /></label>
            <button type="submit" ${galleryCount >= 10 ? 'disabled' : ''}>Upload gallery photos</button>
          </form>
          <div class="gallery-admin-grid">${galleryTiles}</div>
        </section>
      </div>
    </article>
  `;
}

function loginPage(message = '') {
  return layout(`
    <main class="login-wrap">
      <section class="panel login-card">
        <p class="eyebrow">Local static-site admin</p>
        <h1>Open BAG portal control</h1>
        <p class="muted">This admin runs locally. It changes JSON and images inside the project folder, then you rebuild and redeploy the static site.</p>
        ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
        <form method="post" action="/login" class="stack">
          <label>Username<input name="username" required autofocus /></label>
          <label>Password<input name="password" type="password" required /></label>
          <button type="submit">Sign in</button>
        </form>
      </section>
    </main>
  `);
}

function layout(content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>BAG Landing Admin</title><link rel="stylesheet" href="/styles.css" /></head><body>${content}</body></html>`;
}

function styles() {
  return `:root{--bg:#f5f1ea;--card:#fffdf9;--ink:#20303a;--muted:#61707a;--line:rgba(32,48,58,.14);--accent:#1d5c63;--ok:#1d7a50;--off:#8a4d39;--shadow:0 24px 70px rgba(32,48,58,.12)}*{box-sizing:border-box}body{margin:0;color:var(--ink);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at top left,rgba(215,225,230,.9),transparent 35%),radial-gradient(circle at top right,rgba(235,220,203,.88),transparent 30%),var(--bg)}a{color:inherit;text-decoration:none}.panel{background:rgba(255,253,249,.93);border:1px solid var(--line);border-radius:28px;box-shadow:var(--shadow)}.bar,.notice,.section-shell,.deployment-note{width:min(1240px,calc(100% - 32px));margin:22px auto}.bar{padding:26px;display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.bar h1,.login-card h1{margin:4px 0 10px;font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.05em}.bar-actions{display:flex;gap:12px;flex-wrap:wrap}.bar-actions a,.toggle,button{border:0;border-radius:999px;min-height:46px;padding:0 18px;background:var(--accent);color:white;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.eyebrow{margin:0 0 8px;text-transform:uppercase;letter-spacing:.09em;color:var(--accent);font-size:.78rem;font-weight:900}.muted{color:var(--muted);line-height:1.6;margin:0}.notice{padding:18px 22px;color:var(--ok);font-weight:900}.grid-two{width:min(1240px,calc(100% - 32px));margin:22px auto;display:grid;grid-template-columns:1fr 1fr;gap:22px}.grid-two>.panel,.section-shell,.deployment-note{padding:24px}.grid-two h2,.section-head h2,.deployment-note h2,.site-body h3{margin:4px 0 14px;letter-spacing:-.03em}.stack{display:grid;gap:14px;margin-top:18px}.stack.compact{gap:11px}label{display:grid;gap:7px;font-weight:800;font-size:.92rem}input,textarea{width:100%;border:1px solid var(--line);background:white;border-radius:16px;padding:13px 14px;font:inherit;color:var(--ink)}textarea{min-height:96px;resize:vertical}.mini-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px}.mini-gallery figure{margin:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:white}.mini-gallery img{width:100%;height:120px;object-fit:cover;display:block}.mini-gallery figcaption{padding:10px;font-size:.84rem;color:var(--muted);font-weight:800}.section-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:22px}.section-head .muted{max-width:460px}.site-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.site-card{border:1px solid var(--line);border-radius:26px;overflow:hidden;background:white}.site-preview{height:220px;position:relative;background:#eef1ef}.site-preview img{width:100%;height:100%;display:block;object-fit:cover}.status{position:absolute;left:14px;top:14px;padding:10px 12px;border-radius:999px;background:rgba(255,255,255,.94);font-weight:900;font-size:.8rem}.status.on{color:var(--ok)}.status.off{color:var(--off)}.site-body{padding:18px}.site-body h3{font-size:1.25rem;line-height:1.2}.toggle{width:100%;margin-bottom:10px;background:#24343d}.feature-grid{display:grid;grid-template-columns:1fr;gap:11px}.upload-box{padding:14px;border-radius:18px;background:rgba(29,92,99,.08);margin-top:14px}.deployment-note ol{margin:10px 0 0;padding-left:20px;color:var(--muted);line-height:1.8}.deployment-note code,.muted code{background:rgba(29,92,99,.1);padding:3px 7px;border-radius:8px}.login-wrap{min-height:100vh;display:grid;place-items:center;padding:22px}.login-card{width:min(560px,100%);padding:30px}.gallery-manager h4{margin:5px 0 8px;font-size:1.1rem}.gallery-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.gallery-admin-item{margin:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:white}.gallery-admin-item img{width:100%;height:108px;display:block;object-fit:cover}.gallery-admin-item figcaption{padding:9px 10px 2px;font-size:.8rem;color:var(--muted);font-weight:800}.gallery-admin-item form{padding:8px 10px 10px}.remove-photo{width:100%;min-height:36px;padding:0 12px;background:#8a4d39;font-size:.78rem}.gallery-empty{grid-column:1/-1}.gallery-manager button:disabled,.gallery-manager input:disabled{opacity:.55;cursor:not-allowed}@media(max-width:1050px){.grid-two,.site-grid{grid-template-columns:1fr}.section-head,.bar{flex-direction:column}.mini-gallery{grid-template-columns:1fr}}`;
}

function readEnv(key, fallback) {
  loadEnv(path.join(ROOT, '.env.local'));
  loadEnv(path.join(ROOT, '.env'));
  return process.env[key] || fallback;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}

function ensureJson(file, fallback) {
  if (!fs.existsSync(file)) writeJson(file, fallback);
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function redirect(res, location) { res.writeHead(302, { Location: location }); res.end(); }
function send(res, status, type, body) { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
function notFound(res) { return send(res, 404, 'text/plain; charset=utf-8', 'Not found'); }
function clean(value, max = 180) { return String(value || '').trim().replace(/[<>]/g, '').slice(0, max); }
function cleanId(value) { return clean(value, 100).replace(/[^a-zA-Z0-9_-]/g, ''); }
function cleanUrl(value) {
  const raw = clean(value, 260);
  if (!raw || raw.startsWith('#')) return raw;
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch { return ''; }
}
function escapeHtml(value) {
  return String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD_MB * 1024 * 1024) { reject(new Error('Upload is too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function parseMultipart(req) {
  const type = req.headers['content-type'] || '';
  const match = type.match(/boundary=(?:(?:")([^"]+)(?:")|([^;]+))/i);
  const boundary = match?.[1] || match?.[2];
  if (!boundary) throw new Error('Missing multipart boundary.');
  const body = await readBody(req);
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, delimiter).slice(1, -1);
  const fields = {}; const files = {};
  for (let part of parts) {
    if (part.slice(0, 2).toString() === '\r\n') part = part.slice(2);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd).toString('utf8');
    const payload = part.slice(headerEnd + 4);
    const name = headers.match(/name="([^"]+)"/)?.[1];
    const filename = headers.match(/filename="([^"]*)"/)?.[1];
    if (!name) continue;
    if (filename) {
      const file = {
        filename,
        contentType: headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream',
        buffer: payload
      };
      if (!files[name]) files[name] = file;
      else if (Array.isArray(files[name])) files[name].push(file);
      else files[name] = [files[name], file];
    } else {
      fields[name] = payload.toString('utf8').trim();
    }
  }
  return { fields, files };
}
function splitBuffer(buffer, delimiter) {
  const parts = []; let start = 0; let index = buffer.indexOf(delimiter, start);
  while (index !== -1) { parts.push(buffer.slice(start, index)); start = index + delimiter.length; index = buffer.indexOf(delimiter, start); }
  parts.push(buffer.slice(start)); return parts;
}
function writeUploadedPhoto(upload, stem) {
  const ext = ALLOWED.get(upload.contentType);
  const filename = uniqueFilename(`${sanitize(stem || path.parse(upload.filename || 'upload').name)}${ext}`);
  fs.writeFileSync(path.join(PHOTO_DIR, filename), upload.buffer);
  return filename;
}
function sanitize(value) { return String(value || 'photo').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 88) || 'photo'; }
function uniqueFilename(filename) {
  const parsed = path.parse(filename); let candidate = filename; let i = 2;
  while (fs.existsSync(path.join(PHOTO_DIR, candidate))) { candidate = `${parsed.name}-${i}${parsed.ext}`; i += 1; }
  return candidate;
}
function addPhotoMeta(filename, title, alt, kind = 'portfolio', siteId = '') {
  const meta = readJson(META_FILE, {});
  meta[filename] = { title, alt, kind, siteId };
  writeJson(META_FILE, meta);
}
function normalizeFileList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
function removePhotoAsset(src) {
  const filename = path.basename(String(src || '').replace('/photos/', ''));
  if (!filename) return;
  const file = path.join(PHOTO_DIR, filename);
  if (file.startsWith(PHOTO_DIR) && fs.existsSync(file)) fs.unlinkSync(file);
  const meta = readJson(META_FILE, {});
  if (meta[filename]) {
    delete meta[filename];
    writeJson(META_FILE, meta);
  }
}
function regenerateManifest() {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-photo-manifest.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Failed to regenerate photo manifest.');
}
function servePhoto(res, rawName) {
  const name = path.basename(decodeURIComponent(rawName));
  const file = path.join(PHOTO_DIR, name);
  if (!file.startsWith(PHOTO_DIR) || !fs.existsSync(file)) return notFound(res);
  return send(res, 200, contentTypeFor(file), fs.readFileSync(file));
}
function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.svg':'image/svg+xml' })[ext] || 'application/octet-stream';
}
function isAuthenticated(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((item) => item.trim()).filter(Boolean).map((item) => { const [key, ...rest] = item.split('='); return [key, rest.join('=')]; }));
  return safeEqual(cookies[COOKIE_NAME] || '', SESSION_VALUE);
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
