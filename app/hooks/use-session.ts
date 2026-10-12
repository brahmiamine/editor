'use client'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authStorageKey, supabase } from '../supabase'
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let version = 0, cancelled = false
    const cached = (): Session | null => {
      try { const saved = JSON.parse(localStorage.getItem(authStorageKey) || 'null'); return typeof saved?.access_token === 'string' && typeof saved?.refresh_token === 'string' && typeof saved?.user?.id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(saved.user.id) ? saved : null } catch { return null }
    }
    const load = () => {
      const current = ++version
      if (!navigator.onLine) { setSession(cached()); setReady(true); return }
      void client.auth.getSession().then(({ data }) => { if (!cancelled && current === version) { setSession(data.session); setReady(true) } }).catch(() => { if (!cancelled && current === version) { if (!navigator.onLine) setSession(cached()); setReady(true) } })
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (cancelled) return
      version++
      // The cached identity unlocks only its local notebook offline; RLS still validates every server operation.
      setSession(!navigator.onLine && event !== 'SIGNED_OUT' && !next ? cached() : next); setReady(true)
    })
    load()
    window.addEventListener('online',load); window.addEventListener('offline',load)
    return () => { cancelled = true; version++; subscription.unsubscribe(); window.removeEventListener('online',load); window.removeEventListener('offline',load) }
  }, [])
  return { session, ready }
}
