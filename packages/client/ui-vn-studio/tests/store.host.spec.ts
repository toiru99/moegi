/** Host-side durable scene transactions. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SceneStore } from '../src/store.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function store() {
  const root = await mkdtemp(join(tmpdir(), 'vn-studio-'))
  roots.push(root)
  return { root, store: new SceneStore(root) }
}

it('persists Korean and Japanese scenes, detects conflicts, and restores the prior revision', async () => {
  const { root, store: first } = await store()
  const created = await first.create('demo', '첫 만남', 'ko')
  const project = { ...created.project, scenes: [{ id: 'start', title: '교실', lines: [
    { speaker: '하루', text: '안녕, 오늘도 좋은 아침이야.' },
    { speaker: '春', text: 'おはよう、また会えたね。' },
  ], choices: [{ text: '인사한다', target: 'start' }] }] }
  const saved = await first.save('demo', created.revision, project, 'agent')
  const reopened = await new SceneStore(root).read('demo')
  expect(reopened.project).toEqual(project)
  expect(reopened.revision).toBe(saved.revision)
  await expect(first.save('demo', created.revision, project, 'manual')).rejects.toThrow(/revision/i)
  const undone = await first.undo('demo', saved.revision)
  expect(undone.project).toEqual(created.project)
  expect(undone.revision).toBeGreaterThan(saved.revision)
})

it('serializes concurrent edits so only one writer can commit a revision', async () => {
  const { store: first } = await store()
  const created = await first.create('demo', 'Demo', 'ja')
  const results = await Promise.allSettled([
    first.save('demo', created.revision, { ...created.project, title: 'one' }, 'manual'),
    first.save('demo', created.revision, { ...created.project, title: 'two' }, 'agent'),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect((await first.read('demo')).revision).toBe(1)
})

it('rejects path traversal, duplicate project creation, and broken branch targets before changing disk', async () => {
  const { store: first } = await store()
  await expect(first.create('../escape', 'Demo', 'ko')).rejects.toThrow(/id/i)
  const created = await first.create('demo', 'Demo', 'ko')
  await expect(first.create('demo', 'Replacement', 'ko')).rejects.toThrow(/exist/i)
  const invalid = { ...created.project, scenes: [{ id: 'start', title: 'Start', lines: [], choices: [{ text: 'Go', target: 'missing' }] }] }
  await expect(first.save('demo', 0, invalid, 'agent')).rejects.toThrow(/target/i)
  expect((await first.read('demo')).project).toEqual(created.project)
})

it('keeps large valid projects editable when undo history reaches its byte budget', async () => {
  const { store: first } = await store()
  let saved = await first.create('large', 'Long story', 'ko')
  const project = { ...saved.project, scenes: [{ id: 'start', title: 'Long scene', choices: [],
    lines: Array.from({ length: 70 }, () => ({ speaker: '하루', text: '이야기'.repeat(600) })),
  }] }
  for (let index = 0; index < 7; index++) saved = await first.save('large', saved.revision, { ...project, title: `Draft ${index}` }, 'manual')
  const undone = await first.undo('large', saved.revision)
  expect(undone.project.title).toBe('Draft 5')
  expect((await first.read('large')).project.scenes[0]?.lines).toHaveLength(70)
})

it('does not commit a cancelled save queued behind another transaction', async () => {
  const { store: first } = await store()
  const saved = await first.create('cancelled', 'Original', 'ko')
  const active = first.save('cancelled', 0, { ...saved.project, title: 'First edit' }, 'manual')
  const controller = new AbortController()
  const pending = first.save('cancelled', 1, { ...saved.project, title: 'Cancelled edit' }, 'agent', controller.signal)
  const rejected = expect(pending).rejects.toThrow(/abort/i)
  controller.abort()
  await active; await rejected
  expect((await first.read('cancelled')).project.title).toBe('First edit')
  expect((await first.read('cancelled')).revision).toBe(1)
})
