import { createServer as createHttpServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

export class HttpError extends Error {
  constructor(status, message, code = undefined) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badRequest = (message, code = 'bad_request') => new HttpError(400, message, code)

/** Router minimal : `/items/:id` → params.id. */
export function createRouter() {
  const routes = []

  const add = (method, pattern, handler) => {
    const keys = []
    const source = pattern.replace(/:([a-zA-Z_]+)/g, (_, key) => {
      keys.push(key)
      return '([^/]+)'
    })
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, handler })
  }

  const match = (method, path) => {
    let pathMatched = false
    for (const route of routes) {
      const result = route.regex.exec(path)
      if (!result) continue
      pathMatched = true
      if (route.method !== method) continue
      const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(result[index + 1])]))
      return { handler: route.handler, params }
    }
    return pathMatched ? 'method_not_allowed' : null
  }

  return {
    get: (pattern, handler) => add('GET', pattern, handler),
    post: (pattern, handler) => add('POST', pattern, handler),
    put: (pattern, handler) => add('PUT', pattern, handler),
    patch: (pattern, handler) => add('PATCH', pattern, handler),
    delete: (pattern, handler) => add('DELETE', pattern, handler),
    match,
  }
}

const readBody = (req, limit) =>
  new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new HttpError(413, 'Requête trop volumineuse.', 'payload_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

// Erreurs MariaDB dues à une donnée invalide envoyée par le client.
const CLIENT_DB_ERRORS = new Set([
  'ER_CHECK_CONSTRAINT_VIOLATED',
  'ER_TRUNCATED_WRONG_VALUE',
  'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
  'WARN_DATA_TRUNCATED',
  'ER_DATA_TOO_LONG',
  'ER_WARN_DATA_OUT_OF_RANGE',
  'ER_BAD_NULL_ERROR',
  'ER_NO_REFERENCED_ROW_2',
  'ER_DUP_ENTRY',
])

/** Adresse du client : Caddy ajoute la vraie adresse en dernier dans X-Forwarded-For. */
export const clientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean)
  return forwarded.at(-1) || req.socket.remoteAddress || 'unknown'
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.map': 'application/json; charset=utf-8',
}
// Fichiers au nom haché : cache longue durée. Tout le reste (pages, sw.js, manifeste) est revalidé.
const IMMUTABLE = /\/(assets|_next\/static)\//

/** Sert le site compilé (dossier `root`) : index.html dans les dossiers, 404.html si présent. */
async function serveStatic(root, pathname, send) {
  let path
  try { path = decodeURIComponent(pathname) } catch { return send(400, { error: 'bad_request', message: 'Adresse invalide.' }) }
  if (path.includes('\0')) return send(400, { error: 'bad_request', message: 'Adresse invalide.' })
  const base = resolve(root)
  const lookup = async (relative) => {
    const file = resolve(base, '.' + relative)
    if (file !== base && !file.startsWith(base + sep)) return null
    const info = await stat(file).catch(() => null)
    return info ? { file, info } : null
  }
  let found = await lookup(path)
  if (found?.info.isDirectory()) {
    if (!path.endsWith('/')) return send(308, null, { Location: path + '/' })
    found = await lookup(path + 'index.html')
  }
  if (!found || !found.info.isFile()) {
    const missing = await lookup('/404.html')
    if (missing?.info.isFile()) return send(404, await readFile(missing.file), { 'Content-Type': TYPES['.html'] })
    return send(404, { error: 'not_found', message: 'Introuvable.' })
  }
  return send(200, await readFile(found.file), {
    'Content-Type': TYPES[extname(found.file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': IMMUTABLE.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
}

/**
 * L'API répond sous `/api/...` (et à la racine si aucun site n'est servi). Avec `staticDir`, tout ce qui
 * n'est pas `/api` est servi comme fichier du site.
 */
export function createServer({ router, allowedOrigins, bodyLimit = 1024 * 1024, logger = console, staticDir = '' }) {
  const origins = new Set(allowedOrigins)

  return createHttpServer(async (req, res) => {
    const origin = req.headers.origin
    const headers = {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Origin',
    }
    if (origin && origins.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, If-Match'
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      headers['Access-Control-Expose-Headers'] = 'ETag'
      headers['Access-Control-Max-Age'] = '600'
    }

    const send = (status, body, extra = {}) => {
      if (body === undefined || body === null || status === 204) {
        res.writeHead(status === 200 ? 204 : status, { ...headers, ...extra })
        res.end()
        return
      }
      if (Buffer.isBuffer(body)) {
        res.writeHead(status, { ...headers, ...extra })
        res.end(body)
        return
      }
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra })
      res.end(JSON.stringify(body))
    }

    if (req.method === 'OPTIONS') return send(204)

    const url = new URL(req.url || '/', 'http://localhost')
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (staticDir && !isApi) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'method_not_allowed', message: 'Méthode non autorisée.' })
      const page = (status, body, extra = {}) => send(status, body, { 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...extra })
      return serveStatic(staticDir, url.pathname, page).catch((error) => {
        logger.error(`${req.method} ${url.pathname}`, error)
        send(500, { error: 'server_error', message: 'Erreur serveur.' })
      })
    }
    const found = router.match(req.method, isApi ? url.pathname.slice(4) || '/' : url.pathname)
    if (!found) return send(404, { error: 'not_found', message: 'Introuvable.' })
    if (found === 'method_not_allowed') return send(405, { error: 'method_not_allowed', message: 'Méthode non autorisée.' })

    try {
      let body
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const raw = await readBody(req, bodyLimit)
        const type = String(req.headers['content-type'] || '')
        if (raw.length && type.includes('application/json')) {
          try {
            body = JSON.parse(raw.toString('utf8'))
          } catch {
            throw badRequest('JSON invalide.', 'invalid_json')
          }
        } else {
          body = raw
        }
      }

      const result = await found.handler({ req, params: found.params, query: url.searchParams, body, ip: clientIp(req) })
      if (result && typeof result === 'object' && 'status' in result && 'body' in result) {
        return send(result.status, result.body, result.headers)
      }
      return send(200, result)
    } catch (error) {
      if (error instanceof HttpError) {
        return send(error.status, { error: error.code || 'error', message: error.message })
      }
      if (CLIENT_DB_ERRORS.has(error?.code)) {
        return send(400, { error: 'invalid_data', message: 'Données invalides.' })
      }
      logger.error(`${req.method} ${url.pathname}`, error)
      return send(500, { error: 'server_error', message: 'Erreur serveur.' })
    }
  })
}
