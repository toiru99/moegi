// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StudioWorkbench } from '../src/client/StudioWorkbench.tsx'
import { createStudioStore } from '../src/client/studio-store.ts'
import { en } from '../src/client/locales.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'

beforeEach(() => { localStorage.clear(); history.replaceState(null, '', '/') })
afterEach(cleanup)

it('opens an existing editable project beside the assistant and keeps game saves separate', async () => {
  const instance = createStudioStore().create()
  const saved = { revision: 5, canUndo: true, project: { id: 'sample', title: 'Rainy bookshop', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: 'Welcome', lines: [{ speaker: '서윤', text: '어서 와요.' }], choices: [] }] } }
  const read = vi.fn<CreatorActions['read']>(async () => saved)
  const face: CreatorActions = {
    gameSaves: async () => [], saveGame: async () => [], loadGame: async () => { throw new Error('Empty slot') }, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: async (_id, json) => JSON.parse(json),
    productionStatus: async () => ({ revision: 5, planned: false, plannedScenes: 0, writtenScenes: 0, ready: false, scenes: [], media: [], warnings: [], providers: [] }),
    current: () => instance.getSnapshot(), playbackMode: async () => 'prototype', list: async () => [{ id: 'sample', title: 'Rainy bookshop', language: 'ko' }], read, create: async () => saved, save: async () => saved, undo: async () => saved, preview: async () => {}, head: async () => 5,
    mediaStatus: async () => ({ providers: [], maxAssetBytes: 8388608, imageModel: 'test' }), importAsset: async () => saved, assetData: async () => '', generateImage: async () => saved, saveImageKey: async () => {}, effect: async () => saved, ask: async () => {}, prepareAssistant: async () => { throw new Error('unused') },
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: async () => ({ phase: 'idle', notices: [] }), answer: async () => ({ phase: 'idle', notices: [] }), cancel: async () => {} },
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  const ui = <StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions} t={(key, values) => {
    let text = key in en ? en[key as keyof typeof en] : key
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }} conversation={<div>Existing AI conversation</div>} />
  const view = render(ui)
  await waitFor(() => expect(screen.getByLabelText(en.storyIdea)).toBeTruthy())
  fireEvent.change(screen.getByLabelText(en.storyIdea), { target: { value: '설정을 다녀와도 남아 있어야 하는 이야기' } })
  view.unmount()
  render(ui)
  expect(screen.getByDisplayValue('설정을 다녀와도 남아 있어야 하는 이야기')).toBeTruthy()
  await waitFor(() => expect(screen.getByRole('option', { name: 'Rainy bookshop' })).toBeTruthy())
  fireEvent.change(screen.getByLabelText(en.open), { target: { value: 'sample' } })
  await waitFor(() => expect(screen.getByRole('region', { name: en.gameStage })).toBeTruthy())
  expect(screen.getByText('Existing AI conversation')).toBeTruthy()
  expect(screen.getByDisplayValue('어서 와요.')).toBeTruthy()
  expect(screen.getByRole('contentinfo', { name: en.projectActions }).contains(screen.getByRole('button', { name: en.saveProject }))).toBe(true)
  expect(screen.getByRole('group', { name: en.gameControls }).contains(screen.getByRole('button', { name: en.gameSave }))).toBe(true)
  expect(read).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: en.addScene }))
  fireEvent.click(screen.getByRole('button', { name: en.addLine }))
  fireEvent.change(screen.getByLabelText(`${en.dialogue} 1`), { target: { value: 'Draft-only scene' } })
  fireEvent.click(screen.getByRole('button', { name: en.nextLine }))
  fireEvent.click(screen.getByRole('button', { name: en.discard }))
  fireEvent.click(screen.getByRole('button', { name: en.backlog }))
  expect(screen.getByText(en.noHistory)).toBeTruthy()
  expect(instance.getSnapshot().sceneId).toBe('start')
  expect(instance.getSnapshot().line).toBe(0)
})

it('starts on an empty creation form instead of reopening a remembered project', async () => {
  localStorage.setItem('vn-studio.project', 'old-story')
  const instance = createStudioStore().create()
  const saved = { revision: 0, canUndo: false, project: { id: 'old-story', title: 'Saved work', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: 'First scene', lines: [], choices: [] }] } }
  const read = vi.fn<CreatorActions['read']>(async () => saved)
  const create = vi.fn<CreatorActions['create']>(async (id, title, language) => ({ ...saved, project: { ...saved.project, id, title, language } }))
  const ask = vi.fn<CreatorActions['ask']>()
  const face: CreatorActions = {
    gameSaves: async () => [], saveGame: async () => [], loadGame: async () => { throw new Error('Empty slot') }, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: async () => DEFAULT_PLAYER_SETTINGS,
    productionStatus: async () => ({ revision: 0, planned: false, plannedScenes: 0, writtenScenes: 0, ready: false, scenes: [], media: [], warnings: [], providers: [] }),
    current: () => instance.getSnapshot(), playbackMode: async () => 'prototype', list: async () => [{ id: 'old-story', title: 'Saved work', language: 'ko' }], read, create, save: async () => saved, undo: async () => saved, preview: async () => {}, head: async () => 0,
    mediaStatus: async () => ({ providers: [], maxAssetBytes: 8388608, imageModel: 'test' }), importAsset: async () => saved, assetData: async () => '', generateImage: async () => saved, saveImageKey: async () => {}, effect: async () => saved, ask, prepareAssistant: async () => { throw new Error('unused') },
    chatGpt: { status: async () => ({ connected: false, login: { phase: 'idle', notices: [] } }), start: async () => ({ phase: 'idle', notices: [] }), answer: async () => ({ phase: 'idle', notices: [] }), cancel: async () => {} },
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  render(<StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions}
    t={key => key in en ? en[key as keyof typeof en] : key} conversation={<div>Assistant</div>} />)
  await waitFor(() => expect(instance.getSnapshot().initialized).toBe(true))
  expect((screen.getByLabelText(en.projectTitle) as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText(en.storyIdea) as HTMLTextAreaElement).value).toBe('')
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByRole('region', { name: en.gameStage })).toBeNull()
  expect(screen.queryByRole('button', { name: /example/i })).toBeNull()
  expect(read).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: en.askStory }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: en.createBlank }).hasAttribute('disabled')).toBe(true)
  expect({ heading: screen.getByRole('heading', { level: 1 }).textContent,
    title: (screen.getByLabelText(en.projectTitle) as HTMLInputElement).value,
    idea: (screen.getByLabelText(en.storyIdea) as HTMLTextAreaElement).value,
    actions: [en.askStory, en.createBlank] }).toMatchInlineSnapshot(`
      {
        "actions": [
          "Create with AI",
          "Start with an empty project",
        ],
        "heading": "What story will you create?",
        "idea": "",
        "title": "",
      }
    `)
  fireEvent.change(screen.getByLabelText(en.projectTitle), { target: { value: 'My own game' } })
  fireEvent.change(screen.getByLabelText(en.language), { target: { value: 'ja' } })
  fireEvent.click(screen.getByRole('button', { name: en.createBlank }))
  await waitFor(() => expect(screen.getByRole('region', { name: en.gameStage })).toBeTruthy())
  expect(create).toHaveBeenCalledWith(expect.stringMatching(/^story_/), 'My own game', 'ja')
  expect(instance.getSnapshot().loaded?.project.assets).toBeUndefined()
  expect(instance.getSnapshot().loaded?.project.scenes[0]?.lines).toEqual([])
  expect(ask).not.toHaveBeenCalled()
  expect(new URL(location.href).searchParams.get('project')).toBe(instance.getSnapshot().loaded?.project.id)
  fireEvent.click(screen.getByRole('button', { name: en.newStory }))
  expect(new URL(location.href).searchParams.has('project')).toBe(false)
  expect((screen.getByLabelText(en.projectTitle) as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText(en.storyIdea) as HTMLTextAreaElement).value).toBe('')
})
