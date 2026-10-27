import { io } from 'socket.io-client'
import { apiUrl, cachedSession, live } from '../api'

/** Appelle `onChange` quand un autre onglet ou appareil du même compte a modifié des notes (et après une reconnexion). */
export function listenRemoteChanges(onChange: () => void) {
  const url = new URL(apiUrl, location.href)
  const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', transports: ['websocket'], auth: cb => cb({ token: cachedSession()?.token }) })
  socket.on('connect', () => { live.socketId = socket.id })
  socket.on('disconnect', () => { live.socketId = undefined })
  socket.on('notes', onChange)
  socket.io.on('reconnect', onChange)
  return () => { live.socketId = undefined; socket.close() }
}
