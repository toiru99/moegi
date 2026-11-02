import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { SceneStore } from './store.ts'
import type { ProjectRevision, ProjectSummary } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Local novel authoring operations. */
    vnStudio: VnStudio
  }
}

/** Own the authoring directory, typed UI operations and browser preview links. */
export class VnStudio extends TypertRemoteService {
  static inject = ['tools']
  readonly documents: SceneStore

  constructor(ctx: Context, config: Config) {
    super(ctx, 'vnStudio', { namespace: 'vnStudio' })
    this.documents = new SceneStore(config.projectDirectory)
    ctx.tools.register(defineTool({
      name: 'vn_project',
      description: 'Create, read, edit, undo, or preview a visual novel project. Read before editing and pass its revision to save or undo. A project JSON has id, title, language (ko or ja), entry, scenes, and optional assets. Each scene has id, title, lines [{speaker,text}], choices [{text,target}] and optional visual; every target names an existing scene. Use vn_media to import/generate media, and refer to returned asset ids in visual={background?,characters:[{asset,x,y,scale}],music?,sound?}. Saving replaces the whole project: preserve all existing assets, visuals and unrelated scenes unless the user requested changing them. Preview returns {revision,projectId,playback:"browser",url} for the independent browser player; it does not open a window or start an external engine. Open the returned URL to play the project. Project ids and scene ids use lowercase letters, numbers, underscores and hyphens.',
      parameters: {
        action: { type: 'string', enum: ['list', 'create', 'read', 'save', 'undo', 'preview'], required: true },
        id: { type: 'string', description: 'Project id. Required except for list.' },
        title: { type: 'string', description: 'Title for a new project.' },
        language: { type: 'string', enum: ['ko', 'ja'], description: 'Language for a new project.' },
        revision: { type: 'number', description: 'Revision returned by read; required for save and undo.' },
        projectJson: { type: 'string', description: 'Complete project JSON for save. Dialogue remains literal authored text.' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async (args) => {
        if (args.action === 'list') return JSON.stringify(await this.list())
        if (args.id === undefined) throw new Error('Project id is required.')
        switch (args.action) {
          case 'create':
            if (args.title === undefined || args.language === undefined) throw new Error('Title and language are required.')
            return JSON.stringify(await this.create(args.id, args.title, args.language))
          case 'read': return JSON.stringify(await this.read(args.id))
          case 'save':
            if (args.revision === undefined || args.projectJson === undefined) throw new Error('Revision and projectJson are required.')
            return JSON.stringify(await this.documents.save(args.id, args.revision, JSON.parse(args.projectJson), 'agent'))
          case 'undo':
            if (args.revision === undefined) throw new Error('Revision is required.')
            return JSON.stringify(await this.undo(args.id, args.revision))
          case 'preview': return JSON.stringify(await this.preview(args.id))
        }
      },
    }))
  }

  /** List projects in the configured local authoring directory. */
  @Remote
  list(): Promise<ProjectSummary[]> { return this.documents.list() }

  /** Create a new project; refuse an existing id. */
  @Remote
  create(id: string, title: string, language: 'ko' | 'ja'): Promise<ProjectRevision> { return this.documents.create(id, title, language) }

  /** Read the current durable project and revision. */
  @Remote
  read(id: string): Promise<ProjectRevision> { return this.documents.read(id) }

  /** Lightweight revision polling lets the editor notice saved agent changes without overwriting a draft. */
  @Remote
  async head(id: string): Promise<number> { return (await this.documents.read(id)).revision }

  /** Save a manual edit against its loaded revision. */
  @Remote
  save(id: string, revision: number, projectJson: string): Promise<ProjectRevision> { return this.documents.save(id, revision, JSON.parse(projectJson), 'manual') }

  /** Restore the previous saved project if the caller's revision is current. */
  @Remote
  undo(id: string, revision: number): Promise<ProjectRevision> { return this.documents.undo(id, revision) }

  /** Identify the independent browser player using the existing client discriminator.
   * @returns The legacy prototype discriminator for browser playback.
   */
  @Remote
  async playbackMode(): Promise<'prototype'> { return 'prototype' }

  /** Resolve a saved project to its browser playback link without changing authoring data.
   * @param id - Existing project id.
   * @returns Saved revision, project id and relative URL for the independent browser player.
   */
  @Remote
  async preview(id: string): Promise<{ revision: number; projectId: string; playback: 'browser'; url: string }> {
    const saved = await this.documents.read(id)
    return { revision: saved.revision, projectId: saved.project.id, playback: 'browser', url: `/?project=${encodeURIComponent(saved.project.id)}` }
  }
}
