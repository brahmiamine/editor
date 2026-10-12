import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, renderInline } from '../app/lib/markdown.ts'
import { imageMarkdown } from '../app/lib/media.ts'

// Catches task state loss, table text flattened into a paragraph and unsafe code coloring.
test('task lists retain checked states and tables render semantic cells', () => {
  assert.match(renderMarkdown('- [ ] Todo\n- [x] Done'), /type="checkbox"/)
  assert.match(renderMarkdown('- [ ] Todo\n- [x] Done'), /checked/)
  const table = renderMarkdown('| Name | Value |\n| --- | --- |\n| Alice | <script> |')
  assert.ok(table.includes('<table>'))
  assert.ok(table.includes('<th>Name</th>'))
  assert.ok(table.includes('<td>&lt;script&gt;</td>'))
})
test('code coloring escapes source and image dimensions survive Markdown rendering', () => {
  const code = renderMarkdown('```json\n{"key":1,"html":"<script>"}\n```')
  assert.match(code, /syntax-key/)
  assert.ok(!code.includes('<script>'))
  const image = renderInline(imageMarkdown('https://example.com/a.png', 'Caption', 320))
  assert.match(image, /width="320"/)
  assert.match(image, /<figcaption>Caption<\/figcaption>/)
})
test('JSON following a note introduction still renders as an editable-source preview block', () => {
  const html = renderMarkdown('Exemple JSON\n{"name":"Alice","count":2}')
  assert.ok(html.includes('<p>Exemple JSON</p>'))
  assert.ok(html.includes('class="language-json"'))
})
