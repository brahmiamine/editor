import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectNoteJson, parseJson, renderMarkdown } from '../app/lib/markdown.ts'

test('JSON detection supports complete objects, arrays and notes with a title', () => {
  assert.equal(detectNoteJson(' \n{"name":"Note","items":[1,2]}\n'), 'document')
  assert.equal(detectNoteJson('[1,{"ok":true}]'), 'document')
  assert.equal(detectNoteJson('Configuration\n{"ok":true}'), 'content')
  assert.equal(detectNoteJson('Configuration\n\n[1,2]'), 'content')
  assert.equal(detectNoteJson('{"pending":'), null)
  assert.equal(detectNoteJson('Plain text'), null)
  assert.equal(detectNoteJson('42'), null)
})
test('rendered JSON is indented, escaped and wrapped in a semantic code block', () => {
  const raw = '{"markup":"<img src=x onerror=alert(1)>","value":2}'
  const html = renderMarkdown(raw)
  assert.ok(html.includes('<pre><code class="language-json">'))
  assert.ok(html.includes('&lt;img'))
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('\n  &quot;value&quot;: 2\n'))
  assert.deepEqual(JSON.parse(parseJson(raw)), JSON.parse(raw))
})
