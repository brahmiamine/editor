import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_IMAGE_BYTES, imageMarkdown, readImage, safeImageUrl, safeLinkUrl } from '../app/lib/media.ts'
import { codeBlock, looksLikeMarkdown, renderInline, renderMarkdown } from '../app/lib/markdown.ts'

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
test('media URLs reject scripts, SVG, local files and oversized inline images', () => {
  assert.equal(safeLinkUrl('javascript:alert(1)'), null)
  assert.equal(safeLinkUrl('file:///etc/passwd'), null)
  assert.equal(safeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), null)
  assert.equal(safeImageUrl('http://example.com/image.png'), null)
  assert.equal(safeImageUrl('data:image/png;base64,' + 'A'.repeat(MAX_IMAGE_BYTES * 2)), null)
  assert.equal(safeImageUrl('https://example.com/image.png'), 'https://example.com/image.png')
  assert.equal(safeImageUrl(pixel), pixel)
})
test('image Markdown keeps accessible alt text and survives rendering safely', () => {
  const markdown = imageMarkdown(pixel, 'A **picture** " onerror="alert(1)')
  const html = renderMarkdown(markdown)
  assert.equal(looksLikeMarkdown(markdown), true)
  assert.ok(html.includes('<img src="' + pixel + '"'))
  assert.ok(html.includes('alt="A **picture** &quot; onerror=&quot;alert(1)"'))
  assert.ok(!html.includes('<strong>picture</strong>'))
  assert.ok(!/\sonerror="/.test(html))
  assert.equal(imageMarkdown('javascript:alert(1)', 'x'), '')
  assert.ok(imageMarkdown('https://example.com/pic(1).png', 'image').includes('pic%281%29.png'))
})
test('links, code and emphasis do not modify one another’s HTML attributes', () => {
  const link = renderInline('[**Example**](https://example.com/?a=1&b=2)')
  assert.ok(link.includes('<strong>Example</strong>'))
  assert.ok(link.includes('href="https://example.com/?a=1&amp;b=2"'))
  assert.ok(renderInline('\x60**literal**\x60').includes('<code>**literal**</code>'))
  assert.equal(renderInline('~~removed~~'), '<del>removed</del>')
  assert.equal(looksLikeMarkdown('~~removed~~'), true)
  assert.equal(codeBlock('<script>alert(1)</script>'), '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>')
  assert.ok(!renderMarkdown('![x](javascript:alert)').includes('<img'))
})
test('file validation rejects unsupported and oversized files before reading', async () => {
  await assert.rejects(readImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })), /imageType/)
  await assert.rejects(readImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'x.png', { type: 'image/png' })), /imageSize/)
})
test('private attachment references render without network requests or leaking storage URLs', () => {
  const ref = 'attachment:12345678-1234-1234-1234-123456789abc'
  assert.equal(safeImageUrl(ref), ref)
  const html = renderMarkdown(imageMarkdown(ref, 'Private image'))
  assert.ok(html.includes('data-asset="12345678-1234-1234-1234-123456789abc"'))
  assert.ok(!html.includes('src="attachment:'))
  assert.equal(safeImageUrl('attachment:../../other-user'), null)
})
