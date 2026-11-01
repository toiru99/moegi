import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './controller.ts'
import type { Config } from './config.ts'
import type { AssetKind, MediaImportResult, MediaStatus, ProjectRevision } from './types.ts'
import { AssetStore } from './assets.ts'
import { parseAssetKind } from './store.ts'
import { MediaProviders, openAiImages } from './media-providers.ts'
import { renderEffect, renderMusic } from './music.ts'
import { codexImages } from './codex-images.ts'

declare module '@deepseek-ai/cordis' { interface Context { vnMedia: VnMedia } }

/** Own media providers, project imports and cancellation beside the existing authoring service. */
export class VnMedia extends TypertRemoteService {
  static inject = ['tools', 'credentials', 'vnStudio']
  readonly providers = new MediaProviders()
  readonly assets: AssetStore
  private readonly stopped = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  private readonly key = credentialRef('VN_STUDIO_IMAGE_API_KEY')
  private readonly maxBytes: number
  private readonly imageModel: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'vnMedia', { namespace: 'vnMedia' })
    this.maxBytes = config.maxAssetBytes ?? 8 * 1024 * 1024
    this.imageModel = config.imageModel ?? 'gpt-image-2.5-sunburst'
    this.assets = new AssetStore(ctx.vnStudio.documents, this.maxBytes)
    if (config.codexImageEnabled !== false) ctx.effect(() => {
      const provider = codexImages({ executable: config.codexExecutable ?? 'codex', directory: join(config.previewDirectory, 'codex-images'), timeoutMs: config.codexImageTimeoutMs ?? 300000, maxBytes: this.maxBytes })
      const release = this.providers.register(provider)
      return async () => { release(); await provider.dispose() }
    }, 'vn-studio.codex-image-provider')
    ctx.effect(() => this.providers.register(openAiImages({
      readKey: async () => (await ctx.credentials.resolve(this.key))?.value,
      model: this.imageModel, maxBytes: this.maxBytes, timeoutMs: config.imageTimeoutMs ?? 120000,
    })), 'vn-studio.image-provider')
    ctx.effect(() => async () => { this.stopped.abort(); await Promise.allSettled([...this.pending]) }, 'vn-studio.media-operations')
    ctx.tools.register(defineTool({
      name: 'vn_media',
      description: 'Create or import project-owned media for a visual novel. Read the project with vn_project first and use its current revision. Actions: status shows image-provider readiness; import copies a user-selected local image/audio path; compose renders a simple original musical score to WAV; effect renders bell/rain/steps; generate_image calls a connected image provider. scoreJson is {tempo:40..180,instrument:"piano"|"pad"|"bell",notes:[{midi:36..96,beat:0..128,duration:0.0625..8,velocity:0.01..1}]}, 1..512 notes, at most 60 seconds. Returned project.assets metadata contains the new asset id. To use it, preserve all project fields and save scene.visual={background?:assetId,characters:[{asset:characterId,x:0..100,y:0..100,scale:0.1..2}],music?:assetId,sound?:assetId}. Character positions use bottom-centre percentages. Never claim image generation succeeded when its provider is unconfigured.',
      parameters: {
        action: { type: 'string', enum: ['status', 'import', 'compose', 'effect', 'generate_image'], required: true },
        id: { type: 'string', description: 'Existing project id.' }, revision: { type: 'number', description: 'Current project revision.' },
        name: { type: 'string', description: 'Human-readable media name.' }, kind: { type: 'string', enum: ['background', 'character', 'music', 'sound'] },
        path: { type: 'string', description: 'Explicit user-selected source file for import; the original is preserved.' },
        scoreJson: { type: 'string', description: 'Complete bounded musical score for compose.' },
        preset: { type: 'string', enum: ['bell', 'rain', 'steps'] },
        prompt: { type: 'string', description: 'Image prompt, including desired style; at most 4000 characters.' },
        provider: { type: 'string', description: 'Ready provider id returned by status; defaults to signed-in codex-images, then another ready provider.' },
      },
      output: { schema: { type: 'string' }, render: (_args, result) => [{ type: 'text', text: result }] },
      execute: async (args, execution) => {
        execution.signal.throwIfAborted()
        if (args.action === 'status') return JSON.stringify(await this.status())
        if (args.id === undefined || args.revision === undefined || args.name === undefined) throw new Error('Project id, revision and media name are required.')
        if (args.action === 'compose') {
          if (args.scoreJson === undefined) throw new Error('A musical score is required.')
          return JSON.stringify(await this.composeWithSignal(args.id, args.revision, args.name, args.scoreJson, execution.signal))
        }
        if (args.action === 'effect') {
          if (args.preset === undefined) throw new Error('A sound preset is required.')
          return JSON.stringify(await this.effectWithSignal(args.id, args.revision, args.name, args.preset, execution.signal))
        }
        if (args.action === 'generate_image') {
          if (args.kind !== 'background' && args.kind !== 'character') throw new Error('Choose background or character.')
          if (args.prompt === undefined) throw new Error('An image prompt is required.')
          const providers = await this.providers.status()
          const provider = args.provider ?? providers.find(provider => provider.id === 'codex-images' && provider.ready)?.id ?? providers.find(provider => provider.ready && provider.kinds.includes(args.kind!))?.id
          if (provider === undefined) throw new Error('Connect signed-in Codex image generation or an Images API provider before generating.')
          return JSON.stringify(await this.generateImageWithSignal(args.id, args.revision, args.kind, args.name, args.prompt, provider, execution.signal))
        }
        if (args.path === undefined || args.kind === undefined) throw new Error('A source file and media kind are required.')
        const info = await stat(args.path)
        if (!info.isFile() || info.size > this.maxBytes) throw new Error('Media file exceeds the size limit or is not a regular file.')
        const { id, revision, kind, name, path } = args
        return JSON.stringify(await this.perform(async () => this.assets.import(id, revision, parseAssetKind(kind), name, await readFile(path), { origin: 'import' })))
      },
    }))
  }

  private async perform<T>(operation: () => Promise<T>): Promise<T> {
    this.stopped.signal.throwIfAborted()
    const pending = operation()
    this.pending.add(pending)
    try { return await pending } finally { this.pending.delete(pending) }
  }

  /** Report available media providers without disclosing API keys or account data. */
  @Remote
  async status(): Promise<MediaStatus> { return { providers: await this.providers.status(), maxAssetBytes: this.maxBytes, imageModel: this.imageModel } }

  /** Store a user-entered image API key in the native credentials provider. */
  @Remote
  async saveImageKey(value: string): Promise<void> {
    if (typeof value !== 'string' || value.length < 8 || value.length > 4096 || /\s/.test(value)) throw new Error('Enter a valid image API key.')
    await this.ctx.credentials.set(this.key, value)
  }

  /** Import browser-selected media through the same bounded path as provider output. */
  @Remote
  async importAsset(id: string, revision: number, kind: AssetKind, name: string, dataUrl: string): Promise<ProjectRevision> {
    return this.perform(async () => {
    if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(this.maxBytes * 4 / 3) + 128) throw new Error('Upload exceeds the size limit.')
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl)
    if (match?.[2] === undefined) throw new Error('Invalid media upload.')
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')) throw new Error('Invalid media encoding.')
    return this.assets.import(id, revision, kind, name, bytes, { origin: 'import' })
    })
  }

  /** Get only an admitted asset from this project for image/audio preview. */
  @Remote
  assetData(id: string, asset: string): Promise<string> { return this.assets.data(id, asset) }

  /** Render an explicit score to actual WAV audio and commit it to the project. */
  @Remote
  compose(id: string, revision: number, name: string, scoreJson: string): Promise<ProjectRevision> {
    return this.composeWithSignal(id, revision, name, scoreJson)
  }

  /** Render for a calling plugin while retaining its cancellation through the queued save. */
  async composeWithSignal(id: string, revision: number, name: string, scoreJson: string, caller?: AbortSignal): Promise<ProjectRevision> {
    return (await this.composeAssetWithSignal(id, revision, name, scoreJson, caller)).saved
  }

  /** Render an original score and report its exact admitted id, including reused identical files.
   * @param id - Existing project id.
   * @param revision - Current authoring revision.
   * @param name - Human-readable music name.
   * @param scoreJson - Bounded original score JSON.
   * @param caller - Optional calling operation cancellation; absence uses service lifetime.
   * @returns The authoring revision and exact project-owned asset id.
   */
  composeAssetWithSignal(id: string, revision: number, name: string, scoreJson: string, caller?: AbortSignal): Promise<MediaImportResult> {
    const signal = caller === undefined ? this.stopped.signal : AbortSignal.any([this.stopped.signal, caller])
    signal.throwIfAborted()
    return this.perform(async () => {
    if (typeof scoreJson !== 'string' || scoreJson.length > 128 * 1024) throw new Error('Musical score exceeds the size limit.')
    return this.assets.importResult(id, revision, 'music', name, renderMusic(JSON.parse(scoreJson)), { origin: 'composed', provider: 'local-score' }, signal)
    })
  }

  /** Generate an explicitly synthesized sound effect. */
  @Remote
  effect(id: string, revision: number, name: string, preset: string): Promise<ProjectRevision> {
    return this.effectWithSignal(id, revision, name, preset)
  }

  /** Synthesize for a calling plugin without allowing a cancelled task to commit later. */
  async effectWithSignal(id: string, revision: number, name: string, preset: string, caller?: AbortSignal): Promise<ProjectRevision> {
    return (await this.effectAssetWithSignal(id, revision, name, preset, caller)).saved
  }

  /** Synthesize a supported effect and report its exact admitted id.
   * @param id - Existing project id.
   * @param revision - Current authoring revision.
   * @param name - Human-readable sound name.
   * @param preset - Supported bell, rain or steps synthesis.
   * @param caller - Optional calling operation cancellation; absence uses service lifetime.
   * @returns The authoring revision and exact project-owned asset id.
   */
  effectAssetWithSignal(id: string, revision: number, name: string, preset: string, caller?: AbortSignal): Promise<MediaImportResult> {
    const signal = caller === undefined ? this.stopped.signal : AbortSignal.any([this.stopped.signal, caller])
    signal.throwIfAborted()
    return this.perform(() => this.assets.importResult(id, revision, 'sound', name, renderEffect(preset), { origin: 'composed', provider: 'local-synthesis' }, signal))
  }

  /** Generate through an installed provider, then validate and import its bytes. */
  @Remote
  async generateImage(id: string, revision: number, kind: 'background' | 'character', name: string, prompt: string, provider: string): Promise<ProjectRevision> {
    return this.generateImageWithSignal(id, revision, kind, name, prompt, provider)
  }

  /** Generate for a calling plugin with cancellation forwarded through validation and persistence. */
  async generateImageWithSignal(id: string, revision: number, kind: 'background' | 'character', name: string, prompt: string, provider: string, caller?: AbortSignal): Promise<ProjectRevision> {
    return (await this.generateImageAssetWithSignal(id, revision, kind, name, prompt, provider, caller)).saved
  }

  /** Generate through the current provider and retain the exact id after raster normalization.
   * @param id - Existing project id.
   * @param revision - Current authoring revision.
   * @param kind - Background or character image role.
   * @param name - Human-readable image name.
   * @param prompt - Bounded original image prompt.
   * @param provider - Ready registered provider id.
   * @param caller - Optional calling operation cancellation; absence uses service lifetime.
   * @returns The authoring revision and exact validated project-owned image id.
   */
  async generateImageAssetWithSignal(id: string, revision: number, kind: 'background' | 'character', name: string, prompt: string, provider: string, caller?: AbortSignal): Promise<MediaImportResult> {
    const signal = caller === undefined ? this.stopped.signal : AbortSignal.any([this.stopped.signal, caller])
    signal.throwIfAborted()
    const operation = (async () => {
      const bytes = await this.providers.generate(provider, { kind, prompt, signal })
      signal.throwIfAborted()
      return this.assets.importResult(id, revision, kind, name, bytes, { origin: 'generated', provider, prompt }, signal)
    })()
    this.pending.add(operation)
    try { return await operation } finally { this.pending.delete(operation) }
  }
}
