import { test, expect, type WebSocketRoute } from '@playwright/test'

// Only the HTTP API and the Socket.io server are doubled: both tabs run the real app, IndexedDB and sync queue.
for (const socketWorks of [true, false]) {
  test(`two tabs of the same account mirror every action (${socketWorks ? 'Socket.io' : 'WebSocket blocked, same-browser fallback'})`, async ({ context }) => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user = { id, email: 'test@example.invalid' }
    const rows = new Map<string, Record<string, any>>([[id, { id, title: 'First', body: 'First', color: '#e9b949', metadata: { created: 1000 }, revision: 1, updated_at: new Date(1000).toISOString() }]])
    const sockets = new Map<string, WebSocketRoute>()
    await context.addInitScript(session => localStorage.setItem('papertrail-session', JSON.stringify(session)), { token: 'test-token', user })
    await context.routeWebSocket('**/api/socket.io/**', ws => {
      if (!socketWorks) { ws.close(); return }
      const sid = 'sid' + sockets.size
      sockets.set(sid, ws)
      ws.send('0' + JSON.stringify({ sid, upgrades: [], pingInterval: 600000, pingTimeout: 600000 }))
      ws.onMessage(message => { if (String(message).startsWith('40')) ws.send('40' + JSON.stringify({ sid })) })
    })
    await context.route('**/papertrail.clubika.com/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': '*' }
      const reply = (status: number, json?: unknown) => route.fulfill({ status, headers: cors, ...(json === undefined ? {} : { json }) })
      if (method === 'OPTIONS') return reply(204)
      const [resource, key] = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean)
      if (resource === 'auth') return key === 'user' ? reply(200, { user }) : reply(204)
      if (resource !== 'notes') return reply(404, { error: 'not_found' })
      if (method === 'GET') return reply(200, url.searchParams.get('offset') === '0' ? [...rows.values()] : [])
      const current = rows.get(key)
      // Like the API: every other connection of the account is told, the sender is not.
      const changed = () => { const sender = request.headers()['x-socket-id']; for (const [sid, ws] of sockets) if (sid !== sender) ws.send('42["notes"]') }
      if (method === 'POST') {
        const row = request.postDataJSON()
        if (rows.has(row.id)) return reply(409, { error: 'conflict' })
        rows.set(row.id, { ...row, revision: 1 }); changed(); return reply(201, { revision: 1 })
      }
      if (method === 'DELETE') { rows.delete(key); changed(); return reply(204) }
      const row = request.postDataJSON()
      if (!current || row.revision !== current.revision) return reply(409, { error: 'conflict' })
      rows.set(key, { ...row, id: key, revision: current.revision + 1 }); changed()
      return reply(200, { revision: current.revision + 1 })
    })
    const [a, b] = [await context.newPage(), await context.newPage()]
    for (const page of [a, b]) {
      await page.goto('notes/')
      await expect(page.locator('.sync')).toHaveText('Synchronisé')
      await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('First')
    }
    const editor = (page: typeof a) => page.getByRole('textbox', { name: 'Notes', exact: true })

    // Text edited in one tab shows in the other, both ways.
    await editor(a).fill('First, edited in tab A')
    await expect(editor(b)).toHaveValue('First, edited in tab A')
    await editor(b).fill('First, edited in tab B')
    await expect(editor(a)).toHaveValue('First, edited in tab B')

    // A new note appears in the other tab.
    await a.getByRole('button', { name: 'Nouvelle note', exact: true }).first().click()
    await editor(a).fill('Second note')
    await expect(b.locator('.note-row')).toHaveCount(2)
    await expect(b.getByRole('button', { name: /Plus d’actions : Second note/ })).toBeVisible()

    // Pinning, then deleting (trash) in one tab, is mirrored.
    await b.getByRole('button', { name: /Plus d’actions : Second note/ }).click()
    await b.getByRole('menuitem', { name: 'Épingler', exact: true }).click()
    await expect.poll(() => rows.size && [...rows.values()].find(row => row.title === 'Second note')?.metadata.pinned).toBe(true)
    await a.getByRole('button', { name: /Plus d’actions : Second note/ }).click()
    await expect(a.getByRole('menuitem', { name: 'Désépingler', exact: true })).toBeVisible()
    await a.getByRole('menuitem', { name: 'Supprimer', exact: true }).click()
    await a.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(a.locator('.note-row')).toHaveCount(1)
    await expect(b.locator('.note-row')).toHaveCount(1)

    // Restoring from the trash of the other tab brings it back everywhere.
    await b.getByRole('button', { name: 'Corbeille', exact: true }).click()
    await b.getByRole('button', { name: 'Restaurer : Second note' }).click()
    await expect(a.locator('.note-row')).toHaveCount(2)
    await expect(b.locator('.note-row')).toHaveCount(2)

    // Writing then deleting straight away (before the first save) leaves both tabs on the same final state.
    await a.getByRole('button', { name: 'Nouvelle note', exact: true }).first().click()
    await editor(a).fill('Third note')
    await a.getByRole('button', { name: /Plus d’actions : Third note/ }).click()
    await a.getByRole('menuitem', { name: 'Supprimer', exact: true }).click()
    await a.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect.poll(() => [...rows.values()].find(row => row.title === 'Third note')?.metadata.trashedAt).toBeTruthy()
    await expect(a.locator('.note-row')).toHaveCount(2)
    await expect(b.locator('.note-row')).toHaveCount(2)
    await b.getByRole('button', { name: 'Corbeille', exact: true }).click()
    await expect(b.getByRole('button', { name: 'Restaurer : Third note' })).toBeVisible()
  })
}
