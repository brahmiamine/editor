import { readLocal, writeLocal } from './local-db.ts'
import { supabase } from '../supabase'
import { MAX_IMAGE_BYTES, safeImageUrl } from './media.ts'

export const attachmentIds = (text: string) => [...new Set(text.match(/attachment:[0-9a-f-]{36}/gi)?.map(value => value.slice(11)) || [])]
export async function storeImage(file: File) {
  // Decode even allowed MIME types before saving; reduce photographic dimensions without enlarging small images.
  const bitmap = await createImageBitmap(file)
  let blob: Blob = file
  if (file.type !== 'image/gif' && (bitmap.width > 1600 || bitmap.height > 1600)) {
    const scale = Math.min(1600 / bitmap.width, 1600 / bitmap.height, 1)
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('imageRead')), 'image/webp', .85))
  }
  bitmap.close()
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('imageSize')
  const id = crypto.randomUUID(); await writeLocal('assets', id, blob)
  return 'attachment:' + id
}
export async function attachmentBlob(id: string, userId?: string) {
  const cached = await readLocal<Blob>('assets', id)
  if (cached) return cached
  if (!supabase || !userId) throw new Error('imageRead')
  const { data, error } = await supabase.storage.from('note-images').download(`${userId}/${id}`)
  if (error) throw error
  await writeLocal('assets', id, data)
  return data
}
export async function uploadAttachments(text: string, userId: string) {
  if (!supabase) return
  for (const id of attachmentIds(text)) {
    const blob = await attachmentBlob(id, userId)
    const { error } = await supabase.storage.from('note-images').upload(`${userId}/${id}`, blob, { contentType: blob.type, upsert: false })
    if (error && !['409', 'Duplicate'].includes(String(error.statusCode))) throw error
  }
}
export async function embedAttachments(text: string, userId?: string) {
  for (const id of attachmentIds(text)) {
    const blob = await attachmentBlob(id, userId)
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob)
    })
    if (!safeImageUrl(source)) throw new Error('imageRead')
    text = text.replaceAll('attachment:' + id, source)
  }
  return text
}
