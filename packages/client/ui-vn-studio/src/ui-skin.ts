/** Project-owned original artwork for the independent browser player's interface. */
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './controller.ts'
import type {} from './media.ts'
import type { NovelProject, NovelUiSkin, ProjectRevision, UiSkinRole, UiSkinStatus } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Original interface artwork attached to native title, pointer and dialogue slots. */
    vnSkin: VnSkin
  }
}

const roles: UiSkinRole[] = ['title', 'cursor', 'dialogue']

function skinBrief(project: NovelProject, supplied?: string): string {
  if (supplied !== undefined) {
    if (typeof supplied !== 'string' || supplied.trim() === '' || supplied.length > 4000 || supplied.includes('\0')) throw new Error('Expected a UI skin brief of 1–4000 characters.')
    return supplied
  }
  return project.uiSkin?.brief ?? [project.title, project.production?.premise, project.production?.tone].filter(Boolean).join('\n').slice(0, 4000)
}

function skinPrompt(project: NovelProject, role: UiSkinRole, brief: string, cast: string[]): string {
  const context = [project.title, project.production?.premise, project.production?.tone, brief].join(' ')
  const style = /gym|fitness|training|헬스|운동|피트니스/i.test(context)
    ? 'Create a coherent original training-romance identity with black/navy foundations, teal accents, polished gym materials and restrained light.'
    : 'Create a coherent original identity whose palette, materials and ornaments follow this story premise, tone and brief.'
  const composition = role === 'title'
    ? `Game title: ${JSON.stringify(project.title)}. Render this exact title legibly in its original ${project.language === 'ko' ? 'Korean' : 'Japanese'} spelling as the only readable lettering. Create a complete opaque 1920x1080 landscape title-screen illustration with an original title/logo in the upper-left or middle-left and ${cast.length ? `the referenced heroines (${cast.join(', ')}) recognizable in the centre/right` : 'story-specific imagery in the centre/right'}. Preserve attached character identities and outfits. Reserve the entire bottom y=915..1080 as quiet background, with no title, faces, or essential art, for the player controls. Do not reproduce any commercial game title/logo or borrowed commercial characters. No baked-in buttons, menus, start/load labels, watermarks or other UI controls.`
    : role === 'cursor'
      ? `Create exactly one ${/gym|fitness|training|헬스|운동|피트니스/i.test(context) ? 'training/barbell-themed' : 'story-themed'} mouse cursor pointing upper-left, with a clearly visible tip at the upper-left and a compact readable silhouette at 32x32 display size. Use a square transparent PNG canvas with real alpha, clear padding around the single pointer, no human, no scene, no letters, no buttons and no watermark.`
      : 'Create a full 1920x1080 transparent PNG dialogue frame. Upper y=0..787 (788 pixels) must be completely transparent. ONLY the lower 292 pixels, y=788..1079, may contain a dark readable text backing with restrained ornate genre trim and real alpha outside it. Within that bottom frame, leave the speaker region local (385,14,521,52) and body region local (445,68,1147,178) visually quiet and dark; also preserve Japanese speaker origin (415,44) and body origin (475,98). Put decoration at the far edges away from these text areas. No letters, text, characters, portraits, icons, UI buttons or watermark.'
  const header = `${composition}\n${style}\nStory premise: ${project.production?.premise ?? project.title}\nTone: ${project.production?.tone ?? 'Follow the project voice.'}\nAuthored visual brief:\n`
  // Provider prompts have the same 4000-character admission limit as ordinary project images.
  return `${header}${brief.slice(0, Math.max(0, 4000 - header.length))}`.slice(0, 4000)
}

/** Generate interface data through the installed native provider without replacing common UI logic. */
export class VnSkin extends TypertRemoteService {
  static inject = ['tools', 'vnStudio', 'vnMedia']
  private readonly stopped = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()

  constructor(ctx: Context) {
    super(ctx, 'vnSkin', { namespace: 'vnSkin' })
    ctx.effect(() => async () => { this.stopped.abort(); await Promise.allSettled([...this.pending]) }, 'vn-skin.operations')
    ctx.tools.register(defineTool({
      name: 'vn_skin',
      description: 'Prepare original project-owned title/logo artwork, a transparent cursor and a transparent dialogue backing for the independent browser game interface. Read the project revision first. status reports actual admitted files and signed-in native codex-images readiness. prepare generates only missing roles, up to three jobs, and preserves existing story, audio, assets and assigned skin roles. An assigned role changes only when explicitly included in replaceRoles. brief is optional original art direction; omitted uses the saved brief or project title, premise and tone. Returns compact {id,revision,roles,status}; use its revision for subsequent work. Never claim blocked or pending roles are complete.',
      parameters: {
        action: { type: 'string', enum: ['status', 'prepare'], required: true },
        id: { type: 'string', description: 'Existing project id.', required: true },
        revision: { type: 'number', description: 'Current project revision, required for prepare.' },
        brief: { type: 'string', description: 'Original interface art direction, 1–4000 characters; optional.' },
        maxJobs: { type: 'number', description: 'Optional image job limit, integer 1–3; defaults to three.' },
        replaceRoles: { type: 'array', items: { type: 'string', enum: ['title', 'cursor', 'dialogue'] }, description: 'Only these explicitly requested existing roles may be regenerated.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async (args, execution) => {
        execution.signal.throwIfAborted()
        if (args.action === 'status') {
          const status = await this.status(args.id)
          return JSON.stringify({ id: args.id, revision: status.revision, roles: status.roles, status })
        }
        if (args.revision === undefined) throw new Error('Current project revision is required.')
        const { saved, status } = await this.prepareWithSignal(args.id, args.revision, args.brief, args.maxJobs, args.replaceRoles, execution.signal)
        return JSON.stringify({ id: saved.project.id, revision: saved.revision, roles: status.roles, status })
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

  private async inspect(saved: ProjectRevision, signal: AbortSignal): Promise<UiSkinStatus> {
    signal.throwIfAborted()
    const providerReady = (await this.ctx.vnMedia.providers.status()).some(provider => provider.id === 'codex-images' && provider.ready && provider.kinds.includes('background'))
    signal.throwIfAborted()
    const states: UiSkinStatus['roles'] = []
    for (const role of roles) {
      const assetId = saved.project.uiSkin?.[role]
      if (assetId === undefined) { states.push({ role, state: providerReady ? 'pending' : 'blocked' }); continue }
      try {
        await this.ctx.vnMedia.assets.bytes(saved.project.id, assetId)
        states.push({ role, assetId, state: 'ready' })
      } catch (error) {
        signal.throwIfAborted()
        if (!(error instanceof Error)) throw error
        // Assigned missing or corrupt content stays visible and requires explicit replacement.
        states.push({ role, assetId, state: 'blocked' })
      }
    }
    signal.throwIfAborted()
    return { revision: saved.revision, ready: states.every(role => role.state === 'ready'), providerReady, roles: states }
  }

  private async titleReferences(project: NovelProject, signal: AbortSignal): Promise<{ paths: string[]; names: string[] }> {
    const paths: string[] = [], names: string[] = [], admitted = new Set<string>()
    const skinIds = new Set(roles.map(role => project.uiSkin?.[role]))
    const planned = (project.production?.media ?? []).filter(task => task.kind === 'character' && task.assetId !== undefined)
      .sort((left, right) => right.sceneIds.length - left.sceneIds.length)
    for (const task of planned) {
      signal.throwIfAborted()
      const assetId = task.assetId!
      if (admitted.has(assetId) || skinIds.has(assetId) || !project.assets?.some(asset => asset.id === assetId && asset.kind === 'character' && asset.mime.startsWith('image/'))) continue
      try {
        await this.ctx.vnMedia.assets.bytes(project.id, assetId)
        paths.push(await this.ctx.vnMedia.assets.path(project.id, assetId)); names.push(task.name); admitted.add(assetId)
      } catch (error) {
        signal.throwIfAborted()
        if (!(error instanceof Error)) throw error
        // Unavailable planned portraits cannot be attached as native local image inputs.
        continue
      }
      if (paths.length === 3) break
    }
    return { paths, names }
  }

  /** Report native provider readiness and integrity of each assigned project-owned skin image.
   * @param id - Existing project id.
   * @returns Ready, pending or blocked roles at the durable project revision.
   */
  @Remote
  status(id: string): Promise<UiSkinStatus> {
    return this.perform(async signal => this.inspect(await this.ctx.vnStudio.documents.read(id), signal))
  }

  /** Prepare bounded missing skin roles; explicit replacements preserve all previous immutable assets.
   * @param id - Existing project id.
   * @param revision - Revision read before preparation.
   * @param brief - Optional original art direction; absence retains the saved brief or derives one from the story.
   * @param maxJobs - Optional integer 1–3 image limit; absence permits all three roles.
   * @param replaceRoles - Optional roles explicitly authorized for regeneration; absence reuses all existing bindings.
   * @returns Full saved authoring data and current skin readiness.
   */
  @Remote
  prepare(id: string, revision: number, brief?: string, maxJobs?: number, replaceRoles?: UiSkinRole[]): Promise<{ saved: ProjectRevision; status: UiSkinStatus }> {
    return this.prepareWithSignal(id, revision, brief, maxJobs, replaceRoles)
  }

  /** Prepare skin data with caller cancellation forwarded through generation, import and binding saves.
   * @param id - Existing project id.
   * @param revision - Current durable revision.
   * @param brief - Optional original art direction; absence retains or derives the brief.
   * @param maxJobs - Optional 1–3 image limit; absence permits three.
   * @param replaceRoles - Optional explicitly replaceable roles; absence preserves assigned roles.
   * @param caller - Optional caller signal; absence uses the service lifetime.
   * @returns Full saved authoring data and current skin readiness.
   */
  prepareWithSignal(id: string, revision: number, brief?: string, maxJobs?: number, replaceRoles?: UiSkinRole[], caller?: AbortSignal): Promise<{ saved: ProjectRevision; status: UiSkinStatus }> {
    return this.perform(async signal => {
      const limit = maxJobs ?? 3
      if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error('UI skin job limit must be an integer from 1 to 3.')
      if (replaceRoles !== undefined && (!Array.isArray(replaceRoles) || replaceRoles.length > 3 || replaceRoles.some(role => !roles.includes(role)))) throw new Error('Invalid UI skin replacement roles.')
      let saved = await this.ctx.vnStudio.documents.read(id)
      if (saved.revision !== revision) throw new Error('Revision conflict. Reload before preparing UI skin.')
      const resolvedBrief = skinBrief(saved.project, brief)
      const status = await this.inspect(saved, signal)
      if (!status.providerReady) return { saved, status }
      const requested = roles.filter(role => saved.project.uiSkin?.[role] === undefined || replaceRoles?.includes(role)).slice(0, limit)
      for (const role of requested) {
        const references = role === 'title' ? await this.titleReferences(saved.project, signal) : { paths: [], names: [] }
        const prompt = skinPrompt(saved.project, role, resolvedBrief, references.names)
        const bytes = await this.ctx.vnMedia.providers.generate('codex-images', { kind: 'background', prompt, signal,
          presentation: { purpose: 'interface', transparent: role !== 'title', ...references.paths.length ? { references: references.paths } : {} } })
        signal.throwIfAborted()
        const imported = await this.ctx.vnMedia.assets.importResult(id, saved.revision, 'background', `${role}: ${saved.project.title}`.slice(0, 256), bytes,
          { origin: 'generated', provider: 'codex-images', prompt }, signal)
        const uiSkin: NovelUiSkin = { ...imported.saved.project.uiSkin, version: 1, brief: resolvedBrief, [role]: imported.assetId }
        saved = await this.ctx.vnStudio.documents.save(id, imported.saved.revision, { ...imported.saved.project, uiSkin }, 'agent', signal)
      }
      if (requested.length === 0 && brief !== undefined && saved.project.uiSkin !== undefined && saved.project.uiSkin.brief !== resolvedBrief) {
        saved = await this.ctx.vnStudio.documents.save(id, saved.revision, { ...saved.project, uiSkin: { ...saved.project.uiSkin, brief: resolvedBrief } }, 'agent', signal)
      }
      return { saved, status: await this.inspect(saved, signal) }
    }, caller)
  }
}
