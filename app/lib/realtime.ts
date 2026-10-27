import { io } from 'socket.io-client'
import { apiUrl, cachedSession, live } from '../api'

/**
 * Appelle `onChange` quand le même compte a modifié des notes ailleurs : un autre appareil (Socket.io) ou un autre onglet
 * du même navigateur (BroadcastChannel, qui continue de fonctionner si le WebSocket est bloqué), puis au retour sur l'onglet.
 * `announce()` prévient les autres onglets du navigateur qu'une écriture vient d'aboutir.
 */
export function listenRemoteChanges(userId: string, onChange: () => void) {
  const url = new URL(apiUrl, location.href)
  const socket = io(url.origin, { path: url.pathname.replace(/\/$/, '') + '/socket.io', transports: ['websocket'], auth: cb => cb({ token: cachedSession()?.token }) })
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('papertrail-sync:' + userId)
  const visible = () => { if (document.visibilityState === 'visible') onChange() }
  socket.on('connect', () => { live.socketId = socket.id })
  socket.on('disconnect', () => { live.socketId = undefined })
  socket.on('notes', onChange)
  socket.io.on('reconnect', onChange)
  if (channel) channel.onmessage = onChange
  document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible)
  return {
    announce: () => channel?.postMessage(1),
    stop: () => { live.socketId = undefined; socket.close(); channel?.close(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible) },
  }
}
