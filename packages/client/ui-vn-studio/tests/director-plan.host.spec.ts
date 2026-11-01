import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { SceneStore } from '../src/store.ts'
import { bindProductionMedia, deriveProductionStatus, saveProductionPlan, writeProductionScene } from '../src/director-plan.ts'
import type { NovelProduction } from '../src/types.ts'

const plan = (): NovelProduction => ({
  version: 1, premise: 'Restore a neighbourhood reading room', tone: 'Warm',
  pacing: { minScenes: 5, minBeats: 12, maxBeats: 20 },
  cast: [{ id: 'sora', name: '소라', voice: 'Practical', desire: 'Keep the room open' }],
  scenes: ['start', 'sorting', 'repair', 'rain', 'opening'].map((id, index) => ({ id, title: id, purpose: 'Discover a small kindness',
    sharedActivity: 'Sort donated books', relationshipBefore: index === 0 ? 'Strangers' : 'Trust grows', relationshipAfter: 'Trust grows', relationshipChange: 'small',
    beats: ['Notice', 'React', 'Share the work'], continuity: ['The red book stays on the table'] })),
  media: [{ id: 'room', kind: 'background', name: 'Reading room', sceneIds: ['start'], prompt: 'Quiet original reading room' }],
})

it('adds outline placeholders without replacing the entry, assets, existing visuals or unrelated scenes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-plan-'))
  try {
    const store = new SceneStore(root)
    let saved = await store.create('demo', 'Room', 'ko')
    saved = await store.save('demo', 0, { ...saved.project, assets: [{ id: 'old_music', name: 'Original score', kind: 'music', mime: 'audio/wav', bytes: 48 }],
      scenes: [{ ...saved.project.scenes[0], lines: [{ speaker: '', text: 'Existing opening' }], visual: { characters: [], music: 'old_music' } },
        { id: 'epilogue', title: 'Keep me', lines: [{ speaker: '', text: 'Unrelated' }], choices: [] }] }, 'manual')
    const original = saved.project
    saved = await saveProductionPlan(store, 'demo', 1, plan())
    expect(saved.revision).toBe(2)
    expect(saved.project.entry).toBe('start')
    expect(saved.project.assets).toEqual(original.assets)
    expect(saved.project.scenes.slice(0, 2)).toEqual(original.scenes)
    expect(saved.project.scenes.find(scene => scene.id === 'opening')?.lines).toEqual([])
    expect(deriveProductionStatus(saved, [], new Set()).scenes.slice(0, 2)).toMatchObject([
      { id: 'start', phase: 'draft', beatCount: 1 }, { id: 'sorting', phase: 'planned', beatCount: 0 },
    ])
    await expect(saveProductionPlan(store, 'demo', 1, plan())).rejects.toThrow(/revision/i)
    const restored = await store.undo('demo', 2)
    expect(restored.project).toEqual(original)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('writes one scene while preserving omitted choices and visual fields, with revision and graph validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-write-'))
  try {
    const store = new SceneStore(root)
    let saved = await store.create('demo', 'Room', 'ko')
    saved = await saveProductionPlan(store, 'demo', 0, plan())
    saved = await store.save('demo', 1, { ...saved.project, assets: [
      { id: 'bg', name: 'Room', kind: 'background', mime: 'image/png', bytes: 99, width: 100, height: 100 },
      { id: 'music', name: 'Score', kind: 'music', mime: 'audio/wav', bytes: 48 },
    ], scenes: saved.project.scenes.map(scene => scene.id === 'start' ? { ...scene, choices: [{ text: 'Help', target: 'sorting' }], visual: { background: 'bg', characters: [], music: 'music' } } : scene) }, 'manual')
    const original = saved.project
    saved = await writeProductionScene(store, 'demo', 2, { id: 'start', lines: [{ speaker: '소라', text: 'Shall we sort these?' }], visual: { characters: [] } })
    expect(saved.project.scenes[0]).toMatchObject({ visual: { background: 'bg', characters: [], music: 'music' }, choices: [{ text: 'Help', target: 'sorting' }] })
    expect(saved.project.scenes.slice(1)).toEqual(original.scenes.slice(1))
    expect(saved.project.assets).toEqual(original.assets)
    expect(saved.project.production).toEqual(original.production)
    await expect(writeProductionScene(store, 'demo', 2, { id: 'start', lines: [] })).rejects.toThrow(/revision/i)
    await expect(writeProductionScene(store, 'demo', 3, { id: 'start', lines: [], choices: [{ text: 'Broken', target: 'missing' }] })).rejects.toThrow(/target/i)
    const cancelled = new AbortController(); cancelled.abort()
    await expect(writeProductionScene(store, 'demo', 3, { id: 'start', lines: [] }, cancelled.signal)).rejects.toThrow(/abort/i)
    expect((await store.read('demo')).revision).toBe(3)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('derives pacing, relationship and media warnings from actual saved scenes and available files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-status-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    const production = plan()
    production.scenes[0]!.relationshipChange = 'major'
    production.scenes[1]!.relationshipBefore = 'Suddenly engaged'
    let saved = await saveProductionPlan(store, 'demo', 0, production)
    saved = await writeProductionScene(store, 'demo', saved.revision, { id: 'start', lines: [], choices: [{ text: 'Continue together', target: 'sorting' }] })
    let status = deriveProductionStatus(saved, [{ id: 'images', kinds: ['background'], ready: false }], new Set())
    expect(status).toMatchObject({ plannedScenes: 5, writtenScenes: 0, ready: false, media: [{ state: 'blocked' }] })
    expect(status.warnings.map(w => w.code)).toContain('relationship-jump')
    expect(status.warnings.map(w => w.code)).toContain('relationship-continuity')
    saved = await writeProductionScene(store, 'demo', saved.revision, { id: 'start', lines: Array.from({ length: 12 }, (_, n) => ({ speaker: '', text: `Concrete action ${n}` })) })
    status = deriveProductionStatus(saved, [{ id: 'images', kinds: ['background'], ready: true }], new Set())
    expect(status).toMatchObject({ writtenScenes: 1, media: [{ state: 'pending' }] })
    const brief = plan(); brief.pacing = { minScenes: 1, minBeats: 1, maxBeats: 4 }; brief.scenes = brief.scenes.slice(0, 1); brief.media = []
    saved = await saveProductionPlan(store, 'demo', saved.revision, brief)
    status = deriveProductionStatus(saved, [], new Set())
    expect(status.warnings.map(w => w.code)).not.toContain('insufficient-scenes')
    expect(status.scenes[0]?.phase).toBe('written')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('preserves occupied visual roles and does not manufacture repeated revisions for an already bound unassigned task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-bind-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    let saved = await saveProductionPlan(store, 'demo', 0, plan())
    const old = { id: 'old_room', kind: 'background' as const, name: 'Keep my original', mime: 'image/png' as const, bytes: 100, width: 100, height: 100 }
    const next = { ...old, id: 'new_room', name: 'New requirement' }
    saved = await store.save('demo', 1, { ...saved.project, assets: [old, next], scenes: saved.project.scenes.map(scene => scene.id === 'start' ? { ...scene, visual: { background: old.id, characters: [] } } : scene) }, 'manual')
    saved = await bindProductionMedia(store, saved, 'room', next)
    expect(saved.project.scenes[0]?.visual?.background).toBe('old_room')
    expect(saved.project.production?.media[0]?.assetId).toBe('new_room')
    expect(deriveProductionStatus(saved, [], new Set(['old_room', 'new_room'])).media[0]?.state).toBe('unassigned')
    const again = await bindProductionMedia(store, saved, 'room', next)
    expect(again.revision).toBe(saved.revision)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('reports planned scenes that cannot be reached through the saved choice graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-graph-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    const saved = await saveProductionPlan(store, 'demo', 0, plan())
    const warnings = deriveProductionStatus(saved, [], new Set()).warnings
    expect(warnings.filter(warning => warning.code === 'unreachable-scene').map(warning => warning.sceneId)).toEqual(['sorting', 'repair', 'rain', 'opening'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('checks relationship continuity on authored incoming branches rather than adjacent plan entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-director-branch-continuity-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    const production = plan()
    const transitions = [
      ['start', 'Strangers', 'Task accepted'], ['book', 'Task accepted', 'Comfortable working together'],
      ['window', 'Task accepted', 'Comfortable working together'], ['shelf', 'Comfortable working together', 'Small promise kept'],
      ['closing', 'Small promise kept', 'A reason to return'],
    ]
    production.scenes = transitions.map(([id, before, after]) => ({ ...production.scenes[0]!, id: id!, title: id!, relationshipBefore: before!, relationshipAfter: after! }))
    let saved = await saveProductionPlan(store, 'demo', 0, production)
    const edges: Record<string, string[]> = { start: ['book', 'window'], book: ['shelf'], window: ['shelf'], shelf: ['closing'], closing: [] }
    saved = await store.save('demo', saved.revision, { ...saved.project, scenes: saved.project.scenes.map(scene => ({ ...scene,
      choices: (edges[scene.id] ?? []).map(target => ({ text: `Continue to ${target}`, target })) })) }, 'agent')
    expect(deriveProductionStatus(saved, [], new Set()).warnings.filter(warning => warning.code === 'relationship-continuity')).toEqual([])
    const changed = { ...saved, project: { ...saved.project, production: { ...production,
      scenes: production.scenes.map(scene => scene.id === 'window' ? { ...scene, relationshipAfter: 'Distrust grows' } : scene) } } }
    const warnings = deriveProductionStatus(changed, [], new Set()).warnings.filter(warning => warning.code === 'relationship-continuity')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ sceneId: 'shelf' })
    expect(warnings[0]?.message).toContain('window')
  } finally { await rm(root, { recursive: true, force: true }) }
})
