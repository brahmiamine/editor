export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
// An empty NEXT_PUBLIC_API_URL disables accounts: the notebook then stays on this device only.
export const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'https://papertrail.clubika.com/api').replace(/\/+$/, '')
export const sessionKey = 'papertrail-session'
export type User = { id: string; email: string }
export type Session = { token: string; user: User }
export class ApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message) } }

const listeners = new Set<(session: Session | null) => void>()
export function cachedSession(): Session | null {
  try { const saved = JSON.parse(localStorage.getItem(sessionKey) || 'null'); return typeof saved?.token === 'string' && typeof saved?.user?.email === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved?.user?.id) ? saved : null } catch { return null }
}
function setSession(session: Session | null) {
  try { if (session) localStorage.setItem(sessionKey, JSON.stringify(session)); else localStorage.removeItem(sessionKey) } catch {}
  listeners.forEach(listener => listener(session))
}

export async function api<T = void>(method: string, path: string, body?: unknown, options: { blob?: boolean } = {}): Promise<T> {
  if (!apiUrl) throw new ApiError('notConfigured', 0, 'not_configured')
  const token = cachedSession()?.token
  const raw = body instanceof Blob
  const response = await fetch(apiUrl + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': raw ? body.type : 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) })
  if (!response.ok) {
    const details = await response.json().catch(() => ({}))
    // A revoked or expired session signs this device out; the local notebook stays readable.
    if (response.status === 401 && token && cachedSession()?.token === token) setSession(null)
    throw new ApiError(details.message || 'Request failed', response.status, details.error)
  }
  if (options.blob) return await response.blob() as T
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const auth = {
  onChange(listener: (session: Session | null) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  signIn: async (email: string, password: string) => setSession(await api<Session>('POST', '/auth/login', { email, password })),
  signUp: async (email: string, password: string) => setSession(await api<Session>('POST', '/auth/signup', { email, password })),
  async signOut() { try { await api('POST', '/auth/logout') } catch {} setSession(null) },
  forget: () => setSession(null),
  /** Confirms the stored session with the server; network failures keep the cached identity for offline use. */
  async refresh() { const current = cachedSession(); if (!current) return null; const { user } = await api<{ user: User }>('GET', '/auth/user'); const next = { ...current, user }; setSession(next); return next },
  config: () => api<{ emailEnabled: boolean; magicLink: boolean }>('GET', '/auth/config'),
  magicLink: (email: string) => api('POST', '/auth/magic-link', { email }),
  recover: (email: string) => api('POST', '/auth/recover', { email }),
  verify: async (type: 'magic' | 'recovery', token: string) => setSession(await api<Session>('POST', '/auth/verify', { type, token })),
  updatePassword: (password: string) => api('PUT', '/auth/password', { password }),
  deleteAccount: () => api('DELETE', '/auth/user?confirmation=DELETE'),
}
