import { useEffect, useRef, useState } from 'react'
import { basePath, supabase } from '../supabase'
import { deleteLocal } from '../lib/local-db'
import { featureCopy, sharedAccountCopy, type Language } from '../lib/i18n'

export function AccountDialog({ userId, email, lang, open, close }: { userId?: string; email?: string; lang: Language; open: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [deletion, setDeletion] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const t = featureCopy[lang]
  useEffect(() => { if (open) dialog.current?.showModal(); else { dialog.current?.close(); setPassword(''); setConfirmation(''); setDeletion(''); setMessage('') } }, [open])
  async function changePassword() {
    if (!supabase) return
    if (password !== confirmation) { setMessage(t.mismatch); return }
    setBusy(true)
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; setMessage(t.done); setPassword(''); setConfirmation('') } catch { setMessage(t.failure) } finally { setBusy(false) }
  }
  async function deleteAccount() {
    if (!supabase || !userId) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.functions.invoke('papertrail-account', { body: { confirmation: 'DELETE' } })
      if (error) {
        if ('context' in error && error.context instanceof Response) { const details = await error.context.json().catch(() => ({})); if (details.error === 'shared_account') { setMessage(sharedAccountCopy[lang]); return } }
        throw error
      }
      await deleteLocal('books', 'papertrail-notes:' + userId)
      localStorage.removeItem('papertrail-notes:' + userId)
      await supabase.auth.signOut({ scope: 'local' })
      location.replace(basePath + '/notes/')
    } catch { setMessage(t.failure) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="insert-dialog" aria-labelledby="account-title" onCancel={close}><h2 id="account-title">{t.settings}</h2><p>{email}</p><form onSubmit={event => { event.preventDefault(); void changePassword() }}><label>{t.password}<input required type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></label><label>{t.confirmPassword}<input required type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button disabled={busy}>{t.savePassword}</button></form><details><summary>{t.deleteAccount}</summary><p>{t.deleteWarning}</p><label>{t.deleteConfirm}<input value={deletion} onChange={event => setDeletion(event.target.value)} autoComplete="off" /></label><button className="danger" disabled={busy || deletion !== (lang === 'fr' ? 'SUPPRIMER' : 'DELETE')} onClick={() => void deleteAccount()}>{t.deleteAccount}</button></details>{message && <p role="status">{message}</p>}<button autoFocus disabled={busy} onClick={close}>{lang === 'fr' ? 'Fermer' : lang === 'ar' ? 'إغلاق' : 'Close'}</button></dialog>
}
