/** Browser-only saves for exported games; never reads an account or authoring store. */
import type { NovelProject } from '../packages/client/ui-vn-studio/src/types.ts'
import type { GameSave, PlaybackState, PlayerSettings } from '../packages/client/ui-vn-studio/src/playback-types.ts'
import { DEFAULT_PLAYER_SETTINGS, MAX_PLAYBACK_FLAGS, MAX_PLAYBACK_HISTORY } from '../packages/client/ui-vn-studio/src/playback-types.ts'
import { playbackFingerprint } from '../packages/client/ui-vn-studio/src/client/player-state.ts'
import type { PlayerActions } from '../packages/client/ui-vn-studio/src/client/player-actions.ts'

interface BrowserStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface SavedGame { version: 1; id: string; slots: GameSave[]; settings: PlayerSettings }

/** Bind immutable story/media to browser-owned game progress. */
export function portableActions(project: NovelProject, urls: Record<string, string>, storage: BrowserStorage): PlayerActions {
  const key = `vn-studio-portable:${project.id}`
  const identity = (id: string) => { if (id !== project.id) throw new Error('다른 작품의 저장 기록입니다.') }
  const location = (value: { sceneId: string; line: number }, current = true) => {
    if (typeof value.sceneId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.sceneId) || !Number.isInteger(value.line) || value.line < 0 || value.line > 2000) throw new Error('유효하지 않은 게임 위치입니다.')
    if (!current) return
    const scene = project.scenes.find(scene => scene.id === value.sceneId)
    if (!scene || !Number.isInteger(value.line) || value.line < 0 || value.line > scene.lines.length) throw new Error('유효하지 않은 게임 위치입니다.')
  }
  const validate = (value: PlaybackState, current = true) => {
    location(value, current)
    if (!Array.isArray(value.history) || value.history.length > MAX_PLAYBACK_HISTORY) throw new Error('유효하지 않은 게임 기록입니다.')
    value.history.forEach(position => { location(position, current) })
    if (value.flags !== undefined && (typeof value.flags !== 'object' || value.flags === null || Array.isArray(value.flags)
      || Object.entries(value.flags).length > MAX_PLAYBACK_FLAGS || Object.entries(value.flags).some(([key, flag]) => !/^[a-z][a-z0-9_-]{0,63}$/.test(key) || typeof flag !== 'boolean'))) throw new Error('유효하지 않은 선택 기록입니다.')
  }
  const settings = (value: PlayerSettings) => {
    if (![value.musicVolume, value.effectVolume, value.autoDelayMs, value.textSize].every(Number.isFinite)
      || value.musicVolume < 0 || value.musicVolume > 1 || value.effectVolume < 0 || value.effectVolume > 1
      || value.autoDelayMs < 300 || value.autoDelayMs > 15000 || value.textSize < 75 || value.textSize > 150) throw new Error('유효하지 않은 게임 설정입니다.')
    return value
  }
  const read = (): SavedGame => {
    try {
      const raw = storage.getItem(key)
      if (raw === null) return { version: 1, id: project.id, slots: [], settings: { ...DEFAULT_PLAYER_SETTINGS } }
      if (raw.length > 8 * 1024 * 1024) throw new Error('Oversized save')
      const saved = JSON.parse(raw) as SavedGame
      if (saved.version !== 1 || saved.id !== project.id || !Array.isArray(saved.slots) || saved.slots.length > 7) throw new Error('Invalid save')
      const slots = new Set<number>()
      for (const slot of saved.slots) {
        validate(slot, false)
        if (!Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot > 6 || slots.has(slot.slot) || typeof slot.fingerprint !== 'string'
          || typeof slot.title !== 'string' || typeof slot.text !== 'string' || typeof slot.time !== 'string') throw new Error('Invalid slot')
        slots.add(slot.slot)
      }
      settings(saved.settings)
      return saved
    } catch { throw new Error('브라우저 저장 기록을 읽을 수 없습니다. 기록을 보존하려면 같은 파일과 브라우저에서 다시 시도하세요.') }
  }
  const write = (saved: SavedGame) => {
    try { storage.setItem(key, JSON.stringify(saved)) }
    catch { throw new Error('브라우저에 저장하지 못했습니다. 저장 공간과 브라우저의 파일 저장 허용 설정을 확인하세요.') }
  }
  return {
    async assetData(id, asset) { identity(id); if (!Object.hasOwn(urls, asset)) throw new Error('소재 파일이 없습니다.'); return urls[asset]! },
    async gameSaves(id) { identity(id); return read().slots },
    async playerSettings(id) { identity(id); return read().settings },
    async savePlayerSettings(id, json) { identity(id); const saved = read(); saved.settings = settings(JSON.parse(json) as PlayerSettings); write(saved); return saved.settings },
    async saveGame(id, slot, json) {
      identity(id)
      if (!Number.isInteger(slot) || slot < 0 || slot > 6) throw new Error('저장 슬롯을 확인하세요.')
      const value = JSON.parse(json) as PlaybackState; validate(value)
      const fingerprint = await playbackFingerprint(project)
      if (value.fingerprint !== fingerprint) throw new Error('현재 이야기와 저장 위치가 일치하지 않습니다.')
      const scene = project.scenes.find(scene => scene.id === value.sceneId)!, saved = read()
      const next: GameSave = { slot, sceneId: value.sceneId, line: value.line, history: value.history, flags: value.flags ?? {},
        fingerprint, time: new Date().toISOString(), title: scene.title, text: scene.lines[value.line]?.text ?? '' }
      saved.slots = [...saved.slots.filter(value => value.slot !== slot), next].sort((a, b) => a.slot - b.slot)
      write(saved); return saved.slots
    },
    async loadGame(id, slot) {
      identity(id); const saved = read().slots.find(value => value.slot === slot)
      if (saved === undefined) throw new Error('비어 있는 저장 슬롯입니다.')
      if (saved.fingerprint !== await playbackFingerprint(project)) throw new Error('다른 버전의 이야기에서 만든 세이브입니다.')
      validate(saved)
      return saved
    },
  }
}
