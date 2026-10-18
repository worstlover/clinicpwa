import { build } from 'esbuild';
import { cp, rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(ROOT, 'dist');

// چیزهایی که نباید وارد dist بشن
const SKIP = new Set([
  'node_modules', 'dist', '.git', '.github', '.wrangler',
  'package.json', 'package-lock.json', 'build.mjs',
  'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
  '.gitignore', 'README.md',
  'scripts', // ⬅️ پوشه اسکریپت‌ها را نادیده بگیر
]);

async function walk(dir, base = dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

// ۱) پاک‌سازی و کپی همه‌ی فایل‌ها
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const name of await readdir(ROOT)) {
  if (SKIP.has(name)) continue;
  await cp(join(ROOT, name), join(OUT, name), { recursive: true });
}

// ۲) باندل JS (روی js/app.js داخل dist می‌نشینه)
await build({
  entryPoints: [join(ROOT, 'js/app.js')],
  outdir: join(OUT, 'js'),
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: true,
  // ⭐ این دو خط اضافه شدند تا خطاها دقیقاً به فایل اصلی اشاره کنند ⭐
  sourcemap: true,
  sourcesContent: true,
  external: [
    'https://*',
    'http://*',
    'firebase',
    '@firebase/*'
  ],
  define: {
    'firebase': 'window.firebase'
  },
  logLevel: 'info'
});

// ۳) ساخت لیست precache
const files = (await walk(OUT)).filter(p => {
  if (p === 'service-worker.js' || p === 'index.html') return false;
  if (p.endsWith('-sw.js') || p.endsWith('.map')) return false; // فایل‌های مپ کش نمی‌شوند
  if (p.startsWith('.well-known/')) return false;
  // JSهای جداگانه‌ی js/ دیگه استفاده نمی‌شن؛ فقط app.js و chunkها
  if (p.startsWith('js/') && p.endsWith('.js')
      && p !== 'js/app.js' && !basename(p).startsWith('chunk-')) return false;
  return true;
});
const assets = ['./', ...files.map(f => './' + f)];

// ۴) تزریق به service worker
const swPath = join(OUT, 'service-worker.js');
let sw = await readFile(swPath, 'utf8');
if (!sw.includes('__BUILD__') || !sw.includes('__ASSETS__')) {
  throw new Error('service-worker.js باید شامل __BUILD__ و __ASSETS__ باشد');
}
sw = sw
  .replace('__BUILD__', () => String(Date.now()))
  .replace('__ASSETS__', () => JSON.stringify(assets));
await writeFile(swPath, sw);

console.log(`✔ build done — ${assets.length} precached files`);
