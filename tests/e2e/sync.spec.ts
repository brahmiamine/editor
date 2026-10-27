import { test, expect, type BrowserContext } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })
// Only the remote HTTP boundary is doubled: the app's Auth, IndexedDB, guest transfer and sync queue remain real.
test('guest notes and images upload on login, retry conflicts and download on a fresh device', async ({ page, context, browser }, testInfo) => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const user = { id, email: 'test@example.invalid' }
  const rows = new Map<string, Record<string, any>>()
  const images = new Map<string, Buffer>()
  let failWrites = false
  let offline = false
  const api = '**/papertrail.clubika.com/**'
  async function boundary(ctx: BrowserContext) {
    await ctx.route(api, async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
      const reply = (status: number, json?: unknown) => route.fulfill({ status, headers: cors, ...(json === undefined ? {} : { json }) })
      if (method === 'OPTIONS') { await reply(204); return }
      if (offline) { await route.abort('internetdisconnected'); return }
      const [resource, key] = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean)
      if (resource === 'auth') {
        if (key === 'config') await reply(200, { emailEnabled: false, magicLink: false })
        else if (key === 'login') await reply(200, { token: 'test-token', user })
        else if (key === 'user') await reply(200, { user })
        else await reply(204)
        return
      }
      if (resource === 'notes') {
        if (method === 'GET') { await reply(200, url.searchParams.get('offset') === '0' || !url.searchParams.get('offset') ? [...rows.values()] : []); return }
        if (failWrites) { await reply(503, { message: 'Temporary failure' }); return }
        if (method === 'POST') {
          const row = request.postDataJSON()
          if (rows.has(row.id)) { await reply(409, { error: 'conflict' }); return }
          rows.set(row.id, { ...row, revision: 1 }); await reply(201, { revision: 1 }); return
        }
        if (method === 'PUT') {
          const row = request.postDataJSON(), current = rows.get(key)
          if (!current || row.revision !== current.revision) { await reply(409, { error: 'conflict' }); return }
          const { revision, ...fields } = row
          rows.set(key, { ...fields, id: key, revision: current.revision + 1 }); await reply(200, { revision: current.revision + 1 }); return
        }
        await reply(204); return
      }
      if (resource === 'images') {
        if (method === 'PUT') {
          if (images.has(key)) { await reply(409, { error: 'conflict' }); return }
          images.set(key, request.postDataBuffer()!); await reply(201, { id: key }); return
        }
        if (method === 'GET' && images.has(key)) { await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: images.get(key)! }); return }
        await reply(404, { error: 'not_found' }); return
      }
      await reply(404, { error: 'not_found' })
    })
  }
  await boundary(context)
  await page.goto('auth/')
  await page.evaluate(() => localStorage.setItem('papertrail-notes',JSON.stringify([{ id:'legacy-offline-note', body:'Legacy offline content', updated:1, color:'#e9b949' }])))
  const legacyGate = await context.newPage()
  await legacyGate.goto('')
  await legacyGate.evaluate(() => new Promise<void>(resolve => {
    void navigator.locks.request('papertrail:papertrail-notes', async () => {
      resolve()
      await new Promise<void>(release => { (window as any).releaseLegacyLock = release })
    })
  }))
  try {
    await page.getByRole('textbox', { name:'Email', exact:true }).fill('test@example.invalid')
    await page.getByRole('textbox', { name:'Mot de passe', exact:true }).fill('TestPassword123!')
    await page.getByRole('button', { name:'Connexion', exact:true }).click()
    await expect(page.locator('.sync')).toHaveText('Synchronisé')
    expect([...rows.values()].some(row => row.body === 'Legacy offline content')).toBe(false)
    await legacyGate.evaluate(() => (window as any).releaseLegacyLock())
    await expect.poll(() => legacyGate.evaluate(async () => (await navigator.locks.query()).held?.some(lock => lock.name === 'papertrail:papertrail-notes'))).toBe(false)
    await page.getByRole('textbox', { name:'Notes', exact:true }).fill('Existing account note')
    await expect(page.locator('.sync')).toHaveText('Synchronisé')
    expect([...rows.values()].some(row => row.body === 'Legacy offline content')).toBe(true)
    await page.getByRole('button', { name:'Déconnexion : test@example.invalid' }).click()
    await expect(page.locator('.sync')).toHaveText('Enregistré sur cet appareil')
    rows.clear() // Remote test records are removed while signed out; old cached records must not resurrect.
  } finally { await legacyGate.close() }
  await page.goto('notes/')
  const editor = page.getByRole('textbox', { name: 'Notes', exact: true })
  await editor.fill('Note invitée A')
  await page.getByRole('button', { name:'Mise en forme', exact:true }).click()
  await page.getByRole('button', { name:'Image', exact:true }).click()
  await page.locator('.toolbar input[type=file]').setInputFiles({ name:'pixel.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
  await expect(page.locator('.rich img')).toBeVisible()
  await page.getByRole('button', { name: 'Nouvelle note', exact: true }).first().click()
  await editor.fill('Note invitée B')
  await expect(page.locator('.sync')).toHaveText('Enregistré sur cet appareil')
  await page.goto('auth/')
  // Hold a real IndexedDB transaction so account loading is still pending when the user signs out.
  const gate = await context.newPage()
  await gate.goto('')
  await gate.evaluate(() => new Promise<void>(resolve => {
    const request = indexedDB.open('papertrail',1)
    request.onsuccess = () => {
      const tx = request.result.transaction('books','readwrite'), store = tx.objectStore('books')
      let released = false, ready = false
      ;(window as any).releaseDbGate = () => { released = true }
      const pulse = () => { const read = store.get('__test_gate__'); read.onsuccess = () => { if (!ready) { ready = true; resolve() } if (!released) pulse() } }
      pulse()
    }
  }))
  try {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.invalid')
    await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('TestPassword123!')
    await page.getByRole('button', { name: 'Connexion', exact: true }).click()
    await page.getByRole('button', { name:'Déconnexion : test@example.invalid' }).click()
    await gate.evaluate(() => (window as any).releaseDbGate())
    await expect(page.locator('.sync')).toHaveText('Enregistré sur cet appareil')
    await expect(page.locator('.note-row')).toHaveCount(2)
    expect(rows.size).toBe(0)
  } finally { await gate.close() }
  await page.goto('auth/')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('test@example.invalid')
  await page.getByRole('textbox', { name: 'Mot de passe', exact: true }).fill('TestPassword123!')
  await page.getByRole('button', { name: 'Connexion', exact: true }).click()
  await expect(page.locator('.sync')).toHaveText('Synchronisé')
  expect([...rows.values()].map(row => row.body.split('\n')[0]).sort()).toEqual(['Note invitée A','Note invitée B'])
  expect(images.size).toBe(1)
  failWrites = true
  await editor.fill('Modification hors service')
  await expect(page.locator('.sync')).toHaveText('Sauvegarde impossible. Gardez la page ouverte et réessayez.')
  failWrites = false
  const remote = [...rows.values()].find(row => row.body === 'Note invitée B')!
  rows.set(remote.id, { ...remote, body: 'Modification autre appareil', title: 'Modification autre appareil', revision: remote.revision + 1 })
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.sync')).toHaveText('Synchronisé')
  expect([...rows.values()].map(row => row.body.split('\n')[0]).sort()).toEqual(['Modification autre appareil','Modification hors service','Note invitée A'])
  await expect(page.locator('.note-row')).toHaveCount(3)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.clock.setFixedTime(Date.now() + 2 * 3600000)
  offline = true
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.note-row')).toHaveCount(3)
  await expect(page.locator('.sync')).toHaveText('Hors connexion — enregistré sur cet appareil')
  offline = false
  await context.setOffline(false)
  await page.clock.setFixedTime(Date.now())
  await page.reload()
  await expect(page.locator('.sync')).toHaveText('Synchronisé')
  await expect(page.locator('.note-row')).toHaveCount(3)
  const device = await browser.newContext({ baseURL:testInfo.project.use.baseURL, serviceWorkers:'block' })
  try {
    await boundary(device)
    const second = await device.newPage()
    await second.goto('auth/')
    await second.getByRole('textbox', { name:'Email', exact:true }).fill('test@example.invalid')
    await second.getByRole('textbox', { name:'Mot de passe', exact:true }).fill('TestPassword123!')
    await second.getByRole('button', { name:'Connexion', exact:true }).click()
    await expect(second.locator('.sync')).toHaveText('Synchronisé')
    await expect(second.locator('.note-row')).toHaveCount(3)
    await second.locator('.note-item').filter({ hasText:'Note invitée A' }).click()
    await second.getByRole('button', { name:'Mise en forme', exact:true }).click()
    await expect.poll(() => second.locator('.rich img').evaluate((img:HTMLImageElement) => img.naturalWidth)).toBe(1)
  } finally { await device.close() }
  await page.evaluate(() => {
    const get = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function(key: IDBValidKey | IDBKeyRange) { if (this.name === 'books' && key === 'papertrail-notes') throw new DOMException('Test guest load failure','UnknownError'); return get.call(this,key) }
  })
  await page.getByRole('button', { name:'Déconnexion : test@example.invalid' }).click()
  await expect(page.locator('.sync')).toContainText('Sauvegarde impossible')
  await page.getByRole('button', { name: 'Paramètres du compte' }).click()
  await expect(page.getByRole('button', { name:'Sauvegarder toutes les notes' })).toBeDisabled()
  await expect(page.locator('.note-row')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('textbox', { name:'Notes', exact:true })).toBeEmpty()
  await expect(page.locator('.note-row')).toHaveCount(1)
})
