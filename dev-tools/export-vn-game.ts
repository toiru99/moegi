/** Export an admitted saved story as a self-contained offline browser game. */
import { createRequire } from 'node:module'
import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SceneStore } from '../packages/client/ui-vn-studio/src/store.ts'
import { AssetStore } from '../packages/client/ui-vn-studio/src/assets.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jsonText = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')
const escaped = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** Read immutable project media, bundle the existing player, and create a new HTML file. */
export async function exportPortableGame(projectDirectory: string, id: string, destination: string): Promise<{ file: string; title: string; revision: number; assets: number; bytes: number }> {
  const file = resolve(destination)
  try { await access(file); throw new Error('Export file already exists; refusing overwrite.') }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  const store = new SceneStore(projectDirectory), assets = new AssetStore(store), saved = await store.read(id)
  const project = structuredClone(saved.project)
  delete project.production
  if (project.uiSkin !== undefined) project.uiSkin.brief = ''
  const used = new Set<string>()
  for (const scene of project.scenes) for (const visual of [scene.visual, ...scene.lines.map(line => line.visual)]) if (visual !== undefined) {
    for (const id of [visual.cg, ...visual.cg === undefined ? [visual.background, ...visual.characters.map(actor => actor.asset)] : [], visual.music, visual.sound]) if (id !== undefined) used.add(id)
  }
  for (const role of ['title', 'dialogue', 'cursor'] as const) { const id = project.uiSkin?.[role]; if (id !== undefined) used.add(id) }
  if (project.assets !== undefined) project.assets = project.assets.filter(asset => used.has(asset.id))
  const urls: Record<string, string> = {}
  for (const asset of project.assets ?? []) {
    delete asset.provenance
    urls[asset.id] = `data:${asset.mime};base64,${(await assets.bytes(id, asset.id)).toString('base64')}`
  }
  const require = createRequire(import.meta.resolve('tsx'))
  const clientRequire = createRequire(resolve(root, 'packages/client/ui-vn-studio/package.json'))
  const primitivesRequire = createRequire(resolve(root, 'packages/client/ui-primitives/package.json'))
  const { build } = require('esbuild') as { build(options: Record<string, unknown>): Promise<{ outputFiles: { path: string; text: string }[] }> }
  const bundle = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'dev-tools/portable-player.tsx')], outdir: 'portable-build', write: false,
    bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic', tsconfig: resolve(root, 'tsconfig.base.json'),
    alias: { '@deepseek-ai/dsh-client-ui-primitives': resolve(root, 'dev-tools/portable-primitives.ts'),
      react: dirname(clientRequire.resolve('react/package.json')), 'react-dom': dirname(clientRequire.resolve('react-dom/package.json')) },
    loader: { '.module.css': 'local-css' }, define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'inline' })
  const js = bundle.outputFiles.find(file => file.path.endsWith('.js'))?.text, css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text
  if (!js || !css) throw new Error('Player bundle is incomplete.')
  const notices = await Promise.all([resolve(root, 'LICENSE'), ...['react', 'react-dom', 'scheduler', 'clsx'].map(name => {
    if (name === 'clsx') return resolve(dirname(primitivesRequire.resolve('clsx')), '../license')
    const path = name === 'scheduler' ? createRequire(clientRequire.resolve('react-dom/package.json')).resolve('scheduler/package.json')
      : clientRequire.resolve(`${name}/package.json`)
    return resolve(dirname(path.startsWith('file:') ? fileURLToPath(path) : path), 'LICENSE')
  })].map(path => readFile(path, 'utf8')))
  const theme = `:root{color-scheme:dark;--dsw-alias-bg-base:#111820;--dsw-alias-bg-layer-1:#18212c;--dsw-alias-bg-layer-2:#202c3a;--dsw-alias-label-primary:#f5f7fb;--dsw-alias-label-secondary:#b5c1cf;--dsw-alias-label-primary-foreground:#101820;--dsw-alias-border-l3:#465569;--dsw-alias-state-business-primary:#9adbd4;--dsw-alias-button-primary-fill:#a2e5dd;--dsw-alias-button-primary-hover:#c0f4ed;--dsw-alias-interactive-bg-hover:#ffffff16;--dsw-alias-interactive-bg-hover-solid:#283443;--dsw-alias-interactive-bg-active:#ffffff24;--dsw-alias-bg-mask-1:#0009;--dsw-alias-bg-mask-photo:#0008;--dsw-alias-toast-label:#fff;--dsw-radius-sm:8px;--dsw-radius-md:12px;--dsw-radius-panel:18px;--dsw-mask-blur:blur(12px);--dsw-elevation-prominent:0 24px 90px #0008;--ds-transition-duration:160ms;--ds-ease-in-out:ease-in-out}*{box-sizing:border-box}body{margin:0;background:#0d1219;color:var(--dsw-alias-label-primary);font:15px/1.6 system-ui,"Malgun Gothic",sans-serif}button,input{font:inherit}button{cursor:pointer}button:focus-visible{outline:2px solid #a2e5dd;outline-offset:3px}.portable-game{width:min(1280px,100%);margin:auto;padding:12px}.portable-game header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 10px}.portable-game h1{font-size:16px;font-weight:500;margin:0}.portable-game header button{border:1px solid #465569;border-radius:8px;background:#18212c;color:#f5f7fb;padding:5px 12px}.portable-cover{position:relative;aspect-ratio:16/9;display:grid;place-items:center;background:#18212c;border-radius:12px;overflow:hidden}.portable-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.portable-cover button{position:relative;align-self:end;margin-bottom:6%;border:1px solid #b0e3df;border-radius:12px;background:#15252ce8;color:#fff;padding:12px 36px;font-size:18px;box-shadow:0 4px 24px #0008}.portable-note{color:#95a8bb;text-align:center;font-size:12px;margin:12px 0}@media(max-width:600px){.portable-game{padding:6px}.portable-game h1{font-size:13px}.portable-cover button{font-size:15px;padding:8px 22px}}`
  const html = `<!doctype html><html lang="${project.language === 'ja' ? 'ja' : 'ko'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped(project.title)}</title><style>${theme}\n${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><noscript>이 게임을 실행하려면 JavaScript를 허용하세요.</noscript><script type="application/json" id="vn-game-data">${jsonText({ project, urls })}</script><script type="application/json" id="vn-license-notices">${jsonText(notices)}</script><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
  await writeFile(file, html, { flag: 'wx' })
  return { file, title: project.title, revision: saved.revision, assets: Object.keys(urls).length, bytes: Buffer.byteLength(html) }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, id, destination] = process.argv.slice(2)
  if (!directory || !id || !destination) throw new Error('Usage: node --import tsx/esm dev-tools/export-vn-game.ts <project-directory> <id> <new-html-file>')
  console.log(JSON.stringify(await exportPortableGame(directory, id, destination)))
}
