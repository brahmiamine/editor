'use client'
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)
  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setReady(true) })
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    return () => subscription.unsubscribe()
  }, [])
  return { session, ready }
}
