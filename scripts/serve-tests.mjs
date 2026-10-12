import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
const root = resolve('out')
const base = process.env.GITHUB_ACTIONS === 'true' ? '/editor' : ''
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (base && !path.startsWith(base + '/')) throw new Error('path')
    path = path.slice(base.length)
    if (path.endsWith('/')) path += 'index.html'
    const file = resolve(root, '.' + path)
    if (!file.startsWith(root + sep)) throw new Error('path')
    const body = await readFile(file)
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream')
    res.end(body)
  } catch { res.statusCode = 404; res.end('Not found') }
}).listen(3107, '127.0.0.1')
