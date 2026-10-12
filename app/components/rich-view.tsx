import { useEffect, useRef, useState } from 'react'
import { htmlToMarkdown, jsonBlock, parseJson, renderInline, renderMarkdown } from '../lib/markdown'
import { editorRange, imageMarkdown, insertEditorHTML, readImage } from '../lib/media'
import { copy, editorCopy, featureCopy, type Language } from '../lib/i18n'
import { attachmentBlob } from '../lib/attachments'

type Props = { markdown: string; editable: boolean; font: number; onChange?: (markdown: string) => void; innerRef?: React.RefObject<HTMLElement | null>; label: string; lang: Language; userId?: string }

/** Rendered Markdown. When editable it is a WYSIWYG surface that writes Markdown back through onChange. */
export function RichView({ markdown, editable, font, onChange, innerRef, label, lang, userId }: Props) {
  const local = useRef<HTMLDivElement | null>(null)
  const last = useRef<string | null>(null)
  const [mediaError, setMediaError] = useState('')
  const labels = editorCopy[lang]
  const f = featureCopy[lang]
  const imageDialog = useRef<HTMLDialogElement>(null)
  const [image, setImage] = useState<HTMLImageElement>()
  const [caption, setCaption] = useState('')
  const [width, setWidth] = useState(320)
  const objectUrls = useRef(new Map<string, string>())
  const openImage = (img: HTMLImageElement) => { setCaption(img.alt); setWidth(Number(img.getAttribute('width')) || Math.min(img.naturalWidth || 320, 1600)); setImage(img) }
  useEffect(() => { if (image) imageDialog.current?.showModal(); else imageDialog.current?.close() }, [image])
  async function insertFile(file: File, root: HTMLDivElement, range: Range) {
    setMediaError('')
    try {
      const source = await readImage(file)
      if (local.current === root && !insertEditorHTML(root, renderInline(imageMarkdown(source, file.name || labels.image)), range)) setMediaError(labels.imageRead)
    } catch (cause) {
      if (local.current === root) setMediaError(cause instanceof Error && (cause.message === 'imageType' || cause.message === 'imageSize') ? labels[cause.message] : labels.imageRead)
    }
  }
  useEffect(() => {
    const element = local.current
    if (!element || markdown === last.current) return
    element.innerHTML = renderMarkdown(markdown)
    last.current = markdown
  }, [markdown])
  useEffect(() => {
    let cancelled = false
    const root = local.current
    if (!root) return
    root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => { input.disabled = !editable })
    root.querySelectorAll<HTMLImageElement>('img').forEach(img => {
      if (editable) { img.tabIndex = 0; img.setAttribute('role', 'button'); img.setAttribute('aria-label', f.imageOptions + ': ' + img.alt) }
      const id = img.dataset.asset
      if (!id) return
      const url = objectUrls.current.get(id)
      if (url) { img.src = url; return }
      void attachmentBlob(id, userId).then(blob => { if (cancelled) return; const url = URL.createObjectURL(blob); objectUrls.current.set(id, url); img.src = url }).catch(() => { if (!cancelled) setMediaError(labels.imageRead) })
    })
    root.querySelectorAll('[data-copy]').forEach(button => button.setAttribute('aria-label', copy[lang].copy))
    return () => { cancelled = true }
  }, [markdown, userId, editable, lang])
  useEffect(() => () => { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear() }, [])
  useEffect(() => { if (editable) try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch {} }, [editable])
  return <><div className="rich" role={editable ? 'textbox' : undefined} aria-multiline={editable || undefined} aria-label={label} contentEditable={editable} suppressContentEditableWarning spellCheck={editable} style={{ fontSize: font }}
    ref={element => { local.current = element; if (innerRef) innerRef.current = element }}
    onInput={event => { if (!editable) return; const md = htmlToMarkdown(event.currentTarget); last.current = md; onChange?.(md) }}
    onChange={event => { if (editable && event.target instanceof HTMLInputElement && event.target.type === 'checkbox') { const md = htmlToMarkdown(event.currentTarget); last.current = md; onChange?.(md) } }}
    onKeyDown={event => { if (editable && event.key === 'Enter' && event.target instanceof HTMLImageElement) { event.preventDefault(); openImage(event.target) } }}
    onPaste={event => {
      if (!editable) return
      event.preventDefault()
      const root = event.currentTarget
      const file = event.clipboardData.files[0]
      if (file) { void insertFile(file, root, editorRange(root)); return }
      const text = event.clipboardData.getData('text/plain')
      const json = parseJson(text)
      if (json) insertEditorHTML(root, jsonBlock(json))
      else { document.execCommand('insertText', false, text); root.dispatchEvent(new Event('input', { bubbles: true })) }
    }}
    onDragOver={event => { if (editable) event.preventDefault() }}
    onDrop={event => {
      if (!editable) return
      event.preventDefault()
      const root = event.currentTarget
      const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
      const position = range && root.contains(range.commonAncestorContainer) ? range : editorRange(root)
      const file = event.dataTransfer.files[0]
      if (file) void insertFile(file, root, position)
      else {
        const text = event.dataTransfer.getData('text/plain')
        const selection = window.getSelection()
        root.focus(); selection?.removeAllRanges(); selection?.addRange(position)
        document.execCommand('insertText', false, text)
        root.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }}
    onClick={event => {
      if (editable && event.target instanceof HTMLImageElement) { openImage(event.target); return }
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-copy]')
      if (!button) return
      const text = button.closest<HTMLElement>('.json-block')?.dataset.json || ''
      navigator.clipboard?.writeText(text).then(() => { button.textContent = '✓'; setTimeout(() => { button.textContent = '⧉' }, 1500) }).catch(() => {})
    }} />{mediaError && <p role="alert" className="media-error">{mediaError}</p>}
    <dialog ref={imageDialog} className="insert-dialog" aria-labelledby="image-options-title" onCancel={() => setImage(undefined)}><h2 id="image-options-title">{f.imageOptions}</h2><form onSubmit={event => { event.preventDefault(); if (image && local.current?.contains(image)) { image.alt = caption; image.setAttribute('width', String(width)); const label = image.closest('figure')?.querySelector('figcaption'); if (label) label.textContent = caption; else if (caption && image.closest('figure')) { const figcaption = document.createElement('figcaption'); figcaption.textContent = caption; image.closest('figure')!.appendChild(figcaption) } local.current.dispatchEvent(new Event('input', { bubbles: true })) } setImage(undefined) }}><label>{f.caption}<input autoFocus value={caption} maxLength={200} onChange={event => setCaption(event.target.value)} /></label><label>{f.width}<input type="number" required min="40" max="1600" value={width} onChange={event => setWidth(event.target.valueAsNumber)} /></label><div><button type="button" onClick={() => setImage(undefined)}>{labels.cancel}</button><button>{f.apply}</button></div></form></dialog></>
}
