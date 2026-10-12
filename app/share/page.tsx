'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { RichView } from '../components/rich-view'
import { featureCopy, type Language } from '../lib/i18n'

export default function SharedNote() {
  const [body, setBody] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [lang, setLang] = useState<Language>('fr')
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('papertrail-preferences') || '{}'); if (['fr','en','ar'].includes(saved.lang)) setLang(saved.lang) } catch {}
    const token = location.hash.slice(1)
    if (!supabase || !/^[0-9a-f-]{72}$/i.test(token)) { setFailed(true); return }
    let cancelled = false
    void supabase.functions.invoke('papertrail-share', { body: { token } }).then(({ data, error }) => { if (!cancelled) { if (error || typeof data?.body !== 'string') setFailed(true); else setBody(data.body) } })
    return () => { cancelled = true }
  }, [])
  return <main className="shared-note" dir={lang === 'ar' ? 'rtl' : 'ltr'}><Link href="/notes/">papertrail</Link>{failed ? <p role="alert">{featureCopy[lang].emptyShared}</p> : body === undefined ? <p role="status">{featureCopy[lang].loading}</p> : <RichView markdown={body} editable={false} font={18} label={featureCopy[lang].share} lang={lang} />}</main>
}
