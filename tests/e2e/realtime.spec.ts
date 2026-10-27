import { test, expect, type WebSocketRoute } from '@playwright/test'

// Only the HTTP API and the Socket.io server are doubled: both tabs run the real app, IndexedDB and sync queue.
test('two tabs of the same account both edit and see each other\'s changes', async ({ context }) => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user = { id, email: 'test@example.invalid' }
  const rows = new Map<string, Record<string, any>>([[id, { id, title: 'First', body: 'First', color: '#e9b949', metadata: {}, revision: 1, updated_at: new Date(1000).toISOString() }]])
  const sockets = new Map<string, WebSocketRoute>()
  await context.addInitScript(session => localStorage.setItem('papertrail-session', JSON.stringify(session)), { token: 'test-token', user })
  await context.routeWebSocket('**/api/socket.io/**', ws => {
    const sid = 'sid' + sockets.size
    sockets.set(sid, ws)
    ws.send(JSON.stringify({ sid, upgrades: [], pingInterval: 600000, pingTimeout: 600000 }).replace(/^/, '0'))
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
    const row = request.postDataJSON(), current = rows.get(key)
    if (method !== 'PUT' || !current || row.revision !== current.revision) return reply(409, { error: 'conflict' })
    rows.set(key, { ...row, id: key, revision: current.revision + 1 })
    // Like the API: every other connection of the account is told, the sender is not.
    const sender = request.headers()['x-socket-id']
    for (const [sid, ws] of sockets) if (sid !== sender) ws.send('42["notes"]')
    return reply(200, { revision: current.revision + 1 })
  })
  const [first, second] = [await context.newPage(), await context.newPage()]
  for (const page of [first, second]) {
    await page.goto('notes/')
    await expect(page.locator('.sync')).toHaveText('Synchronisé')
    await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('First')
  }
  expect(sockets.size).toBe(2)
  await first.getByRole('textbox', { name: 'Notes', exact: true }).fill('First, edited in the first tab')
  await expect(second.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('First, edited in the first tab')
  expect(rows.get(id)!.revision).toBe(2)
  await second.getByRole('textbox', { name: 'Notes', exact: true }).fill('First, then edited in the second tab')
  await expect(first.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('First, then edited in the second tab')
  expect(rows.get(id)!.revision).toBe(3)
})
