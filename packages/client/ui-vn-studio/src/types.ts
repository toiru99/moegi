/** Authoring document shared by manual editing and model tools. */
export interface NovelProject {
  id: string
  title: string
  language: 'ko' | 'ja'
  entry: string
  scenes: NovelScene[]
  assets?: NovelAsset[]
  production?: NovelProduction
  uiSkin?: NovelUiSkin
}

/** Original generated artwork attached to the existing game's native interface slots. */
export interface NovelUiSkin {
  version: 1
  brief: string
  title?: string
  cursor?: string
  dialogue?: string
}

/** The three project-owned interface images; all use background image storage. */
export type UiSkinRole = 'title' | 'cursor' | 'dialogue'

/** Current admitted interface files and native image provider readiness. */
export interface UiSkinStatus {
  revision: number
  ready: boolean
  providerReady: boolean
  roles: { role: UiSkinRole; assetId?: string; state: 'ready' | 'pending' | 'blocked' }[]
}

/** Durable story bible and asset tasks; an outline never claims a scene was written. */
export interface NovelProduction {
  version: 1
  premise: string
  tone: string
  pacing: { minScenes: number; minBeats: number; maxBeats: number }
  cast: { id: string; name: string; voice: string; desire: string }[]
  scenes: ProductionScene[]
  media: ProductionMedia[]
}

/** Planned dramatic work, relationship development and continuity for a saved scene. */
export interface ProductionScene {
  id: string
  title: string
  purpose: string
  sharedActivity: string
  relationshipBefore: string
  relationshipAfter: string
  relationshipChange: 'none' | 'small' | 'major'
  beats: string[]
  continuity: string[]
}

/** Required project media; assetId names a real imported asset, never an invented completion. */
export interface ProductionMedia {
  id: string
  kind: AssetKind
  name: string
  sceneIds: string[]
  prompt?: string
  scoreJson?: string
  preset?: 'bell' | 'rain' | 'steps'
  assetId?: string
  /** Up to three admitted project image ids; absent means generation without image references. */
  referenceAssetIds?: string[]
}

/** Inspectable production problems derived from saved content rather than literary scores. */
export interface ProductionWarning {
  code: string
  message: string
  sceneId?: string
  mediaId?: string
}

/** Current scene, asset and provider evidence for the production view. */
export interface ProductionStatus {
  revision: number
  planned: boolean
  plannedScenes: number
  writtenScenes: number
  ready: boolean
  scenes: { id: string; title: string; phase: 'planned' | 'draft' | 'written'; beatCount: number; minBeats: number; maxBeats: number }[]
  media: { id: string; name: string; kind: AssetKind; sceneIds: string[]; assetId?: string; state: 'ready' | 'unassigned' | 'pending' | 'blocked' }[]
  warnings: ProductionWarning[]
  providers: MediaStatus['providers']
  uiSkin?: UiSkinStatus
}

/** One scene and its outgoing choices. */
export interface NovelScene {
  id: string
  title: string
  /** A visual is a complete snapshot, retained until the next beat snapshot; absence uses the preceding snapshot or scene.visual. */
  lines: { speaker: string; text: string; visual?: SceneVisual }[]
  /** Boolean requirements and assignments use at most 64 identifier keys; unspecified flags read false. */
  choices: { text: string; target: string; when?: Record<string, boolean>; effects?: Record<string, boolean> }[]
  visual?: SceneVisual
}

/** Media roles available to scene composition and generation providers. */
export type AssetKind = 'background' | 'character' | 'music' | 'sound'

/** Project-owned file metadata; file paths and credentials are not authored data. */
export interface NovelAsset {
  id: string
  name: string
  kind: AssetKind
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'audio/wav' | 'audio/ogg'
  bytes: number
  width?: number
  height?: number
  provenance?: { origin: 'import' | 'generated' | 'composed' | 'starter'; provider?: string; prompt?: string }
}

/** Percent positions use the character's bottom centre; scale is relative to stage height. */
export interface SceneVisual {
  background?: string
  characters: { asset: string; x: number; y: number; scale: number }[]
  music?: string
  sound?: string
  shot?: 'wide' | 'medium' | 'close'
  transition?: 'cut' | 'dissolve'
  /** Zero-based character slot; when present it must name one of the snapshot's visible characters. */
  focus?: number
  /** An admitted background image displayed as the full-scene CG. */
  cg?: string
}

/** Provider readiness and upload policy, with no stored credential values. */
export interface MediaStatus {
  providers: { id: string; kinds: AssetKind[]; ready: boolean; supportsReferences?: boolean }[]
  maxAssetBytes: number
  imageModel: string
}

/** A revision is required for every mutation to prevent lost edits. */
export interface ProjectRevision {
  revision: number
  project: NovelProject
  canUndo: boolean
}

/** Host media intake result, including the exact immutable id when content was deduplicated. */
export interface MediaImportResult {
  saved: ProjectRevision
  assetId: string
}

/** Metadata used by project pickers. */
export interface ProjectSummary {
  id: string
  title: string
  language: 'ko' | 'ja'
}

/** Transient login instructions only; credential values never cross this API. */
export interface ChatGptLoginSnapshot {
  phase: 'idle' | 'pending' | 'authorized' | 'cancelled' | 'failed'
  notices: { message: string; url?: string; code?: string }[]
  prompt?: { id: string; message: string; options?: { id: string; label: string }[] }
}

/** Connection status without tokens, email or account identifiers. */
export interface ChatGptConnection {
  connected: boolean
  login: ChatGptLoginSnapshot
}
