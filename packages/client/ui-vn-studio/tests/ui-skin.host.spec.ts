import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as NativeTools from '@deepseek-ai/dsh-tool-executor-native'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import sharp from 'sharp'
import { expect, it, vi } from 'vitest'
import { VnStudio } from '../src/controller.ts'
import { VnMedia } from '../src/media.ts'
import { VnSkin } from '../src/ui-skin.ts'
import type { MediaRequest } from '../src/media-providers.ts'
import type { NovelProduction } from '../src/types.ts'

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

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'vn-skin-')), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(NativeTools); await ctx.plugin(UnconfiguredCredentials)
    const config = { projectDirectory: root, previewDirectory: join(root, 'previews'), compilerDirectory: root, fontFile: join(root, 'font.ttf'), codexImageEnabled: false }
    await ctx.plugin(VnStudio, config); await ctx.plugin(VnMedia, config)
    const fiber = ctx.plugin(VnSkin); await fiber
    const saved = await ctx.vnStudio.create('demo', '헬스시뮬', 'ko')
    return { ctx, root, fiber, saved, dispose: async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) } }
  } catch (error) { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); throw error }
}

const png = (color = '#446688') => sharp({ create: { width: 32, height: 32, channels: 4, background: color } }).png().toBuffer()

it('reports missing roles and requires the registered native provider even if an API provider is ready', async () => {
  const f = await setup()
  try {
    f.ctx.vnMedia.providers.register({ id: 'other-images', kinds: ['background'], ready: async () => true, generate: async () => png() })
    expect(await f.ctx.vnSkin.status('demo')).toEqual({ revision: 0, ready: false, providerReady: false,
      roles: ['title', 'cursor', 'dialogue'].map(role => ({ role, state: 'blocked' })) })
    const result = await f.ctx.vnSkin.prepare('demo', 0)
    expect(result.saved.revision).toBe(0)
    expect(result.saved.project).not.toHaveProperty('uiSkin')
    await f.fiber.dispose()
    expect(f.ctx.tools.get('vn_skin')).toBeUndefined()
  } finally { await f.dispose() }
})

it('generates original interface data in bounded resumable jobs and preserves story and existing assets', async () => {
  const f = await setup(), requests: MediaRequest[] = []
  try {
    const bg = await f.ctx.vnMedia.assets.importResult('demo', 0, 'background', 'Existing background', await png('#334455'))
    let before = await f.ctx.vnStudio.documents.save('demo', bg.saved.revision, { ...bg.saved.project,
      scenes: [{ ...bg.saved.project.scenes[0], lines: [{ speaker: '서윤', text: 'Prior dialogue is preserved.' }] }] }, 'manual')
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true,
      generate: async request => { requests.push(request); return png(['#445566', '#556677', '#667788'][requests.length - 1]) } })
    expect((await f.ctx.vnSkin.status('demo')).roles.every(role => role.state === 'pending')).toBe(true)
    const first = await f.ctx.vnSkin.prepare('demo', before.revision, undefined, 1)
    expect(requests).toHaveLength(1)
    expect(first.status.roles.map(role => role.state)).toEqual(['ready', 'pending', 'pending'])
    expect(first.saved.project.uiSkin).toMatchObject({ version: 1, title: expect.stringMatching(/^asset_/) })
    const result = await f.ctx.vnSkin.prepare('demo', first.saved.revision)
    expect(requests).toHaveLength(3)
    expect(result.status.ready).toBe(true)
    expect(result.saved.project.assets?.[0]).toEqual(bg.saved.project.assets![0])
    expect(result.saved.project.scenes).toEqual(before.project.scenes)
    expect(requests.map(request => request.presentation?.transparent)).toEqual([false, true, true])
    expect(requests.every(request => request.kind === 'background')).toBe(true)
    expect(requests[0]?.prompt).toMatch(/헬스시뮬[\s\S]*1920.?1080/)
    expect(requests[0]?.prompt).toMatch(/915[\s\S]*1080/)
    expect(requests[0]?.prompt).toMatch(/no.*buttons/i)
    expect(requests[1]?.prompt).toMatch(/barbell[\s\S]*upper.left/i)
    expect(requests[2]?.prompt).toMatch(/788[\s\S]*292/)
    expect(requests[2]?.prompt).toMatch(/\(417,812\)[\s\S]*\(442,879\)/)
    expect(requests[2]?.prompt).toContain('No inner boxes, nameplates')
    const again = await f.ctx.vnSkin.prepare('demo', result.saved.revision)
    expect(again.saved).toEqual(result.saved)
    expect(requests).toHaveLength(3)
    const replaced = await f.ctx.vnSkin.prepare('demo', result.saved.revision, undefined, 1, ['cursor'])
    expect(requests).toHaveLength(4)
    expect(replaced.saved.project.uiSkin?.title).toBe(result.saved.project.uiSkin?.title)
  } finally { await f.dispose() }
})

it('attaches the three most recurring planned character assets only to the title', async () => {
  const f = await setup(), requests: MediaRequest[] = []
  try {
    let saved = f.saved
    const ids: string[] = []
    for (let index = 0; index < 4; index++) {
      const imported = await f.ctx.vnMedia.assets.importResult('demo', saved.revision, 'character', `Heroine ${index}`, await png(`#${index + 1}45566`))
      saved = imported.saved; ids.push(imported.assetId)
    }
    const production: NovelProduction = { version: 1, premise: 'Exercise together in a gym', tone: 'Warm teal evenings',
      pacing: { minScenes: 1, minBeats: 8, maxBeats: 12 }, cast: [],
      scenes: ['start', 'next', 'third'].map(id => ({ id, title: id, purpose: 'Grow close', sharedActivity: 'Training', relationshipBefore: 'Strangers', relationshipAfter: 'Friends', relationshipChange: 'small', beats: ['Train'], continuity: [] })),
      media: ids.map((assetId, index) => ({ id: `heroine_${index}`, kind: 'character', name: `Heroine ${index}`, assetId,
        sceneIds: index === 0 ? ['start'] : index === 3 ? ['start', 'next', 'third'] : ['start', 'next'] })) }
    saved = await f.ctx.vnStudio.documents.save('demo', saved.revision, { ...saved.project, production }, 'manual')
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true,
      generate: async request => { requests.push(request); return png() } })
    await f.ctx.vnSkin.prepare('demo', saved.revision)
    expect(requests[0]?.presentation?.references).toEqual(await Promise.all([ids[3]!, ids[1]!, ids[2]!].map(id => f.ctx.vnMedia.assets.path('demo', id))))
    expect(requests[0]?.prompt).toMatch(/Heroine 3[\s\S]*Heroine 1[\s\S]*Heroine 2/)
    expect(requests[1]?.presentation?.references).toBeUndefined()
    expect(requests[2]?.presentation?.references).toBeUndefined()
  } finally { await f.dispose() }
})

it('returns compact model receipts while ordinary host calls retain full saved revisions', async () => {
  const f = await setup()
  try {
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true, generate: async () => png() })
    const saved = await f.ctx.vnStudio.documents.save('demo', 0, { ...f.saved.project,
      scenes: [{ ...f.saved.project.scenes[0], lines: [{ speaker: '', text: 'Private authored dialogue.' }] }] }, 'manual')
    const result = await executeToolFixture(f.ctx, { callId: ToolCallId('prepare-skin'), name: 'vn_skin',
      arguments: { action: 'prepare', id: 'demo', revision: saved.revision }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    const receipt = JSON.parse(text)
    expect(receipt).toMatchObject({ id: 'demo', revision: expect.any(Number), roles: expect.any(Array), status: { ready: true } })
    expect(receipt).not.toHaveProperty('saved'); expect(receipt).not.toHaveProperty('project')
    expect(text).not.toContain('Private authored dialogue')
    expect(text).not.toContain('brief')
    const full = await f.ctx.vnSkin.prepare('demo', receipt.revision)
    expect(full.saved.project.scenes[0]?.lines[0]?.text).toBe('Private authored dialogue.')
  } finally { await f.dispose() }
})

it('keeps an assigned missing file blocked until replacement is explicitly requested', async () => {
  const f = await setup()
  try {
    let generated = 0
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true, generate: async () => png(generated++ ? '#667788' : '#446688') })
    const first = await f.ctx.vnSkin.prepare('demo', 0, undefined, 1)
    const assetId = first.saved.project.uiSkin!.title!
    await unlink(await f.ctx.vnMedia.assets.path('demo', assetId))
    expect((await f.ctx.vnSkin.status('demo')).roles[0]).toEqual({ role: 'title', assetId, state: 'blocked' })
    const next = await f.ctx.vnSkin.prepare('demo', first.saved.revision, undefined, 1)
    expect(next.saved.project.uiSkin?.title).toBe(assetId)
    expect(next.status.roles[0]?.state).toBe('blocked')
  } finally { await f.dispose() }
})

it('cancels provider output and waits for it during disposal without importing a late artifact', async () => {
  const f = await setup(), entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<Buffer>()
  let providerSignal: AbortSignal | undefined
  try {
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true,
      generate: async request => { providerSignal = request.signal; entered.resolve(); return finish.promise } })
    const pending = f.ctx.vnSkin.prepare('demo', 0), rejected = expect(pending).rejects.toThrow(/abort/i)
    await entered.promise
    let disposed = false
    const disposing = f.fiber.dispose().then(() => { disposed = true })
    await expect.poll(() => providerSignal?.aborted).toBe(true)
    expect(disposed).toBe(false)
    finish.resolve(await png()); await disposing; await rejected
    expect((await f.ctx.vnStudio.read('demo')).project).not.toHaveProperty('assets')
  } finally { finish.resolve(await png()); await f.dispose() }
})

it('rejects stale revisions, oversized briefs and out-of-range job limits before image calls', async () => {
  const f = await setup()
  try {
    await expect(f.ctx.vnSkin.prepare('demo', 3)).rejects.toThrow(/revision/i)
    await expect(f.ctx.vnSkin.prepare('demo', 0, 'x'.repeat(4001))).rejects.toThrow(/brief/i)
    for (const jobs of [0, 4, 1.5]) await expect(f.ctx.vnSkin.prepare('demo', 0, undefined, jobs)).rejects.toThrow(/job/i)
  } finally { await f.dispose() }
})

it('passes caller cancellation through the final queued binding save', async () => {
  const f = await setup(), entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(), caller = new AbortController()
  try {
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true, generate: async () => png() })
    const original = f.ctx.vnStudio.documents.save.bind(f.ctx.vnStudio.documents)
    const save = vi.spyOn(f.ctx.vnStudio.documents, 'save').mockImplementation(async (...args) => {
      const project = args[2]
      if (typeof project === 'object' && project !== null && 'uiSkin' in project) { entered.resolve(); await finish.promise }
      return original(...args)
    })
    const pending = f.ctx.vnSkin.prepareWithSignal('demo', 0, undefined, 1, undefined, caller.signal)
    const rejected = expect(pending).rejects.toThrow(/abort/i)
    await entered.promise; caller.abort(); finish.resolve(); await rejected
    expect((await f.ctx.vnStudio.read('demo')).project).not.toHaveProperty('uiSkin')
    expect(save.mock.calls.at(-1)?.[4]?.aborted).toBe(true)
    save.mockRestore()
  } finally { finish.resolve(); vi.restoreAllMocks(); await f.dispose() }
})

it('keeps previously bound roles when a later native generation fails', async () => {
  const f = await setup()
  try {
    let count = 0
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true,
      generate: async () => { if (++count === 2) throw new Error('Native limit reached'); return png() } })
    await expect(f.ctx.vnSkin.prepare('demo', 0)).rejects.toThrow('Native limit reached')
    const saved = await f.ctx.vnStudio.read('demo')
    expect(saved.project.uiSkin?.title).toMatch(/^asset_/)
    expect((await f.ctx.vnSkin.status('demo')).roles.map(role => role.state)).toEqual(['ready', 'pending', 'pending'])
  } finally { await f.dispose() }
})

it('accepts the full brief limit and long project titles within provider and asset name limits', async () => {
  const f = await setup(), requests: MediaRequest[] = []
  try {
    const saved = await f.ctx.vnStudio.documents.save('demo', 0, { ...f.saved.project, title: '가'.repeat(256) }, 'manual')
    f.ctx.vnMedia.providers.register({ id: 'codex-images', supportsReferences: true, kinds: ['background'], ready: async () => true,
      generate: async request => { requests.push(request); return png() } })
    const result = await f.ctx.vnSkin.prepare('demo', saved.revision, '나'.repeat(4000), 1)
    expect(result.saved.project.uiSkin?.brief).toHaveLength(4000)
    expect(requests[0]!.prompt.length).toBeLessThanOrEqual(4000)
    expect(result.saved.project.assets![0]!.name.length).toBeLessThanOrEqual(256)
  } finally { await f.dispose() }
})
