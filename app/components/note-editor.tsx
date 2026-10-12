import { useEffect, useRef, useState } from 'react'
import { exportNote, formatText, wordCount, type Note } from '../lib/notes'
import { looksLikeMarkdown, parseJson } from '../lib/markdown'
import type { copy, Language } from '../lib/i18n'
import { FormatToolbar } from './format-toolbar'
import { RichView } from './rich-view'
type Props = { note?: Note; t: typeof copy.fr; lang: Language; font: number; setFont: (size: number) => void; rich: boolean; setRich: (rich: boolean) => void; update: (body: string) => void; add: () => void; remove: () => void; openMenu: () => void }
type View = { id: string; mode: 'edit' | 'preview'; flat: boolean }

function ago(time: number, now: number, lang: Language) {
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' })
  const seconds = Math.round((time - now) / 1000)
  if (Math.abs(seconds) < 60) return format.format(0, 'second')
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86400), 'day')
}

export function NoteEditor({ note, t, lang, font, setFont, rich, setRich, update, add, remove, openMenu }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [more, setMore] = useState(false)
  const [chosen, setChosen] = useState<View>()
  const title = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLElement | null>(null)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  useEffect(() => setNow(Date.now()), [note?.updated])
  const text = note?.body ?? ''
  const json = !!parseJson(text)
  const markdown = looksLikeMarkdown(text)
  // A note that is JSON when opened starts as a block with a copy button; the choice then stays until toggled.
  useEffect(() => { if (note) setChosen({ id: note.id, mode: parseJson(note.body) ? 'preview' : 'edit', flat: !!parseJson(note.body) }) }, [note?.id])
  const view: View = chosen && chosen.id === note?.id ? chosen : { id: note?.id ?? '', mode: json ? 'preview' : 'edit', flat: json }
  const preview = view.mode === 'preview'
  // "flat" notes are edited as a single JSON document without a separate title line.
  const flat = preview ? json : view.flat
  function download(extension: 'txt' | 'md') {
    if (!note) return
    const url = URL.createObjectURL(new Blob([exportNote(note, extension)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${note.title.replace(/[<>:"/\\|?*]/g, '_') || 'note'}.${extension}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  // The first line of the body is edited as the note title, the rest as its text.
  const split = text.indexOf('\n')
  const head = split < 0 ? text : text.slice(0, split)
  const rest = split < 0 ? '' : text.slice(split + 1)
  const content = flat ? text : rest
  const setContent = (value: string) => update(flat ? value : head + '\n' + value)
  const action = (run: () => void) => () => { setMore(false); run() }
  const toggleView = () => note && setChosen({ id: note.id, mode: preview ? 'edit' : 'preview', flat: json })
  const focusBody = () => { area.current?.focus(); if (area.current instanceof HTMLTextAreaElement) area.current.setSelectionRange(0, 0) }
  return <section className="editor">
    <header>
      <button className="menu-btn" onClick={openMenu} aria-label={t.menu}>☰</button>
      <div className="crumb">{t.all} <span>›</span> {note?.body.trim() ? note.title : t.untitled}</div>
      <button className="more-btn" disabled={!note} onClick={() => setMore(value => !value)} aria-expanded={more} aria-label={t.more}>⋯</button>
      <div className={`actions ${more ? 'open' : ''}`}>
        <button disabled={!note} onClick={action(() => download('md'))} aria-label="Export Markdown">↓ .md</button>
        <button disabled={!note} onClick={action(() => download('txt'))} aria-label="Export text">↓ .txt</button>
        <button disabled={!note} className={rich ? 'on' : ''} aria-pressed={rich} aria-label={t.richMode} title={t.richMode} onClick={action(() => setRich(!rich))}>≡</button>
        <button disabled={!note} className="danger" aria-label={t.delete} title={t.delete} onClick={action(remove)}>⌫</button>
      </div>
    </header>
    {note ? <>
      {rich && !preview && !flat && <FormatToolbar t={t} tidy={() => update(formatText(note.body))} />}
      <div className="page" key={note.id}>
        {!flat && <input ref={title} className="title" autoFocus={!note.body} aria-label={t.untitled} placeholder={t.untitled} value={head}
          onChange={event => update(rest || split >= 0 ? event.target.value + '\n' + rest : event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); focusBody() } }} />}
        <div className="meta"><span>{t.modified} {ago(note.updated, now, lang)}</span>
          {(json || markdown || preview) && <span className="detect">{json ? t.json : markdown ? t.markdown : ''}<button onClick={toggleView}>{preview ? t.edit : t.preview}</button></span>}</div>
        {preview ? <RichView markdown={content} editable={false} font={font} label={t.preview} />
          : rich && !flat ? <RichView markdown={content} editable font={font} onChange={setContent} innerRef={area} label={t.notes} />
          : <textarea ref={area as React.RefObject<HTMLTextAreaElement>} autoFocus={!!note.body || flat} className={`body ${flat ? 'mono' : ''}`} aria-label={t.notes} style={{ fontSize: font }} value={content} placeholder={t.start}
            onChange={event => setContent(event.target.value)}
            onKeyDown={event => { const el = event.currentTarget; if (!flat && event.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) { event.preventDefault(); title.current?.focus() } }} />}
      </div>
      <footer><span>{wordCount(note.body)} {t.words} <em>·</em> {Array.from(note.body).length} {t.chars}</span>
        <span><button className="clear" onClick={() => update('')}>{t.clear}</button><label>A <input aria-label="Text size" type="range" min="14" max="48" step="1" value={font} onChange={event => setFont(Math.max(14, Math.min(48, event.target.valueAsNumber)))} /> {font}</label></span>
      </footer></> : <div className="empty editor-empty"><button onClick={add}>{t.newNote}</button></div>}
    <button className="fab" onClick={add} aria-label={t.newNote}>＋</button>
  </section>
}
