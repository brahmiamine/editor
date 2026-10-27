import { createHash, randomUUID } from 'node:crypto'
import { HttpError, badRequest } from './http.js'
import { toDbDateTime, toIso } from './db.js'

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const SHARE_TOKEN = /^[0-9a-f-]{72}$/i
const HASH = /^[0-9a-f]{64}$/
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const MAX_IMAGE_BYTES = 1024 * 1024
const MAX_SHARE_DAYS = 30
const PAGE_SIZE = 1000

const uuid = (value, field = 'id') => {
  if (typeof value !== 'string' || !UUID.test(value)) throw badRequest(`Champ ${field} invalide.`)
  return value.toLowerCase()
}

const noteRow = (body) => {
  if (!body || typeof body !== 'object') throw badRequest('Note attendue.')
  if (typeof body.body !== 'string' || typeof body.title !== 'string') throw badRequest('Note invalide.')
  const updated = toDbDateTime(body.updated_at)
  if (!updated) throw badRequest('Champ updated_at invalide.')
  return {
    title: body.title,
    body: body.body,
    color: typeof body.color === 'string' && body.color.length <= 32 ? body.color : '#e9b949',
    metadata: JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
    updated,
  }
}

const fromNote = (row) => ({
  id: row.id,
  title: row.title,
  body: row.body,
  color: row.color,
  metadata: JSON.parse(row.metadata),
  revision: Number(row.revision),
  updated_at: toIso(row.updated_at),
})

export function registerRoutes(router, { pool, auth, notify }) {
  // L'onglet à l'origine de l'écriture (X-Socket-Id) n'a pas besoin d'être prévenu.
  const changed = (req, user) => notify(user.id, req.headers['x-socket-id'])

  router.get('/notes', async ({ req, query }) => {
    const user = await auth.requireUser(req)
    const offset = Math.max(0, Number.parseInt(query.get('offset') || '0', 10) || 0)
    const [rows] = await pool.query(
      `SELECT id, title, body, color, metadata, revision, updated_at FROM notes
        WHERE user_id = ? ORDER BY id LIMIT ? OFFSET ?`,
      [user.id, PAGE_SIZE, offset],
    )
    return rows.map(fromNote)
  })

  router.post('/notes', async ({ req, body }) => {
    const user = await auth.requireUser(req)
    const id = uuid(body?.id)
    const row = noteRow(body)
    try {
      await pool.execute(
        'INSERT INTO notes (user_id, id, title, body, color, metadata, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user.id, id, row.title, row.body, row.color, row.metadata, row.updated],
      )
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Cette note existe déjà.', 'conflict')
      throw error
    }
    changed(req, user)
    return { status: 201, body: { revision: 1 } }
  })

  /** Écriture conditionnelle : refusée (409) si la note a changé depuis la révision connue du client. */
  router.put('/notes/:id', async ({ req, params, body }) => {
    const user = await auth.requireUser(req)
    const id = uuid(params.id)
    const revision = Number(body?.revision)
    if (!Number.isInteger(revision)) throw badRequest('Champ revision invalide.')
    const row = noteRow(body)
    const [result] = await pool.execute(
      `UPDATE notes SET title = ?, body = ?, color = ?, metadata = ?, updated_at = ?, revision = revision + 1
        WHERE user_id = ? AND id = ? AND revision = ?`,
      [row.title, row.body, row.color, row.metadata, row.updated, user.id, id, revision],
    )
    if (!result.affectedRows) throw new HttpError(409, 'La note a été modifiée ailleurs.', 'conflict')
    changed(req, user)
    return { revision: revision + 1 }
  })

  router.delete('/notes/:id', async ({ req, params, query }) => {
    const user = await auth.requireUser(req)
    const revision = Number(query.get('revision'))
    if (!Number.isInteger(revision)) throw badRequest('Paramètre revision invalide.')
    const [result] = await pool.execute('DELETE FROM notes WHERE user_id = ? AND id = ? AND revision = ?', [user.id, uuid(params.id), revision])
    if (result.affectedRows) changed(req, user)
    return null
  })

  router.put('/images/:id', async ({ req, params, body }) => {
    const user = await auth.requireUser(req)
    const id = uuid(params.id)
    const type = String(req.headers['content-type'] || '').split(';')[0].trim()
    if (!IMAGE_TYPES.has(type)) throw badRequest('Format d’image non pris en charge.', 'invalid_image')
    if (!Buffer.isBuffer(body) || !body.length) throw badRequest('Image vide.', 'invalid_image')
    if (body.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image trop volumineuse (1 Mo maximum).', 'payload_too_large')
    try {
      await pool.execute('INSERT INTO note_images (user_id, id, content_type, data) VALUES (?, ?, ?, ?)', [user.id, id, type, body])
    } catch (error) {
      // Les images sont immuables : un second envoi du même identifiant est ignoré par le client.
      if (error?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Image déjà enregistrée.', 'conflict')
      throw error
    }
    return { status: 201, body: { id } }
  })

  router.get('/images/:id', async ({ req, params }) => {
    const user = await auth.requireUser(req)
    const [rows] = await pool.execute(
      'SELECT content_type, data FROM note_images WHERE user_id = ? AND id = ?',
      [user.id, uuid(params.id)],
    )
    if (!rows[0]) throw new HttpError(404, 'Image introuvable.', 'not_found')
    return { status: 200, body: rows[0].data, headers: { 'Content-Type': rows[0].content_type, 'Cache-Control': 'private, no-store' } }
  })

  router.get('/shares', async ({ req }) => {
    const user = await auth.requireUser(req)
    const [rows] = await pool.execute(
      'SELECT id, expires_at FROM note_shares WHERE user_id = ? AND expires_at > UTC_TIMESTAMP(3) ORDER BY expires_at',
      [user.id],
    )
    return rows.map((row) => ({ id: row.id, expires_at: toIso(row.expires_at) }))
  })

  router.post('/shares', async ({ req, body }) => {
    const user = await auth.requireUser(req)
    if (typeof body?.token_hash !== 'string' || !HASH.test(body.token_hash)) throw badRequest('Champ token_hash invalide.')
    if (typeof body.body !== 'string') throw badRequest('Champ body invalide.')
    const expires = new Date(body.expires_at)
    if (Number.isNaN(expires.getTime()) || expires.getTime() > Date.now() + MAX_SHARE_DAYS * 86_400_000) {
      throw badRequest(`Un partage expire au plus tard dans ${MAX_SHARE_DAYS} jours.`)
    }
    const id = randomUUID()
    await pool.execute(
      'INSERT INTO note_shares (id, user_id, token_hash, body, expires_at) VALUES (?, ?, ?, ?, ?)',
      [id, user.id, body.token_hash.toLowerCase(), body.body, toDbDateTime(expires)],
    )
    return { status: 201, body: { id } }
  })

  router.delete('/shares/:id', async ({ req, params }) => {
    const user = await auth.requireUser(req)
    await pool.execute('DELETE FROM note_shares WHERE user_id = ? AND id = ?', [user.id, uuid(params.id)])
    return null
  })

  /** Lecture publique d'un partage : le jeton non deviné fait office d'autorisation. */
  router.post('/shares/read', async ({ body }) => {
    if (typeof body?.token !== 'string' || !SHARE_TOKEN.test(body.token)) throw badRequest('Jeton invalide.', 'invalid_token')
    const hash = createHash('sha256').update(body.token).digest('hex')
    const [rows] = await pool.execute(
      'SELECT body FROM note_shares WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3)',
      [hash],
    )
    if (!rows[0]) throw new HttpError(404, 'Partage indisponible.', 'unavailable')
    return { body: rows[0].body }
  })

  /** Suppression du compte de la session : notes, images, partages et sessions suivent en cascade. */
  router.delete('/auth/user', async ({ req, query }) => {
    const user = await auth.requireUser(req)
    if (query.get('confirmation') !== 'DELETE') throw badRequest('Confirmation requise.', 'confirmation_required')
    await pool.execute('DELETE FROM users WHERE id = ?', [user.id])
    return null
  })
}
