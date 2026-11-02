import { expect, it } from 'vitest'
import { createStudioStore } from '../src/client/studio-store.ts'

it('retains the same unsaved project through view consumers and rejects replacing it with a reload', () => {
  const instance = createStudioStore().create()
  const saved = { revision: 2, canUndo: true, project: { id: 'demo', title: '서점', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: '첫 장면', lines: [], choices: [] }] } }
  instance.actions.adopt(saved)
  instance.actions.edit({ ...saved.project, title: '수동으로 고친 제목' })
  expect(instance.getSnapshot().dirty).toBe(true)
  expect(() => instance.actions.adopt({ ...saved, revision: 3 })).toThrow(/unsaved/i)
  expect(instance.getSnapshot().draft?.title).toBe('수동으로 고친 제목')
  instance.actions.discard()
  instance.actions.adopt({ ...saved, revision: 3 })
  expect(instance.getSnapshot().loaded?.revision).toBe(3)
  expect(instance.getSnapshot().dirty).toBe(false)
})

it('resets rehearsal position on an external story replacement and clamps manual deletions', () => {
  const instance = createStudioStore().create()
  const saved = { revision: 1, canUndo: false, project: { id: 'demo', title: '서점', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: '첫 장면', lines: [{ speaker: '', text: '하나' }, { speaker: '', text: '둘' }, { speaker: '', text: '셋' }], choices: [] }] } }
  instance.actions.adopt(saved); instance.actions.line(3)
  const shortened = { ...saved, revision: 2, project: { ...saved.project, scenes: [{ ...saved.project.scenes[0]!, lines: [{ speaker: '', text: '새 이야기' }] }] } }
  instance.actions.adopt(shortened)
  expect(instance.getSnapshot().line).toBe(0)
  instance.actions.line(1)
  instance.actions.adopt({ ...shortened, revision: 3, project: { ...shortened.project, scenes: [{ ...shortened.project.scenes[0]!, lines: [] }] } }, true)
  expect(instance.getSnapshot().line).toBe(0)
})

it('restarts only playback position while preserving the exact authored draft and saved revision', () => {
  const instance = createStudioStore().create()
  const saved = { revision: 9, canUndo: true, project: { id: 'demo', title: 'Own story', language: 'ko' as const, entry: 'start', scenes: [
    { id: 'start', title: 'Opening', lines: [{ speaker: '', text: 'Keep this line.' }], choices: [] },
    { id: 'next', title: 'Next', lines: [{ speaker: '', text: 'Keep this too.' }], choices: [] },
  ] } }
  instance.actions.adopt(saved); instance.actions.scene('next'); instance.actions.line(1)
  const draft = { ...saved.project, title: 'Unsaved title' }
  instance.actions.edit(draft)
  instance.actions.restartPlayback()
  expect(instance.getSnapshot()).toMatchObject({ dirty: true, sceneId: 'start', line: 0, playbackRun: 1, draft, loaded: saved })
  expect(instance.getSnapshot().draft).toBe(draft)
})
