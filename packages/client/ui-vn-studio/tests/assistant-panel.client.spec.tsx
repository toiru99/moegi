// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantPanel } from '../src/client/AssistantPanel.tsx'
import type { NovelProject } from '../src/types.ts'

afterEach(cleanup)

const copy: Record<string, string> = {
  assistantCompanion: 'Creation companion', assistantContextHint: 'Shape the next scene together.',
  assistantNoProject: 'Your next story starts here', assistantNoProjectHint: 'Create or open a project, then describe what you want to make.',
  assistantCurrentScene: 'Current scene', assistantScenes: 'Scenes', assistantBeats: 'Dialogue beats', assistantMedia: 'Media files',
  assistantShowPlan: 'Production plan', assistantShowScene: 'Open scene',
}
const t = (key: string) => copy[key] ?? key
const project: NovelProject = { id: 'gym', title: '헬스시뮬', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: '처음 만난 날', lines: [{ speaker: '서윤', text: '운동 시작할까요?' }, { speaker: '', text: '고개를 끄덕인다.' }], choices: [] },
  { id: 'next', title: '함께하는 저녁', lines: [{ speaker: '서윤', text: '내일도 같이해요.' }], choices: [] },
], assets: [{ id: 'asset_title', name: 'Original title art', kind: 'background', mime: 'image/png', bytes: 100, width: 1920, height: 1080 }] }

function Composer() {
  const [value, setValue] = useState('')
  return <label>Existing composer<textarea value={value} onChange={event => { setValue(event.target.value) }} /></label>
}

it('shows project artwork, current scene and actual totals with working navigation', () => {
  const showPlan = vi.fn(), showScene = vi.fn()
  render(<AssistantPanel project={project} scene={project.scenes[1]} titleImage="data:image/png;base64,project-art" showPlan={showPlan} showScene={showScene} t={t}>
    <Composer />
  </AssistantPanel>)
  expect(screen.getByRole('heading', { name: project.title })).toBeTruthy()
  expect(screen.getByRole('img', { name: project.title }).getAttribute('src')).toBe('data:image/png;base64,project-art')
  expect(screen.getByText('함께하는 저녁')).toBeTruthy()
  expect(screen.getByText('Scenes').parentElement?.textContent).toContain('2')
  expect(screen.getByText('Dialogue beats').parentElement?.textContent).toContain('3')
  expect(screen.getByText('Media files').parentElement?.textContent).toContain('1')
  fireEvent.click(screen.getByRole('button', { name: 'Production plan' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open scene' }))
  expect(showPlan).toHaveBeenCalledOnce(); expect(showScene).toHaveBeenCalledOnce()
  expect(screen.getByRole('textbox', { name: 'Existing composer' })).toBeTruthy()
})

it('gives an honest project-free state and preserves the existing composer as project context changes', () => {
  const props = { showPlan: vi.fn(), showScene: vi.fn(), t }
  const rendered = render(<AssistantPanel {...props}><Composer /></AssistantPanel>)
  expect(screen.getByRole('heading', { name: 'Your next story starts here' })).toBeTruthy()
  expect(screen.getByText('Create or open a project, then describe what you want to make.')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  const composer = screen.getByRole('textbox', { name: 'Existing composer' })
  fireEvent.change(composer, { target: { value: '저녁 장면을 이어 써 주세요.' } })
  rendered.rerender(<AssistantPanel {...props} project={project} scene={project.scenes[0]}><Composer /></AssistantPanel>)
  expect(screen.getByRole('textbox', { name: 'Existing composer' })).toBe(composer)
  expect((composer as HTMLTextAreaElement).value).toBe('저녁 장면을 이어 써 주세요.')
  expect(screen.queryByRole('img')).toBeNull()
})

it('keeps scene navigation unavailable when no current scene was supplied', () => {
  const showScene = vi.fn()
  render(<AssistantPanel project={project} showPlan={vi.fn()} showScene={showScene} t={t}><Composer /></AssistantPanel>)
  expect(screen.getByRole('button', { name: 'Production plan' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Open scene' })).toBeNull()
  expect(showScene).not.toHaveBeenCalled()
})
