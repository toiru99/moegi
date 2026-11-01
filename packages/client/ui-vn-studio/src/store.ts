import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseScore } from './music.ts'
import type { AssetKind, NovelAsset, NovelProduction, NovelProject, NovelUiSkin, ProductionMedia, ProjectRevision, ProjectSummary, SceneVisual } from './types.ts'

interface SavedProject {
  version: 1
  revision: number
  project: NovelProject
  history: { project: NovelProject; origin: 'manual' | 'agent' | 'undo' }[]
}

const MAX_BYTES = 2 * 1024 * 1024

/** Validate filename-safe project and scene identifiers. */
export function assertId(value: string): void {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value)) throw new Error('Invalid id: use lowercase letters, numbers, underscore or hyphen.')
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a project object.')
  return value as Record<string, unknown>
}

function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim() === '') || value.includes('\0')) {
    throw new Error('Invalid or oversized project text.')
  }
  return value
}

function bounded(value: unknown, minimum: number, maximum: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid ${label}.`)
  return value
}

/** Admit one of the supported roles at tool/upload/durable boundaries. */
export function parseAssetKind(value: unknown): AssetKind {
  if (value !== 'background' && value !== 'character' && value !== 'music' && value !== 'sound') throw new Error('Invalid asset kind.')
  return value
}

function parseAssets(value: unknown): NovelAsset[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error('Expected at most 128 assets.')
  const assets = value.map((item: unknown): NovelAsset => {
    const row = object(item)
    const id = text(row.id, 64)
    assertId(id)
    const kind = parseAssetKind(row.kind)
    const mime = row.mime
    if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp' && mime !== 'audio/wav' && mime !== 'audio/ogg') throw new Error('Unsupported asset media type.')
    const image = kind === 'background' || kind === 'character'
    if (image !== mime.startsWith('image/')) throw new Error('Asset kind and media type do not match.')
    const bytes = bounded(row.bytes, 1, 20 * 1024 * 1024, 'asset byte length')
    if (!Number.isInteger(bytes)) throw new Error('Invalid asset byte length.')
    const asset: NovelAsset = { id, name: text(row.name, 256), kind, mime, bytes }
    if (image) {
      asset.width = bounded(row.width, 1, 4096, 'asset dimensions')
      asset.height = bounded(row.height, 1, 4096, 'asset dimensions')
      if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height)) throw new Error('Invalid asset dimensions.')
      if (asset.width / asset.height > 4 || asset.height / asset.width > 4) throw new Error('Invalid asset dimension ratio.')
    }
    if (row.provenance !== undefined) {
      const source = object(row.provenance)
      const origin = source.origin
      if (origin !== 'import' && origin !== 'generated' && origin !== 'composed' && origin !== 'starter') throw new Error('Invalid asset provenance.')
      asset.provenance = { origin }
      if (source.provider !== undefined) asset.provenance.provider = text(source.provider, 128)
      if (source.prompt !== undefined) asset.provenance.prompt = text(source.prompt, 4000)
    }
    return asset
  })
  if (new Set(assets.map(asset => asset.id)).size !== assets.length) throw new Error('Duplicate asset id.')
  return assets
}

function parseVisual(value: unknown, assets: NovelAsset[]): SceneVisual {
  const row = object(value)
  if (!Array.isArray(row.characters) || row.characters.length > 3) throw new Error('Expected at most three character placements.')
  const reference = (value: unknown, kind: AssetKind): string => {
    const id = text(value, 64)
    assertId(id)
    if (!assets.some(asset => asset.id === id && asset.kind === kind)) throw new Error(`Missing ${kind} asset or incorrect asset kind.`)
    return id
  }
  const visual: SceneVisual = { characters: row.characters.map((item: unknown) => {
    const character = object(item)
    return { asset: reference(character.asset, 'character'), x: bounded(character.x, 0, 100, 'character position'),
      y: bounded(character.y, 0, 100, 'character position'), scale: bounded(character.scale, 0.1, 2, 'character placement scale') }
  }) }
  if (row.background !== undefined) visual.background = reference(row.background, 'background')
  if (row.music !== undefined) visual.music = reference(row.music, 'music')
  if (row.sound !== undefined) visual.sound = reference(row.sound, 'sound')
  return visual
}

function rows(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Expected at most ${max} ${label}.`)
  return value
}

function identifier(value: unknown): string { const id = text(value, 64); assertId(id); return id }
function unique(ids: string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} id.`)
}

function productionScore(value: unknown, index: number): string {
  const field = `production.media[${index}].scoreJson`
  if (typeof value !== 'string' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    throw new Error(`${field} must be a musical score object or a JSON string containing one.`)
  }
  const encoded = typeof value === 'string' ? value : JSON.stringify(value)
  if (encoded === undefined || encoded.length === 0 || encoded.length > 128 * 1024 || encoded.includes('\0')) {
    throw new Error(`${field} must serialize to 1–131072 characters.`)
  }
  let score: unknown
  try { score = JSON.parse(encoded) }
  catch (error) { throw new Error(`${field} contains invalid JSON. Pass a score object or JSON.stringify(score).`, { cause: error }) }
  try { parseScore(score) }
  catch (error) { throw new Error(`${field}: ${error instanceof Error ? error.message : 'Invalid musical score.'} Supply {tempo,instrument,notes}.`, { cause: error }) }
  return encoded
}

/** Parse production metadata while retaining legacy score strings in saved projects.
 * @param value - Untrusted plan object.
 * @param mode - New plans validate musical score contents; durable reads preserve previously admitted bounded strings.
 * @returns Admitted production metadata without unknown fields.
 */
export function parseProduction(value: unknown, mode: 'plan' | 'durable'): NovelProduction {
  const source = object(value), pacing = object(source.pacing)
  if (source.version !== 1) throw new Error('Unsupported production version.')
  const integer = (value: unknown, min: number, max: number): number => {
    const result = bounded(value, min, max, 'production pacing')
    if (!Number.isInteger(result)) throw new Error('Production pacing must use whole beats and scenes.')
    return result
  }
  const minScenes = integer(pacing.minScenes, 1, 128), minBeats = integer(pacing.minBeats, 1, 2000), maxBeats = integer(pacing.maxBeats, 1, 2000)
  if (minBeats > maxBeats) throw new Error('Invalid production pacing beat range.')
  const cast = rows(source.cast, 16, 'cast members').map(item => {
    const row = object(item)
    return { id: identifier(row.id), name: text(row.name, 128), voice: text(row.voice, 1000), desire: text(row.desire, 1000) }
  })
  const scenes = rows(source.scenes, 128, 'planned scenes').map((item): NovelProduction['scenes'][number] => {
    const row = object(item), relationshipChange = row.relationshipChange
    if (relationshipChange !== 'none' && relationshipChange !== 'small' && relationshipChange !== 'major') throw new Error('Invalid relationship change.')
    return { id: identifier(row.id), title: text(row.title, 256), purpose: text(row.purpose, 1000), sharedActivity: text(row.sharedActivity, 1000, true),
      relationshipBefore: text(row.relationshipBefore, 1000), relationshipAfter: text(row.relationshipAfter, 1000), relationshipChange,
      beats: rows(row.beats, 40, 'planned beats').map(beat => text(beat, 1000)),
      continuity: rows(row.continuity, 16, 'continuity notes').map(note => text(note, 1000)) }
  })
  const media = rows(source.media, 128, 'planned media tasks').map((item, index): ProductionMedia => {
    const row = object(item)
    const task: ProductionMedia = { id: identifier(row.id), kind: parseAssetKind(row.kind), name: text(row.name, 256),
      sceneIds: rows(row.sceneIds, 128, 'media scene references').map(identifier) }
    if (task.sceneIds.length === 0) throw new Error('Media needs at least one scene reference.')
    unique(task.sceneIds, 'media scene reference')
    if (row.prompt !== undefined) task.prompt = text(row.prompt, 4000)
    if (row.scoreJson !== undefined) task.scoreJson = mode === 'durable' && typeof row.scoreJson === 'string'
      ? text(row.scoreJson, 128 * 1024) : productionScore(row.scoreJson, index)
    if (row.preset !== undefined) {
      if (row.preset !== 'bell' && row.preset !== 'rain' && row.preset !== 'steps') throw new Error('Invalid planned sound preset.')
      task.preset = row.preset
    }
    if (row.assetId !== undefined) task.assetId = identifier(row.assetId)
    return task
  })
  unique(cast.map(row => row.id), 'cast'); unique(scenes.map(row => row.id), 'planned scene'); unique(media.map(row => row.id), 'planned media')
  return { version: 1, premise: text(source.premise, 4000), tone: text(source.tone, 1000), pacing: { minScenes, minBeats, maxBeats }, cast, scenes, media }
}

/** Validate the whole scene graph before persisting any change. */
export function parseProject(value: unknown): NovelProject {
  const source = object(value)
  const id = text(source.id, 64)
  assertId(id)
  const entry = text(source.entry, 64)
  assertId(entry)
  if (source.language !== 'ko' && source.language !== 'ja') throw new Error('Project language must be ko or ja.')
  const assets = source.assets === undefined ? undefined : parseAssets(source.assets)
  if (!Array.isArray(source.scenes) || source.scenes.length < 1 || source.scenes.length > 128) throw new Error('Expected 1–128 scenes.')
  const scenes = source.scenes.map((item: unknown) => {
    const scene = object(item)
    const sceneId = text(scene.id, 64)
    assertId(sceneId)
    if (!Array.isArray(scene.lines) || scene.lines.length > 2000) throw new Error('Expected at most 2000 lines per scene.')
    if (!Array.isArray(scene.choices) || scene.choices.length > 16) throw new Error('Expected at most 16 choices per scene.')
    return {
      id: sceneId, title: text(scene.title, 256),
      ...scene.visual === undefined ? {} : { visual: parseVisual(scene.visual, assets ?? []) },
      lines: scene.lines.map((line: unknown) => {
        const row = object(line)
        return { speaker: text(row.speaker, 128, true), text: text(row.text, 8192) }
      }),
      choices: scene.choices.map((choice: unknown) => {
        const row = object(choice)
        const target = text(row.target, 64)
        assertId(target)
        return { text: text(row.text, 256), target }
      }),
    }
  })
  const ids = new Set(scenes.map(scene => scene.id))
  if (ids.size !== scenes.length) throw new Error('Duplicate scene id.')
  if (!ids.has(entry)) throw new Error('Entry scene does not exist.')
  for (const scene of scenes) for (const choice of scene.choices) {
    if (!ids.has(choice.target)) throw new Error(`Choice target does not exist: ${choice.target}`)
  }
  const project: NovelProject = { id, title: text(source.title, 256), language: source.language, entry, scenes }
  if (assets !== undefined) project.assets = assets
  if (source.uiSkin !== undefined) {
    const skin = object(source.uiSkin)
    if (skin.version !== 1) throw new Error('Unsupported UI skin version.')
    const uiSkin: NovelUiSkin = { version: 1, brief: text(skin.brief, 4000) }
    for (const role of ['title', 'cursor', 'dialogue'] as const) {
      if (skin[role] === undefined) continue
      const assetId = identifier(skin[role])
      const asset = assets?.find(asset => asset.id === assetId)
      if (asset?.kind !== 'background' || !asset.mime.startsWith('image/')) throw new Error('UI skin requires an existing background image asset.')
      uiSkin[role] = assetId
    }
    project.uiSkin = uiSkin
  }
  if (source.production !== undefined) {
    project.production = parseProduction(source.production, 'durable')
    const known = new Set([...ids, ...project.production.scenes.map(scene => scene.id)])
    for (const task of project.production.media) for (const sceneId of task.sceneIds) {
      if (!known.has(sceneId)) throw new Error(`Planned media scene reference does not exist: ${sceneId}`)
    }
  }
  if (Buffer.byteLength(JSON.stringify(project), 'utf8') > MAX_BYTES / 4) throw new Error('Project exceeds the size limit.')
  return project
}

/** One Host instance owns writes; atomic replacement keeps readers on complete revisions. */
export class SceneStore {
  private pending: Promise<unknown> = Promise.resolve()

  constructor(readonly root: string) {}

  private path(id: string): string { assertId(id); return join(this.root, `${id}.json`) }

  private transaction<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run)
    this.pending = result.catch(() => {})
    return result
  }

  private async load(id: string): Promise<SavedProject> {
    const bytes = await readFile(this.path(id))
    if (bytes.length > MAX_BYTES) throw new Error('Saved project exceeds the size limit.')
    const saved = object(JSON.parse(bytes.toString('utf8')) as unknown)
    if (saved.version !== 1 || !Number.isSafeInteger(saved.revision) || Number(saved.revision) < 0 || !Array.isArray(saved.history)) {
      throw new Error('Unsupported saved project.')
    }
    const project = parseProject(saved.project)
    if (project.id !== id || saved.history.length > 5) throw new Error('Invalid saved project identity or history.')
    const history = saved.history.map((entry: unknown): SavedProject['history'][number] => {
      const item = object(entry)
      if (item.origin !== 'manual' && item.origin !== 'agent' && item.origin !== 'undo') throw new Error('Invalid edit origin.')
      const previous = parseProject(item.project)
      if (previous.id !== id) throw new Error('Invalid history identity.')
      return { project: previous, origin: item.origin }
    })
    return { version: 1, revision: Number(saved.revision), project, history }
  }

  private view(saved: SavedProject): ProjectRevision {
    return { revision: saved.revision, project: saved.project, canUndo: saved.history.length > 0 }
  }

  private async persist(saved: SavedProject, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    const path = this.path(saved.project.id)
    const temp = `${path}.${randomUUID()}.tmp`
    let data = JSON.stringify(saved, null, 2)
    while (Buffer.byteLength(data, 'utf8') > MAX_BYTES && saved.history.length > 0) {
      saved.history.shift()
      data = JSON.stringify(saved, null, 2)
    }
    if (Buffer.byteLength(data, 'utf8') > MAX_BYTES) throw new Error('Saved history exceeds the size limit.')
    try {
      await writeFile(temp, data, { flag: 'wx', ...signal === undefined ? {} : { signal } })
      signal?.throwIfAborted()
      await rename(temp, path)
    }
    finally { await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error }) }
  }

  /** Create once; an existing id is never replaced. */
  create(id: string, title: string, language: 'ko' | 'ja'): Promise<ProjectRevision> {
    return this.transaction(async () => {
      const project = parseProject({ id, title, language, entry: 'start', scenes: [{ id: 'start', title, lines: [], choices: [] }] })
      await mkdir(this.root, { recursive: true })
      const saved: SavedProject = { version: 1, revision: 0, project, history: [] }
      await writeFile(this.path(id), JSON.stringify(saved, null, 2), { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'EEXIST') throw new Error('Project already exists.')
        throw error
      })
      return this.view(saved)
    })
  }

  /** Read the durable revision, including after restarting the Host. */
  async read(id: string): Promise<ProjectRevision> { return this.view(await this.load(id)) }

  /** List projects in this configured authoring directory. */
  async list(): Promise<ProjectSummary[]> {
    await mkdir(this.root, { recursive: true })
    const files = (await readdir(this.root)).filter(file => /^[a-z][a-z0-9_-]{0,63}\.json$/.test(file))
    return Promise.all(files.map(async file => {
      const { project } = await this.read(file.slice(0, -5))
      return { id: project.id, title: project.title, language: project.language }
    }))
  }

  /** Commit only against the revision the caller actually edited. */
  save(id: string, revision: number, input: unknown, origin: 'manual' | 'agent', signal?: AbortSignal): Promise<ProjectRevision> {
    return this.transaction(async () => {
      signal?.throwIfAborted()
      const project = parseProject(input)
      if (project.id !== id) throw new Error('Project id cannot change.')
      const saved = await this.load(id)
      if (saved.revision !== revision) throw new Error('Revision conflict. Reload the project before saving.')
      const next: SavedProject = { version: 1, revision: revision + 1, project, history: [...saved.history, { project: saved.project, origin }].slice(-5) }
      await this.persist(next, signal)
      return this.view(next)
    })
  }

  /** Restore the most recent saved state with a new revision number. */
  undo(id: string, revision: number): Promise<ProjectRevision> {
    return this.transaction(async () => {
      const saved = await this.load(id)
      if (saved.revision !== revision) throw new Error('Revision conflict. Reload the project before undoing.')
      const previous = saved.history.at(-1)
      if (previous === undefined) throw new Error('No saved edit to undo.')
      const next: SavedProject = { version: 1, revision: revision + 1, project: previous.project, history: saved.history.slice(0, -1) }
      await this.persist(next)
      return this.view(next)
    })
  }
}
