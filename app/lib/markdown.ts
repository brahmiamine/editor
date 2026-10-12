import { imageMarkdown, safeImageUrl, safeLinkUrl } from './media.ts'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Returns pretty-printed JSON when the whole text is a JSON object or array, otherwise null. */
export function parseJson(text: string) {
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed)) return null
  try { const value = JSON.parse(trimmed); return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : null } catch { return null }
}

export function detectNoteJson(text: string): 'document' | 'content' | null {
  if (parseJson(text)) return 'document'
  const newline = text.indexOf('\n')
  return newline >= 0 && parseJson(text.slice(newline + 1)) ? 'content' : null
}

export const looksLikeMarkdown = (text: string) => !parseJson(text) &&
  (/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s|```)/m.test(text) || /!\[[^\]\n]*\]\([^) \n]+\)|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:[^)\n]+\)|~~[^~\n]+~~|<u>.+<\/u>/.test(text))

export function jsonBlock(pretty: string) {
  return `<div class="json-block" contenteditable="false" data-json="${esc(pretty)}"><button type="button" class="copy-btn" data-copy aria-label="Copy">⧉</button><pre><code class="language-json">${highlightCode(pretty)}</code></pre></div>`
}
export function highlightCode(text: string) {
  const tokens = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(true|false|null|const|let|var|function|return|if|else|class|import|export|async|await)\b|\b(-?\d+(?:\.\d+)?)\b/g
  let html = '', index = 0
  for (const match of text.matchAll(tokens)) { html += esc(text.slice(index, match.index)) + '<span class="syntax-' + (match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'keyword' : 'number') + '">' + esc(match[0]) + '</span>'; index = match.index! + match[0].length }
  return html + esc(text.slice(index))
}
export function codeBlock(text: string, colored = false) { return '<pre><code>' + (colored ? highlightCode(text) : esc(text)) + '</code></pre>' }

export function renderInline(raw: string): string {
  const tokens: string[] = []
  const token = (html: string) => '\u0000' + (tokens.push(html) - 1) + '\u0000'
  const protectedText = raw.replace(/\x60([^\x60\n]+)\x60|!\[([^\]\n]*)\]\(([^)\s]+)\)(?:\{width=(\d{1,4})\})?|\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g,
    (match, code, alt, source, width, label, target) => {
      if (code !== undefined) return token('<code>' + esc(code) + '</code>')
      if (alt !== undefined) {
        const url = safeImageUrl(source)
        return token(url ? '<figure contenteditable="false"><img ' + (url.startsWith('attachment:') ? 'data-asset="' + url.slice(11) + '"' : 'src="' + esc(url) + '"') + (width ? ' width="' + Math.max(40, Math.min(1600, Number(width))) + '"' : '') + ' alt="' + esc(alt) + '" loading="lazy" decoding="async" />' + (alt ? '<figcaption>' + esc(alt) + '</figcaption>' : '') + '</figure>' : esc(match))
      }
      const url = safeLinkUrl(target)
      return token(url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + renderInline(label) + '</a>' : esc(match))
    })
  return esc(protectedText)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] ?? '')
}

/** Renders Markdown to HTML. Input is escaped first, so the output is safe to assign to innerHTML. */
export function renderMarkdown(text: string): string {
  const whole = parseJson(text)
  if (whole) return jsonBlock(whole)
  const newline = text.indexOf('\n')
  const jsonContent = newline >= 0 ? parseJson(text.slice(newline + 1)) : null
  if (jsonContent) return renderMarkdown(text.slice(0,newline)) + jsonBlock(jsonContent)
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  const blockStart = (line: string) => /^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>|```|---+\s*$)/.test(line)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^```/.test(line)) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++])
      i++
      const body = code.join('\n')
      const json = parseJson(body)
      out.push(json ? jsonBlock(json) : codeBlock(body, true))
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) { out.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`); i++; continue }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1])) {
      const cells = (value: string) => value.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'))
      const headers = cells(line); i += 2
      const rows: string[] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { const values = cells(lines[i++]); rows.push('<tr>' + headers.map((_, index) => '<td>' + renderInline(values[index] || '') + '</td>').join('') + '</tr>') }
      out.push('<table><thead><tr>' + headers.map(value => '<th>' + renderInline(value) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'); continue
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${quote.map(renderInline).join('<br>')}</blockquote>`)
      continue
    }
    const list = line.match(/^\s*([-*+]|\d+\.)\s/)
    if (list) {
      const ordered = /\d/.test(list[1])
      const item = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
      const items: string[] = []
      let match: RegExpMatchArray | null
      while (i < lines.length && (match = lines[i].match(item))) { const task = !ordered && match[1].match(/^\[([ xX])\]\s+(.*)$/); items.push(task ? `<li class="task"><input type="checkbox" aria-label="${esc(task[2])}" ${task[1].toLowerCase() === 'x' ? 'checked' : ''} />${renderInline(task[2])}</li>` : `<li>${renderInline(match[1])}</li>`); i++ }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && (!paragraph.length || !blockStart(lines[i]))) paragraph.push(lines[i++])
    const json = parseJson(paragraph.join('\n'))
    out.push(json ? jsonBlock(json) : `<p>${paragraph.map(renderInline).join('<br>')}</p>`)
  }
  return out.join('')
}

function inlineText(node: Node): string {
  if (!(node instanceof HTMLElement)) return node.textContent || ''
  const inner = Array.from(node.childNodes).map(inlineText).join('')
  switch (node.tagName) {
    case 'B': case 'STRONG': return inner.trim() ? `**${inner}**` : inner
    case 'I': case 'EM': return inner.trim() ? `*${inner}*` : inner
    case 'U': return inner.trim() ? `<u>${inner}</u>` : inner
    case 'S': case 'STRIKE': case 'DEL': return inner.trim() ? '~~' + inner + '~~' : inner
    case 'IMG': return imageMarkdown(node.dataset.asset ? 'attachment:' + node.dataset.asset : node.getAttribute('src') || '', node.getAttribute('alt') || '', node.hasAttribute('width') ? Number(node.getAttribute('width')) : undefined)
    case 'FIGURE': return node.querySelector('img') ? inlineText(node.querySelector('img')!) : inner
    case 'INPUT': return ''
    case 'CODE': return `\`${inner}\``
    case 'BR': return '\n'
    case 'A': { const url = safeLinkUrl(node.getAttribute('href') || ''); return url ? '[' + inner + '](' + url.replace(/[()]/g, char => char === '(' ? '%28' : '%29') + ')' : inner }
    default: return inner
  }
}

/** Converts the editable HTML produced by renderMarkdown and the browser back to Markdown. */
export function htmlToMarkdown(root: HTMLElement) {
  const out: string[] = []
  let loose = ''
  const flush = () => { if (loose.trim()) out.push(loose.trim()); loose = '' }
  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (!(node instanceof HTMLElement)) { loose += node.textContent || ''; continue }
      const tag = node.tagName
      if (node.classList.contains('json-block')) { flush(); out.push('```json\n' + (node.dataset.json || '') + '\n```') }
      else if (/^H[1-6]$/.test(tag)) { flush(); out.push('#'.repeat(Number(tag[1])) + ' ' + inlineText(node).trim()) }
      else if (tag === 'UL' || tag === 'OL') { flush(); out.push(Array.from(node.children).map((li, n) => (tag === 'UL' ? '- ' : `${n + 1}. `) + (li.querySelector('input[type="checkbox"]') ? '[' + (li.querySelector<HTMLInputElement>('input')?.checked ? 'x' : ' ') + '] ' : '') + inlineText(li).trim()).join('\n')) }
      else if (tag === 'TABLE') { flush(); const rows = Array.from(node.querySelectorAll('tr')).map(row => '| ' + Array.from(row.children).map(cell => inlineText(cell).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |'); if (rows.length) rows.splice(1,0,'| ' + Array.from(node.querySelector('tr')!.children).map(() => '---').join(' | ') + ' |'); out.push(rows.join('\n')) }
      else if (tag === 'BLOCKQUOTE') { flush(); out.push('> ' + inlineText(node).trim().replace(/\n/g, '\n> ')) }
      else if (tag === 'PRE') { flush(); out.push('```\n' + (node.textContent || '').replace(/\n$/, '') + '\n```') }
      else if (tag === 'HR') { flush(); out.push('---') }
      else if (tag === 'P' || tag === 'DIV') {
        flush()
        if (node.querySelector('.json-block,ul,ol,h1,h2,h3,h4,h5,h6,blockquote,pre,p,div')) walk(node)
        else { const text = inlineText(node).trim(); if (text) out.push(text) }
      }
      else loose += inlineText(node)
    }
  }
  walk(root)
  flush()
  return out.join('\n\n')
}
