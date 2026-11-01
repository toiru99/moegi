/** Browser-only gameplay remote capability; authoring mutations remain on vnStudio. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from './controller.ts'
import { PlaybackStore } from './playback-store.ts'
import type { GameSave, PlayerSettings } from './playback-types.ts'

declare module '@deepseek-ai/cordis' { interface Context { vnPlayback: VnPlayback } }

/** Own persistent browser slots, project preferences and cancellation during plugin unload. */
export class VnPlayback extends TypertRemoteService {
  static inject = ['vnStudio']
  private readonly games: PlaybackStore

  constructor(ctx: Context) {
    super(ctx, 'vnPlayback', { namespace: 'vnPlayback' })
    this.games = new PlaybackStore(ctx.vnStudio.documents)
    ctx.effect(() => () => this.games.close(), 'vn-studio.browser-gameplay')
  }

  /** Read occupied browser slots, including older-story metadata.
   * @param id Existing project id.
   * @returns Slots ordered from quicksave 0 through manual slot 6.
   */
  @Remote
  slots(id: string): Promise<GameSave[]> { return this.games.slots(id) }

  /** Persist browser progress independently of production revisions.
   * @param id Existing project id.
   * @param slot Quicksave 0 or manual slot 1–6.
   * @param stateJson Scene id, line and bounded visited-position history.
   * @returns Occupied browser slots after committing.
   */
  @Remote
  save(id: string, slot: number, stateJson: string): Promise<GameSave[]> { return this.games.save(id, slot, stateJson) }

  /** Load browser progress only when its story fingerprint still matches.
   * @param id Existing project id.
   * @param slot Occupied quicksave or manual slot.
   * @returns Saved position and visited-position history.
   */
  @Remote
  load(id: string, slot: number): Promise<GameSave> { return this.games.load(id, slot) }

  /** Read per-project browser preferences.
   * @param id Existing project id.
   * @returns Saved preferences or initial player defaults.
   */
  @Remote
  settings(id: string): Promise<PlayerSettings> { return this.games.settings(id) }

  /** Save bounded browser preferences while retaining gameplay slots.
   * @param id Existing project id.
   * @param settingsJson Complete volume, automatic reading delay and text-size settings.
   * @returns Persisted preferences.
   */
  @Remote
  saveSettings(id: string, settingsJson: string): Promise<PlayerSettings> { return this.games.saveSettings(id, settingsJson) }
}
