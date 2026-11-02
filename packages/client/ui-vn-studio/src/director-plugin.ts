/** Default-on VN production service, tools, automatic guidance and discoverable skill. */
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from './controller.ts'
import type {} from './media.ts'
import type {} from './ui-skin.ts'
import { bindProductionMedia, deriveProductionStatus, saveProductionPlan, writeProductionScene } from './director-plan.ts'
import { directorGuidance, directorSkillPath, loadDirectorSkill } from './director-guidance.ts'
import type { MediaImportResult, NovelAsset, ProductionStatus, ProjectRevision } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Durable chapter plans, scene writing and evidence-based production progress. */
    vnDirector: VnDirector
  }
}

/** Deployment defaults; saved projects carry their own explicit pacing targets. */
export interface Config {
  defaultSceneCount: number
  defaultMinBeats: number
  defaultMaxBeats: number
  maxMediaJobs: number
}

/** Bounded director defaults without changing the host's model or authorization settings. */
export const Config: z<Config> = z.object({
  defaultSceneCount: z.number().step(1).min(1).max(128).default(5),
  defaultMinBeats: z.number().step(1).min(1).max(2000).default(12),
  defaultMaxBeats: z.number().step(1).min(1).max(2000).default(20),
  maxMediaJobs: z.number().step(1).min(1).max(16).default(8),
})

/** Loader component identifier. */
export const name = 'vn-director'
/** The director consumes the actual project and media services. */
export const inject = ['tools', 'vnStudio', 'vnMedia']

/** Install automatically active production behavior and optional packaged-skill discovery.
 * @param ctx - Component lifetime and declared authoring/media services.
 * @param config - Validated pacing and per-call media bounds.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.defaultMinBeats > config.defaultMaxBeats) throw new Error('Director minimum beats must not exceed maximum beats.')
  const content = loadDirectorSkill()
  ctx.plugin(VnDirector, config)
  ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section({ name: 'vn-director-guidance', order: 95, interpolate: false,
    text: directorGuidance({ minScenes: config.defaultSceneCount, minBeats: config.defaultMinBeats, maxBeats: config.defaultMaxBeats }, content) }))
  ctx.inject(['skills'], scope => scope.skills.register({ name: 'vn-director', description: 'Plan and produce paced visual novels, cast, scenes and actual image/audio assets in VN Studio, including vague new-game requests.',
    source: 'bundled', provider: 'vn-director', path: directorSkillPath, resourceBase: { kind: 'directory', path: dirname(directorSkillPath) }, content }))
}

function parseJson(value: string): unknown {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 512 * 1024) throw new Error('Production JSON exceeds the size limit.')
  return JSON.parse(value) as unknown
}

function changedIds<T extends { id: string }>(before: T[], after: T[]): string[] {
  const previous = new Map(before.map(row => [row.id, JSON.stringify(row)]))
  const current = new Map(after.map(row => [row.id, JSON.stringify(row)]))
  return [...new Set([...current.keys(), ...previous.keys()])].filter(id => previous.get(id) !== current.get(id))
}

function mutationReceipt(previous: ProjectRevision, saved: ProjectRevision) {
  const { project } = saved
  const assets = project.assets ?? []
  return {
    id: project.id, revision: saved.revision,
    changedSceneIds: changedIds(previous.project.scenes, project.scenes),
    changedMediaIds: changedIds(previous.project.production?.media ?? [], project.production?.media ?? []),
    addedAssetIds: assets.filter(asset => !previous.project.assets?.some(old => old.id === asset.id)).map(asset => asset.id),
    counts: { scenes: project.scenes.length, beats: project.scenes.reduce((total, scene) => total + scene.lines.length, 0), assets: assets.length, mediaTasks: project.production?.media.length ?? 0 },
  }
}

/** Own production orchestration beside the single project revision store. */
export class VnDirector extends TypertRemoteService {
  static inject = ['tools', 'vnStudio', 'vnMedia']
  private readonly stopped = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'vnDirector', { namespace: 'vnDirector' })
    ctx.effect(() => async () => { this.stopped.abort(); await Promise.allSettled([...this.pending]) }, 'vn-director.operations')
    ctx.tools.register(defineTool({
      name: 'vn_director',
      description: 'Make a developed visual novel chapter, including production planning, paced writing and required media. Use automatically for new-game requests. Read before mutations and use the current revision. planJson is {version:1,premise,tone,pacing:{minScenes,minBeats,maxBeats},cast:[{id,name,voice,desire}],scenes:[{id,title,purpose,sharedActivity,relationshipBefore,relationshipAfter,relationshipChange:"none"|"small"|"major",beats:string[],continuity:string[]}],media:[{id,kind:"background"|"character"|"music"|"sound",name,sceneIds:string[],prompt?,scoreJson?,preset?:"bell"|"rain"|"steps",assetId?}]}. scoreJson accepts a score object or its JSON string. Plan adds empty scene placeholders and preserves existing content/assets. write_scene takes sceneJson {id,lines:[{speaker,text}],title?,choices?:[{text,target}],visual?}; omitted choices/visual roles retain saved values, with at most three visible characters per scene. prepare_media prefers ready codex-images, generates bounded pending jobs with actual local scores/effects and project-owned title/logo, cursor and dialogue-frame images for the independent browser player automatically; it preserves occupied roles and reports blocked or unassigned work, including status.uiSkin. Mutations return {id,revision,changedSceneIds,changedMediaIds,addedAssetIds,counts:{scenes,beats,assets,mediaTasks}}, plus status for prepare_media. Use the returned revision to continue remaining executable jobs; read returns the full project. Do not loop on blocked tasks or mark a goal complete while required media remains pending, blocked or unassigned. status derives pacing, continuity, actual file and assignment warnings without literary scores.',
      parameters: {
        action: { type: 'string', enum: ['plan', 'read', 'status', 'write_scene', 'prepare_media'], required: true },
        id: { type: 'string', description: 'Existing project id.', required: true },
        revision: { type: 'number', description: 'Current revision for every mutation.' },
        planJson: { type: 'string', description: 'Complete production bible and media tasks for plan. Each media scoreJson accepts a musical score object or a JSON string containing it.' },
        sceneJson: { type: 'string', description: 'One scene with complete lines and optional field patches for write_scene.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async (args, execution) => {
        execution.signal.throwIfAborted()
        if (args.action === 'read') return JSON.stringify(await this.read(args.id))
        if (args.action === 'status') return JSON.stringify(await this.inspect(args.id, execution.signal))
        const { id, revision } = args
        if (revision === undefined) throw new Error('Current project revision is required.')
        return JSON.stringify(await this.perform(async signal => {
          const previous = await ctx.vnStudio.documents.read(id)
          if (args.action === 'plan') {
            if (args.planJson === undefined) throw new Error('planJson is required.')
            return mutationReceipt(previous, await saveProductionPlan(ctx.vnStudio.documents, id, revision, parseJson(args.planJson), signal))
          }
          if (args.action === 'write_scene') {
            if (args.sceneJson === undefined) throw new Error('sceneJson is required.')
            return mutationReceipt(previous, await writeProductionScene(ctx.vnStudio.documents, id, revision, parseJson(args.sceneJson), signal))
          }
          const { saved, status } = await this.prepare(id, revision, signal)
          return { ...mutationReceipt(previous, saved), status }
        }, execution.signal))
      },
    }))
  }

  private async perform<T>(operation: (signal: AbortSignal) => Promise<T>, caller?: AbortSignal): Promise<T> {
    const signal = caller === undefined ? this.stopped.signal : AbortSignal.any([this.stopped.signal, caller])
    signal.throwIfAborted()
    const pending = operation(signal)
    this.pending.add(pending)
    try { const result = await pending; signal.throwIfAborted(); return result } finally { this.pending.delete(pending) }
  }

  private async available(saved: ProjectRevision, signal: AbortSignal): Promise<Set<string>> {
    const available = new Set<string>()
    for (const asset of saved.project.assets ?? []) {
      signal.throwIfAborted()
      try { await this.ctx.vnMedia.assets.bytes(saved.project.id, asset.id); available.add(asset.id) }
      catch (error) {
        signal.throwIfAborted()
        // Invalid/missing files stay unavailable; status exposes the affected saved references.
        if (error instanceof Error) continue
        throw error
      }
    }
    return available
  }

  private inspect(id: string, caller?: AbortSignal): Promise<ProductionStatus> {
    return this.perform(async signal => {
      const saved = await this.ctx.vnStudio.documents.read(id)
      const available = await this.available(saved, signal)
      const { providers } = await this.ctx.vnMedia.status()
      return this.productionStatus(saved, providers, available, signal)
    }, caller)
  }

  private async productionStatus(saved: ProjectRevision, providers: ProductionStatus['providers'], available: Set<string>, signal: AbortSignal): Promise<ProductionStatus> {
    const status = deriveProductionStatus(saved, providers, available)
    signal.throwIfAborted()
    const skin = this.ctx.get('vnSkin')
    if (skin === undefined) throw new Error('Production requires the VN Studio interface artwork service. Reload the VN Studio plugin.')
    const uiSkin = await skin.status(saved.project.id)
    signal.throwIfAborted()
    return { ...status, uiSkin, ready: status.ready && uiSkin.ready,
      warnings: [...status.warnings, ...uiSkin.roles.filter(role => role.state !== 'ready').map(role => ({ code: 'ui-skin-incomplete', message: `Project ${role.role} artwork is ${role.state}. Prepare project interface artwork before finishing production.` }))] }
  }

  /** Save the complete production bible in the ordinary project revision and undo history.
   * @param id - Existing project id.
   * @param revision - Revision read before editing.
   * @param planJson - Complete bounded production bible JSON.
   * @returns Committed authoring revision with preserved unrelated scenes and media.
   */
  @Remote
  plan(id: string, revision: number, planJson: string): Promise<ProjectRevision> {
    return this.perform(signal => saveProductionPlan(this.ctx.vnStudio.documents, id, revision, parseJson(planJson), signal))
  }

  /** Read the saved project, including its plan and current authoring revision.
   * @param id - Existing project id.
   * @returns Current durable project revision.
   */
  @Remote
  read(id: string): Promise<ProjectRevision> { return this.perform(() => this.ctx.vnStudio.documents.read(id)) }

  /** Derive progress from saved scenes, verified project media and provider availability.
   * @param id - Existing project id.
   * @returns Inspectable progress and pending production requirements.
   */
  @Remote
  status(id: string): Promise<ProductionStatus> { return this.inspect(id) }

  /** Save complete lines for one scene, preserving omitted choices and visual roles.
   * @param id - Existing project id.
   * @param revision - Revision read before editing.
   * @param sceneJson - Complete lines and optional title, choice and visual patches.
   * @returns Committed revision after graph and asset-reference validation.
   */
  @Remote
  writeScene(id: string, revision: number, sceneJson: string): Promise<ProjectRevision> {
    return this.perform(signal => writeProductionScene(this.ctx.vnStudio.documents, id, revision, parseJson(sceneJson), signal))
  }

  /** Generate bounded planned media jobs, retain unavailable requirements, and bind admitted files.
   * @param id - Existing project id.
   * @param revision - Revision read before media work.
   * @returns Saved project and evidence-based status, including blocked image requirements.
   */
  @Remote
  prepareMedia(id: string, revision: number): Promise<{ saved: ProjectRevision; status: ProductionStatus }> { return this.prepare(id, revision) }

  private prepare(id: string, revision: number, caller?: AbortSignal): Promise<{ saved: ProjectRevision; status: ProductionStatus }> {
    return this.perform(async signal => {
      let saved = await this.ctx.vnStudio.documents.read(id)
      if (saved.revision !== revision) throw new Error('Revision conflict. Reload before preparing media.')
      if (saved.project.production === undefined) throw new Error('Save a production plan before preparing media.')
      const { providers } = await this.ctx.vnMedia.status()
      let jobs = 0
      const available = await this.available(saved, signal)
      for (const task of saved.project.production.media) {
        signal.throwIfAborted()
        if (jobs >= this.config.maxMediaJobs) break
        const progress = deriveProductionStatus(saved, providers, available).media.find(row => row.id === task.id)!
        if (progress.state === 'ready' || progress.state === 'blocked') continue
        const previousRevision = saved.revision
        let asset: NovelAsset | undefined = saved.project.assets?.find(asset => asset.id === task.assetId && asset.kind === task.kind && available.has(asset.id))
        if (asset === undefined) {
          const media = this.ctx.vnMedia
          let imported: MediaImportResult
          if (task.kind === 'music' && task.scoreJson !== undefined) imported = await media.composeAssetWithSignal(id, saved.revision, task.name, task.scoreJson, signal)
          else if (task.kind === 'sound' && task.preset !== undefined) imported = await media.effectAssetWithSignal(id, saved.revision, task.name, task.preset, signal)
          else if ((task.kind === 'background' || task.kind === 'character') && task.prompt !== undefined) {
            const ready = providers.filter(provider => provider.ready && provider.kinds.includes(task.kind))
            const provider = ready.find(provider => provider.id === 'codex-images') ?? ready[0]
            if (provider === undefined) continue
            imported = await media.generateImageAssetWithSignal(id, saved.revision, task.kind, task.name, task.prompt, provider.id, signal)
          } else continue
          signal.throwIfAborted()
          saved = imported.saved
          asset = saved.project.assets?.find(asset => asset.id === imported.assetId && asset.kind === task.kind)
          if (asset === undefined) throw new Error('Imported media metadata is missing. Reload the project before retrying.')
          available.add(asset.id)
        }
        saved = await bindProductionMedia(this.ctx.vnStudio.documents, saved, task.id, asset, signal)
        if (saved.revision !== previousRevision) jobs++
      }
      if (jobs < this.config.maxMediaJobs) {
        const skin = this.ctx.get('vnSkin')
        if (skin === undefined) throw new Error('Production requires the VN Studio interface artwork service. Reload the VN Studio plugin.')
        const prepared = await skin.prepareWithSignal(id, saved.revision, undefined, Math.min(3, this.config.maxMediaJobs - jobs), undefined, signal)
        saved = prepared.saved
      }
      return { saved, status: await this.productionStatus(saved, providers, available, signal) }
    }, caller)
  }
}
