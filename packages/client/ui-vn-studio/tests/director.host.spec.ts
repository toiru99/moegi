import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as NativeTools from '@deepseek-ai/dsh-tool-executor-native'
import Skills from '@deepseek-ai/dsh-skill'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { VnStudio } from '../src/controller.ts'
import { VnMedia } from '../src/media.ts'
import { VnSkin } from '../src/ui-skin.ts'
import * as Director from '../src/director-plugin.ts'
import type { NovelProduction } from '../src/types.ts'
import type { Config as StudioConfig } from '../src/config.ts'

class UnconfiguredCredentials extends CredentialProvider {
  async resolve() { return undefined }
  async describe() { return { configured: false, writable: false } }
  async set(): Promise<never> { throw new Error('No credential writes in this fixture') }
  async unset(): Promise<never> { throw new Error('No credential writes in this fixture') }
  async readRecord() { return undefined }
  async describeRecord() { return { configured: false, writable: false } }
  async listRecords() { return [] }
  async modifyRecord(): Promise<never> { throw new Error('No credential writes in this fixture') }
  async deleteRecord(): Promise<never> { throw new Error('No credential writes in this fixture') }
}

function plan(): NovelProduction {
  return { version: 1, premise: 'Sort a box of old books together', tone: 'Warm', pacing: { minScenes: 1, minBeats: 12, maxBeats: 20 },
    cast: [{ id: 'sora', name: '소라', voice: 'Practical', desire: 'Keep the reading room open' }],
    scenes: [{ id: 'start', title: 'A shared shelf', purpose: 'Notice care through action', sharedActivity: 'Sort donated books',
      relationshipBefore: 'Strangers', relationshipAfter: 'Willing to help again', relationshipChange: 'small',
      beats: Array.from({ length: 12 }, (_, index) => `Action and reaction ${index + 1}`), continuity: [] }],
    media: [
      { id: 'room', name: 'Reading room', kind: 'background', sceneIds: ['start'], prompt: 'An original warm reading room' },
      { id: 'sora', name: 'Sora', kind: 'character', sceneIds: ['start'], prompt: 'An original librarian character, transparent background' },
      { id: 'theme', name: 'Quiet work', kind: 'music', sceneIds: ['start'], scoreJson: JSON.stringify({ tempo: 90, instrument: 'piano', notes: [{ midi: 60, beat: 0, duration: 1, velocity: 0.4 }] }) },
      { id: 'bell', name: 'Door bell', kind: 'sound', sceneIds: ['start'], preset: 'bell' },
    ] }
}

async function setup(skills = true, directorConfig: Partial<Director.Config> = {}, mediaConfig: Partial<StudioConfig> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-')), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(NativeTools)
    if (skills) await ctx.plugin(Skills)
    await ctx.plugin(UnconfiguredCredentials)
    const config = { projectDirectory: root, codexImageEnabled: false, ...mediaConfig }
    await ctx.plugin(VnStudio, config)
    await ctx.plugin(VnMedia, config)
    await ctx.plugin(VnSkin)
    const fiber = ctx.plugin(Director, { defaultSceneCount: 5, defaultMinBeats: 12, defaultMaxBeats: 20, maxMediaJobs: 8, ...directorConfig })
    await fiber
    return { ctx, root, fiber, dispose: async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) } }
  } catch (error) { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error }
}

it('starts authoring and image providers without any legacy engine directories', async () => {
  const fixture = await setup(false, {}, { codexImageEnabled: true, codexExecutable: join(tmpdir(), 'vn-no-codex-installed-fixture.exe') })
  try {
    expect(await fixture.ctx.vnMedia.providers.status()).toEqual([
      { id: 'codex-images', kinds: ['background', 'character'], ready: false },
      { id: 'openai-images', kinds: ['background', 'character'], ready: false },
    ])
    await fixture.ctx.vnStudio.create('demo', 'Browser story', 'ko')
    expect(await fixture.ctx.vnStudio.preview('demo')).toMatchObject({ projectId: 'demo', playback: 'browser', url: '/?project=demo' })
  } finally { await fixture.dispose() }
})

it('automatically contributes its real packaged skill and tool, and removes them when unloaded', async () => {
  const fixture = await setup()
  const { ctx, fiber } = fixture
  try {
    const skill = await ctx.skills.get('vn-director')
    expect(skill).toMatchObject({ name: 'vn-director', source: 'bundled', invocation: { modelInvocable: true, userInvocable: true } })
    expect(skill?.content).toContain('vn_director')
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain(skill!.content)
    expect(ctx.tools.get('vn_director')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('vn_director')).toBeUndefined()
    expect(await ctx.skills.get('vn-director')).toBeUndefined()
    expect((await ctx.systemPrompt.assemble()).sections.map(section => section.name)).not.toContain('vn-director-guidance')
  } finally { await fixture.dispose() }
})

it('returns compact model mutation receipts and keeps full project reads and remote results', async () => {
  const fixture = await setup(false, { maxMediaJobs: 1 })
  const { ctx } = fixture
  const call = async (action: string, revision?: number, fields: Record<string, string> = {}) => {
    const result = await executeToolFixture(ctx, { callId: ToolCallId(`receipt-${action}-${revision}`), name: 'vn_director',
      arguments: { action, id: 'demo', ...revision === undefined ? {} : { revision }, ...fields }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    return { text, value: JSON.parse(text) }
  }
  try {
    let saved = await ctx.vnStudio.create('demo', 'Room', 'ko')
    saved = await ctx.vnStudio.documents.save('demo', saved.revision, { ...saved.project,
      scenes: [{ ...saved.project.scenes[0], lines: [{ speaker: '', text: 'Prior dialogue must not be echoed in mutation receipts.' }] }] }, 'manual')
    const production = plan()
    production.scenes.push({ ...production.scenes[0]!, id: 'next', title: 'The next shelf' })
    const planned = await call('plan', saved.revision, { planJson: JSON.stringify(production) })
    expect(planned.value).toEqual({ id: 'demo', revision: 2, changedSceneIds: ['next'], changedMediaIds: ['room', 'sora', 'theme', 'bell'], addedAssetIds: [],
      counts: { scenes: 2, beats: 1, assets: 0, mediaTasks: 4 } })
    expect(planned.text).not.toContain('Prior dialogue')
    expect(planned.text).not.toContain(production.premise)
    const written = await call('write_scene', planned.value.revision, { sceneJson: JSON.stringify({ id: 'next', lines: [{ speaker: '소라', text: 'New dialogue stays in the saved scene.' }] }) })
    expect(written.value).toEqual({ id: 'demo', revision: 3, changedSceneIds: ['next'], changedMediaIds: [], addedAssetIds: [],
      counts: { scenes: 2, beats: 2, assets: 0, mediaTasks: 4 } })
    expect(written.text).not.toContain('dialogue')
    expect(written.value).not.toHaveProperty('project')
    expect(written.value).not.toHaveProperty('saved')
    const prepared = await call('prepare_media', written.value.revision)
    expect(prepared.value).toMatchObject({ id: 'demo', revision: 5, changedSceneIds: ['start'], changedMediaIds: ['theme'], addedAssetIds: [expect.stringMatching(/^asset_/)],
      counts: { scenes: 2, beats: 2, assets: 1, mediaTasks: 4 }, status: { revision: 5, ready: false } })
    expect(prepared.value.status.media.find((task: { id: string }) => task.id === 'theme')).toMatchObject({ assetId: prepared.value.addedAssetIds[0], state: 'ready' })
    expect(prepared.text).not.toContain('Prior dialogue must not be echoed in mutation receipts.')
    expect(prepared.text).not.toContain('New dialogue stays in the saved scene.')
    expect(prepared.value.status.uiSkin).toMatchObject({ ready: false, providerReady: false,
      roles: [{ role: 'title', state: 'blocked' }, { role: 'cursor', state: 'blocked' }, { role: 'dialogue', state: 'blocked' }] })
    expect(prepared.text).not.toContain(production.premise)
    expect(prepared.value).not.toHaveProperty('saved')
    const resumed = await call('prepare_media', prepared.value.revision)
    expect(resumed.value).toMatchObject({ revision: 7, changedMediaIds: ['bell'], status: { revision: 7 } })
    const read = await call('read')
    expect(read.value.project.scenes.map((scene: { lines: { text: string }[] }) => scene.lines[0]?.text)).toEqual([
      'Prior dialogue must not be echoed in mutation receipts.', 'New dialogue stays in the saved scene.',
    ])
    expect(read.value.project.production.premise).toBe(production.premise)
    expect((await ctx.vnDirector.read('demo')).project).toEqual(read.value.project)
  } finally { await fixture.dispose() }
})

it('automatically prepares project-owned UI art for browser playback within the shared media budget', async () => {
  const fixture = await setup(false, { maxMediaJobs: 1 })
  const { ctx } = fixture
  try {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 40, g: 80, b: 100, alpha: 0.5 } } }).png().toBuffer()
    ctx.vnMedia.providers.register({ id: 'codex-images', kinds: ['background', 'character'], ready: async () => true, generate: async () => png })
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const production = plan()
    let saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(production))
    saved = await ctx.vnDirector.writeScene('demo', saved.revision, JSON.stringify({ id: 'start', lines: Array.from({ length: 12 }, (_, n) => ({ speaker: '', text: `An action and reply ${n}` })) }))
    for (let count = 0; count < production.media.length; count++) saved = (await ctx.vnDirector.prepareMedia('demo', saved.revision)).saved
    expect(await ctx.vnStudio.playbackMode()).toBe('prototype')
    const originalScenes = saved.project.scenes
    expect(await ctx.vnDirector.status('demo')).toMatchObject({ ready: false, uiSkin: { ready: false, roles: [ { role: 'title', state: 'pending' }, { role: 'cursor', state: 'pending' }, { role: 'dialogue', state: 'pending' } ] } })
    for (let count = 1; count <= 3; count++) {
      const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
      saved = result.saved
      expect(result.status.uiSkin?.roles.filter(role => role.state === 'ready')).toHaveLength(count)
      expect(result.status.ready).toBe(count === 3)
      expect(saved.project.scenes).toEqual(originalScenes)
    }
    const complete = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(complete.saved.revision).toBe(saved.revision)
    expect(complete.status.warnings).toEqual([])
  } finally { await fixture.dispose() }
})

it('prefers the ready Codex image provider when another provider was registered first', async () => {
  const fixture = await setup(false)
  const { ctx } = fixture
  try {
    const apiImage = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#aa4444' } }).png().toBuffer()
    const codexImage = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#44aa44' } }).png().toBuffer()
    ctx.vnMedia.providers.register({ id: 'fixture-api-images', kinds: ['background', 'character'], ready: async () => true, generate: async () => apiImage })
    ctx.vnMedia.providers.register({ id: 'codex-images', kinds: ['background', 'character'], ready: async () => true, generate: async () => codexImage })
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(plan()))
    const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(result.saved.project.assets?.filter(asset => asset.kind === 'background' || asset.kind === 'character').map(asset => asset.provenance?.provider)).toEqual(['codex-images', 'codex-images'])
  } finally { await fixture.dispose() }
})

it('activates without the optional skill registry and keeps unavailable images visibly pending while rendering actual audio', async () => {
  const fixture = await setup(false)
  const { ctx } = fixture
  try {
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    let saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(plan()))
    saved = await ctx.vnDirector.writeScene('demo', saved.revision, JSON.stringify({ id: 'start', lines: Array.from({ length: 12 }, (_, n) => ({ speaker: '', text: `The books settle ${n}` })) }))
    const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(result.status.media.map(task => [task.id, task.state])).toEqual([['room', 'blocked'], ['sora', 'blocked'], ['theme', 'ready'], ['bell', 'ready']])
    expect(result.status.uiSkin).toMatchObject({ ready: false, providerReady: false,
      roles: [{ role: 'title', state: 'blocked' }, { role: 'cursor', state: 'blocked' }, { role: 'dialogue', state: 'blocked' }] })
    expect(result.status.warnings.filter(warning => warning.code === 'ui-skin-incomplete')).toHaveLength(3)
    expect(result.saved.project.assets?.map(asset => asset.kind)).toEqual(['music', 'sound'])
    const music = result.saved.project.assets!.find(asset => asset.kind === 'music')!
    expect((await ctx.vnMedia.assets.bytes('demo', music.id)).toString('ascii', 0, 4)).toBe('RIFF')
    expect(result.saved.project.scenes[0]?.visual?.music).toBe(music.id)
    await unlink(await ctx.vnMedia.assets.path('demo', music.id))
    const missing = await ctx.vnDirector.status('demo')
    expect(missing.ready).toBe(false)
    expect(missing.media.find(task => task.id === 'theme')?.state).not.toBe('ready')
    expect(missing.warnings.map(warning => warning.code)).toContain('missing-asset-file')
  } finally { await fixture.dispose() }
})

it('uses a ready image provider and binds admitted images with real audio into the saved scenes', async () => {
  const fixture = await setup()
  const { ctx } = fixture
  try {
    const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#446688' } }).png().toBuffer()
    ctx.vnMedia.providers.register({ id: 'codex-images', kinds: ['background', 'character'], ready: async () => true, generate: async () => png })
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    let saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(plan()))
    saved = await ctx.vnDirector.writeScene('demo', saved.revision, JSON.stringify({ id: 'start', lines: Array.from({ length: 12 }, (_, n) => ({ speaker: '', text: `A concrete action and reply ${n}` })) }))
    const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(result.status.ready).toBe(true)
    expect(result.status.media.map(task => task.state)).toEqual(['ready', 'ready', 'ready', 'ready'])
    expect(result.status.uiSkin).toMatchObject({ ready: true, roles: [{ role: 'title', state: 'ready' }, { role: 'cursor', state: 'ready' }, { role: 'dialogue', state: 'ready' }] })
    expect(result.saved.project.scenes[0]?.visual).toMatchObject({ background: expect.stringMatching(/^asset_/), music: expect.stringMatching(/^asset_/), sound: expect.stringMatching(/^asset_/),
      characters: [{ asset: expect.stringMatching(/^asset_/), x: 50, y: 100, scale: 0.85 }] })
    const again = await ctx.vnDirector.prepareMedia('demo', result.saved.revision)
    expect(again.saved.revision).toBe(result.saved.revision)
  } finally { await fixture.dispose() }
})

it('cancels a model tool waiting on images without importing or binding late provider output', async () => {
  const fixture = await setup()
  const { ctx } = fixture
  try {
    const entered = Promise.withResolvers<void>(), finished = Promise.withResolvers<Buffer>()
    ctx.vnMedia.providers.register({ id: 'slow-images', kinds: ['background', 'character'], ready: async () => true,
      generate: async () => { entered.resolve(); return finished.promise } })
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(plan()))
    const controller = new AbortController()
    const pending = executeToolFixture(ctx, { callId: ToolCallId('cancel-production-media'), name: 'vn_director', arguments: { action: 'prepare_media', id: 'demo', revision: saved.revision }, signal: controller.signal })
    await entered.promise
    controller.abort()
    finished.resolve(Buffer.from('late image'))
    expect((await pending).isError).toBe(true)
    expect((await ctx.vnStudio.read('demo')).project.assets).toBeUndefined()
    expect((await ctx.vnStudio.read('demo')).revision).toBe(saved.revision)
  } finally { await fixture.dispose() }
})

it('forwards model cancellation while preparing browser interface artwork without admitting late images', async () => {
  const fixture = await setup(false)
  const { ctx } = fixture
  const entered = Promise.withResolvers<void>(), finished = Promise.withResolvers<Buffer>()
  try {
    ctx.vnMedia.providers.register({ id: 'codex-images', kinds: ['background', 'character'], ready: async () => true,
      generate: async () => { entered.resolve(); return finished.promise } })
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const production = plan(); production.media = []
    const saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(production))
    const controller = new AbortController()
    const pending = executeToolFixture(ctx, { callId: ToolCallId('cancel-interface-artwork'), name: 'vn_director', arguments: { action: 'prepare_media', id: 'demo', revision: saved.revision }, signal: controller.signal })
    await entered.promise
    controller.abort()
    finished.resolve(Buffer.from('late interface image'))
    expect((await pending).isError).toBe(true)
    expect(await ctx.vnStudio.read('demo')).toEqual(saved)
  } finally { finished.resolve(Buffer.from('late interface image')); await fixture.dispose() }
})

it('bounds each preparation call and resumes pending media using the returned revision', async () => {
  const fixture = await setup(false, { maxMediaJobs: 1 })
  const { ctx } = fixture
  try {
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(plan()))
    const first = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(first.saved.project.assets?.map(asset => asset.kind)).toEqual(['music'])
    expect(first.status.media.find(task => task.id === 'bell')?.state).toBe('pending')
    const second = await ctx.vnDirector.prepareMedia('demo', first.saved.revision)
    expect(second.saved.project.assets?.map(asset => asset.kind)).toEqual(['music', 'sound'])
    expect(second.status.media.find(task => task.id === 'bell')?.state).toBe('ready')
    const third = await ctx.vnDirector.prepareMedia('demo', second.saved.revision)
    expect(third.saved.revision).toBe(second.saved.revision)
  } finally { await fixture.dispose() }
})

it('reuses the exact admitted file when repeated sound requirements synthesize identical bytes', async () => {
  const fixture = await setup(false)
  const { ctx } = fixture
  try {
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const production = plan()
    production.media.push({ id: 'other_bell', name: 'A second door cue', kind: 'sound', sceneIds: ['start'], preset: 'bell' })
    const saved = await ctx.vnDirector.plan('demo', 0, JSON.stringify(production))
    const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    const first = result.saved.project.production!.media.find(task => task.id === 'bell')!
    const repeated = result.saved.project.production!.media.find(task => task.id === 'other_bell')!
    expect(repeated.assetId).toBe(first.assetId)
    expect(result.saved.project.assets?.filter(asset => asset.kind === 'sound')).toHaveLength(1)
    expect(result.status.media.find(task => task.id === 'other_bell')?.state).toBe('ready')
  } finally { await fixture.dispose() }
})

it('continues executable jobs past an occupied visual role that requires an explicit author decision', async () => {
  const fixture = await setup(false, { maxMediaJobs: 1 })
  const { ctx } = fixture
  try {
    await ctx.vnStudio.create('demo', 'Room', 'ko')
    const score = (midi: number) => JSON.stringify({ tempo: 90, instrument: 'piano', notes: [{ midi, beat: 0, duration: 1, velocity: 0.4 }] })
    const original = await ctx.vnMedia.composeAssetWithSignal('demo', 0, 'Original music', score(60))
    const other = await ctx.vnMedia.composeAssetWithSignal('demo', original.saved.revision, 'Alternative music', score(62))
    const production = plan()
    production.media = [
      { id: 'alternative', name: 'Alternative music', kind: 'music', sceneIds: ['start'], assetId: other.assetId },
      { id: 'bell', name: 'Door cue', kind: 'sound', sceneIds: ['start'], preset: 'bell' },
    ]
    let saved = await ctx.vnDirector.plan('demo', other.saved.revision, JSON.stringify(production))
    saved = await ctx.vnStudio.documents.save('demo', saved.revision, { ...saved.project, scenes: saved.project.scenes.map(scene => ({ ...scene, visual: { characters: [], music: original.assetId } })) }, 'manual')
    const result = await ctx.vnDirector.prepareMedia('demo', saved.revision)
    expect(result.status.media.map(task => [task.id, task.state])).toEqual([['alternative', 'unassigned'], ['bell', 'ready']])
    expect(result.saved.project.scenes[0]?.visual?.music).toBe(original.assetId)
  } finally { await fixture.dispose() }
})
