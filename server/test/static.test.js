// Le conteneur sert aussi le site compilé : fichiers statiques à la racine, API sous /api.
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'

describe('service du site compilé', () => {
  let parent
  let dir
  let server
  let base

  before(async () => {
    parent = await mkdtemp(join(tmpdir(), 'site-'))
    dir = join(parent, 'site')
    await mkdir(dir)
    await mkdir(join(dir, 'assets'))
    await mkdir(join(dir, 'notes'))
    await writeFile(join(dir, 'index.html'), '<h1>accueil</h1>')
    await writeFile(join(dir, 'notes', 'index.html'), '<h1>notes</h1>')
    await writeFile(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)')
    await writeFile(join(dir, '404.html'), '<h1>perdu</h1>')
    await writeFile(join(parent, 'secret.txt'), 'secret')
    const pool = { query: async () => [[{ 1: 1 }]] }
    server = createApp({ pool, env: { STATIC_DIR: dir }, logger: { error() {} } })
    await new Promise((resolve) => server.listen(0, resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(parent, { recursive: true, force: true })
  })

  const get = (path) => fetch(base + path, { redirect: 'manual' })

  it('sert la page d’accueil, les dossiers et les fichiers avec le bon type', async () => {
    const home = await get('/')
    assert.equal(home.status, 200)
    assert.match(home.headers.get('content-type'), /text\/html/)
    assert.equal(await home.text(), '<h1>accueil</h1>')
    assert.equal(await (await get('/notes/')).text(), '<h1>notes</h1>')
    const script = await get('/assets/app-abc123.js')
    assert.match(script.headers.get('content-type'), /javascript/)
    assert.match(script.headers.get('cache-control'), /immutable/)
    assert.equal(home.headers.get('cache-control'), 'no-cache')
    assert.equal(home.headers.get('x-frame-options'), 'DENY')
  })

  it('redirige un dossier sans barre finale', async () => {
    const response = await get('/notes')
    assert.equal(response.status, 308)
    assert.equal(response.headers.get('location'), '/notes/')
  })

  it('renvoie la page 404 et refuse de sortir du dossier', async () => {
    const missing = await get('/absent')
    assert.equal(missing.status, 404)
    assert.equal(await missing.text(), '<h1>perdu</h1>')
    for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%00']) {
      const response = await get(path)
      assert.ok([400, 404].includes(response.status), `${path} -> ${response.status}`)
      assert.ok(!(await response.text()).includes('secret'), path)
    }
  })

  it('garde l’API sous /api et ne l’expose pas à la racine', async () => {
    const health = await get('/api/health')
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true })
    assert.equal((await get('/health')).status, 404)
    const post = await fetch(base + '/', { method: 'POST' })
    assert.equal(post.status, 405)
  })
})
