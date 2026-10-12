import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const base = process.env.GITHUB_ACTIONS === 'true' ? '/editor' : ''
const icon = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#f8f7f3"/><g stroke="#dfaa30" stroke-width="20" stroke-linecap="round"><path d="M256 136v240M136 256h240M171 171l170 170M171 341l170-170"/></g></svg>')
for (const size of [192,512]) await sharp(icon).resize(size,size).png().toFile('out/icon-' + size + '.png')
async function files(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name
    if (entry.isDirectory()) result.push(...await files(path))
    else if (path !== 'out/sw.js' && (/\.(js|css|woff2|png|svg)$/.test(path) || ['out/index.html','out/notes/index.html','out/manifest.webmanifest'].includes(path))) result.push(path)
  }
  return result
}
const assets = await files('out')
const hash = createHash('sha256')
for (const file of assets) hash.update(await readFile(file))
const urls = assets.map(file => base + file.slice(3)).map(url => url.replace(/\/index\.html$/, '/'))
const worker = `const CACHE = 'papertrail-${hash.digest('hex').slice(0,16)}';
const BASE = ${JSON.stringify(base)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('papertrail-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.pathname === BASE + '/notes/') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match(BASE + '/notes/'))));
  } else if (ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`;
await writeFile('out/sw.js', worker)
console.log('Offline shell generated:', assets.length, 'assets; basePath:', base || '/')
