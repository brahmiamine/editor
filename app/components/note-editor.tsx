import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Download, Ellipsis, Menu, PanelLeftClose, PanelLeftOpen, Pilcrow, Plus, Search, Type, X } from 'lucide-react'
import { downloadText, exportNote, formatText, noteTitle, wordCount, type Note, type changeNote } from '../lib/notes'
import { embedAttachments } from '../lib/attachments'
import { detectNoteJson } from '../lib/markdown'
import { featureCopy, type copy, type Language } from '../lib/i18n'
import { FormatToolbar } from './format-toolbar'
import { RichView } from './rich-view'
type Props = { note?: Note; t: typeof copy.fr; lang: Language; font: number; setFont: (size: number) => void; rich: boolean; setRich: (rich: boolean) => void; update: (body: string) => void; add: () => void; openMenu: () => void; change: (patch: Parameters<typeof changeNote>[2]) => void; userId?: string; focus: boolean; setFocus: (value: boolean) => void; readOnly: boolean }

export function NoteEditor({ note, t, lang, font, setFont, rich, setRich, update, add, openMenu, change, userId, focus, setFocus, readOnly }: Props) {
  const [more, setMore] = useState(false)
  const [preview, setPreview] = useState(false)
  const [codeNote, setCodeNote] = useState(false)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(0)
  const [failure, setFailure] = useState('')
  const [fontDraft, setFontDraft] = useState(String(font))
  const findInput = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLElement | null>(null)
  const f = featureCopy[lang]
  const text = note?.body ?? ''
  const json = detectNoteJson(text) !== null
  useEffect(() => { setFontDraft(String(font)) }, [font])
  useEffect(() => { setPreview(false); setCodeNote(detectNoteJson(note?.body || '') !== null); setQuery(''); setFinding(false); setFailure('') }, [note?.id])
  useEffect(() => { if (json) setCodeNote(true) }, [json])
  useEffect(() => {
    const root = area.current
    if (!preview && !note?.trashedAt && root) {
      root.focus()
      if (!(root instanceof HTMLTextAreaElement)) {
        // A range retained from the replaced textarea must not select the whole rich note.
        const range = document.createRange(); range.selectNodeContents(root); range.collapse(false)
        const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range)
      }
    }
  }, [note?.id, preview, rich])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setFinding(true); requestAnimationFrame(() => findInput.current?.focus()) }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setFocus(false); setFinding(false) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [setFocus])
  const matches: number[] = []
  if (query) { const source = text.toLocaleLowerCase(), search = query.toLocaleLowerCase(); let index = 0; while ((index = source.indexOf(search, index)) >= 0) { matches.push(index); index += Math.max(search.length, 1) } }
  function findNext(direction: number) {
    const root = area.current
    if (!root || !query) return
    if (root instanceof HTMLTextAreaElement) {
      const position = ((result + direction) % matches.length + matches.length) % matches.length
      if (!matches.length) return
      setResult(position); root.focus(); root.setSelectionRange(matches[position], matches[position] + query.length)
    } else {
      const nodes: Text[] = []; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) nodes.push(walker.currentNode as Text)
      const source = nodes.map(node => node.textContent).join('')
      const hits: number[] = []; let start = 0
      while ((start = source.toLocaleLowerCase().indexOf(query.toLocaleLowerCase(), start)) >= 0) { hits.push(start); start += query.length }
      if (!hits.length) return
      const position = ((result + direction) % hits.length + hits.length) % hits.length; setResult(position)
      let offset = 0; const range = document.createRange()
      for (const node of nodes) {
        const end = offset + node.length
        if (hits[position] >= offset && hits[position] < end) range.setStart(node, hits[position] - offset)
        if (hits[position] + query.length > offset && hits[position] + query.length <= end) { range.setEnd(node, hits[position] + query.length - offset); break }
        offset = end
      }
      root.focus(); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); range.startContainer.parentElement?.scrollIntoView({ block: 'nearest' })
    }
  }
  async function download(extension: 'txt' | 'md') {
    if (!note) return
    try { downloadText(await embedAttachments(exportNote(note, extension), userId), note.title.replace(/[<>:"/\\|?*]/g, '_') + '.' + extension) } catch { setFailure(f.failure) }
  }
  const readonly = !!note?.trashedAt || readOnly
  return <section className="editor">
    <header>
      <button className="menu-btn" onClick={openMenu} aria-label={t.menu}><Menu size={22} aria-hidden="true" /></button>
      <div className="crumb">{t.all} <ChevronRight size={13} aria-hidden="true" /> {note?.body.trim() || note?.heading?.trim() ? note.title : t.untitled}</div>
      {(json || preview) && <span className="detect">{json ? t.json : ''}<button onClick={() => setPreview(!preview)}>{preview ? t.edit : t.preview}</button></span>}
      <button className="more-btn" disabled={!note} onClick={() => setMore(!more)} aria-expanded={more} aria-label={t.more}><Ellipsis size={18} aria-hidden="true" /></button>
      <div className={`actions ${more ? 'open' : ''}`}>
        <button disabled={!note} onClick={() => void download('md')} aria-label=".md" title=".md"><Download size={15} aria-hidden="true" /> .md</button>
        <button disabled={!note} onClick={() => void download('txt')} aria-label=".txt" title=".txt"><Download size={15} aria-hidden="true" /> .txt</button>
        <button disabled={!note || readonly} aria-pressed={rich} title={t.richMode} aria-label={t.richMode} onClick={() => { setCodeNote(false); setRich(!rich) }}><Type size={16} aria-hidden="true" /></button>
        <button disabled={!note || readonly} aria-label={t.tidy} title={t.tidy} onClick={() => update(formatText(text))}><Pilcrow size={16} aria-hidden="true" /></button>
        <button className="sidebar-toggle" aria-pressed={focus} aria-label={focus ? f.exitFocus : f.focus} title={focus ? f.exitFocus : f.focus} onClick={() => setFocus(!focus)}>{focus ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}</button>
        <button disabled={!note} onClick={() => { setFinding(!finding); requestAnimationFrame(() => findInput.current?.focus()) }} aria-label={f.find}><Search size={16} aria-hidden="true" /></button>
      </div>
    </header>
    {note ? <>
      {note.conflictOf && <p role="status" className="conflict">{f.conflict}</p>}
      {finding && <div className="find-bar"><input ref={findInput} aria-label={f.find} placeholder={f.find} value={query} onChange={event => { setQuery(event.target.value); setResult(-1) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); findNext(event.shiftKey ? -1 : 1) } }} /><span>{matches.length} {f.matches}</span><button onClick={() => findNext(-1)}>{f.previous}</button><button onClick={() => findNext(1)}>{f.next}</button><button onClick={() => setFinding(false)} aria-label={t.close}><X size={15} aria-hidden="true" /></button></div>}
      {rich && !preview && !readonly && !json && !codeNote && <FormatToolbar t={t} lang={lang} editor={area} tidy={() => update(formatText(text))} />}
      {failure && <p role="alert">{failure}</p>}
      <input className="note-title" aria-label={f.title} placeholder={f.titlePlaceholder} value={note.heading ?? ''} maxLength={200} readOnly={readonly} onChange={event => change({ heading: event.target.value, title: noteTitle(event.target.value, note.body) })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); area.current?.focus() } }} />
      <div className="page" key={note.id + ':' + preview + ':' + rich}>
        {preview || readonly ? <RichView markdown={text} editable={false} font={font} label={t.preview} lang={lang} userId={userId} innerRef={area} />
          : rich && !json && !codeNote ? <RichView markdown={text} editable font={font} onChange={update} innerRef={area} label={t.notes} lang={lang} userId={userId} />
          : <textarea ref={area as React.RefObject<HTMLTextAreaElement>} autoFocus className={`body ${json || codeNote ? 'mono' : ''}`} aria-label={t.notes} style={{ fontSize: font }} value={text} placeholder={t.start} onChange={event => update(event.target.value)} />}
      </div>
      <footer><span>{wordCount(text)} {t.words} <em>·</em> {Array.from(text).length} {t.chars}</span><span>{!readonly && <button className="clear" onClick={() => update('')}>{t.clear}</button>}<label>{f.textSize}<input aria-label={f.textSize} type="number" min="14" max="48" step="1" value={fontDraft} onChange={event => { setFontDraft(event.target.value); const size = event.target.valueAsNumber; if (Number.isInteger(size) && size >= 14 && size <= 48) setFont(size) }} onBlur={() => { const size = fontDraft.trim() ? Math.max(14, Math.min(48, Math.round(Number(fontDraft)))) : font; const normalized = Number.isFinite(size) ? size : font; setFont(normalized); setFontDraft(String(normalized)) }} /></label></span></footer>
    </> : <div className="empty editor-empty"><button onClick={add}>{t.newNote}</button></div>}
    <button className="fab" disabled={readOnly} onClick={add} aria-label={t.newNote}><Plus size={24} aria-hidden="true" /></button>
  </section>
}
