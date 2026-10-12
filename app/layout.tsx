import './globals.css'
export const metadata = { title: { default: 'Papertrail', template: '%s · Papertrail' }, applicationName: 'Papertrail', description: 'A calm, fast place for your notes.', appleWebApp: { capable: true, title: 'Papertrail' } }
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="fr"><body>{children}</body></html> }
