/** Loads the same packaged director instructions for implicit prompts and skill discovery. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Packaged skill location shared by source execution and the installed lib entry. */
export const directorSkillPath = fileURLToPath(new URL('../assets/skills/vn-director/SKILL.md', import.meta.url))

/** Read the packaged body, failing at plugin load when the shipped skill is missing.
 * @returns The Markdown body without its discovery frontmatter.
 */
export function loadDirectorSkill(): string {
  const source = readFileSync(directorSkillPath, 'utf8')
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(source)
  if (match?.[1] === undefined) throw new Error('The packaged VN director skill has invalid frontmatter.')
  return match[1].trim()
}

/** Compose automatically active instructions with deployment-owned pacing defaults.
 * @param pacing - Validated deployment defaults; explicit story requests override them.
 * @param content - Actual packaged skill body, also exposed through discovery.
 * @returns Model-visible instructions contributed through the logged prompt registry.
 */
export function directorGuidance(pacing: { minScenes: number; minBeats: number; maxBeats: number }, content: string): string {
  return `VN Studio production director is active for ordinary game-making requests. Default pacing: at least ${pacing.minScenes} scenes with ${pacing.minBeats}–${pacing.maxBeats} saved dialogue/narration beats per scene. Explicit user brevity, genre and pacing take precedence. Plan, write and prepare required original media without waiting to be asked for each asset. Prefer ready codex-images and continue executable media work automatically. At most three character portraits can be visible per scene. A draft with required media pending, blocked or unassigned must not be reported or marked as a completed goal.\n\n${content}`
}
