'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { copy, type Language } from '../lib/i18n'
import type { Note } from '../lib/notes'
import { useSession } from '../hooks/use-session'
import { useNotes } from '../hooks/use-notes'
import { DeleteNoteDialog } from '../components/delete-note-dialog'
import { NoteEditor } from '../components/note-editor'
import { NoteSidebar } from '../components/note-sidebar'

export default function Notes() {
  const { session, ready } = useSession()
  const notebook = useNotes(session?.user.id, ready)
  const [active, setActive] = useState('')
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState('paper')
  const [lang, setLang] = useState<Language>('fr')
  const [font, setFont] = useState(18)
  const [rich, setRich] = useState(false)
  const [sidebar, setSidebar] = useState(272)
  const [drawer, setDrawer] = useState(false)
  const [deleting, setDeleting] = useState<Note>()
  const [preferencesReady, setPreferencesReady] = useState(false)
  const current = notebook.notes.find(note => note.id === active) || notebook.notes[0]
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('papertrail-preferences') || '{}')
      if (['paper', 'night', 'sun'].includes(saved.theme)) setTheme(saved.theme)
      if (['fr', 'en', 'ar'].includes(saved.lang)) setLang(saved.lang)
      if (saved.font >= 14 && saved.font <= 48) setFont(saved.font)
      if (saved.rich === true) setRich(true)
    } catch {}
    setPreferencesReady(true)
  }, [])
  useEffect(() => {
    if (preferencesReady) try { localStorage.setItem('papertrail-preferences', JSON.stringify({ theme, lang, font, rich })) } catch {}
    document.documentElement.lang = lang
  }, [theme, lang, font, rich, preferencesReady])
  const add = () => { if (notebook.ready) { setActive(notebook.add()); setQuery(''); setDrawer(false) } }
  const select = (id: string) => { setActive(id); setDrawer(false) }
  return <main className={`app ${theme} ${drawer ? 'drawer-open' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ '--sidebar': sidebar + 'px' } as React.CSSProperties}>
    <NoteSidebar notes={notebook.notes} active={current?.id} select={select} query={query} search={setQuery} add={add} remove={setDeleting} t={copy[lang]} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} width={sidebar} setWidth={setSidebar} email={session?.user.email} signOut={() => { void supabase?.auth.signOut() }} status={notebook.status} retry={notebook.retry} ready={notebook.ready} />
    <button className="scrim" tabIndex={-1} aria-hidden="true" onClick={() => setDrawer(false)} />
    <NoteEditor note={current} t={copy[lang]} lang={lang} font={font} setFont={setFont} rich={rich} setRich={setRich} update={body => { if (current) notebook.update(current.id, body) }} add={add} remove={() => setDeleting(current)} openMenu={() => setDrawer(true)} />
    <DeleteNoteDialog note={deleting} lang={lang} cancel={() => setDeleting(undefined)} confirm={notebook.remove} />
  </main>
}
