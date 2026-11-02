// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { resolveSceneDirection, choiceFlagsMatch } from '../src/direction.ts'
import { Stage } from '../src/client/Stage.tsx'
import { en } from '../src/client/locales.ts'
import type { NovelProject, NovelScene } from '../src/types.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

afterEach(() => { cleanup(); vi.useRealTimers() })
const t: PropsLocale<'vnStudio'>['t'] = key => en[key as keyof typeof en]
const scene: NovelScene = { id: 'start', title: 'Room', visual: { characters: [], background: 'room' }, lines: [
  { speaker: 'A', text: 'One' },
  { speaker: 'A', text: 'Two', visual: { background: 'room', characters: [{ asset: 'smile', x: 50, y: 100, scale: 1 }, { asset: 'other', x: 75, y: 100, scale: 1 }], shot: 'close', focus: 0, transition: 'dissolve' } },
  { speaker: '', text: 'Three' },
  { speaker: '', text: 'Four', visual: { characters: [], cg: 'cg' } },
], choices: [{ text: 'Hidden', target: 'end', when: { trusted: true } }, { text: 'Open', target: 'end', when: { trusted: false } }] }
const project: NovelProject = { id: 'story', title: 'Story', language: 'ko', entry: 'start', scenes: [scene], assets: [
  ...['room', 'cg'].map(id => ({ id, name: id, kind: 'background' as const, mime: 'image/png' as const, bytes: 1, width: 1600, height: 900 })),
  ...['smile', 'other'].map(id => ({ id, name: id, kind: 'character' as const, mime: 'image/png' as const, bytes: 1, width: 500, height: 900 })),
] }
const urls = { room: '/room.png', smile: '/smile.png', other: '/other.png', cg: '/cg.png' }

it('reconstructs the last full visual snapshot at any resumed line without merging defaults', () => {
  expect(resolveSceneDirection(scene, 0)).toEqual({ visual: scene.visual, cueIndex: -1 })
  expect(resolveSceneDirection(scene, 2)).toEqual({ visual: scene.lines[1]!.visual, cueIndex: 1 })
  expect(resolveSceneDirection(scene, 4)).toEqual({ visual: scene.lines[3]!.visual, cueIndex: 3 })
  expect(resolveSceneDirection({ id: scene.id, title: scene.title, choices: [], lines: [] }, 0)).toEqual({ visual: undefined, cueIndex: -1 })
})

it('treats unknown flags as false and never reads inherited properties', () => {
  expect(choiceFlagsMatch({ trusted: false }, {})).toBe(true)
  expect(choiceFlagsMatch({ trusted: true }, {})).toBe(false)
  expect(choiceFlagsMatch({ toString: true }, {})).toBe(false)
  expect(choiceFlagsMatch(undefined, {})).toBe(true)
})

it('renders expression snapshots with framing and focus, then replaces portraits with CG while preserving dialogue artwork', () => {
  const view = render(<Stage project={project} scene={scene} line={2} urls={urls} next={() => {}} choose={() => {}} dialogueFrame="/frame.png" t={t} />)
  const stage = screen.getByRole('region', { name: en.gameStage })
  expect(stage.getAttribute('data-shot')).toBe('close')
  expect(screen.getByRole('img', { name: 'smile' }).getAttribute('data-dimmed')).toBe('false')
  expect(screen.getByRole('img', { name: 'other' }).getAttribute('data-dimmed')).toBe('true')
  expect(screen.getByRole('img', { name: 'smile' }).closest('[data-transition]')?.getAttribute('data-transition')).toBe('dissolve')
  view.rerender(<Stage project={project} scene={scene} line={3} urls={urls} next={() => {}} choose={() => {}} dialogueFrame="/frame.png" t={t} />)
  expect(screen.getByRole('img', { name: 'cg' }).getAttribute('src')).toBe('/cg.png')
  expect(screen.queryByRole('img', { name: 'room' })).toBeNull()
  expect(screen.queryByRole('img', { name: 'smile' })).toBeNull()
  expect(screen.getByRole('img', { name: en.dialogueArtwork })).toBeTruthy()
})

it('filters choices with stable original indices and keeps legacy target callbacks', () => {
  const choose = vi.fn()
  render(<Stage project={project} scene={scene} line={4} urls={urls} next={() => {}} choose={choose} t={t} />)
  expect(screen.queryByRole('button', { name: 'Hidden' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(choose).toHaveBeenCalledWith('end', 1)
})

it('keeps outgoing artwork until an incoming dissolve has URLs and finishes', () => {
  vi.useFakeTimers()
  const props = { project, scene, next: () => {}, choose: () => {}, t }
  const view = render(<Stage {...props} line={0} urls={{ room: urls.room }} />)
  view.rerender(<Stage {...props} line={1} urls={{ room: urls.room }} />)
  expect(view.container.querySelector('[aria-hidden="true"] img')?.getAttribute('src')).toBe(urls.room)
  expect(view.container.querySelector('[data-transition]')?.getAttribute('style')).toContain('visibility: hidden')
  act(() => { vi.advanceTimersByTime(500) })
  expect(view.container.querySelector('[aria-hidden="true"] img')).toBeTruthy()
  view.rerender(<Stage {...props} line={1} urls={urls} />)
  expect(screen.getByRole('img', { name: 'smile' })).toBeTruthy()
  act(() => { vi.advanceTimersByTime(280) })
  expect(view.container.querySelector('[aria-hidden="true"] img')).toBeNull()
})

it('retains the last ready artwork when multiple skipped cue assets are still pending', () => {
  const directed: NovelScene = { ...scene, lines: [
    { speaker: '', text: 'A', visual: { characters: [], background: 'room' } },
    { speaker: '', text: 'B', visual: { characters: [{ asset: 'smile', x: 50, y: 100, scale: 1 }], transition: 'dissolve' } },
    { speaker: '', text: 'C', visual: { characters: [], cg: 'cg', transition: 'dissolve' } },
  ] }
  const props = { project, scene: directed, next: () => {}, choose: () => {}, t }
  const view = render(<Stage {...props} line={0} urls={{ room: urls.room }} />)
  view.rerender(<Stage {...props} line={1} urls={{ room: urls.room }} />)
  view.rerender(<Stage {...props} line={2} urls={{ room: urls.room }} />)
  expect(view.container.querySelector('[aria-hidden="true"] img')?.getAttribute('src')).toBe(urls.room)
  view.rerender(<Stage {...props} line={2} urls={{ room: urls.room, cg: urls.cg }} />)
  expect(screen.getByRole('img', { name: 'cg' })).toBeTruthy()
})
