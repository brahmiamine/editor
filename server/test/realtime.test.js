// Sans base de données : l'authentification est simulée, seul le routage des événements est testé.
import { after, before, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { io as connect } from 'socket.io-client'
import { attachRealtime } from '../src/realtime.js'

const users = { tokenA: { id: 'a' }, tokenA2: { id: 'a' }, tokenB: { id: 'b' } }
let server, url, notify
const sockets = []

const open = (token) => new Promise((resolve, reject) => {
  const socket = connect(url, { path: '/api/socket.io', transports: ['websocket'], auth: { token }, reconnection: false })
  sockets.push(socket)
  socket.on('connect', () => resolve(socket))
  socket.on('connect_error', reject)
})
const heard = (socket) => { const events = []; socket.on('notes', () => events.push(1)); return events }
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

before(async () => {
  server = createServer()
  const auth = { currentUser: async (req) => users[req.headers.authorization.slice(7)] || null }
  notify = attachRealtime(server, { auth, origins: [] })
  await new Promise((resolve) => server.listen(0, resolve))
  url = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  sockets.forEach((socket) => socket.close())
  await new Promise((resolve) => server.close(resolve))
})

it('refuse une connexion sans session valide', async () => {
  await assert.rejects(open('inconnu'), /unauthorized/)
})

it('prévient les autres onglets du même utilisateur, pas l\'émetteur ni les autres comptes', async () => {
  const [first, second, other] = await Promise.all([open('tokenA'), open('tokenA2'), open('tokenB')])
  const [onFirst, onSecond, onOther] = [first, second, other].map(heard)
  notify('a', first.id)
  await settle()
  assert.deepEqual([onFirst.length, onSecond.length, onOther.length], [0, 1, 0])
  notify('a')
  await settle()
  assert.deepEqual([onFirst.length, onSecond.length, onOther.length], [1, 2, 0])
})
