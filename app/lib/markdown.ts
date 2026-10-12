const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Returns pretty-printed JSON when the whole text is a JSON object or array, otherwise null. */
export function parseJson(text: string) {
  const trimmed = text.trim()
  if (!/^[[{]/.test(trimmed)) return null
  try { const value = JSON.parse(trimmed); return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : null } catch { return null }
}

export const looksLikeMarkdown = (text: string) => !parseJson(text) &&
  (/^(#{1,6}\s|\s*[-*+]\s|\s*\d+\.\s|>\s|```)/m.test(text) || /\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:[^)\n]+\)|<u>.+<\/u>/.test(text))

export function jsonBlock(pretty: string) {
  return `<div class="json-block" contenteditable="false" data-json="${esc(pretty)}"><button type="button" class="copy-btn" data-copy aria-label="Copy">⧉</button><pre>${esc(pretty)}</pre></div>`
}

function inline(raw: string) {
  return esc(raw)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/&lt;u&gt;(.+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

/** Renders Markdown to HTML. Input is escaped first, so the output is safe to assign to innerHTML. */
export function renderMarkdown(text: string) {
  const whole = parseJson(text)
  if (whole) return jsonBlock(whole)
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
      out.push(json ? jsonBlock(json) : `<pre><code>${esc(body)}</code></pre>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) { out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`)
      continue
    }
    const list = line.match(/^\s*([-*+]|\d+\.)\s/)
    if (list) {
      const ordered = /\d/.test(list[1])
      const item = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/
      const items: string[] = []
      let match: RegExpMatchArray | null
      while (i < lines.length && (match = lines[i].match(item))) { items.push(`<li>${inline(match[1])}</li>`); i++ }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && (!paragraph.length || !blockStart(lines[i]))) paragraph.push(lines[i++])
    const json = parseJson(paragraph.join('\n'))
    out.push(json ? jsonBlock(json) : `<p>${paragraph.map(inline).join('<br>')}</p>`)
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
    case 'CODE': return `\`${inner}\``
    case 'BR': return '\n'
    case 'A': return `[${inner}](${node.getAttribute('href') || ''})`
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
      else if (tag === 'UL' || tag === 'OL') { flush(); out.push(Array.from(node.children).map((li, n) => (tag === 'UL' ? '- ' : `${n + 1}. `) + inlineText(li).trim()).join('\n')) }
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
