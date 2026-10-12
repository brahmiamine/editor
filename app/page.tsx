'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { copy, type Language } from './lib/i18n'
import { useSession } from './hooks/use-session'
import { useNotes } from './hooks/use-notes'
import { NoteEditor } from './components/note-editor'
import { NoteSidebar } from './components/note-sidebar'

export default function Home() {
  const { session, ready } = useSession()
  const notebook = useNotes(session?.user.id, ready)
  const [active, setActive] = useState('')
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState('paper')
  const [lang, setLang] = useState<Language>('fr')
  const [font, setFont] = useState(18)
  const [sidebar, setSidebar] = useState(280)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const current = notebook.notes.find(note => note.id === active) || notebook.notes[0]
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('papertrail-preferences') || '{}')
      if (['paper', 'night', 'sun'].includes(saved.theme)) setTheme(saved.theme)
      if (['fr', 'en', 'ar'].includes(saved.lang)) setLang(saved.lang)
      if (saved.font >= 14 && saved.font <= 28) setFont(saved.font)
    } catch {}
    setPreferencesReady(true)
  }, [])
  useEffect(() => {
    if (preferencesReady) try { localStorage.setItem('papertrail-preferences', JSON.stringify({ theme, lang, font })) } catch {}
    document.documentElement.lang = lang
  }, [theme, lang, font, preferencesReady])
  const add = () => { setActive(notebook.add()); setQuery('') }
  return <main className={`app ${theme}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ '--sidebar': sidebar + 'px' } as React.CSSProperties}>
    <NoteSidebar notes={notebook.notes} active={current?.id} select={setActive} query={query} search={setQuery} add={add} t={copy[lang]} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} width={sidebar} setWidth={setSidebar} email={session?.user.email} signOut={() => { void supabase?.auth.signOut() }} status={notebook.status} retry={notebook.retry} ready={notebook.ready} />
    <NoteEditor note={current} t={copy[lang]} font={font} setFont={setFont} update={body => { if (current) notebook.update(current.id, body) }} remove={() => { if (current) notebook.remove(current.id) }} add={add} />
  </main>
}
