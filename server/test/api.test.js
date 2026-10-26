// Tests d'intégration contre une vraie base MariaDB de test.
// TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD (+ TEST_DB_SOCKET ou TEST_DB_HOST) ; ignorés sinon.
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createApp } from '../src/app.js'
import { createPool, migrate } from '../src/db.js'

const env = {
  DB_NAME: process.env.TEST_DB_NAME,
  DB_USER: process.env.TEST_DB_USER,
  DB_PASSWORD: process.env.TEST_DB_PASSWORD,
  DB_SOCKET: process.env.TEST_DB_SOCKET,
  DB_HOST: process.env.TEST_DB_HOST,
}
const skip = !env.DB_NAME && 'TEST_DB_NAME non défini'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

describe('Papertrail API', { skip }, () => {
  let pool
  let server
  let base
  const sent = []
  const mailer = { enabled: true, send: async (mail) => { sent.push(mail) } }

  const call = async (method, path, { token, body, raw, type } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(raw ? { 'Content-Type': type } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
    return { status: response.status, data, contentType }
  }

  const signup = async (email = 'a@example.com') =>
    (await call('POST', '/auth/signup', { body: { email, password: 'motdepasse1' } })).data

  const note = (id, extra = {}) => ({
    id, title: 'Titre', body: 'Titre\nCorps', color: '#e9b949', updated_at: '2026-10-26T10:00:00.000Z',
    metadata: { pinned: true, tags: ['a'] }, ...extra,
  })

  before(async () => {
    pool = createPool(env)
    await pool.query('SET FOREIGN_KEY_CHECKS = 0')
    const [tables] = await pool.query('SHOW TABLES')
    for (const row of tables) await pool.query(`DROP TABLE \`${Object.values(row)[0]}\``)
    await pool.query('SET FOREIGN_KEY_CHECKS = 1')
    await migrate(new URL('../schema.sql', import.meta.url), env)
    await migrate(new URL('../schema.sql', import.meta.url), env) // idempotent
    server = createApp({ pool, env, mailer, logger: { error() {} } })
    await new Promise((resolve) => server.listen(0, resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  beforeEach(async () => {
    sent.length = 0
    await pool.query('DELETE FROM users')
  })

  it('crée, relit et met à jour une note avec contrôle de révision', async () => {
    const { token } = await signup()
    const id = randomUUID()
    const created = await call('POST', '/notes', { token, body: note(id) })
    assert.equal(created.status, 201)
    assert.deepEqual(created.data, { revision: 1 })
    assert.equal((await call('POST', '/notes', { token, body: note(id) })).status, 409)

    const [stored] = (await call('GET', '/notes', { token })).data
    assert.deepEqual(stored, { ...note(id), revision: 1 })

    const updated = await call('PUT', `/notes/${id}`, { token, body: { ...note(id, { body: 'v2' }), revision: 1 } })
    assert.deepEqual(updated.data, { revision: 2 })
    // Révision périmée : un autre appareil a écrit entre-temps.
    assert.equal((await call('PUT', `/notes/${id}`, { token, body: { ...note(id, { body: 'v3' }), revision: 1 } })).status, 409)
    assert.equal((await call('GET', '/notes', { token })).data[0].body, 'v2')

    await call('DELETE', `/notes/${id}?revision=1`, { token })
    assert.equal((await call('GET', '/notes', { token })).data.length, 1)
    await call('DELETE', `/notes/${id}?revision=2`, { token })
    assert.equal((await call('GET', '/notes', { token })).data.length, 0)
  })

  it('pagine les notes par 1000', async () => {
    const { token, user } = await signup()
    const values = Array.from({ length: 1001 }, () => [user.id, randomUUID(), 't', 'b', '{}'])
    await pool.query('INSERT INTO notes (user_id, id, title, body, metadata) VALUES ?', [values])
    assert.equal((await call('GET', '/notes', { token })).data.length, 1000)
    assert.equal((await call('GET', '/notes?offset=1000', { token })).data.length, 1)
  })

  it('cloisonne notes, images et partages entre comptes', async () => {
    const alice = await signup('alice@example.com')
    const bob = await signup('bob@example.com')
    const id = randomUUID()
    await call('POST', '/notes', { token: alice.token, body: note(id) })
    await call('PUT', `/images/${id}`, { token: alice.token, raw: PNG, type: 'image/png' })

    assert.equal((await call('GET', '/notes', { token: bob.token })).data.length, 0)
    assert.equal((await call('PUT', `/notes/${id}`, { token: bob.token, body: { ...note(id), revision: 1 } })).status, 409)
    assert.equal((await call('GET', `/images/${id}`, { token: bob.token })).status, 404)
    // Le même identifiant chez Bob n'entre pas en collision avec Alice.
    assert.equal((await call('POST', '/notes', { token: bob.token, body: note(id) })).status, 201)
  })

  it('stocke les images privées et refuse les formats invalides', async () => {
    const { token } = await signup()
    const id = randomUUID()
    assert.equal((await call('PUT', `/images/${id}`, { token, raw: PNG, type: 'image/png' })).status, 201)
    assert.equal((await call('PUT', `/images/${id}`, { token, raw: PNG, type: 'image/png' })).status, 409)
    const image = await call('GET', `/images/${id}`, { token })
    assert.equal(image.contentType, 'image/png')
    assert.ok(image.data.equals(PNG))
    assert.equal((await call('PUT', `/images/${randomUUID()}`, { token, raw: Buffer.from('<svg/>'), type: 'image/svg+xml' })).status, 400)
    assert.equal((await call('PUT', `/images/${randomUUID()}`, { token, raw: Buffer.alloc(1024 * 1024 + 1), type: 'image/png' })).status, 413)
    assert.equal((await call('GET', `/images/${id}`)).status, 401)
  })

  it('crée, lit publiquement et révoque un partage', async () => {
    const { token } = await signup()
    const shareToken = randomUUID() + randomUUID()
    const hash = createHash('sha256').update(shareToken).digest('hex')
    const expires = new Date(Date.now() + 7 * 86_400_000).toISOString()

    assert.equal((await call('POST', '/shares', { token, body: { token_hash: hash, body: 'Texte', expires_at: new Date(Date.now() + 31 * 86_400_000).toISOString() } })).status, 400)
    const created = await call('POST', '/shares', { token, body: { token_hash: hash, body: 'Texte partagé', expires_at: expires } })
    assert.equal(created.status, 201)

    const read = await call('POST', '/shares/read', { body: { token: shareToken } })
    assert.deepEqual(read.data, { body: 'Texte partagé' })
    assert.equal((await call('POST', '/shares/read', { body: { token: 'mauvais' } })).status, 400)

    const shares = (await call('GET', '/shares', { token })).data
    assert.equal(shares.length, 1)
    await call('DELETE', `/shares/${shares[0].id}`, { token })
    assert.equal((await call('POST', '/shares/read', { body: { token: shareToken } })).status, 404)
  })

  it('ne renvoie pas un partage expiré', async () => {
    const { token, user } = await signup()
    const shareToken = randomUUID() + randomUUID()
    const hash = createHash('sha256').update(shareToken).digest('hex')
    await pool.query("INSERT INTO note_shares (id, user_id, token_hash, body, expires_at) VALUES (UUID(), ?, ?, 'x', UTC_TIMESTAMP(3) - INTERVAL 1 SECOND)", [user.id, hash])
    assert.equal((await call('POST', '/shares/read', { body: { token: shareToken } })).status, 404)
    assert.equal((await call('GET', '/shares', { token })).data.length, 0)
  })

  it('supprime le compte et toutes ses données après confirmation', async () => {
    const { token, user } = await signup()
    const id = randomUUID()
    await call('POST', '/notes', { token, body: note(id) })
    await call('PUT', `/images/${id}`, { token, raw: PNG, type: 'image/png' })

    assert.equal((await call('DELETE', '/auth/user', { token })).status, 400)
    assert.equal((await call('DELETE', '/auth/user?confirmation=DELETE', { token })).status, 204)
    assert.equal((await call('GET', '/auth/user', { token })).status, 401)
    for (const table of ['notes', 'note_images', 'sessions']) {
      const [[{ count }]] = await pool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`, [user.id])
      assert.equal(count, 0, table)
    }
  })

  it('connecte par lien magique à usage unique', async () => {
    await signup()
    assert.equal((await call('GET', '/auth/config')).data.magicLink, true)
    await call('POST', '/auth/magic-link', { body: { email: 'a@example.com' } })
    const link = /https:\/\/\S+/.exec(sent[0].text)[0]
    assert.match(link, /\/editor\/auth\/#auth=magic:/)
    const magic = link.split('#auth=magic:')[1]
    // Un jeton de connexion ne vaut pas jeton de récupération.
    assert.equal((await call('POST', '/auth/verify', { body: { type: 'recovery', token: magic } })).status, 400)
    const session = await call('POST', '/auth/verify', { body: { type: 'magic', token: magic } })
    assert.equal(session.data.user.email, 'a@example.com')
    assert.equal((await call('POST', '/auth/verify', { body: { type: 'magic', token: magic } })).status, 400)
  })
})
