import { expect, it } from 'vitest'
import { advancePlayback, rememberPlayback, visitPlayback } from '../src/client/player-state.ts'
import type { NovelProject } from '../src/types.ts'

const project: NovelProject = { id: 'story', title: 'Story', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: 'First', lines: [{ speaker: '서윤', text: '어서 와요.' }, { speaker: '', text: '서로 책을 정리했다.' }], choices: [{ text: '계속', target: 'next' }] },
  { id: 'next', title: 'Next', lines: [{ speaker: '', text: '조금 더 편해졌다.' }], choices: [] },
] }

it('waits after the final spoken line before presenting a choice and pauses at the choice', () => {
  expect(advancePlayback(project, { sceneId: 'start', line: 0 })).toEqual({ sceneId: 'start', line: 1 })
  expect(advancePlayback(project, { sceneId: 'start', line: 1 })).toEqual({ sceneId: 'start', line: 2 })
  expect(advancePlayback(project, { sceneId: 'start', line: 2 })).toBeUndefined()
  expect(visitPlayback(project, 'next')).toEqual({ sceneId: 'next', line: 0 })
})

it('keeps a bounded, nonduplicated played path for history and saves', () => {
  const history = rememberPlayback([], { sceneId: 'start', line: 0 })
  expect(rememberPlayback(history, { sceneId: 'start', line: 0 })).toEqual(history)
  let many = history
  for (let line = 1; line <= 300; line++) many = rememberPlayback(many, { sceneId: 'start', line })
  expect(many).toHaveLength(200)
  expect(many.at(-1)?.line).toBe(300)
})
