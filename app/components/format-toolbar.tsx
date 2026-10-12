import { useEffect, useRef, useState } from 'react'
import { Bold, ChevronDown, Code, Heading, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, ListTodo, Minus, Pilcrow, Quote, Redo2, Strikethrough, Table, Underline, Undo2 } from 'lucide-react'
import { editorCopy, featureCopy, type copy, type Language } from '../lib/i18n'
import { renderInline } from '../lib/markdown'
import { editorRange, imageMarkdown, insertEditorHTML, readImage, safeImageUrl, safeLinkUrl } from '../lib/media'

export function FormatToolbar({ t, lang, editor, tidy }: { t: typeof copy.fr; lang: Language; editor: React.RefObject<HTMLElement | null>; tidy: () => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'image' | 'link' | null>(null)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const saved = useRef<{ editor: HTMLElement; range: Range } | null>(null)
  const request = useRef(0)
  const labels = editorCopy[lang]
  const f = featureCopy[lang]
  useEffect(() => { if (kind) dialog.current?.showModal(); else dialog.current?.close() }, [kind])
  useEffect(() => () => { request.current++ }, [])
  const keep = (event: React.MouseEvent) => event.preventDefault()
  function run(command: string, value?: string) {
    setOpen(false)
    const root = editor.current
    if (!root) return
    const range = editorRange(root)
    root.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
    if (document.execCommand(command, false, value)) root.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function boldTitle() {
    const root = editor.current
    if (!root) return
    const range = editorRange(root)
    root.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
    const start = range.startContainer
    let block = (start.nodeType === 1 ? start as Element : start.parentElement)?.closest('h1,h2,h3,h4')
    if (!block || !root.contains(block)) {
      document.execCommand('formatBlock', false, '<h2>')
      const now = window.getSelection()?.anchorNode
      block = (now?.nodeType === 1 ? now as Element : now?.parentElement)?.closest('h1,h2,h3,h4') ?? null
    }
    if (!block || !root.contains(block)) return
    const whole = document.createRange()
    whole.selectNodeContents(block)
    selection?.removeAllRanges(); selection?.addRange(whole)
    const bolded = !!block.querySelector('strong,b') && block.textContent === Array.from(block.querySelectorAll('strong,b')).map(node => node.textContent).join('')
    if (bolded) { for (const node of Array.from(block.querySelectorAll('strong,b'))) node.replaceWith(...Array.from(node.childNodes)) }
    else document.execCommand('bold')
    root.dispatchEvent(new Event('input', { bubbles: true }))
  }
  function show(next: 'image' | 'link') {
    const root = editor.current
    if (!root) return
    const range = editorRange(root)
    saved.current = { editor: root, range }
    request.current++
    setUrl(''); setDescription(next === 'link' ? range.toString() : ''); setError(''); setBusy(false); setKind(next); setOpen(false)
  }
  function close() { request.current++; setKind(null); setBusy(false) }
  function insert(source: string, label: string, mode: 'image' | 'link') {
    const root = editor.current
    const selection = saved.current
    if (!root || !selection || root !== selection.editor) { close(); return }
    const target = mode === 'image' ? safeImageUrl(source) : safeLinkUrl(source)
    if (!target) { setError(labels.invalidUrl); return }
    const markdown = mode === 'image' ? imageMarkdown(target, label || labels.image)
      : '[' + (label || target).replace(/[\[\]\r\n]/g, ' ') + '](' + target.replace(/[()]/g, char => char === '(' ? '%28' : '%29') + ')'
    dialog.current?.close()
    if (!insertEditorHTML(root, renderInline(markdown), selection.range)) setError(labels.imageRead)
    close()
  }
  async function chooseFile(file: File) {
    const version = request.current
    setBusy(true); setError('')
    try {
      const source = await readImage(file)
      if (version === request.current) insert(source, description || file.name, 'image')
    } catch (cause) {
      if (version === request.current) setError(cause instanceof Error && (cause.message === 'imageType' || cause.message === 'imageSize') ? labels[cause.message] : labels.imageRead)
    } finally { if (version === request.current) setBusy(false) }
  }
  function insertCode() {
    const root = editor.current
    if (!root) return
    const range = editorRange(root)
    const text = range.toString() || labels.code
    root.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
    document.execCommand('insertParagraph')
    document.execCommand('formatBlock', false, '<pre>')
    document.execCommand('insertText', false, text)
    root.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const headings: [string, string][] = [['<p>', t.paragraph], ['<h1>', t.h1], ['<h2>', t.h2], ['<h3>', t.h3]]
  return <div className="toolbar" role="toolbar" aria-label={t.richMode}>
    <div className="menu-wrap">
      <button className="heading-btn" onMouseDown={keep} onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open}>{t.headings} <ChevronDown size={14} aria-hidden="true" /></button>
      {open && <div className="heading-menu" role="menu">{headings.map(([tag, label]) => <button key={tag} role="menuitem" onMouseDown={keep} onClick={() => run('formatBlock', tag)}>{label}</button>)}</div>}
    </div>
    <i className="sep" />
    <button onMouseDown={keep} onClick={boldTitle} aria-label={labels.boldTitle} title={labels.boldTitle}><Heading size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('bold')} aria-label={t.bold} title={t.bold}><Bold size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('italic')} aria-label={t.italic} title={t.italic}><Italic size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('underline')} aria-label={t.underline} title={t.underline}><Underline size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('strikeThrough')} aria-label={labels.strike} title={labels.strike}><Strikethrough size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={tidy} aria-label={t.tidy} title={t.tidy}><Pilcrow size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('insertUnorderedList')} aria-label={t.bullets} title={t.bullets}><List size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('insertOrderedList')} aria-label={t.numbers} title={t.numbers}><ListOrdered size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => { const root = editor.current; if (root) insertEditorHTML(root, '<ul><li class="task"><input type="checkbox" aria-label="' + f.task + '">' + f.task + '</li></ul>') }} aria-label={f.task} title={f.task}><ListTodo size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => { const root = editor.current; if (root) insertEditorHTML(root, '<table><thead><tr><th>' + f.title + '</th><th>' + t.notes + '</th></tr></thead><tbody><tr><td>…</td><td>…</td></tr></tbody></table><p><br></p>') }} aria-label={f.table} title={f.table}><Table size={16} aria-hidden="true" /></button>
    <i className="sep" />
    <button onMouseDown={keep} onClick={() => show('image')} aria-label={labels.image} title={labels.image}><ImageIcon size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => show('link')} aria-label={labels.link} title={labels.link}><LinkIcon size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('formatBlock', '<blockquote>')} aria-label={labels.quote} title={labels.quote}><Quote size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={insertCode} aria-label={labels.code} title={labels.code}><Code size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('insertHorizontalRule')} aria-label={labels.rule} title={labels.rule}><Minus size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('undo')} aria-label={t.undo} title={t.undo}><Undo2 size={16} aria-hidden="true" /></button>
    <button onMouseDown={keep} onClick={() => run('redo')} aria-label={t.redo} title={t.redo}><Redo2 size={16} aria-hidden="true" /></button>
    {error && !kind && <span role="alert">{error}</span>}
    <dialog ref={dialog} className="insert-dialog" aria-labelledby="insert-media-title" onCancel={close}>
      <h2 id="insert-media-title">{kind === 'image' ? labels.image : labels.link}</h2>
      <form onSubmit={event => { event.preventDefault(); if (kind) insert(url.trim(), description, kind) }}>
        <label>{labels.url}<input type="url" value={url} onChange={event => setUrl(event.target.value)} required maxLength={4096} autoFocus /></label>
        <label>{labels.description}<input value={description} onChange={event => setDescription(event.target.value)} maxLength={200} /></label>
        {kind === 'image' && <><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void chooseFile(file) }} /><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{labels.file}</button></>}
        {error && <p role="alert">{error}</p>}
        <div><button type="button" onClick={close}>{labels.cancel}</button><button type="submit" className="primary" disabled={busy}>{labels.insert}</button></div>
      </form>
    </dialog>
  </div>
}
