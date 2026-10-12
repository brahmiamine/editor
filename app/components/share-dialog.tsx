import { useEffect, useRef, useState } from 'react'
import { basePath, supabase } from '../supabase'
import { embedAttachments } from '../lib/attachments'
import { featureCopy, type Language } from '../lib/i18n'
import type { Note } from '../lib/notes'

export function ShareDialog({ note, userId, lang, open, close }: { note: Note; userId?: string; lang: Language; open: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [url, setUrl] = useState('')
  const [shares, setShares] = useState<{ id: string; expires_at: string }[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const t = featureCopy[lang]
  async function refresh() {
    if (!supabase || !userId) return
    const { data, error } = await supabase.from('note_shares').select('id,expires_at').eq('user_id', userId).gt('expires_at', new Date().toISOString())
    if (error) throw error
    setShares(data)
  }
  useEffect(() => { if (open) { dialog.current?.showModal(); void refresh().catch(() => setMessage(t.failure)) } else { dialog.current?.close(); setUrl(''); setMessage('') } }, [open, userId])
  async function create() {
    if (!supabase || !userId) return
    setBusy(true); setMessage('')
    try {
      const token = crypto.randomUUID() + crypto.randomUUID()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).map(value => value.toString(16).padStart(2, '0')).join('')
      const body = await embedAttachments(note.body, userId)
      const { error } = await supabase.from('note_shares').insert({ user_id: userId, token_hash: hash, body, expires_at: new Date(Date.now() + 7 * 86400000).toISOString() })
      if (error) throw error
      setUrl(location.origin + basePath + '/share/#' + token)
      await refresh()
    } catch { setMessage(t.failure) } finally { setBusy(false) }
  }
  async function revoke(id: string) {
    if (!supabase || !userId) return
    setBusy(true)
    try { const { error } = await supabase.from('note_shares').delete().eq('id', id).eq('user_id', userId); if (error) throw error; setUrl(''); await refresh() } catch { setMessage(t.failure) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="insert-dialog" aria-labelledby="share-title" onCancel={close}><h2 id="share-title">{t.share}</h2><p>{t.shareHint}</p><button disabled={busy} onClick={() => void create()}>{t.createShare}</button>{url && <><input readOnly aria-label={t.share} value={url} onFocus={event => event.target.select()} /><button onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage(t.copied)).catch(() => setMessage(t.failure))}>{lang === 'fr' ? 'Copier' : lang === 'ar' ? 'نسخ' : 'Copy'}</button></>}<h3>{t.shares}</h3>{shares.map(share => <p key={share.id}>{new Date(share.expires_at).toLocaleDateString(lang)} <button disabled={busy} onClick={() => void revoke(share.id)}>{t.revoke}</button></p>)}{message && <p role="status">{message}</p>}<button autoFocus onClick={close}>{lang === 'fr' ? 'Fermer' : lang === 'ar' ? 'إغلاق' : 'Close'}</button></dialog>
}
