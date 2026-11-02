import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import sharp from 'sharp'
import { SceneStore } from '../src/store.ts'
import { AssetStore } from '../src/assets.ts'
import { exportPortableGame } from '../../../../dev-tools/export-vn-game.ts'

it('exports admitted media and literal story text into an offline file without changing the source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-portable-')), store = new SceneStore(root), assets = new AssetStore(store)
  try {
    let saved = await store.create('sample', 'A </script> title', 'ko')
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#123456' } }).png().toBuffer()
    const imported = await assets.importResult('sample', saved.revision, 'background', 'Room', png, { origin: 'generated', provider: 'test', prompt: 'UNPUBLISHED_GENERATION_PROMPT' })
    saved = await store.save('sample', imported.saved.revision, { ...imported.saved.project, scenes: [{ id: 'start', title: 'Start',
      visual: { background: imported.assetId, characters: [] }, lines: [{ speaker: 'A', text: '</script><script>window.INJECTED=1</script>' }], choices: [] }] }, 'manual')
    const before = await readFile(join(root, 'sample.json')), output = join(root, 'game.html')
    const result = await exportPortableGame(root, 'sample', output)
    const html = await readFile(output, 'utf8')
    expect(result).toMatchObject({ file: output, revision: saved.revision, assets: 1 })
    expect(html).toContain('data:image/png;base64,')
    expect(html).not.toContain('<script>window.INJECTED=1</script>')
    expect(html).toContain('\\u003c/script>')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:/)
    expect(html).toContain('MIT License')
    expect(html.includes('UNPUBLISHED_GENERATION_PROMPT')).toBe(false)
    expect(await readFile(join(root, 'sample.json'))).toEqual(before)
    await expect(exportPortableGame(root, 'sample', output)).rejects.toThrow(/exist|overwrite/i)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('refuses missing admitted files before writing an export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-portable-missing-')), store = new SceneStore(root)
  try {
    const saved = await store.create('sample', 'Missing art', 'ko')
    await store.save('sample', saved.revision, { ...saved.project, assets: [{ id: 'missing', name: 'Missing', kind: 'background', mime: 'image/png', bytes: 1, width: 8, height: 8 }] }, 'manual')
    const missing = await store.read('sample')
    await store.save('sample', missing.revision, { ...missing.project, scenes: [{ id: 'start', title: 'Start', visual: { background: 'missing', characters: [] }, lines: [], choices: [] }] }, 'manual')
    await expect(exportPortableGame(root, 'sample', join(root, 'game.html'))).rejects.toThrow()
    await expect(readFile(join(root, 'game.html'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('excludes unused library images from the playable export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-portable-unused-')), store = new SceneStore(root)
  try {
    const saved = await store.create('sample', 'No art needed', 'ko')
    await store.save('sample', saved.revision, { ...saved.project, assets: [{ id: 'private', name: 'UNUSED_PRIVATE_ART', kind: 'background', mime: 'image/png', bytes: 1, width: 8, height: 8 }] }, 'manual')
    const output = join(root, 'game.html')
    expect(await exportPortableGame(root, 'sample', output)).toMatchObject({ assets: 0 })
    expect(await readFile(output, 'utf8')).not.toContain('UNUSED_PRIVATE_ART')
  } finally { await rm(root, { recursive: true, force: true }) }
})
