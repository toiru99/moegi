import type { NovelProject } from '../types.ts'
import type { PlaybackPosition } from '../playback-types.ts'
import { MAX_PLAYBACK_FLAGS } from '../playback-types.ts'
import { choiceFlagsMatch } from '../direction.ts'

/** Bind a game slot to the actual rendered story, including changes not yet polled from the Host. */
export async function playbackFingerprint(project: NovelProject): Promise<string> {
  const source = JSON.stringify({ id: project.id, language: project.language, entry: project.entry, scenes: project.scenes })
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Advancing reaches the scene-end position before choices become available. */
export function advancePlayback(project: NovelProject, position: PlaybackPosition): PlaybackPosition | undefined {
  const scene = project.scenes.find(scene => scene.id === position.sceneId)
  return scene !== undefined && position.line < scene.lines.length ? { ...position, line: position.line + 1 } : undefined
}

/** Enter an authored destination without changing its contents. */
export function visitPlayback(project: NovelProject, sceneId: string): PlaybackPosition {
  if (!project.scenes.some(scene => scene.id === sceneId)) throw new Error('The playback destination no longer exists.')
  return { sceneId, line: 0 }
}

/** Select only an available authored choice and apply its effects with its destination.
 * @param project Current story.
 * @param position Current scene-end position.
 * @param index Original authored choice index, before condition filtering.
 * @param flags Current gameplay flags, never mutated.
 * @returns Destination and new flags, or undefined when the choice is unavailable.
 * @throws RangeError when applying the choice would exceed the accumulated flag limit.
 */
export function choosePlayback(project: NovelProject, position: PlaybackPosition, index: number, flags: Record<string, boolean>): { position: PlaybackPosition; flags: Record<string, boolean> } | undefined {
  const scene = project.scenes.find(scene => scene.id === position.sceneId), choice = scene?.choices[index]
  if (scene === undefined || position.line !== scene.lines.length || choice === undefined || !choiceFlagsMatch(choice.when, flags)) return undefined
  const nextFlags = { ...flags, ...choice.effects }
  if (Object.keys(nextFlags).length > MAX_PLAYBACK_FLAGS) throw new RangeError('Gameplay exceeds the accumulated flag limit.')
  return { position: visitPlayback(project, choice.target), flags: nextFlags }
}

/** Store at most 200 distinct consecutive visits, matching gameplay persistence. */
export function rememberPlayback(history: PlaybackPosition[], position: PlaybackPosition): PlaybackPosition[] {
  const last = history.at(-1)
  return last?.sceneId === position.sceneId && last.line === position.line ? history : [...history, position].slice(-200)
}
