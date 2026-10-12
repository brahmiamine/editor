import Link from 'next/link'

export default function Landing() {
  return <main className="landing">
    <nav className="landing-nav">
      <span className="mark">✳</span><b>Papertrail</b>
      <Link className="landing-login" href="/auth/">Connexion</Link>
      <Link className="landing-cta" href="/notes/">Essayer sans compte</Link>
    </nav>
    <div className="landing-hero">
      <div className="landing-copy">
        <div className="landing-kicker">NOTES · FR / EN / عربي</div>
        <h1>Des notes qui vous suivent.</h1>
        <p>Un éditeur calme et sans bordure. Vos notes restent sur l’appareil, puis se synchronisent avec votre compte.</p>
        <div className="landing-buttons">
          <Link className="landing-primary" href="/notes/">Nouvelle note</Link>
          <Link className="landing-secondary" href="/auth/?mode=signup">Créer un compte →</Link>
        </div>
        <div className="landing-features"><span>Enregistrement local</span><span>Export .md / .txt</span><span>3 thèmes</span></div>
      </div>
      <div className="landing-preview" aria-hidden="true">
        <div className="preview-side">
          <div className="preview-brand"><span className="mark">✳</span> Papertrail</div>
          <div className="preview-note selected">Idées de voyage<small>Lisbonne, Porto, Faro…</small></div>
          <div className="preview-note">Courses<small>Pain, citrons, café</small></div>
          <div className="preview-note">Réunion lundi<small>Points à aborder</small></div>
        </div>
        <div className="preview-page">
          <div className="preview-crumb">Tout › Idées de voyage</div>
          <div className="preview-text">Lisbonne en mars. Train de nuit vers Porto, puis la côte jusqu’à Faro<span className="caret" /></div>
        </div>
      </div>
    </div>
  </main>
}
