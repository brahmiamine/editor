'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { copy, type Language } from '../lib/i18n'
import { visibleNotes, type Note, type NoteFilter } from '../lib/notes'
import { useSession } from '../hooks/use-session'
import { useNotes } from '../hooks/use-notes'
import { DeleteNoteDialog } from '../components/delete-note-dialog'
import { NoteEditor } from '../components/note-editor'
import { NoteSidebar } from '../components/note-sidebar'
import { NotebookTools } from '../components/notebook-tools'
import { AccountDialog } from '../components/account-dialog'
import { OfflineApp } from '../components/offline-app'

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
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [focus, setFocus] = useState(false)
  const [settings, setSettings] = useState(false)
  const notes = visibleNotes(notebook.notes, filter, query)
  const current = notes.find(note => note.id === active) || notes[0]
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
  const add = () => { if (notebook.ready) { setActive(notebook.add()); setFilter('all'); setQuery(''); setDrawer(false) } }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); add() } }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut)
  }, [notebook.ready])
  const select = (id: string) => { setActive(id); setDrawer(false) }
  const signOut = () => { void notebook.flush().then(() => supabase?.auth.signOut()).catch(() => {}) }
  return <main className={`app ${theme} ${drawer ? 'drawer-open' : ''} ${focus ? 'focus-mode' : ''}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ '--sidebar': sidebar + 'px' } as React.CSSProperties}>
    <NoteSidebar notes={notes} active={current?.id} select={select} query={query} search={setQuery} add={add} remove={note => { if (notebook.ready) setDeleting(note) }} t={copy[lang]} lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} width={sidebar} setWidth={setSidebar} email={session?.user.email} signOut={signOut} status={notebook.status} error={notebook.error} retry={notebook.retry} ready={notebook.ready} filter={filter} setFilter={setFilter} change={notebook.change} reorder={notebook.reorder} userId={session?.user.id} restore={id => { notebook.restore(id); setFilter('all'); setActive(id) }} settings={() => setSettings(true)} tools={<><NotebookTools book={notebook.book} userId={session?.user.id} lang={lang} importNotes={notebook.import} ready={notebook.ready} /><OfflineApp lang={lang} /></>} />
    <button className="scrim" tabIndex={-1} aria-hidden="true" onClick={() => setDrawer(false)} />
    <NoteEditor note={current} t={copy[lang]} lang={lang} font={font} setFont={setFont} rich={rich} setRich={setRich} update={body => { if (current) notebook.update(current.id, body) }} add={add} openMenu={() => { setFocus(false); setDrawer(true) }} change={patch => { if (current) notebook.change(current.id, patch) }} userId={session?.user.id} focus={focus} setFocus={setFocus} readOnly={notebook.readOnly} />
    <DeleteNoteDialog note={deleting} lang={lang} cancel={() => setDeleting(undefined)} confirm={notebook.remove} />
    <AccountDialog userId={session?.user.id} email={session?.user.email} lang={lang} open={settings} close={() => setSettings(false)} />
  </main>
}
