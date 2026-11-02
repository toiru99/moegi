// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StudioWorkbench } from '../src/client/StudioWorkbench.tsx'
import { createStudioStore } from '../src/client/studio-store.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import { en } from '../src/client/locales.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'

afterEach(cleanup)

function workbench(overrides: Partial<CreatorActions> = {}) {
  const instance = createStudioStore().create()
  const saved = { revision: 23, canUndo: false, project: { id: 'own', title: 'My own game', language: 'ko' as const, entry: 'start', scenes: [{ id: 'start', title: 'Opening', lines: [{ speaker: 'Guide', text: 'Our own player renders this line.' }, { speaker: '', text: 'The next moment.' }], choices: [] }] } }
  instance.actions.initialize(); instance.actions.adopt(saved); instance.actions.line(1)
  const unused = async (): Promise<never> => { throw new Error('Unexpected authoring operation') }
  const preview = vi.fn<CreatorActions['preview']>(async () => {})
  const exportGame = vi.fn(async (_id: string) => ({ archivePath: 'D:\\Games\\own.zip', bytes: 8192, revision: 23 }))
  const playbackMode = vi.fn<CreatorActions['playbackMode']>(async () => 'recovered')
  const face: CreatorActions = {
    current: () => instance.getSnapshot(), playbackMode, list: async () => [], read: async () => saved, create: unused, save: unused, undo: unused, preview, exportGame, head: async () => 23,
    gameSaves: async () => [], saveGame: unused, loadGame: unused, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: async () => DEFAULT_PLAYER_SETTINGS,
    productionStatus: unused, mediaStatus: unused, importAsset: unused, assetData: unused, generateImage: unused, saveImageKey: unused, effect: unused, ask: unused, prepareAssistant: unused,
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: unused, answer: unused, cancel: unused },
    ...overrides,
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  render(<StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions} t={(key, values) => {
    let text = key in en ? en[key as keyof typeof en] : key
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }} conversation={<div>Existing assistant composer</div>} />)
  return { instance, saved, preview, exportGame, playbackMode }
}

it('runs the configured game while keeping the editable browser stage and project intact', async () => {
  let finish: (() => void) | undefined
  const preview = vi.fn<CreatorActions['preview']>(() => new Promise(resolve => { finish = resolve }))
  const { instance, saved, playbackMode } = workbench({ preview })
  const runGame = await screen.findByRole('button', { name: 'Run game' })
  expect(playbackMode).toHaveBeenCalledOnce()
  expect(screen.getByRole('region', { name: en.gameStage })).toBeTruthy()
  expect(screen.getByRole('group', { name: en.gameControls })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /original systems|native game|원작/ })).toBeNull()
  fireEvent.click(runGame)
  expect(preview).toHaveBeenCalledExactlyOnceWith('own')
  expect(instance.getSnapshot().busy).toBe(true)
  expect(runGame.hasAttribute('disabled')).toBe(true)
  fireEvent.click(runGame)
  expect(preview).toHaveBeenCalledOnce()
  await act(async () => { finish?.() })
  expect(instance.getSnapshot().busy).toBe(false)
  expect(instance.getSnapshot().loaded).toEqual(saved)
  expect(instance.getSnapshot().draft).toEqual(saved.project)
  expect(instance.getSnapshot().line).toBe(1)
  expect(instance.getSnapshot().playbackRun).toBe(0)
  expect(screen.getByText('Existing assistant composer')).toBeTruthy()
})

it('exports the saved game and reports the archive location after completion', async () => {
  let finish: ((receipt: { archivePath: string; bytes: number; revision: number }) => void) | undefined
  const exportGame = vi.fn((_id: string) => new Promise<{ archivePath: string; bytes: number; revision: number }>(resolve => { finish = resolve }))
  const { instance, saved } = workbench({ exportGame })
  const exportButton = await screen.findByRole('button', { name: 'Export game' })
  fireEvent.click(exportButton)
  expect(exportGame).toHaveBeenCalledExactlyOnceWith('own')
  expect(instance.getSnapshot().busy).toBe(true)
  expect(screen.queryByText(/own\.zip/)).toBeNull()
  expect(exportButton.hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Run game' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(exportButton)
  expect(exportGame).toHaveBeenCalledOnce()
  await act(async () => { finish?.({ archivePath: 'D:\\Games\\own.zip', bytes: 8192, revision: 23 }) })
  expect(screen.getByRole('status').textContent).toBe('Game exported to D:\\Games\\own.zip')
  expect(instance.getSnapshot().busy).toBe(false)
  expect(instance.getSnapshot().loaded).toEqual(saved)
  expect(instance.getSnapshot().draft).toEqual(saved.project)
})

it('requires saved changes before running or exporting the game', async () => {
  const { instance, preview, exportGame } = workbench()
  await screen.findByRole('button', { name: 'Run game' })
  fireEvent.change(screen.getByDisplayValue('Our own player renders this line.'), { target: { value: 'Unsaved local dialogue.' } })
  for (const name of ['Run game', 'Export game']) {
    const button = screen.getByRole('button', { name })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.click(button)
  }
  expect(preview).not.toHaveBeenCalled()
  expect(exportGame).not.toHaveBeenCalled()
  expect(instance.getSnapshot().draft?.scenes[0]?.lines[0]?.text).toBe('Unsaved local dialogue.')
  expect(instance.getSnapshot().dirty).toBe(true)
})

it('keeps browser playback available without a configured game runtime', async () => {
  const { instance, saved, preview, exportGame } = workbench({ playbackMode: async () => 'prototype' })
  await act(async () => {})
  expect(screen.queryByRole('button', { name: 'Run game' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Export game' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.restartPlayback }))
  await waitFor(() => expect(instance.getSnapshot().line).toBe(0))
  expect(instance.getSnapshot().playbackRun).toBe(1)
  expect(instance.getSnapshot().draft).toEqual(saved.project)
  expect(preview).not.toHaveBeenCalled()
  expect(exportGame).not.toHaveBeenCalled()
})

it.each(['run', 'export'] as const)('reports %s failures and releases the busy guard', async operation => {
  const failure = vi.fn(async () => { throw new Error('The saved game could not be prepared.') })
  const { instance } = workbench(operation === 'run' ? { preview: failure } : { exportGame: failure })
  fireEvent.click(await screen.findByRole('button', { name: operation === 'run' ? 'Run game' : 'Export game' }))
  await waitFor(() => expect(instance.getSnapshot().busy).toBe(false))
  expect(screen.getByRole('status').textContent).toBe('The saved game could not be prepared.')
  expect(instance.getSnapshot().dirty).toBe(false)
})
