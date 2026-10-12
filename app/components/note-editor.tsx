import { useEffect, useRef, useState } from 'react'
import { exportNote, formatText, wordCount, type Note } from '../lib/notes'
import type { copy, Language } from '../lib/i18n'
type Props = { note?: Note; t: typeof copy.fr; lang: Language; font: number; setFont: (size: number) => void; update: (body: string) => void; add: () => void; remove: () => void; openMenu: () => void }

function ago(time: number, now: number, lang: Language) {
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  const seconds = Math.round((time - now) / 1000)
  if (Math.abs(seconds) < 60) return format.format(0, 'second')
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86400), 'day')
}

export function NoteEditor({ note, t, lang, font, setFont, update, add, remove, openMenu }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [more, setMore] = useState(false)
  const title = useRef<HTMLInputElement>(null)
  const body = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => setNow(Date.now()), [note?.updated])
  function download(extension: 'txt' | 'md') {
    if (!note) return
    const url = URL.createObjectURL(new Blob([exportNote(note, extension)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${note.title.replace(/[<>:"/\\|?*]/g, '_') || 'note'}.${extension}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  // The first line of the body is edited as the note title, the rest as its text.
  const text = note?.body ?? ''
  const split = text.indexOf('\n')
  const head = split < 0 ? text : text.slice(0, split)
  const rest = split < 0 ? '' : text.slice(split + 1)
  const action = (run: () => void) => () => { setMore(false); run() }
  return <section className="editor">
    <header>
      <button className="menu-btn" onClick={openMenu} aria-label={t.menu}>☰</button>
      <div className="crumb">{t.all} <span>›</span> {note?.body.trim() ? note.title : t.untitled}</div>
      <button className="more-btn" disabled={!note} onClick={() => setMore(value => !value)} aria-expanded={more} aria-label={t.more}>⋯</button>
      <div className={`actions ${more ? 'open' : ''}`}>
        <button disabled={!note} onClick={action(() => download('md'))} aria-label="Export Markdown">↓ .md</button>
        <button disabled={!note} onClick={action(() => download('txt'))} aria-label="Export text">↓ .txt</button>
        <button disabled={!note} aria-label="Autoformat" title="Autoformat" onClick={action(() => { if (note) update(formatText(note.body)) })}>≡</button>
        <button disabled={!note} className="danger" aria-label={t.delete} title={t.delete} onClick={action(remove)}>⌫</button>
      </div>
    </header>
    {note ? <>
      <div className="page" key={note.id}>
        <input ref={title} className="title" autoFocus={!note.body} aria-label={t.untitled} placeholder={t.untitled} value={head}
          onChange={event => update(rest || split >= 0 ? event.target.value + '\n' + rest : event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); body.current?.focus(); body.current?.setSelectionRange(0, 0) } }} />
        <div className="meta">{t.modified} {ago(note.updated, now, lang)}</div>
        <textarea ref={body} autoFocus={!!note.body} className="body" aria-label={t.notes} style={{ fontSize: font }} value={rest} placeholder={t.start}
          onChange={event => update(head + '\n' + event.target.value)}
          onKeyDown={event => { const area = event.currentTarget; if (event.key === 'Backspace' && area.selectionStart === 0 && area.selectionEnd === 0) { event.preventDefault(); title.current?.focus() } }} />
      </div>
      <footer><span>{wordCount(note.body)} {t.words} <em>·</em> {Array.from(note.body).length} {t.chars}</span>
        <span><button className="clear" onClick={() => update('')}>{t.clear}</button><label>A <input aria-label="Text size" type="range" min="14" max="48" step="1" value={font} onChange={event => setFont(Math.max(14, Math.min(48, event.target.valueAsNumber)))} /> {font}</label></span>
      </footer></> : <div className="empty editor-empty"><button onClick={add}>{t.newNote}</button></div>}
    <button className="fab" onClick={add} aria-label={t.newNote}>＋</button>
  </section>
}
