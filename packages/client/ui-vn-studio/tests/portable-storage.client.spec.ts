import { webcrypto } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { portableActions } from '../../../../dev-tools/portable-storage.ts'
import { playbackFingerprint } from '../src/client/player-state.ts'
import type { NovelProject } from '../src/types.ts'

const project: NovelProject = { id: 'portable', title: 'Portable', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: 'Start', lines: [{ speaker: '', text: 'One' }], choices: [] },
] }

it('retains choices and settings across new instances and rejects changed story saves', async () => {
  vi.stubGlobal('crypto', webcrypto)
  try {
    const memory = new Map<string, string>(), storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const first = portableActions(project, { room: 'data:image/png;base64,AAAA' }, storage)
    await first.saveGame(project.id, 0, JSON.stringify({ sceneId: 'start', line: 1, history: [{ sceneId: 'start', line: 0 }], flags: { trusted: true }, fingerprint: await playbackFingerprint(project) }))
    await first.savePlayerSettings(project.id, JSON.stringify({ musicVolume: 0.3, effectVolume: 0.4, textSize: 125, autoDelayMs: 900 }))
    const second = portableActions(project, {}, storage)
    expect(await second.loadGame(project.id, 0)).toMatchObject({ line: 1, flags: { trusted: true }, history: [{ sceneId: 'start', line: 0 }] })
    expect(await second.playerSettings(project.id)).toMatchObject({ musicVolume: 0.3, textSize: 125 })
    const changed = structuredClone(project); changed.scenes[0]!.lines[0]!.text = 'Changed'
    await expect(portableActions(changed, {}, storage).loadGame(project.id, 0)).rejects.toThrow(/다른 버전/)
    const shortened = structuredClone(project); shortened.scenes[0]!.lines = []
    const updated = portableActions(shortened, {}, storage)
    expect(await updated.playerSettings(project.id)).toMatchObject({ musicVolume: 0.3 })
    await expect(updated.loadGame(project.id, 0)).rejects.toThrow(/다른 버전/)
    await updated.saveGame(project.id, 0, JSON.stringify({ sceneId: 'start', line: 0, history: [], flags: {}, fingerprint: await playbackFingerprint(shortened) }))
    expect(await updated.loadGame(project.id, 0)).toMatchObject({ line: 0, flags: {} })
    await expect(second.assetData(project.id, 'file:///private')).rejects.toThrow(/소재/)
  } finally { vi.unstubAllGlobals() }
})

it('reports unavailable storage and quota failures instead of claiming a successful save', async () => {
  vi.stubGlobal('crypto', webcrypto)
  try {
    const denied = portableActions(project, {}, { getItem() { throw new Error('denied') }, setItem() {} })
    await expect(denied.gameSaves(project.id)).rejects.toThrow(/읽을 수 없습니다/)
    const quota = portableActions(project, {}, { getItem: () => null, setItem() { throw new Error('quota') } })
    await expect(quota.saveGame(project.id, 1, JSON.stringify({ sceneId: 'start', line: 0, history: [], flags: {}, fingerprint: await playbackFingerprint(project) }))).rejects.toThrow(/저장하지 못했습니다/)
  } finally { vi.unstubAllGlobals() }
})
