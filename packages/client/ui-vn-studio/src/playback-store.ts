/** Confined gameplay slots, independent of authoring revisions and undo history. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assertId } from './store.ts'
import type { SceneStore } from './store.ts'
import type { NovelProject } from './types.ts'
import { DEFAULT_PLAYER_SETTINGS, MAX_PLAYBACK_FLAGS, MAX_PLAYBACK_HISTORY } from './playback-types.ts'
import type { GameSave, PlaybackPosition, PlaybackState, PlayerSettings } from './playback-types.ts'

interface SavedPlayback { version: 1; id: string; slots: GameSave[]; settings: PlayerSettings }

/** Machine-readable browser save failures; a failure never rewrites an invalid save file. */
export class PlaybackError extends Error {
  constructor(readonly code: 'invalid-input' | 'incompatible-save' | 'corrupt-save' | 'unsafe-file' | 'empty-slot', message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PlaybackError'
  }
}

const MAX_INPUT_BYTES = 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new PlaybackError('invalid-input', 'Expected a playback object.')
  return value as Record<string, unknown>
}

function bounded(value: unknown, min: number, max: number, label: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new PlaybackError('invalid-input', `Invalid playback ${label}.`)
  }
  return value
}

function slotNumber(value: unknown): number { return bounded(value, 0, 6, 'slot (choose 0–6)', true) }

function position(value: unknown): PlaybackPosition {
  const row = record(value)
  if (typeof row.sceneId !== 'string') throw new PlaybackError('invalid-input', 'Invalid scene id.')
  assertId(row.sceneId)
  return { sceneId: row.sceneId, line: bounded(row.line, 0, 2000, 'line', true) }
}

function state(value: unknown): PlaybackState {
  const row = record(value)
  if (!Array.isArray(row.history) || row.history.length > MAX_PLAYBACK_HISTORY) throw new PlaybackError('invalid-input', 'Playback history exceeds 200 visited positions.')
  const result: PlaybackState = { ...position(row), history: row.history.map(position) }
  if (row.flags !== undefined) {
    const entries = Object.entries(record(row.flags))
    if (entries.length > MAX_PLAYBACK_FLAGS || entries.some(([key, value]) => !/^[a-z][a-z0-9_-]{0,63}$/.test(key) || typeof value !== 'boolean')) {
      throw new PlaybackError('invalid-input', 'Playback flags require at most 8192 boolean identifier keys.')
    }
    result.flags = Object.fromEntries(entries) as Record<string, boolean>
  }
  if (row.fingerprint !== undefined) {
    if (typeof row.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(row.fingerprint)) throw new PlaybackError('invalid-input', 'Invalid story fingerprint.')
    result.fingerprint = row.fingerprint
  }
  return result
}

function settings(value: unknown): PlayerSettings {
  const row = record(value)
  return {
    musicVolume: bounded(row.musicVolume, 0, 1, 'music volume'),
    effectVolume: bounded(row.effectVolume, 0, 1, 'effect volume'),
    autoDelayMs: bounded(row.autoDelayMs, 300, 15000, 'automatic reading delay', true),
    textSize: bounded(row.textSize, 75, 150, 'text size', true),
  }
}

function inputJson(value: string): unknown {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_INPUT_BYTES) throw new PlaybackError('invalid-input', 'Playback input exceeds the size limit.')
  try { return JSON.parse(value) as unknown }
  catch (cause) { throw new PlaybackError('invalid-input', 'Invalid playback JSON.', { cause }) }
}

function savedSlot(value: unknown): GameSave {
  const row = record(value), parsed = state(row)
  if (parsed.fingerprint === undefined || typeof row.time !== 'string' || !Number.isFinite(Date.parse(row.time)) || new Date(row.time).toISOString() !== row.time ||
      typeof row.title !== 'string' || row.title.length > 256 || typeof row.text !== 'string' || row.text.length > 8192) {
    throw new PlaybackError('corrupt-save', 'Invalid saved playback slot.')
  }
  return { slot: slotNumber(row.slot), time: row.time, fingerprint: parsed.fingerprint, sceneId: parsed.sceneId,
    line: parsed.line, history: parsed.history, ...(parsed.flags === undefined ? {} : { flags: parsed.flags }), title: row.title, text: row.text }
}

function savedFile(value: unknown, id: string): SavedPlayback {
  const row = record(value)
  if (row.version !== 1 || row.id !== id || !Array.isArray(row.slots) || row.slots.length > 7) throw new PlaybackError('corrupt-save', 'Unsupported saved playback version or project identity.')
  const slots = row.slots.map(savedSlot)
  if (new Set(slots.map(slot => slot.slot)).size !== slots.length) throw new PlaybackError('corrupt-save', 'Duplicate saved playback slots.')
  return { version: 1, id, slots: slots.sort((a, b) => a.slot - b.slot), settings: settings(row.settings) }
}

/** Derive compatibility from story content, excluding production metadata and unused assets.
 * @param project Current validated authoring document.
 * @returns SHA-256 digest identifying this exact story.
 */
export function playbackFingerprint(project: NovelProject): string {
  return createHash('sha256').update(JSON.stringify({ id: project.id, language: project.language, entry: project.entry, scenes: project.scenes })).digest('hex')
}

function validateLocations(project: NovelProject, state: PlaybackState): void {
  for (const location of [state, ...state.history]) {
    const scene = project.scenes.find(scene => scene.id === location.sceneId)
    if (scene === undefined || location.line > scene.lines.length) throw new PlaybackError('invalid-input', 'The saved scene or line does not exist in this story.')
  }
}

function missing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT' }

/** One Host owns the write queue; every update merges the complete durable gameplay file. */
export class PlaybackStore {
  private pending: Promise<unknown> = Promise.resolve()
  private readonly stopped = new AbortController()

  constructor(private readonly documents: SceneStore) {}

  private transaction<T>(run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const cancellation = signal === undefined ? this.stopped.signal : AbortSignal.any([this.stopped.signal, signal])
    const result = this.pending.then(async () => { cancellation.throwIfAborted(); return run(cancellation) })
    this.pending = result.catch(() => { /* The caller owns this operation's failure; later operations remain usable. */ })
    return result
  }

  private async regular(path: string, directory: string): Promise<void> {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || dirname(await realpath(path)) !== directory) {
      throw new PlaybackError('unsafe-file', 'Playback requires confined regular files without symbolic links.')
    }
  }

  private async project(id: string): Promise<{ directory: string; project: NovelProject }> {
    assertId(id)
    const directory = await realpath(this.documents.root)
    await this.regular(join(directory, `${id}.json`), directory)
    const project = (await this.documents.read(id)).project
    if (await realpath(this.documents.root) !== directory) throw new PlaybackError('unsafe-file', 'The project directory changed while reading the story.')
    return { directory, project }
  }

  private async read(directory: string, id: string): Promise<SavedPlayback> {
    const path = join(directory, `${id}.playback.json`)
    try { await this.regular(path, directory) }
    catch (error) {
      if (missing(error)) return { version: 1, id, slots: [], settings: { ...DEFAULT_PLAYER_SETTINGS } }
      throw error
    }
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat(), named = await lstat(path)
      if (!info.isFile() || named.isSymbolicLink() || info.dev !== named.dev || info.ino !== named.ino) throw new PlaybackError('unsafe-file', 'The playback file changed while opening it.')
      if (info.size > MAX_FILE_BYTES) throw new PlaybackError('corrupt-save', 'Saved playback exceeds the size limit.')
      try {
        const bytes = await handle.readFile()
        if (bytes.length > MAX_FILE_BYTES) throw new PlaybackError('corrupt-save', 'Saved playback exceeds the size limit.')
        return savedFile(JSON.parse(bytes.toString('utf8')) as unknown, id)
      } catch (cause) { throw new PlaybackError('corrupt-save', 'Saved playback is invalid. Preserve the file and create a new browser save file to recover.', { cause }) }
    } finally { await handle.close() }
  }

  private async persist(directory: string, saved: SavedPlayback, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const path = join(directory, `${saved.id}.playback.json`), temp = `${path}.${randomUUID()}.tmp`
    const data = JSON.stringify(saved, null, 2)
    if (Buffer.byteLength(data, 'utf8') > MAX_FILE_BYTES) throw new PlaybackError('invalid-input', 'Saved playback exceeds the size limit.')
    if (await realpath(this.documents.root) !== directory) throw new PlaybackError('unsafe-file', 'The project directory changed before the gameplay save.')
    try {
      const handle = await open(temp, 'wx')
      try { await handle.writeFile(data, { signal }); await handle.sync() } finally { await handle.close() }
      if (await realpath(this.documents.root) !== directory) throw new PlaybackError('unsafe-file', 'The project directory changed during the gameplay save.')
      try { await this.regular(path, directory) } catch (error) { if (!missing(error)) throw error }
      signal.throwIfAborted()
      await rename(temp, path)
    } finally { await unlink(temp).catch((error) => { if (!missing(error)) throw error }) }
  }

  /** Read all occupied slots, including incompatible slots which load rejects.
   * @param id Existing project id.
   * @returns Slots sorted from quicksave (0) through manual slot 6.
   */
  slots(id: string): Promise<GameSave[]> {
    return this.transaction(async () => { const { directory } = await this.project(id); return (await this.read(directory, id)).slots })
  }

  /** Store a validated browser position; no authoring document is written.
   * @param id Existing project id.
   * @param slot Quicksave 0 or manual slot 1–6.
   * @param stateJson Position and at most 200 visited positions; an optional fingerprint must match the durable story.
   * @param signal Optional cancellation prevents a queued or uncommitted write; absent means service cancellation only.
   * @returns All occupied slots after the atomic commit.
   */
  save(id: string, slot: number, stateJson: string, signal?: AbortSignal): Promise<GameSave[]> {
    return this.transaction(async (cancellation) => {
      assertId(id)
      slotNumber(slot)
      const parsed = state(inputJson(stateJson)), { directory, project } = await this.project(id)
      cancellation.throwIfAborted()
      const fingerprint = playbackFingerprint(project)
      if (parsed.fingerprint !== undefined && parsed.fingerprint !== fingerprint) throw new PlaybackError('incompatible-save', 'The story changed. Reload the saved production file before saving gameplay.')
      validateLocations(project, parsed)
      const saved = await this.read(directory, id), scene = project.scenes.find(scene => scene.id === parsed.sceneId)
      if (scene === undefined) throw new PlaybackError('invalid-input', 'The saved scene does not exist in this story.')
      const next: GameSave = { slot, time: new Date().toISOString(), fingerprint, sceneId: parsed.sceneId, line: parsed.line,
        history: parsed.history, ...(parsed.flags === undefined ? {} : { flags: parsed.flags }), title: scene.title, text: scene.lines[parsed.line]?.text ?? '' }
      saved.slots = [...saved.slots.filter(item => item.slot !== slot), next].sort((a, b) => a.slot - b.slot)
      await this.persist(directory, saved, cancellation)
      return saved.slots
    }, signal)
  }

  /** Restore only an exactly compatible story position without changing authoring revisions.
   * @param id Existing project id.
   * @param slot Occupied quicksave or manual slot.
   * @returns Saved position and history; stale story saves fail explicitly.
   */
  load(id: string, slot: number): Promise<GameSave> {
    return this.transaction(async () => {
      slotNumber(slot)
      const { directory, project } = await this.project(id), saved = (await this.read(directory, id)).slots.find(item => item.slot === slot)
      if (saved === undefined) throw new PlaybackError('empty-slot', 'This browser game slot is empty.')
      if (saved.fingerprint !== playbackFingerprint(project)) throw new PlaybackError('incompatible-save', 'The story changed after this browser save. Start again or choose a compatible slot.')
      validateLocations(project, saved)
      return saved
    })
  }

  /** Read saved preferences or independent defaults for this project.
   * @param id Existing project id.
   * @returns Validated browser player settings.
   */
  settings(id: string): Promise<PlayerSettings> {
    return this.transaction(async () => { const { directory } = await this.project(id); return (await this.read(directory, id)).settings })
  }

  /** Atomically replace preferences while retaining every occupied slot.
   * @param id Existing project id.
   * @param settingsJson Complete volume, reading-delay and text-size settings.
   * @param signal Optional cancellation prevents a queued or uncommitted write; absent means service cancellation only.
   * @returns Preferences after the atomic commit.
   */
  saveSettings(id: string, settingsJson: string, signal?: AbortSignal): Promise<PlayerSettings> {
    return this.transaction(async (cancellation) => {
      assertId(id)
      const parsed = settings(inputJson(settingsJson)), { directory } = await this.project(id)
      cancellation.throwIfAborted()
      const saved = await this.read(directory, id)
      saved.settings = parsed
      await this.persist(directory, saved, cancellation)
      return parsed
    }, signal)
  }

  /** Abort queued/uncommitted operations and wait for owned filesystem work to settle.
   * @returns Completion after the write queue has drained.
   */
  async close(): Promise<void> { this.stopped.abort(); await this.pending }
}
