import { writeFile } from 'node:fs/promises'
import { STUDIO_FRAME, STUDIO_PLAY, STUDIO_TAB_ICON } from '../packages/client/ui-vn-studio/src/client/brand-art.ts'

const directory = new URL('../apps/web/public/', import.meta.url)
const svg = (color, background = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 32 32">${background}<g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${STUDIO_FRAME}"/></g><path d="${STUDIO_PLAY}" fill="${color}"/></svg>`
await writeFile(new URL('favicon.svg', directory), svg('#24445b'))
await writeFile(new URL('favicon-dark.svg', directory), svg('#e2edf2'))
await writeFile(new URL('vn-studio-favicon.svg', directory), STUDIO_TAB_ICON)
await writeFile(new URL('studio-icon.svg', directory), svg('#f5f8fb', '<rect width="32" height="32" rx="6" fill="#152e3f"/>'))
await writeFile(new URL('manifest.webmanifest', directory), JSON.stringify({
  name: 'VN Studio', short_name: 'VN Studio', description: 'Visual novel authoring with an AI agent.',
  start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#152e3f',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
}, null, 2) + '\n')
