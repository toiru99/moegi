// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudioWorkbench } from '../src/client/StudioWorkbench.tsx'
import { createStudioStore } from '../src/client/studio-store.ts'
import { en } from '../src/client/locales.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'

afterEach(cleanup)

it('uses the recovered player for common game systems instead of rendering handmade web menus', async () => {
  const instance = createStudioStore().create()
  const saved = { revision: 0, canUndo: false, project: { id: 'own', title: 'My own game', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: 'Opening', lines: [{ speaker: 'Guide', text: 'Original common UI will render this line.' }], choices: [] }] } }
  instance.actions.initialize(); instance.actions.adopt(saved)
  const unused = async (): Promise<never> => { throw new Error('Unexpected prototype operation') }
  const preview = vi.fn<CreatorActions['preview']>(async () => {})
  const face: CreatorActions = {
    current: () => instance.getSnapshot(), playbackMode: async () => 'recovered', list: async () => [], read: async () => saved, create: unused, save: unused, undo: unused, preview, head: async () => 0,
    gameSaves: unused, saveGame: unused, loadGame: unused, playerSettings: unused, savePlayerSettings: unused,
    productionStatus: unused, mediaStatus: unused, importAsset: unused, assetData: unused, generateImage: unused, saveImageKey: unused, effect: unused, ask: unused, prepareAssistant: unused,
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: unused, answer: unused, cancel: unused },
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  render(<StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions} t={key => key in en ? en[key as keyof typeof en] : key} conversation={<div>Assistant</div>} />)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scene composition preview' })).toBeTruthy())
  expect(screen.queryByRole('group', { name: en.gameControls })).toBeNull()
  expect(screen.queryByRole('button', { name: en.gameSettings })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Play with original systems' }))
  await waitFor(() => expect(preview).toHaveBeenCalledWith('own'))
  expect(instance.getSnapshot().loaded?.project).toEqual(saved.project)
})
