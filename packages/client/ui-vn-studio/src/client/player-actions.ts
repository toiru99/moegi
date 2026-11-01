import type { GameSave, PlayerSettings } from '../playback-types.ts'

/** Gameplay persistence operates separately from authored project revisions. */
export interface PlayerActions {
  gameSaves(id: string): Promise<GameSave[]>
  saveGame(id: string, slot: number, stateJson: string): Promise<GameSave[]>
  loadGame(id: string, slot: number): Promise<GameSave>
  playerSettings(id: string): Promise<PlayerSettings>
  savePlayerSettings(id: string, settingsJson: string): Promise<PlayerSettings>
  assetData(id: string, asset: string): Promise<string>
}
