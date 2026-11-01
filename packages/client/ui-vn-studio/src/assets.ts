import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import sharp, { type Metadata } from 'sharp'
import { assertId, parseAssetKind, SceneStore } from './store.ts'
import type { AssetKind, MediaImportResult, NovelAsset, ProjectRevision } from './types.ts'
import { inspectAudio } from './audio-format.ts'

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/wav': 'wav', 'audio/ogg': 'ogg' } as const
/** Fixed file extension admitted by the project's media type. */
export const assetExtension = (asset: Pick<NovelAsset, 'mime'>): string => EXTENSIONS[asset.mime]
const assetId = (kind: AssetKind, bytes: Buffer): string => `asset_${createHash('sha256').update(kind).update(bytes).digest('hex').slice(0, 24)}`

/** Project-owned, immutable media shared by imports, generators and the compiler. */
export class AssetStore {
  constructor(private readonly scenes: SceneStore, private readonly maxBytes = 8 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 20 * 1024 * 1024) throw new Error('Invalid media byte limit.')
  }

  private async directory(id: string, create: boolean): Promise<string> {
    assertId(id)
    const root = await realpath(this.scenes.root)
    const directory = join(root, `${id}.assets`)
    if (create) await mkdir(directory).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error })
    const stat = await lstat(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Asset directory must be confined and cannot be a symlink.')
    const resolved = await realpath(directory)
    if (!resolved.startsWith(`${root}${sep}`)) throw new Error('Asset directory is outside project storage.')
    return resolved
  }

  private async normalize(kind: AssetKind, input: Buffer): Promise<{ bytes: Buffer; mime: NovelAsset['mime']; width?: number; height?: number }> {
    if (input.length === 0 || input.length > this.maxBytes) throw new Error('Media exceeds the upload size limit.')
    if (kind === 'background' || kind === 'character') {
      const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff
      const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP'
      if (!png && !jpeg && !webp) throw new Error('Unsupported image media. Import a raster PNG, JPEG or WebP image.')
      let metadata: Metadata
      try { metadata = await sharp(input, { limitInputPixels: 4096 * 4096, animated: false }).metadata() }
      catch { throw new Error('Unsupported or invalid image media.') }
      if (metadata.format !== 'png' && metadata.format !== 'jpeg' && metadata.format !== 'webp') throw new Error('Only raster PNG, JPEG and WebP images are supported.')
      if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) !== 1) throw new Error('Image dimensions exceed the limit.')
      if (metadata.width / metadata.height > 4 || metadata.height / metadata.width > 4) throw new Error('Image aspect ratio exceeds the 4:1 dimension limit.')
      const normalized = await sharp(input, { limitInputPixels: 4096 * 4096 }).rotate().png().toBuffer({ resolveWithObject: true })
      if (normalized.data.length > this.maxBytes) throw new Error('Normalized image exceeds the upload size limit.')
      return { bytes: normalized.data, mime: 'image/png', width: normalized.info.width, height: normalized.info.height }
    }
    return { bytes: input, mime: inspectAudio(input) }
  }

  /** Import a new immutable file and commit metadata only against the caller's revision. */
  async import(id: string, revision: number, role: AssetKind, name: string, data: Buffer, provenance?: NovelAsset['provenance'], signal?: AbortSignal): Promise<ProjectRevision> {
    return (await this.importResult(id, revision, role, name, data, provenance, signal)).saved
  }

  /** Import through bounded validation and report the exact admitted id, including deduplicated content.
   * @param id - Existing project id.
   * @param revision - Revision read before import.
   * @param role - Image or audio role of the file.
   * @param name - Human-readable asset name.
   * @param data - Bounded source bytes normalized by this importer.
   * @param provenance - Optional generation/import source metadata; absence records no source.
   * @param signal - Optional caller cancellation checked before committing metadata.
   * @returns The committed revision and exact immutable asset id.
   */
  async importResult(id: string, revision: number, role: AssetKind, name: string, data: Buffer, provenance?: NovelAsset['provenance'], signal?: AbortSignal): Promise<MediaImportResult> {
    signal?.throwIfAborted()
    const kind = parseAssetKind(role)
    const saved = await this.scenes.read(id)
    if (saved.revision !== revision) throw new Error('Revision conflict. Reload before importing media.')
    if (typeof name !== 'string' || name.trim() === '' || name.length > 256 || name.includes('\0')) throw new Error('Invalid asset name.')
    const normalized = await this.normalize(kind, data)
    signal?.throwIfAborted()
    const hashId = assetId(kind, normalized.bytes)
    if (saved.project.assets?.some(asset => asset.id === hashId)) {
      await this.bytes(id, hashId)
      signal?.throwIfAborted()
      return { saved, assetId: hashId }
    }
    const asset: NovelAsset = { id: hashId, name, kind, mime: normalized.mime, bytes: normalized.bytes.length,
      ...normalized.width === undefined ? {} : { width: normalized.width, height: normalized.height! },
      ...provenance === undefined ? {} : { provenance },
    }
    const directory = await this.directory(id, true)
    const path = join(directory, `${hashId}.${EXTENSIONS[asset.mime]}`)
    signal?.throwIfAborted()
    await writeFile(path, normalized.bytes, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== normalized.bytes.length || !(await readFile(path)).equals(normalized.bytes)) throw new Error('Asset storage collision or symlink.')
    })
    // Unreferenced content may remain after a conflict; it cannot replace another revision.
    signal?.throwIfAborted()
    return { saved: await this.scenes.save(id, revision, { ...saved.project, assets: [...saved.project.assets ?? [], asset] }, 'manual', signal), assetId: hashId }
  }

  /** Resolve only an existing, regular file admitted by the current project's metadata. */
  async path(projectId: string, id: string): Promise<string> {
    assertId(id)
    const { project } = await this.scenes.read(projectId)
    const asset = project.assets?.find(asset => asset.id === id)
    if (asset === undefined) throw new Error('Project asset does not exist.')
    const directory = await this.directory(projectId, false)
    const file = join(directory, `${asset.id}.${EXTENSIONS[asset.mime]}`)
    const stat = await lstat(file)
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== asset.bytes || stat.size > this.maxBytes) throw new Error('Invalid or oversized asset file.')
    const resolved = await realpath(file)
    if (!resolved.startsWith(`${directory}${sep}`)) throw new Error('Asset file is outside project storage.')
    return resolved
  }

  /** Read bounded validated media for the authoring view, never arbitrary local files. */
  async bytes(projectId: string, id: string): Promise<Buffer> {
    const { project } = await this.scenes.read(projectId)
    const asset = project.assets?.find(asset => asset.id === id)
    if (asset === undefined) throw new Error('Project asset does not exist.')
    const bytes = await readFile(await this.path(projectId, id))
    if (bytes.length !== asset.bytes || bytes.length > this.maxBytes || assetId(asset.kind, bytes) !== id) throw new Error('Project asset integrity check failed.')
    return bytes
  }

  /** Return browser-consumable media without exposing a filesystem path. */
  async data(projectId: string, id: string): Promise<string> {
    const { project } = await this.scenes.read(projectId)
    const asset = project.assets?.find(asset => asset.id === id)
    if (asset === undefined) throw new Error('Project asset does not exist.')
    return `data:${asset.mime};base64,${(await this.bytes(projectId, id)).toString('base64')}`
  }
}
