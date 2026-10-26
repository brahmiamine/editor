import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { HttpError, badRequest } from './http.js'
import { toDbDateTime, toIso, transaction } from './db.js'

const SESSION_DAYS = 60
const EMAIL_TOKEN_MINUTES = 60
const BCRYPT_ROUNDS = 10
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
const addMinutes = (minutes) => toDbDateTime(new Date(Date.now() + minutes * 60_000))

/** Limiteur en mémoire : `limit` tentatives par fenêtre de `windowMs`. */
export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
      }
      return
    }
    entry.count += 1
    if (entry.count > limit) throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.', 'rate_limited')
  }
}

const normalizeEmail = (value) => {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!EMAIL_PATTERN.test(email) || email.length > 320) throw badRequest('Adresse e-mail invalide.', 'invalid_email')
  return email
}

const publicUser = (row) => ({ id: row.id, email: row.email, created_at: toIso(row.created_at) })

/**
 * Comptes e-mail + mot de passe et sessions opaques (jeton Bearer haché en SHA-256 en base).
 * options.buildLink(type, token) construit le lien envoyé par e-mail ('recovery' ou 'magic').
 */
export function createAuth({ pool, mailer, appName, buildLink, minPasswordLength = 8, magicLink = false }) {
  const limitLogin = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 })
  const limitEmail = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 })
  const limitSignup = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 })

  const checkPassword = (password) => {
    if (typeof password !== 'string' || password.length < minPasswordLength) {
      throw badRequest(`Le mot de passe doit contenir au moins ${minPasswordLength} caractères.`, 'weak_password')
    }
    if (password.length > 72) throw badRequest('Le mot de passe ne doit pas dépasser 72 caractères.', 'weak_password')
  }

  const createSession = async (user, db = pool) => {
    const token = newToken()
    await db.execute(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
      [hashToken(token), user.id, addMinutes(SESSION_DAYS * 24 * 60)],
    )
    return { token, user: publicUser(user) }
  }

  const bearer = (req) => {
    const header = String(req.headers.authorization || '')
    return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  }

  /** Utilisateur de la session courante, ou null. */
  const currentUser = async (req) => {
    const token = bearer(req)
    if (!token) return null
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3)`,
      [hashToken(token)],
    )
    return rows[0] ? publicUser(rows[0]) : null
  }

  const requireUser = async (req) => {
    const user = await currentUser(req)
    if (!user) throw new HttpError(401, 'Session expirée. Reconnecte-toi.', 'unauthorized')
    return user
  }

  const findUserByEmail = async (email, db = pool) => {
    const [rows] = await db.execute('SELECT id, email, password_hash, created_at FROM users WHERE email = ?', [email])
    return rows[0] || null
  }

  const issueEmailToken = async (userId, purpose) => {
    const token = newToken()
    await pool.execute(
      'INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)',
      [hashToken(token), userId, purpose, addMinutes(EMAIL_TOKEN_MINUTES)],
    )
    return token
  }

  /** Consomme un jeton e-mail à usage unique ; renvoie l'utilisateur. */
  const consumeEmailToken = async (token, purpose, db) => {
    if (typeof token !== 'string' || !token) throw badRequest('Lien invalide.', 'invalid_token')
    const [rows] = await db.execute(
      `SELECT u.id, u.email, u.created_at FROM email_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND t.purpose = ? AND t.expires_at > UTC_TIMESTAMP(3) FOR UPDATE`,
      [hashToken(token), purpose],
    )
    if (!rows[0]) throw badRequest('Ce lien est invalide ou a expiré.', 'invalid_token')
    await db.execute('DELETE FROM email_tokens WHERE token_hash = ?', [hashToken(token)])
    return rows[0]
  }

  const register = (router) => {
    router.get('/auth/config', () => ({ emailEnabled: mailer.enabled, magicLink: magicLink && mailer.enabled, minPasswordLength }))

    router.post('/auth/signup', async ({ body, ip }) => {
      limitSignup(ip)
      const email = normalizeEmail(body?.email)
      checkPassword(body?.password)
      if (await findUserByEmail(email)) throw new HttpError(409, 'Un compte existe déjà avec cette adresse.', 'user_exists')
      const user = { id: randomUUID(), email, created_at: toDbDateTime() }
      const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
      try {
        await pool.execute('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', [user.id, email, hash])
      } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Un compte existe déjà avec cette adresse.', 'user_exists')
        throw error
      }
      return { status: 201, body: await createSession(user) }
    })

    router.post('/auth/login', async ({ body, ip }) => {
      const email = normalizeEmail(body?.email)
      limitLogin(`${ip}:${email}`)
      const user = await findUserByEmail(email)
      const valid = user && typeof body?.password === 'string' && await bcrypt.compare(body.password, user.password_hash)
      if (!valid) throw new HttpError(400, 'Adresse e-mail ou mot de passe incorrect.', 'invalid_credentials')
      return createSession(user)
    })

    router.post('/auth/logout', async ({ req }) => {
      const token = bearer(req)
      if (token) await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)])
      return null
    })

    router.get('/auth/user', async ({ req }) => ({ user: await requireUser(req) }))

    router.put('/auth/password', async ({ req, body }) => {
      const user = await requireUser(req)
      checkPassword(body?.password)
      const hash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)
      await transaction(pool, async (db) => {
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id])
        // Les autres appareils sont déconnectés ; la session courante reste valide.
        await db.execute('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [user.id, hashToken(bearer(req))])
      })
      return null
    })

    const sendEmailLink = async (body, ip, purpose) => {
      if (!mailer.enabled) throw new HttpError(503, "L'envoi d'e-mails n'est pas encore configuré.", 'email_disabled')
      const email = normalizeEmail(body?.email)
      limitEmail(`${ip}:${email}`)
      const user = await findUserByEmail(email)
      // Réponse identique que le compte existe ou non.
      if (user) {
        const token = await issueEmailToken(user.id, purpose)
        const link = buildLink(purpose, token)
        await mailer.send(purpose === 'recovery'
          ? { to: email, subject: `${appName} : nouveau mot de passe`, text: `Ouvre ce lien (valable 1 heure) pour choisir un nouveau mot de passe :\n\n${link}\n\nSi tu n'as rien demandé, ignore cet e-mail.` }
          : { to: email, subject: `${appName} : lien de connexion`, text: `Ouvre ce lien (valable 1 heure) pour te connecter :\n\n${link}\n\nSi tu n'as rien demandé, ignore cet e-mail.` })
      }
      return null
    }

    router.post('/auth/recover', ({ body, ip }) => sendEmailLink(body, ip, 'recovery'))

    /** Échange un lien de récupération contre une session ; le nouveau mot de passe est choisi ensuite. */
    router.post('/auth/verify', async ({ body }) => {
      const purpose = body?.type === 'magic' ? 'magic' : 'recovery'
      if (purpose === 'magic' && !magicLink) throw badRequest('Lien invalide.', 'invalid_token')
      return transaction(pool, async (db) => {
        const user = await consumeEmailToken(body?.token, purpose, db)
        return createSession(user, db)
      })
    })

    if (magicLink) router.post('/auth/magic-link', ({ body, ip }) => sendEmailLink(body, ip, 'magic'))
  }

  return { register, currentUser, requireUser, bearer, hashToken }
}
