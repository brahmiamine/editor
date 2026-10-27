import { createAuth } from './auth.js'
import { createRouter, createServer } from './http.js'
import { createMailer } from './mailer.js'
import { attachRealtime } from './realtime.js'
import { registerRoutes } from './routes.js'

export const DEFAULT_ORIGINS = ['https://brahmiamine.github.io', 'http://localhost:3000', 'http://127.0.0.1:3107']

export function createApp({ pool, env = process.env, mailer = createMailer(env), logger = console }) {
  const appUrl = (env.APP_URL || 'https://papertrail.clubika.com/').replace(/\/?$/, '/')
  const router = createRouter()
  const auth = createAuth({
    pool,
    mailer,
    appName: 'Papertrail',
    // Le jeton est placé dans le fragment : il n'est jamais envoyé à un serveur ni journalisé.
    buildLink: (type, token) => type === 'recovery' ? `${appUrl}auth/?mode=update#auth=recovery:${token}` : `${appUrl}auth/#auth=magic:${token}`,
    minPasswordLength: 8,
    magicLink: true,
  })

  router.get('/health', async () => {
    await pool.query('SELECT 1')
    return { ok: true }
  })
  auth.register(router)
  // Branché une fois le serveur HTTP créé (voir plus bas).
  let notify = () => {}
  registerRoutes(router, { pool, auth, notify: (...args) => notify(...args) })

  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()) : DEFAULT_ORIGINS
  // Notes avec historique et partages avec images intégrées : jusqu'à 15 Mo par requête.
  const server = createServer({ router, allowedOrigins, bodyLimit: 15 * 1024 * 1024, logger, staticDir: env.STATIC_DIR })
  notify = attachRealtime(server, { auth, origins: allowedOrigins })
  return server
}
