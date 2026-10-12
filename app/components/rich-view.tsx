import { useEffect, useRef } from 'react'
import { htmlToMarkdown, jsonBlock, parseJson, renderMarkdown } from '../lib/markdown'

type Props = { markdown: string; editable: boolean; font: number; onChange?: (markdown: string) => void; innerRef?: React.RefObject<HTMLElement | null>; label: string }

/** Rendered Markdown. When editable it is a WYSIWYG surface that writes Markdown back through onChange. */
export function RichView({ markdown, editable, font, onChange, innerRef, label }: Props) {
  const local = useRef<HTMLDivElement | null>(null)
  const last = useRef<string | null>(null)
  useEffect(() => {
    const element = local.current
    if (!element || markdown === last.current) return
    element.innerHTML = renderMarkdown(markdown)
    last.current = markdown
  }, [markdown])
  useEffect(() => { if (editable) try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch {} }, [editable])
  return <div className="rich" role={editable ? 'textbox' : undefined} aria-multiline={editable || undefined} aria-label={label} contentEditable={editable} suppressContentEditableWarning spellCheck={editable} style={{ fontSize: font }}
    ref={element => { local.current = element; if (innerRef) innerRef.current = element }}
    onInput={event => { if (!editable) return; const md = htmlToMarkdown(event.currentTarget); last.current = md; onChange?.(md) }}
    onPaste={event => {
      if (!editable) return
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      const json = parseJson(text)
      document.execCommand(json ? 'insertHTML' : 'insertText', false, json ? jsonBlock(json) : text)
    }}
    onClick={event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-copy]')
      if (!button) return
      const text = button.closest<HTMLElement>('.json-block')?.dataset.json || ''
      navigator.clipboard?.writeText(text).then(() => { button.textContent = '✓'; setTimeout(() => { button.textContent = '⧉' }, 1500) }).catch(() => {})
    }} />
}
