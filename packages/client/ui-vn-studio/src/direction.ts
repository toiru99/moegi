/** Pure interpretation of authored visual snapshots and boolean choice conditions. */
import type { NovelScene, SceneVisual } from './types.ts'

/** Resolve a full snapshot without mutating the authoring document.
 * @param scene Authored scene and line cues.
 * @param line Current dialogue index, including the scene-end position.
 * @returns Last authored snapshot and its line index; -1 denotes the scene default.
 */
export function resolveSceneDirection(scene: NovelScene, line: number): { visual: SceneVisual | undefined; cueIndex: number } {
  for (let index = Math.min(line, scene.lines.length - 1); index >= 0; index--) {
    const visual = scene.lines[index]?.visual
    if (visual !== undefined) return { visual, cueIndex: index }
  }
  return { visual: scene.visual, cueIndex: -1 }
}

/** Evaluate all authored conditions, with unspecified flags reading false.
 * @param when Optional required boolean values.
 * @param flags Current gameplay flags.
 * @returns Whether every required flag matches.
 */
export function choiceFlagsMatch(when: Record<string, boolean> | undefined, flags: Record<string, boolean> = {}): boolean {
  return Object.entries(when ?? {}).every(([key, value]) => (Object.hasOwn(flags, key) ? flags[key] : false) === value)
}
