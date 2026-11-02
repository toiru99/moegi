/** Browser gameplay persistence remains separate from production revisions. */
import { link, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { SceneStore } from '../src/store.ts'
import { PlaybackStore } from '../src/playback-store.ts'
import { VnStudio } from '../src/controller.ts'
import { VnPlayback } from '../src/playback.ts'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vn-playback-'))
  roots.push(root)
  const documents = new SceneStore(root)
  const created = await documents.create('demo', 'Chapter', 'ko')
  await documents.save('demo', created.revision, { ...created.project, scenes: [
    { id: 'start', title: 'Library', lines: [{ speaker: '하루', text: '같이 읽을래?' }, { speaker: '', text: '잠시 기다렸다.' }], choices: [{ text: '함께 읽는다', target: 'end' }] },
    { id: 'end', title: 'Evening', lines: [], choices: [] },
  ] }, 'manual')
  return { root, documents, games: new PlaybackStore(documents) }
}

const position = { sceneId: 'start', line: 1, history: [{ sceneId: 'start', line: 0 }] }
const input = JSON.stringify(position)
const preferences = { musicVolume: 0.25, effectVolume: 0.5, autoDelayMs: 1900, textSize: 110 }

it('restores quick/manual slots and settings after restart without authoring writes', async () => {
  const { root, documents, games } = await fixture()
  const before = await readFile(join(root, 'demo.json'), 'utf8')
  await games.save('demo', 0, input)
  await games.save('demo', 6, JSON.stringify({ sceneId: 'end', line: 0, history: [position.history[0], { sceneId: 'start', line: 1 }] }))
  await games.saveSettings('demo', JSON.stringify(preferences))
  await games.close()

  const restarted = new PlaybackStore(new SceneStore(root))
  const slots = await restarted.slots('demo')
  expect(slots.map(slot => slot.slot)).toEqual([0, 6])
  expect(await restarted.load('demo', 0)).toMatchObject({ ...position, title: 'Library', text: '잠시 기다렸다.' })
  expect(await restarted.load('demo', 6)).toMatchObject({ sceneId: 'end', line: 0, text: '' })
  expect(slots[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(Number.isFinite(Date.parse(slots[0]!.time))).toBe(true)
  expect(await restarted.settings('demo')).toEqual(preferences)
  expect(await readFile(join(root, 'demo.json'), 'utf8')).toBe(before)
  expect((await documents.read('demo')).revision).toBe(1)
  expect((await readdir(root)).sort()).toEqual(['demo.json', 'demo.playback.json'])
  await restarted.close()
})

it('persists bounded boolean flags, accepts old slots without flags and leaves author progress untouched', async () => {
  const { root, games } = await fixture()
  const before = await readFile(join(root, 'demo.json'), 'utf8')
  await games.save('demo', 0, JSON.stringify({ ...position, flags: { trusted: true, declined: false } }))
  await games.close()
  const restarted = new PlaybackStore(new SceneStore(root))
  expect((await restarted.load('demo', 0)).flags).toEqual({ trusted: true, declined: false })
  const path = join(root, 'demo.playback.json')
  const stored = JSON.parse(await readFile(path, 'utf8'))
  delete stored.slots[0].flags
  await writeFile(path, JSON.stringify(stored))
  expect((await restarted.load('demo', 0)).flags ?? {}).toEqual({})
  const accumulated = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`f${index}`, true]))
  await restarted.save('demo', 2, JSON.stringify({ ...position, flags: accumulated }))
  expect((await restarted.load('demo', 2)).flags).toEqual(accumulated)
  const oldBytes = await readFile(path, 'utf8')
  for (const flags of [[], null, { trusted: 1 }, { 'invalid.key': true }, Object.fromEntries(Array.from({ length: 8193 }, (_, index) => [`f${index}`, true]))]) {
    await expect(restarted.save('demo', 1, JSON.stringify({ ...position, flags }))).rejects.toThrow(/flag|object|limit/i)
    expect(await readFile(path, 'utf8')).toBe(oldBytes)
  }
  expect(await readFile(join(root, 'demo.json'), 'utf8')).toBe(before)
  await restarted.close()
})

it('saves and restores all seven slots with the maximum accumulated flags and history', async () => {
  const { root, games } = await fixture()
  const flags = Object.fromEntries(Array.from({ length: 8192 }, (_, index) => [`f${String(index).padStart(63, '0')}`, index % 2 === 0]))
  const history = Array.from({ length: 200 }, () => position.history[0]!)
  const payload = JSON.stringify({ ...position, history, flags })
  expect(Buffer.byteLength(payload)).toBeGreaterThan(64 * 1024)
  for (let slot = 0; slot <= 6; slot++) await games.save('demo', slot, payload)
  await games.close()
  const restarted = new PlaybackStore(new SceneStore(root))
  const slots = await restarted.slots('demo')
  expect(slots).toHaveLength(7)
  expect(slots.every(slot => Object.keys(slot.flags ?? {}).length === 8192 && slot.history.length === 200)).toBe(true)
  expect((await restarted.load('demo', 6)).flags).toEqual(flags)
  await restarted.close()
})

it('isolates saves and preferences by project and owns immutable returned values', async () => {
  const { documents, games } = await fixture()
  await documents.create('other', 'Other', 'ja')
  await games.save('demo', 1, input)
  await games.saveSettings('demo', JSON.stringify(preferences))
  expect(await games.slots('other')).toEqual([])
  await expect(games.load('other', 1)).rejects.toThrow(/empty|slot/i)
  expect(await games.settings('other')).toEqual({ musicVolume: 0.7, effectVolume: 0.8, autoDelayMs: 2500, textSize: 100 })
  const settings = await games.settings('demo')
  settings.musicVolume = 1
  const slot = await games.load('demo', 1)
  slot.history.length = 0
  expect(await games.settings('demo')).toEqual(preferences)
  expect((await games.load('demo', 1)).history).toHaveLength(1)
})

it('rejects malformed, escaped, oversized and out-of-story gameplay before changing disk', async () => {
  const { root, games } = await fixture()
  for (const id of ['../escape', 'demo/extra', 'demo\\extra', 'DEMO', 'demo\0']) {
    await expect(games.slots(id)).rejects.toThrow(/id/i)
    await expect(games.save(id, 0, input)).rejects.toThrow(/id/i)
  }
  for (const slot of [-1, 7, 0.5, Number.NaN]) await expect(games.save('demo', slot, input)).rejects.toThrow(/slot/i)
  for (const bad of ['{', '[]', JSON.stringify({ ...position, sceneId: 'absent' }), JSON.stringify({ ...position, line: -1 }),
    JSON.stringify({ ...position, line: 3 }), JSON.stringify({ ...position, line: 0.5 }),
    JSON.stringify({ ...position, history: [{ sceneId: 'end', line: 1 }] }),
    JSON.stringify({ ...position, history: Array.from({ length: 201 }, () => ({ sceneId: 'start', line: 0 })) }),
    JSON.stringify({ ...position, fingerprint: 'not-a-digest' }), ' '.repeat(65537)]) {
    await expect(games.save('demo', 1, bad)).rejects.toThrow()
  }
  for (const bad of [{ ...preferences, musicVolume: 1.1 }, { ...preferences, effectVolume: -0.1 },
    { ...preferences, autoDelayMs: 0 }, { ...preferences, autoDelayMs: 1000.5 }, { ...preferences, textSize: 400 }, {}]) {
    await expect(games.saveSettings('demo', JSON.stringify(bad))).rejects.toThrow(/setting|volume|delay|size/i)
  }
  expect((await readdir(root)).sort()).toEqual(['demo.json'])
})

it('refuses incompatible story saves but accepts metadata-only revisions', async () => {
  const { documents, games } = await fixture()
  const saved = (await games.save('demo', 1, input))[0]!
  let current = await documents.read('demo')
  current = await documents.save('demo', current.revision, { ...current.project, title: 'Renamed production file',
    assets: [{ id: 'unused', kind: 'music', name: 'Unused track', mime: 'audio/wav', bytes: 128 }] }, 'manual')
  expect((await games.load('demo', 1)).fingerprint).toBe(saved.fingerprint)
  await documents.save('demo', current.revision, { ...current.project, scenes: current.project.scenes.map(scene => scene.id !== 'start' ? scene :
    { ...scene, lines: [{ speaker: '하루', text: '바뀐 이야기.' }, ...scene.lines.slice(1)] }) }, 'manual')
  expect(await games.slots('demo')).toHaveLength(1)
  await expect(games.load('demo', 1)).rejects.toThrow(/changed|incompatible|stale/i)
  await expect(games.save('demo', 2, JSON.stringify({ ...position, fingerprint: saved.fingerprint }))).rejects.toThrow(/changed|incompatible|stale/i)
  expect(await games.settings('demo')).toHaveProperty('textSize', 100)
  await games.save('demo', 1, input)
  expect((await games.load('demo', 1)).fingerprint).not.toBe(saved.fingerprint)
})

it('retains concurrent slot and preference updates through the owned write queue', async () => {
  const { games } = await fixture()
  await Promise.all([
    games.save('demo', 1, input), games.save('demo', 2, input), games.saveSettings('demo', JSON.stringify(preferences)),
    games.save('demo', 3, JSON.stringify({ ...position, line: 2 })),
  ])
  expect((await games.slots('demo')).map(slot => slot.slot)).toEqual([1, 2, 3])
  expect(await games.settings('demo')).toEqual(preferences)
})

it('persists only validated gameplay fields and derives display metadata on the Host', async () => {
  const { root, games } = await fixture()
  const saved = await games.save('demo', 1, JSON.stringify({ ...position, title: 'Spoofed title', text: 'Spoofed text',
    time: '1900-01-01T00:00:00.000Z', token: 'secret-value', image: 'data:image/png;base64,private' }))
  expect(saved[0]).toMatchObject({ title: 'Library', text: '잠시 기다렸다.' })
  const file = await readFile(join(root, 'demo.playback.json'), 'utf8')
  expect(file).not.toMatch(/secret-value|data:image|Spoofed|1900-01/)
})

it('rejects corrupt or foreign durable files without overwriting them', async () => {
  const { root, games } = await fixture()
  const path = join(root, 'demo.playback.json')
  for (const data of ['{', JSON.stringify({ version: 1, id: 'other', slots: [], settings: preferences }), ' '.repeat(262145)]) {
    await writeFile(path, data)
    await expect(games.slots('demo')).rejects.toThrow(/saved|playback|identity|size|JSON/i)
    await expect(games.saveSettings('demo', JSON.stringify(preferences))).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe(data)
  }
})

it('refuses externally linked project and playback files', async () => {
  const { root, games } = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'vn-playback-outside-'))
  roots.push(outside)
  await writeFile(join(outside, 'foreign.json'), 'private unrelated content')
  const externalLink = async (destination: string) => {
    try { await symlink(join(outside, 'foreign.json'), destination) }
    catch (error) {
      if (process.platform !== 'win32' || !(error instanceof Error) || !('code' in error) || error.code !== 'EPERM') throw error
      await link(join(outside, 'foreign.json'), destination)
    }
  }
  await externalLink(join(root, 'demo.playback.json'))
  await expect(games.settings('demo')).rejects.toThrow(/regular|symlink|confined|unsafe/i)
  await expect(games.save('demo', 1, input)).rejects.toThrow(/regular|symlink|confined|unsafe/i)
  await externalLink(join(root, 'escaped.json'))
  await expect(games.slots('escaped')).rejects.toThrow(/regular|symlink|confined|unsafe/i)
  expect(await readFile(join(outside, 'foreign.json'), 'utf8')).toBe('private unrelated content')
})

it('refuses a project directory redirected while the authoring document is being read', async () => {
  const { root, documents, games } = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'vn-playback-redirect-'))
  roots.push(outside)
  const read = documents.read.bind(documents), held = `${root}-held`
  vi.spyOn(documents, 'read').mockImplementationOnce(async (id) => {
    const current = await read(id)
    await rename(root, held)
    roots.push(held)
    await symlink(outside, root, process.platform === 'win32' ? 'junction' : 'dir')
    return current
  })
  await expect(games.settings('demo')).rejects.toThrow(/directory|confined|unsafe/i)
})

it('cancels queued writes and settles disposal before returning', async () => {
  const { root, documents, games } = await fixture()
  const read = documents.read.bind(documents)
  let release!: () => void
  let entered!: () => void
  const waiting = new Promise<void>((resolve) => { entered = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(documents, 'read').mockImplementationOnce(async (id) => { entered(); await gate; return read(id) })
  const active = games.save('demo', 1, input)
  const rejectedActive = expect(active).rejects.toThrow(/abort|disposed/i)
  await waiting
  const queued = games.saveSettings('demo', JSON.stringify(preferences))
  const rejectedQueued = expect(queued).rejects.toThrow(/abort|disposed/i)
  const closed = games.close()
  release()
  await Promise.all([closed, rejectedActive, rejectedQueued])
  expect((await readdir(root)).sort()).toEqual(['demo.json'])
  await expect(games.save('demo', 1, input)).rejects.toThrow(/abort|disposed/i)
})

it('cancels an individual queued operation while retaining the preceding committed slot', async () => {
  const { documents, games } = await fixture()
  const read = documents.read.bind(documents)
  let release!: () => void
  let entered!: () => void
  const waiting = new Promise<void>((resolve) => { entered = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(documents, 'read').mockImplementationOnce(async (id) => { entered(); await gate; return read(id) })
  const active = games.save('demo', 1, input)
  await waiting
  const controller = new AbortController()
  const queued = games.saveSettings('demo', JSON.stringify(preferences), controller.signal)
  const rejected = expect(queued).rejects.toThrow(/abort/i)
  controller.abort()
  release()
  await Promise.all([active, rejected])
  expect((await games.slots('demo')).map(slot => slot.slot)).toEqual([1])
  expect(await games.settings('demo')).toHaveProperty('musicVolume', 0.7)
})

it('mounts the dedicated remote service and aborts its owned queue during plugin disposal', async () => {
  const { root } = await fixture(), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, previewDirectory: root, compilerDirectory: root, fontFile: 'test.ttf' })
    await ctx.plugin(VnPlayback)
    const studio = ctx.get('vnStudio')!, playback = ctx.get('vnPlayback')!
    await playback.save('demo', 0, input)
    expect(await playback.slots('demo')).toHaveLength(1)
    expect(await playback.load('demo', 0)).toMatchObject(position)
    expect(await playback.saveSettings('demo', JSON.stringify(preferences))).toEqual(preferences)
    expect(await playback.settings('demo')).toEqual(preferences)
    const read = studio.documents.read.bind(studio.documents)
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => { entered = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.spyOn(studio.documents, 'read').mockImplementationOnce(async (id) => { entered(); await gate; return read(id) })
    const pending = playback.save('demo', 2, input)
    const rejected = expect(pending).rejects.toThrow(/abort|disposed/i)
    await waiting
    const disposed = ctx.fiber.dispose()
    release()
    await Promise.all([rejected, disposed])
    const reopened = new PlaybackStore(new SceneStore(root))
    expect((await reopened.slots('demo')).map(slot => slot.slot)).toEqual([0])
    expect((await new SceneStore(root).read('demo')).revision).toBe(1)
    await reopened.close()
  } finally { await ctx.fiber.dispose() }
})
