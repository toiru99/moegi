/** Browser rehearsal locations; line equal to scene length denotes choices or the ending. */
export interface PlaybackPosition { sceneId: string; line: number }

/** Independent position, history and boolean flags; fingerprint rejects a changed story. */
export interface PlaybackState extends PlaybackPosition {
  history: PlaybackPosition[]
  flags?: Record<string, boolean>
  fingerprint?: string
}

/** One browser-only game slot, with display text and timestamp derived by the Host. */
export interface GameSave extends PlaybackPosition {
  slot: number
  time: string
  fingerprint: string
  history: PlaybackPosition[]
  flags?: Record<string, boolean>
  title: string
  text: string
}

/** Volume fractions, automatic reading delay in milliseconds and text scale in percent. */
export interface PlayerSettings {
  musicVolume: number
  effectVolume: number
  autoDelayMs: number
  textSize: number
}

/** Maximum persisted visited positions per browser slot. */
export const MAX_PLAYBACK_HISTORY = 200

/** Accumulated gameplay flags, independently bounded from each authored choice map. */
export const MAX_PLAYBACK_FLAGS = 8192

/** Initial player preferences, copied per project until the user saves settings. */
export const DEFAULT_PLAYER_SETTINGS: Readonly<PlayerSettings> = Object.freeze({
  musicVolume: 0.7, effectVolume: 0.8, autoDelayMs: 2500, textSize: 100,
})
