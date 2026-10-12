// ponytail: inline images are capped at 1 MB for offline notes; use private object storage for large libraries.
export const MAX_IMAGE_BYTES = 1024 * 1024
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export function safeLinkUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}
export function safeImageUrl(value: string): string | null {
  if (/^attachment:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return value
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+={0,2}$/i.test(value)) {
    return value.length <= Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 ? value : null
  }
  const url = safeLinkUrl(value)
  return url?.startsWith('https:') ? url : null
}
export function imageMarkdown(source: string, alt: string, width?: number) {
  const url = safeImageUrl(source)
  if (!url) return ''
  const label = alt.replace(/[\[\]\r\n]/g, ' ')
  return '![' + label + '](' + url.replace(/[()]/g, char => char === '(' ? '%28' : '%29') + ')' + (width && Number.isFinite(width) ? '{width=' + Math.max(40, Math.min(1600, Math.round(width))) + '}' : '')
}
export async function readImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) return Promise.reject(new Error('imageType'))
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error('imageSize'))
  const { storeImage } = await import('./attachments.ts')
  return storeImage(file)
}
export function editorRange(editor: HTMLElement): Range {
  const selection = window.getSelection()
  if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) return selection.getRangeAt(0).cloneRange()
  const range = document.createRange()
  range.selectNodeContents(editor); range.collapse(false)
  return range
}
export function insertEditorHTML(editor: HTMLElement, html: string, range = editorRange(editor)) {
  editor.focus()
  const selection = window.getSelection()
  selection?.removeAllRanges(); selection?.addRange(range)
  const inserted = document.execCommand('insertHTML', false, html)
  if (inserted) editor.dispatchEvent(new Event('input', { bubbles: true }))
  return inserted
}
