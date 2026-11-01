// @vitest-environment jsdom
import { useState } from 'react'
import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Player } from '../src/client/Player.tsx'
import { en } from '../src/client/locales.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import type { NovelProject } from '../src/types.ts'
import type { PlayerActions } from '../src/client/player-actions.ts'
import type { GameSave } from '../src/playback-types.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

beforeEach(() => { vi.stubGlobal('crypto', webcrypto) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
const project: NovelProject = { id: 'player', title: 'Bookshop', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: 'First', lines: [{ speaker: '서윤', text: '첫 대사' }], choices: [{ text: '책을 건넨다', target: 'next' }] },
  { id: 'next', title: 'Next', lines: [{ speaker: '', text: '두 번째 장면' }], choices: [] },
] }
const t: PropsLocale<'vnStudio'>['t'] = (key, values) => {
  let text = key in en ? en[key as keyof typeof en] : key
  for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}
function fixture(dirty = false) {
  const saveGame = vi.fn<PlayerActions['saveGame']>(async () => [])
  const face: PlayerActions = { gameSaves: async () => [], saveGame, loadGame: async () => { throw new Error('Empty slot') }, playerSettings: async () => DEFAULT_PLAYER_SETTINGS, savePlayerSettings: async (_id, json) => JSON.parse(json), assetData: async () => '' }
  function Harness() {
    const [position, setPosition] = useState({ sceneId: 'start', line: 0 })
    return <Player project={project} scene={project.scenes.find(scene => scene.id === position.sceneId)!} line={position.line} urls={{}} dirty={dirty} navigate={setPosition} face={face} t={t} />
  }
  render(<Harness />)
  return { saveGame, face }
}
it('offers common controls before authoring and waits for the last line before choices', async () => {
  fixture()
  expect(screen.getByRole('group', { name: en.gameControls })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '책을 건넨다' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.nextLine }))
  fireEvent.click(screen.getByRole('button', { name: '책을 건넨다' }))
  expect(screen.getByText('두 번째 장면')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.quickSave }))
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain(en.gameSaved))
})
it('keeps gameplay save controls disabled while an authoring draft is unsaved', () => {
  const { saveGame } = fixture(true)
  expect(screen.getByRole('button', { name: en.gameSave }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: en.quickSave }).hasAttribute('disabled')).toBe(true)
  expect(saveGame).not.toHaveBeenCalled()
})

it('retains explicit mute across dialogue and choice navigation', () => {
  fixture()
  fireEvent.click(screen.getByRole('button', { name: en.nextLine }))
  fireEvent.click(screen.getByRole('button', { name: en.soundOff }))
  fireEvent.click(screen.getByRole('button', { name: '책을 건넨다' }))
  expect(screen.getByRole('button', { name: en.soundOn }).getAttribute('aria-pressed')).toBe('false')
})

it('pauses automatic reading at choices instead of choosing a branch', () => {
  vi.useFakeTimers()
  fixture()
  fireEvent.click(screen.getByRole('button', { name: en.autoPlay }))
  act(() => { vi.advanceTimersByTime(DEFAULT_PLAYER_SETTINGS.autoDelayMs) })
  expect(screen.getByRole('button', { name: en.autoPlay }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByRole('button', { name: '책을 건넨다' })).toBeTruthy()
  expect(screen.queryByText('두 번째 장면')).toBeNull()
})

it('does not apply an old project load after the player switches to another project', async () => {
  const { face } = fixture(); cleanup()
  let finish!: (saved: GameSave) => void
  const load = vi.fn<PlayerActions['loadGame']>(() => new Promise(resolve => { finish = resolve }))
  const navigate = vi.fn(), currentFace = { ...face, loadGame: load }
  const view = render(<Player project={project} scene={project.scenes[0]!} line={0} urls={{}} dirty={false} navigate={navigate} face={currentFace} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.quickLoad }))
  await waitFor(() => expect(load).toHaveBeenCalledOnce())
  const other = { ...project, id: 'other' }
  view.rerender(<Player project={other} scene={other.scenes[0]!} line={0} urls={{}} dirty={false} navigate={navigate} face={currentFace} t={t} />)
  finish({ slot: 0, time: new Date().toISOString(), fingerprint: '0'.repeat(64), sceneId: 'next', line: 0, history: [], title: '', text: '' })
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(en.gameStale))
  expect(navigate).not.toHaveBeenCalled()
})

it('uses the latest volume when a delayed audio asset becomes ready', async () => {
  const { face } = fixture(); cleanup()
  const audio = document.createElement('audio')
  vi.spyOn(audio, 'play').mockResolvedValue()
  vi.spyOn(audio, 'pause').mockImplementation(() => {})
  vi.spyOn(audio, 'load').mockImplementation(() => {})
  vi.stubGlobal('Audio', function () { return audio })
  let ready!: (url: string) => void
  const assetData = vi.fn<PlayerActions['assetData']>(() => new Promise(resolve => { ready = resolve }))
  const withMusic = { ...project, scenes: project.scenes.map(scene => ({ ...scene, visual: { characters: [], music: 'asset_music' } })) }
  render(<Player project={withMusic} scene={withMusic.scenes[0]!} line={0} urls={{}} dirty={false} navigate={() => {}} face={{ ...face, assetData }} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.soundOn }))
  await waitFor(() => expect(assetData).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: en.gameSettings }))
  fireEvent.change(screen.getByLabelText(en.musicVolume), { target: { value: '0' } })
  ready('data:audio/wav;base64,AAAA')
  await waitFor(() => expect(audio.play).toHaveBeenCalledOnce())
  expect(audio.volume).toBe(0)
})
