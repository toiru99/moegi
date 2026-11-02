import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseProject, SceneStore } from '../src/store.ts'
import { bindProductionMedia, deriveProductionStatus, saveProductionPlan, sceneUsesMedia, writeProductionScene } from '../src/director-plan.ts'

const assets = [
  { id: 'room', name: 'Room', kind: 'background', mime: 'image/png', bytes: 99, width: 100, height: 100 },
  { id: 'cg', name: 'Shared work', kind: 'background', mime: 'image/png', bytes: 99, width: 100, height: 100 },
  { id: 'sora', name: 'Sora', kind: 'character', mime: 'image/png', bytes: 99, width: 100, height: 100 },
  { id: 'theme', name: 'Theme', kind: 'music', mime: 'audio/wav', bytes: 48 },
  { id: 'bell', name: 'Bell', kind: 'sound', mime: 'audio/wav', bytes: 48 },
]
const visual = { background: 'room', characters: [{ asset: 'sora', x: 50, y: 100, scale: 0.85 }], music: 'theme', sound: 'bell',
  shot: 'close', transition: 'dissolve', focus: 0, cg: 'cg' }
const scene = { id: 'start', title: 'Room', lines: [{ speaker: 'Sora', text: 'Together?', visual }],
  choices: [{ text: 'Help', target: 'start', when: { accepted: false }, effects: { accepted: true } }] }
const project = { id: 'demo', title: 'Room', language: 'ko', entry: 'start', assets, scenes: [scene] }
const production = { version: 1, premise: 'Restore the reading room', tone: 'Warm', pacing: { minScenes: 1, minBeats: 1, maxBeats: 4 },
  cast: [{ id: 'sora', name: 'Sora', voice: 'Practical', desire: 'Keep the room open' }],
  scenes: [{ id: 'start', title: 'Room', purpose: 'Work together', sharedActivity: 'Sort books', relationshipBefore: 'Strangers', relationshipAfter: 'Co-workers',
    relationshipChange: 'small', beats: ['Offer help'], continuity: [] }],
  media: [{ id: 'variant', kind: 'character', name: 'Sora smiling', sceneIds: ['start'], prompt: 'Same character smiling', referenceAssetIds: ['sora', 'room'] }] }

it('retains complete beat snapshots and boolean choice maps through parse, restart and undo', async () => {
  expect(parseProject(project).scenes[0]).toEqual(scene)
  const root = await mkdtemp(join(tmpdir(), 'vn-direction-schema-'))
  try {
    const store = new SceneStore(root)
    const legacy = await store.create('demo', 'Room', 'ko')
    const saved = await store.save('demo', 0, project, 'agent')
    expect((await new SceneStore(root).read('demo')).project).toEqual(saved.project)
    expect((await store.undo('demo', saved.revision)).project).toEqual(legacy.project)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each([
  { ...visual, background: 'missing' }, { ...visual, cg: 'sora' }, { ...visual, music: 'bell' }, { ...visual, sound: 'theme' },
  { ...visual, characters: [{ ...visual.characters[0], asset: 'room' }] },
  { ...visual, characters: Array.from({ length: 4 }, () => visual.characters[0]) },
  { ...visual, shot: 'extreme' }, { ...visual, transition: 'script' },
  { ...visual, focus: 1 }, { ...visual, focus: 0.5 }, { ...visual, focus: -1 }, { ...visual, focus: 3 },
  { ...visual, characters: undefined },
])('rejects invalid beat snapshots without merging scene defaults %#', snapshot => {
  expect(() => parseProject({ ...project, scenes: [{ ...scene, visual, lines: [{ speaker: '', text: 'Beat', visual: snapshot }] }] })).toThrow()
})

it.each(['when', 'effects'])('validates bounded identifier boolean maps for %s', field => {
  for (const value of [null, [], 'accepted', { accepted: 'true' }, { 'bad.key': true }, Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`flag_${i}`, true]))]) {
    expect(() => parseProject({ ...project, scenes: [{ ...scene, choices: [{ text: 'Help', target: 'start', [field]: value }] }] })).toThrow()
  }
  const flags = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`flag_${i}`, i === 0]))
  expect(parseProject({ ...project, scenes: [{ ...scene, choices: [{ text: 'Help', target: 'start', [field]: flags }] }] }).scenes[0]?.choices[0]).toHaveProperty(field, flags)
})

it('admits only up to three existing image references for planned image tasks', () => {
  expect(parseProject({ ...project, production }).production?.media[0]).toHaveProperty('referenceAssetIds', ['sora', 'room'])
  for (const references of ['sora', [1], ['missing'], ['theme'], ['sora', 'room', 'cg', 'sora']]) {
    expect(() => parseProject({ ...project, production: { ...production, media: [{ ...production.media[0], referenceAssetIds: references }] } })).toThrow()
  }
})

it('writes full beat replacements and preserves omitted scene cues, choices and image references on replanning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-direction-write-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    let saved = await store.save('demo', 0, { ...project, scenes: [{ ...scene, visual }], production }, 'agent')
    const replacement = { speaker: 'Sora', text: 'A pause.', visual: { characters: [], shot: 'wide', transition: 'cut' } }
    saved = await writeProductionScene(store, 'demo', saved.revision, { id: 'start', lines: [replacement] })
    expect(saved.project.scenes[0]).toEqual({ ...scene, lines: [replacement], visual })
    const { referenceAssetIds: _references, ...task } = production.media[0]!
    saved = await saveProductionPlan(store, 'demo', saved.revision, { ...production, media: [task] })
    expect(saved.project.production?.media[0]?.referenceAssetIds).toEqual(['sora', 'room'])
    expect(saved.project.scenes[0]?.lines[0]?.visual).toEqual(replacement.visual)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('recognises beat-only character variants and CG and checks their actual files', () => {
  const saved = { revision: 1, canUndo: false, project: parseProject({ ...project, production }) }
  const currentScene = saved.project.scenes[0]!
  expect(sceneUsesMedia(currentScene, { id: 'cg_task', name: 'CG', kind: 'background', sceneIds: ['start'], assetId: 'cg' })).toBe(true)
  expect(sceneUsesMedia(currentScene, { id: 'variant', name: 'Sora', kind: 'character', sceneIds: ['start'], assetId: 'sora' })).toBe(true)
  const status = deriveProductionStatus(saved, [], new Set(['room', 'sora', 'theme', 'bell']))
  expect(status.warnings.filter(warning => warning.code === 'missing-asset-file')).toEqual([{ code: 'missing-asset-file', message: expect.stringContaining('cg') }])
})

it.each(['character', 'background'] as const)('leaves referenced %s tasks for deliberate author placement', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'vn-direction-referenced-binding-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Room', 'ko')
    const task = { ...production.media[0]!, kind }
    const saved = await store.save('demo', 0, { ...project, scenes: [{ ...scene, lines: [], visual: { characters: [] } }],
      production: { ...production, media: [task] } }, 'agent')
    const asset = saved.project.assets!.find(asset => asset.id === (kind === 'character' ? 'sora' : 'cg'))!
    const bound = await bindProductionMedia(store, saved, task.id, asset)
    expect(bound.project.scenes).toEqual(saved.project.scenes)
    expect(bound.project.production?.media[0]?.assetId).toBe(asset.id)
    expect(deriveProductionStatus(bound, [], new Set(assets.map(asset => asset.id))).media[0]?.state).toBe('unassigned')
  } finally { await rm(root, { recursive: true, force: true }) }
})
