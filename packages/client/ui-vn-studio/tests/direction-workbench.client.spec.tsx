// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { StudioWorkbench } from '../src/client/StudioWorkbench.tsx'
import { createStudioStore } from '../src/client/studio-store.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import { playbackFingerprint } from '../src/client/player-state.ts'
import { en } from '../src/client/locales.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'
import type { NovelProject } from '../src/types.ts'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); history.replaceState(null, '', '/') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('loads line expression and CG assets, restores the effective cue from a game slot, and resets flags on footer restart', async () => {
  const instance = createStudioStore().create()
  const project: NovelProject = { id: 'directed', title: 'Directed', language: 'ko', entry: 'start', scenes: [
    { id: 'start', title: 'Opening', visual: { characters: [], background: 'room' }, lines: [
      { speaker: 'Guide', text: 'Opening line' },
      { speaker: 'Guide', text: 'Reaction', visual: { characters: [{ asset: 'smile', x: 50, y: 100, scale: 1 }], background: 'room' } },
      { speaker: '', text: 'Illustration', visual: { characters: [], cg: 'cg' } },
    ], choices: [{ text: 'Trusted', target: 'start', when: { trusted: true } }, { text: 'Unknown', target: 'start', when: { trusted: false } }] },
  ], assets: [
    ...['room', 'cg'].map(id => ({ id, name: id, kind: 'background' as const, mime: 'image/png' as const, bytes: 1, width: 1600, height: 900 })),
    { id: 'smile', name: 'smile', kind: 'character', mime: 'image/png', bytes: 1, width: 500, height: 900 },
  ] }
  const saved = { revision: 1, canUndo: false, project }, before = structuredClone(project)
  instance.actions.initialize(); instance.actions.adopt(saved)
  const unused = async (): Promise<never> => { throw new Error('Unexpected authoring operation') }
  const assetData = vi.fn<CreatorActions['assetData']>(async (_id, asset) => `/${asset}.png`)
  const face: CreatorActions = {
    current: () => instance.getSnapshot(), playbackMode: async () => 'prototype', list: async () => [], read: async () => saved, create: unused, save: unused, undo: unused, preview: unused, head: async () => 1,
    gameSaves: async () => [], saveGame: unused, loadGame: async () => ({ slot: 0, time: new Date().toISOString(), fingerprint: await playbackFingerprint(project), sceneId: 'start', line: 3, history: [], flags: { trusted: true }, title: '', text: '' }), playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: unused,
    productionStatus: unused, mediaStatus: unused, importAsset: unused, assetData, generateImage: unused, saveImageKey: unused, effect: unused, ask: unused, prepareAssistant: unused,
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: unused, answer: unused, cancel: unused },
  }
  const useStudio = <T,>(selector: (state: ReturnType<typeof instance.getSnapshot>) => T): T => selector(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  render(<StudioWorkbench {...face} useStudio={useStudio} actions={instance.actions} t={key => key in en ? en[key as keyof typeof en] : key} conversation={<div>Assistant</div>} />)
  const stage = () => within(screen.getByRole('region', { name: en.gameStage }))
  await waitFor(() => expect(stage().getByRole('img', { name: 'room' })).toBeTruthy())
  fireEvent.click(stage().getByRole('button', { name: en.nextLine }))
  await waitFor(() => expect(stage().getByRole('img', { name: 'smile' }).getAttribute('src')).toBe('/smile.png'))
  fireEvent.click(screen.getByRole('button', { name: en.quickLoad }))
  await waitFor(() => expect(stage().getByRole('img', { name: 'cg' }).getAttribute('src')).toBe('/cg.png'))
  expect(stage().getByRole('button', { name: 'Trusted' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.restartPlayback }))
  await act(async () => { instance.actions.line(3) })
  expect(stage().queryByRole('button', { name: 'Trusted' })).toBeNull()
  expect(stage().getByRole('button', { name: 'Unknown' })).toBeTruthy()
  expect(instance.getSnapshot().draft).toEqual(before)
  expect(instance.getSnapshot().dirty).toBe(false)
})
