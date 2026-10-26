'use client'
import { useEffect, useState } from 'react'
import { apiUrl, auth, cachedSession, type Session } from '../api'
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!apiUrl)
  useEffect(() => {
    if (!apiUrl) return
    let version = 0, cancelled = false
    const load = () => {
      const current = ++version
      // The cached identity unlocks only its local notebook offline; the API still validates every server operation.
      if (!navigator.onLine) { setSession(cachedSession()); setReady(true); return }
      void auth.refresh().then(next => { if (!cancelled && current === version) { setSession(next); setReady(true) } }).catch(() => { if (!cancelled && current === version) { setSession(cachedSession()); setReady(true) } })
    }
    const unsubscribe = auth.onChange(next => { if (cancelled) return; version++; setSession(next); setReady(true) })
    load()
    window.addEventListener('online',load); window.addEventListener('offline',load)
    return () => { cancelled = true; version++; unsubscribe(); window.removeEventListener('online',load); window.removeEventListener('offline',load) }
  }, [])
  return { session, ready }
}
