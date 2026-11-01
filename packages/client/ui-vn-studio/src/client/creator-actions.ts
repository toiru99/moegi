import type { AssetKind, MediaStatus, ProductionStatus, ProjectRevision } from '../types.ts'
import type { PlayerActions } from './player-actions.ts'
import type { EditorActions } from './Editor.tsx'
import type { LoginActions } from './Login.tsx'
import type { StudioState } from './studio-store.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Existing authoring operations plus media and scoped assistant actions. */
export interface CreatorActions extends EditorActions, PlayerActions {
  playbackMode(): Promise<'recovered' | 'prototype'>
  productionStatus(id: string): Promise<ProductionStatus>
  head(id: string): Promise<number>
  mediaStatus(): Promise<MediaStatus>
  importAsset(id: string, revision: number, kind: AssetKind, name: string, dataUrl: string): Promise<ProjectRevision>
  assetData(id: string, asset: string): Promise<string>
  generateImage(id: string, revision: number, kind: 'background' | 'character', name: string, prompt: string, provider: string): Promise<ProjectRevision>
  saveImageKey(value: string): Promise<void>
  effect(id: string, revision: number, name: string, preset: string): Promise<ProjectRevision>
  prepareAssistant(): Promise<SessionId>
  ask(prompt: string, target?: SessionId): Promise<void>
  current(): StudioState
  chatGpt: LoginActions
}
