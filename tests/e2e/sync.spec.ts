import { test, expect, type BrowserContext } from '@playwright/test'

test.use({ serviceWorkers: 'allow' })
// Only the remote HTTP boundary is doubled: the app's Auth, IndexedDB, guest transfer and sync queue remain real.
test('guest notes and images upload on login, retry conflicts and download on a fresh device', async ({ page, context, browser }, testInfo) => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const user = { id, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url'), 'signature'].join('.')
  const rows = new Map<string, Record<string, any>>()
  const images = new Map<string, Buffer>()
  let failWrites = false
  let offline = false
  async function boundary(ctx: BrowserContext) {
    await ctx.route('**/auth/v1/**', async route => {
      if (offline) { await route.abort('internetdisconnected'); return }
      const url = new URL(route.request().url())
      await route.fulfill({ json: url.pathname.endsWith('/token') ? { access_token: jwt, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user } : user })
    })
    await ctx.route('**/rest/v1/notes**', async route => {
      const request = route.request(), url = new URL(request.url())
      const noteId = url.searchParams.get('id')?.replace(/^eq\./,'')
      if (request.method() === 'GET') { await route.fulfill({ json: [...rows.values()] }); return }
      if (failWrites) { await route.fulfill({ status: 503, json: { message: 'Temporary failure' } }); return }
      const row = request.postDataJSON()
      if (request.method() === 'POST') { if (rows.has(row.id)) { await route.fulfill({ status: 409, json: { code:'23505' } }); return } rows.set(row.id, { ...row, revision: 1 }); await route.fulfill({ json: { revision: 1 } }); return }
      if (request.method() === 'PATCH') {
        const current = noteId && rows.get(noteId)
        if (!current || url.searchParams.get('revision') !== 'eq.' + current.revision) { await route.fulfill({ body: '', status: 200 }); return }
        rows.set(row.id, { ...row, revision: current.revision + 1 }); await route.fulfill({ json: { revision: current.revision + 1 } }); return
      }
      await route.fulfill({ json: [] })
    })
    await ctx.route('**/storage/v1/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.pathname.includes('/object/list/')) { await route.fulfill({ json: [...images.keys()].map(name => ({ name:name.split('/').at(-1), created_at:new Date().toISOString() })) }); return }
      const path = url.pathname.split('/note-images/')[1]
      if (request.method() === 'POST') {
        if (images.has(path)) { await route.fulfill({ status:409, json:{ message:'Asset already exists', statusCode:'409' } }); return }
        let buffer = request.postDataBuffer()!
        if (request.headers()['content-type']?.startsWith('multipart/form-data')) {
          const form = await new Request('https://test.invalid', { method:'POST', headers:{ 'content-type':request.headers()['content-type'] }, body:Uint8Array.from(buffer).buffer }).formData()
          const file = [...form.values()].find(value => typeof value !== 'string') as File
          buffer = Buffer.from(await file.arrayBuffer())
        }
        images.set(path,buffer); await route.fulfill({ json:{ Key:path } }); return
      }
      if (request.method() === 'GET' && images.has(path)) { await route.fulfill({ body:images.get(path)!, contentType:'image/png' }); return }
      await route.fulfill({ status:404, json:{ message:'Not found' } })
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
  await expect(page.getByRole('button', { name:'Sauvegarder toutes les notes' })).toBeDisabled()
  await expect(page.locator('.note-row')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('textbox', { name:'Notes', exact:true })).toBeEmpty()
  await expect(page.locator('.note-row')).toHaveCount(1)
})
