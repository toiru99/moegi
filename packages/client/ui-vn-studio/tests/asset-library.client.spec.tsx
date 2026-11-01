// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AssetLibrary } from '../src/client/AssetLibrary.tsx'
import { en } from '../src/client/locales.ts'
import { createStudioStore } from '../src/client/studio-store.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import type { CreatorActions } from '../src/client/creator-actions.ts'
import type { ProjectRevision } from '../src/types.ts'

afterEach(cleanup)

it('uses signed-in Codex for artwork without asking for an API key', async () => {
  const instance = createStudioStore().create()
  const saved: ProjectRevision = { revision: 0, canUndo: false, project: { id: 'original', title: 'My own story', language: 'ko', entry: 'start', scenes: [{ id: 'start', title: 'Opening', lines: [], choices: [] }] } }
  const unused = async (): Promise<never> => { throw new Error('Unexpected operation in image-generation fixture') }
  const generateImage = vi.fn<CreatorActions['generateImage']>(async () => saved)
  const face: CreatorActions = {
    current: () => instance.getSnapshot(), playbackMode: async () => 'prototype', list: async () => [], read: unused, create: unused, save: unused, undo: unused, preview: unused, head: async () => 0,
    gameSaves: async () => [], saveGame: unused, loadGame: unused, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: unused,
    productionStatus: unused, mediaStatus: async () => ({ providers: [{ id: 'codex-images', kinds: ['background', 'character'], ready: true }, { id: 'openai-images', kinds: ['background', 'character'], ready: false }], maxAssetBytes: 8388608, imageModel: 'test' }),
    importAsset: unused, assetData: unused, generateImage, saveImageKey: unused, effect: unused, ask: unused, prepareAssistant: unused,
    chatGpt: { status: async () => ({ connected: true, login: { phase: 'idle', notices: [] } }), start: unused, answer: unused, cancel: unused },
  }
  const adopt = vi.fn()
  render(<AssetLibrary project={saved.project} revision={saved.revision} busy={false} dirty={false} face={face} adopt={adopt}
    run={operation => { void operation() }} useAsset={vi.fn()} requestMusic={vi.fn()}
    mediaDraft={{ kind: 'background', imagePrompt: 'An original mountain observatory at sunrise', musicIdea: '' }} changeMediaDraft={vi.fn()}
    t={key => key in en ? en[key as keyof typeof en] : key} />)
  await waitFor(() => expect(screen.getByText('Codex image generation ready · Using ChatGPT plan')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: en.generateImage }))
  await waitFor(() => expect(generateImage).toHaveBeenCalledWith('original', 0, 'background', 'An original mountain observatory at sunrise', 'An original mountain observatory at sunrise', 'codex-images'))
  expect(adopt).toHaveBeenCalledWith(saved)
})
