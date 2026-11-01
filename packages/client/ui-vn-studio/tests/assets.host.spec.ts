import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, it } from 'vitest'
import { AssetStore } from '../src/assets.ts'
import { SceneStore } from '../src/store.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'vn-media-'))
  roots.push(root)
  const scenes = new SceneStore(root)
  await scenes.create('demo', '雨の本屋', 'ko')
  const assets = new AssetStore(scenes, 8 * 1024 * 1024)
  const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: '#246080' } }).png().toBuffer()
  return { root, scenes, assets, png }
}

it('imports an image into owned storage and preserves it after reopen and undo', async () => {
  const { root, scenes, assets, png } = await setup()
  const saved = await assets.import('demo', 0, 'background', '비 오는 서점', png, { origin: 'import' })
  const asset = saved.project.assets![0]!
  expect(asset).toMatchObject({ name: '비 오는 서점', kind: 'background', mime: 'image/png', width: 32, height: 24 })
  expect(await readFile(await assets.path('demo', asset.id))).toEqual(png)
  expect(await assets.data('demo', asset.id)).toMatch(/^data:image\/png;base64,/)
  const reopened = new SceneStore(root)
  expect((await reopened.read('demo')).project.assets).toEqual([asset])
  const edited = await scenes.save('demo', saved.revision, { ...saved.project, title: '새 제목' }, 'manual')
  expect((await scenes.undo('demo', edited.revision)).project.assets).toEqual([asset])
})

it('refuses stale imports and invalid image/audio content without changing the document', async () => {
  const { scenes, assets, png } = await setup()
  await scenes.save('demo', 0, { ...(await scenes.read('demo')).project, title: 'Manual edit' }, 'manual')
  await expect(assets.import('demo', 0, 'background', 'Stale', png)).rejects.toThrow(/revision/i)
  await expect(assets.import('demo', 1, 'character', 'SVG', Buffer.from('<svg/>'))).rejects.toThrow(/image|media/i)
  await expect(assets.import('demo', 1, 'music', 'Invalid', png)).rejects.toThrow(/audio|media/i)
  const unchanged = (await scenes.read('demo')).project
  expect(unchanged.title).toBe('Manual edit')
  expect(unchanged.assets).toBeUndefined()
})

it('bounds uploads and image dimensions before committing project metadata', async () => {
  const { scenes, assets } = await setup()
  await expect(assets.import('demo', 0, 'background', 'Oversized', Buffer.alloc(8 * 1024 * 1024 + 1))).rejects.toThrow(/size|large|limit/i)
  const tooWide = await sharp({ create: { width: 4097, height: 1, channels: 4, background: '#fff' } }).png().toBuffer()
  await expect(assets.import('demo', 0, 'background', 'Too wide', tooWide)).rejects.toThrow(/dimension/i)
  const extreme = await sharp({ create: { width: 4096, height: 1, channels: 4, background: '#fff' } }).png().toBuffer()
  await expect(assets.import('demo', 0, 'character', 'Extreme aspect', extreme)).rejects.toThrow(/dimension|ratio/i)
  expect((await scenes.read('demo')).revision).toBe(0)
})

it('refuses unsupported or malformed audio instead of saving browser-only playable media', async () => {
  const { scenes, assets } = await setup()
  const mp3 = Buffer.alloc(64); mp3.write('ID3')
  const opus = Buffer.alloc(100); opus.write('OggS'); opus.write('OpusHead', 28)
  const brokenWave = Buffer.alloc(44); brokenWave.write('RIFF'); brokenWave.write('WAVE', 8)
  for (const bytes of [mp3, opus, brokenWave]) await expect(assets.import('demo', 0, 'music', 'Unsupported', bytes)).rejects.toThrow(/audio|WAV|Vorbis/i)
  expect((await scenes.read('demo')).revision).toBe(0)
})

it('rejects a symlinked asset directory instead of writing outside the project store', async () => {
  const { root, assets, png } = await setup()
  const outside = await mkdtemp(join(tmpdir(), 'vn-outside-'))
  roots.push(outside)
  await symlink(outside, join(root, 'demo.assets'), 'junction')
  await expect(assets.import('demo', 0, 'background', 'Escaped', png)).rejects.toThrow(/symlink|outside|confined/i)
})

it('does not import metadata after its caller cancels an asynchronous import', async () => {
  const { scenes, assets, png } = await setup()
  const controller = new AbortController()
  const pending = assets.import('demo', 0, 'background', 'Cancelled image', png, undefined, controller.signal)
  const rejected = expect(pending).rejects.toThrow(/abort/i)
  controller.abort()
  await rejected
  expect((await scenes.read('demo')).revision).toBe(0)
  expect((await scenes.read('demo')).project.assets).toBeUndefined()
})
