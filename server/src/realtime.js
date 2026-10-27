import { Server } from 'socket.io'

/**
 * Socket.io : prévient les autres onglets/appareils d'un utilisateur qu'une note a changé.
 * Aucune donnée ne transite : le client relance sa synchronisation via l'API authentifiée.
 * Renvoie `notify(userId, exceptSocketId)`.
 */
export function attachRealtime(httpServer, { auth, origins }) {
  const io = new Server(httpServer, { path: '/api/socket.io', serveClient: false, cors: { origin: [...origins] } })
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    const user = typeof token === 'string' ? await auth.currentUser({ headers: { authorization: `Bearer ${token}` } }).catch(() => null) : null
    if (!user) return next(new Error('unauthorized'))
    socket.join(`user:${user.id}`)
    next()
  })
  // Les WebSockets ouverts empêcheraient server.close() d'aboutir à l'arrêt.
  const close = httpServer.close.bind(httpServer)
  httpServer.close = (callback) => { io.disconnectSockets(true); return close(callback) }
  return (userId, exceptSocketId) => {
    const room = io.to(`user:${userId}`)
    return (exceptSocketId ? room.except(exceptSocketId) : room).emit('notes')
  }
}
