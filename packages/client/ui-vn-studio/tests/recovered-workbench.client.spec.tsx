// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudioWorkbench } from '../src/client/StudioWorkbench.tsx'
import { createStudioStore } from '../src/client/studio-store.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import { en } from '../src/client/locales.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'

afterEach(cleanup)

it('plays independently in the browser and restarts without native calls or authored changes', async () => {
  const instance = createStudioStore().create()
  const saved = { revision: 23, canUndo: false, project: { id: 'own', title: 'My own game', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: 'Opening', lines: [{ speaker: 'Guide', text: 'Our own player renders this line.' }, { speaker: '', text: 'The next moment.' }], choices: [] }] } }
  instance.actions.initialize(); instance.actions.adopt(saved); instance.actions.line(1)
  const unused = async (): Promise<never> => { throw new Error('Unexpected external runtime operation') }
  const preview = vi.fn<CreatorActions['preview']>(unused), playbackMode = vi.fn<CreatorActions['playbackMode']>(async () => 'recovered')
  const face: CreatorActions = {
    current: () => instance.getSnapshot(), playbackMode, list: async () => [], read: async () => saved, create: unused, save: unused, undo: unused, preview, head: async () => 23,
    gameSaves: async () => [], saveGame: unused, loadGame: unused, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: async () => DEFAULT_PLAYER_SETTINGS,
    productionStatus: unused, mediaStatus: unused, importAsset: unused, assetData: unused, generateImage: unused, saveImageKey: unused, effect: unused, ask: unused, prepareAssistant: unused,
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: unused, answer: unused, cancel: unused },
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  render(<StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions} t={key => key in en ? en[key as keyof typeof en] : key} conversation={<div>Existing assistant composer</div>} />)
  expect(screen.getByRole('region', { name: en.gameStage })).toBeTruthy()
  expect(screen.getByRole('group', { name: en.gameControls })).toBeTruthy()
  expect(screen.getByRole('button', { name: en.gameSettings })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /original systems|native game|원작/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Play from beginning' }))
  await waitFor(() => expect(instance.getSnapshot().line).toBe(0))
  expect(instance.getSnapshot().playbackRun).toBe(1)
  expect(instance.getSnapshot().loaded).toEqual(saved)
  expect(instance.getSnapshot().draft).toEqual(saved.project)
  expect(preview).not.toHaveBeenCalled(); expect(playbackMode).not.toHaveBeenCalled()
  fireEvent.change(screen.getByDisplayValue('Our own player renders this line.'), { target: { value: 'Unsaved local dialogue.' } })
  expect(screen.getByRole('button', { name: 'Play from beginning' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Play from beginning' }))
  expect(instance.getSnapshot().draft?.scenes[0]?.lines[0]?.text).toBe('Unsaved local dialogue.')
  expect(instance.getSnapshot().dirty).toBe(true)
  expect(screen.getByText('Existing assistant composer')).toBeTruthy()
})
