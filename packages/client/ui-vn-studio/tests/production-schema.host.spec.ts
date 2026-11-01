import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseProject, SceneStore } from '../src/store.ts'
import { saveProductionPlan } from '../src/director-plan.ts'

const production = {
  version: 1, premise: 'Restore a neighbourhood reading room.', tone: 'Quiet, warm',
  pacing: { minScenes: 5, minBeats: 12, maxBeats: 20 },
  cast: [{ id: 'sora', name: '소라', voice: 'Practical, short sentences', desire: 'Keep the room open' }],
  scenes: [{ id: 'start', title: 'A shared shelf', purpose: 'Learn how they work together', sharedActivity: 'Sort donated books',
    relationshipBefore: 'Strangers', relationshipAfter: 'Recognise each other’s care', relationshipChange: 'small',
    beats: ['A box breaks', 'They gather the books together'], continuity: ['The red book stays on the table'] }],
  media: [{ id: 'room', kind: 'background', name: 'Reading room', sceneIds: ['start'], prompt: 'Original warm reading room, late afternoon' }],
}
const project = { id: 'demo', title: 'Reading room', language: 'ko', entry: 'start', scenes: [{ id: 'start', title: 'Start', lines: [], choices: [] }] }

it('retains optional production metadata through durable revisions and ordinary undo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-production-schema-'))
  try {
    const store = new SceneStore(root)
    const old = await store.create('demo', 'Reading room', 'ko')
    expect(old.project).not.toHaveProperty('production')
    const saved = await store.save('demo', 0, { ...project, production }, 'agent')
    expect(saved.project).toHaveProperty('production', production)
    expect((await new SceneStore(root).read('demo')).project).toEqual(saved.project)
    expect((await store.undo('demo', 1)).project).toEqual(old.project)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects unbounded metadata and dangling planned media references', () => {
  expect(() => parseProject({ ...project, production: { ...production, premise: 'x'.repeat(4001) } })).toThrow(/text|limit|premise/i)
  expect(() => parseProject({ ...project, production: { ...production, cast: Array.from({ length: 17 }, (_, n) => ({ ...production.cast[0], id: `person_${n}` })) } })).toThrow(/cast|16/i)
  expect(() => parseProject({ ...project, production: { ...production, media: [{ ...production.media[0], sceneIds: ['missing'] }] } })).toThrow(/scene|reference/i)
  expect(() => parseProject({ ...project, production: { ...production, pacing: { minScenes: 5, minBeats: 20, maxBeats: 12 } } })).toThrow(/pacing|beat/i)
  expect(() => parseProject({ ...project, production: { ...production, scenes: [production.scenes[0], production.scenes[0]] } })).toThrow(/duplicate/i)
})

it('normalizes structured planned scores into the existing durable string format', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-production-score-'))
  const score = { tempo: 90, instrument: 'piano', notes: [{ midi: 60, beat: 0, duration: 1, velocity: 0.4 }] }
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Reading room', 'ko')
    const saved = await saveProductionPlan(store, 'demo', 0, { ...production, media: [
      { id: 'theme', kind: 'music', name: 'Theme', sceneIds: ['start'], scoreJson: score },
    ] })
    expect(saved.project.production?.media[0]?.scoreJson).toBe('{"tempo":90,"instrument":"piano","notes":[{"midi":60,"beat":0,"duration":1,"velocity":0.4}]}')
    expect((await new SceneStore(root).read('demo')).project).toEqual(saved.project)
    const existingString = JSON.stringify(score, null, 2)
    const resaved = await saveProductionPlan(store, 'demo', saved.revision, { ...saved.project.production!, media: [
      { ...saved.project.production!.media[0], scoreJson: existingString },
    ] })
    expect(resaved.project.production?.media[0]?.scoreJson).toBe(existingString)
    expect((await store.undo('demo', resaved.revision)).project).toEqual(saved.project)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each(['legacy current source', '{"tempo":90,"instrument":"piano","notes":[{"midi":60,"beat":0,"duration":1,"velocity":0.4}]}'])('reads, lists and undoes legacy scores even when only history contains malformed strings %#', async currentScore => {
  const root = await mkdtemp(join(tmpdir(), 'vn-production-legacy-scores-'))
  const draft = (scoreJson: string, title: string) => ({ ...project, title,
    assets: [{ id: 'old_music', name: 'Previously rendered music', kind: 'music', mime: 'audio/wav', bytes: 48 }],
    production: { ...production, media: [{ id: 'theme', kind: 'music', name: 'Theme', sceneIds: ['start'], scoreJson, assetId: 'old_music' }] },
  })
  try {
    const previousScores = ['not JSON', '{broken', '{}', 'true', '{"tempo":900,"instrument":"piano","notes":[]}']
    await writeFile(join(root, 'demo.json'), JSON.stringify({ version: 1, revision: 6,
      project: draft(currentScore, 'Current'),
      history: previousScores.map((score, index) => ({ project: draft(score, `Previous ${index}`), origin: 'agent' })),
    }))
    const store = new SceneStore(root)
    let saved = await store.read('demo')
    expect(saved.project.production?.media[0]).toMatchObject({ scoreJson: currentScore, assetId: 'old_music' })
    expect(await store.list()).toEqual([{ id: 'demo', title: 'Current', language: 'ko' }])
    for (const scoreJson of previousScores.toReversed()) {
      saved = await store.undo('demo', saved.revision)
      expect(saved.project.production?.media[0]?.scoreJson).toBe(scoreJson)
      expect((await new SceneStore(root).read('demo')).project).toEqual(saved.project)
    }
    expect(saved.canUndo).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

it.each([
  { scoreJson: 42, message: /media\[0\]\.scoreJson.*object.*JSON string/i },
  { scoreJson: [], message: /media\[0\]\.scoreJson.*object.*JSON string/i },
  { scoreJson: null, message: /media\[0\]\.scoreJson.*object.*JSON string/i },
  { scoreJson: '{broken', message: /media\[0\]\.scoreJson.*JSON/i },
  { scoreJson: 'true', message: /media\[0\]\.scoreJson.*object/i },
  { scoreJson: { tempo: 900, instrument: 'piano', notes: [{ midi: 60, beat: 0, duration: 1, velocity: 0.4 }] }, message: /media\[0\]\.scoreJson.*tempo/i },
  { scoreJson: JSON.stringify({ tempo: 90, instrument: 'piano', notes: [] }), message: /media\[0\]\.scoreJson.*notes/i },
  { scoreJson: 'x'.repeat(128 * 1024 + 1), message: /media\[0\]\.scoreJson.*131072/i },
  { scoreJson: { extra: 'x'.repeat(128 * 1024) }, message: /media\[0\]\.scoreJson.*131072/i },
])('rejects new plan input with the precise score field %#', async ({ scoreJson, message }) => {
  const root = await mkdtemp(join(tmpdir(), 'vn-production-invalid-score-'))
  try {
    const store = new SceneStore(root)
    await store.create('demo', 'Reading room', 'ko')
    await expect(saveProductionPlan(store, 'demo', 0, { ...production, media: [
      { id: 'theme', kind: 'music', name: 'Theme', sceneIds: ['start'], scoreJson },
    ] })).rejects.toThrow(message)
    expect((await store.read('demo')).revision).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
