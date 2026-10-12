'use client'
import { useEffect, useState } from 'react'
import { basePath } from '../supabase'
import { featureCopy, type Language } from '../lib/i18n'
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function OfflineApp({ lang }: { lang: Language }) {
  const [install, setInstall] = useState<InstallEvent>()
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) void navigator.serviceWorker.register(basePath + '/sw.js', { scope: basePath + '/' }).catch(() => {})
    const offer = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent) }
    window.addEventListener('beforeinstallprompt', offer)
    return () => window.removeEventListener('beforeinstallprompt', offer)
  }, [])
  return install ? <button onClick={() => { void install.prompt().then(() => install.userChoice).then(() => setInstall(undefined)) }}>{featureCopy[lang].install}</button> : null
}
