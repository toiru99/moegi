// @vitest-environment jsdom
import { useState } from 'react'
import { webcrypto } from 'node:crypto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Player } from '../src/client/Player.tsx'
import { en } from '../src/client/locales.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../src/playback-types.ts'
import { playbackFingerprint } from '../src/client/player-state.ts'
import css from '../src/client/Player.module.css'
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

it('renders own title and dialogue art and crops cursor padding so its visible tip lands at the click origin', async () => {
  const { face } = fixture(); cleanup()
  const images: HTMLImageElement[] = []
  vi.stubGlobal('Image', function () {
    const image = document.createElement('img')
    Object.defineProperties(image, { naturalWidth: { value: 1254 }, naturalHeight: { value: 1254 } })
    images.push(image); return image
  })
  const drawImage = vi.fn()
  const pixels = new Uint8ClampedArray(1254 * 1254 * 4)
  for (const [x, y, alpha] of [[300, 200, 255], [799, 400, 255], [500, 699, 255], [12, 24, 8]]) pixels[(y! * 1254 + x!) * 4 + 3] = alpha!
  const getImageData = vi.fn(() => ({ data: pixels, width: 1254, height: 1254, colorSpace: 'srgb' as const }))
  const context: Pick<CanvasRenderingContext2D, 'clearRect' | 'drawImage' | 'getImageData'> = { clearRect: vi.fn(), drawImage, getImageData }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,small-cursor')
  const skinned = { ...project, uiSkin: { version: 1 as const, brief: 'Original own game art', title: 'asset_title', dialogue: 'asset_dialogue', cursor: 'asset_cursor' } }
  const assetData = vi.fn<PlayerActions['assetData']>(async (_id, asset) => `data:image/png;base64,${asset}`)
  render(<Player project={skinned} scene={skinned.scenes[0]!} line={0} urls={{}} dirty={false} navigate={() => {}} face={{ ...face, assetData }} t={t} />)
  await waitFor(() => expect(screen.getByRole('img', { name: en.dialogueArtwork }).getAttribute('src')).toContain('asset_dialogue'))
  await waitFor(() => expect(images).toHaveLength(1))
  fireEvent.load(images[0]!)
  await waitFor(() => expect(screen.getByRole('region', { name: en.gameStage }).closest('[data-custom-cursor]')?.getAttribute('style')).toContain('small-cursor'))
  expect(getImageData).toHaveBeenCalledWith(0, 0, 1254, 1254)
  expect(drawImage).toHaveBeenLastCalledWith(images[0], 300, 200, 500, 500, 0, 0, 32, 32)
  fireEvent.click(screen.getByRole('button', { name: en.gameTitle }))
  expect(screen.getByRole('img', { name: en.titleArtwork }).getAttribute('src')).toContain('asset_title')
  expect(screen.getByRole('dialog').className).toContain(css.modal)
  expect(assetData.mock.calls.map(call => call[1])).toEqual(['asset_title', 'asset_dialogue', 'asset_cursor'])
})

it('loads compatible browser progress and saves player settings without touching authored data', async () => {
  const { face } = fixture(); cleanup()
  const original = structuredClone(project), navigate = vi.fn()
  const loadGame = vi.fn<PlayerActions['loadGame']>(async () => ({ slot: 0, time: new Date().toISOString(), fingerprint: await playbackFingerprint(project), sceneId: 'next', line: 0, history: [], title: 'Next', text: 'Saved line' }))
  const savePlayerSettings = vi.fn<PlayerActions['savePlayerSettings']>(async (_id, json) => JSON.parse(json))
  render(<Player project={project} scene={project.scenes[0]!} line={0} urls={{}} dirty={false} navigate={navigate} face={{ ...face, loadGame, savePlayerSettings }} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.quickLoad }))
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ sceneId: 'next', line: 0 }))
  fireEvent.click(screen.getByRole('button', { name: en.gameSettings }))
  expect(screen.getByRole('dialog').className).toContain(css.modal)
  fireEvent.change(screen.getByLabelText(en.musicVolume), { target: { value: '0.25' } })
  fireEvent.click(screen.getByRole('button', { name: en.saveGameSettings }))
  await waitFor(() => expect(savePlayerSettings).toHaveBeenCalledWith('player', expect.stringContaining('"musicVolume":0.25')))
  expect(project).toEqual(original)
})

it('does not attach delayed interface artwork after the project changes', async () => {
  const { face } = fixture(); cleanup()
  const pending = Promise.withResolvers<string>()
  const assetData = vi.fn<PlayerActions['assetData']>(() => pending.promise)
  const withSkin = { ...project, uiSkin: { version: 1 as const, brief: 'Own original art', title: 'asset_title', dialogue: 'asset_dialogue' } }
  const currentFace = { ...face, assetData }
  const view = render(<Player project={withSkin} scene={project.scenes[0]!} line={0} urls={{}} dirty={false} navigate={() => {}} face={currentFace} t={t} />)
  await waitFor(() => expect(assetData).toHaveBeenCalledTimes(2))
  const other = { ...project, id: 'other', title: 'Other project' }
  view.rerender(<Player project={other} scene={other.scenes[0]!} line={0} urls={{}} dirty={false} navigate={() => {}} face={currentFace} t={t} />)
  await act(async () => { pending.resolve('data:image/png;base64,previous-project') })
  fireEvent.click(screen.getByRole('button', { name: en.gameTitle }))
  expect(screen.queryByRole('img', { name: en.titleArtwork })).toBeNull()
  expect(screen.queryByRole('img', { name: en.dialogueArtwork })).toBeNull()
})

it('disables title Start until a delayed game load settles', async () => {
  const { face } = fixture(); cleanup()
  const pending = Promise.withResolvers<GameSave>(), navigate = vi.fn()
  const fingerprint = await playbackFingerprint(project)
  const loadGame = vi.fn<PlayerActions['loadGame']>(() => pending.promise)
  render(<Player project={project} scene={project.scenes[0]!} line={0} urls={{}} dirty={false} navigate={navigate} face={{ ...face, loadGame }} t={t} />)
  fireEvent.click(screen.getByRole('button', { name: en.quickLoad }))
  await waitFor(() => expect(loadGame).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: en.gameTitle }))
  const start = screen.getByRole('button', { name: en.gameStart })
  expect(start.hasAttribute('disabled')).toBe(true)
  fireEvent.click(start)
  expect(navigate).not.toHaveBeenCalled()
  await act(async () => { pending.resolve({ slot: 0, time: new Date().toISOString(), fingerprint, sceneId: 'next', line: 0, history: [], title: 'Next', text: 'Saved line' }) })
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ sceneId: 'next', line: 0 }))
  fireEvent.click(screen.getByRole('button', { name: en.gameTitle }))
  expect(screen.getByRole('button', { name: en.gameStart }).hasAttribute('disabled')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: en.gameStart }))
  expect(navigate).toHaveBeenLastCalledWith({ sceneId: 'start', line: 0 })
})
