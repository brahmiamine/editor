import type { MetadataRoute } from 'next'
export const dynamic = 'force-static'
export default function manifest(): MetadataRoute.Manifest {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  return { name: 'Papertrail', short_name: 'Papertrail', description: 'Notes privées, même hors connexion.', start_url: base + '/notes/', scope: base + '/', display: 'standalone', background_color: '#f8f7f3', theme_color: '#dfaa30', icons: [{ src: base + '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: base + '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }
}
