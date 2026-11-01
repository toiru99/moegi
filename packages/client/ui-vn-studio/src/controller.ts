import { spawn } from 'node:child_process'
import { NATIVE_TITLE_SCENE } from './native-template.ts'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { SceneStore } from './store.ts'
import { compileProject } from './compiler.ts'
import { compileRecoveredProject } from './recovered-compiler.ts'
import type { ProjectRevision, ProjectSummary } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Local novel authoring operations. */
    vnStudio: VnStudio
  }
}

/** Own the authoring directory, typed UI operations, tools and preview processes. */
export class VnStudio extends TypertRemoteService {
  static inject = ['tools']
  readonly documents: SceneStore
  private readonly previews = new Map<ChildProcess, Promise<void>>()
  private readonly inFlight = new Set<Promise<void>>()
  private readonly stopped = new AbortController()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'vnStudio', { namespace: 'vnStudio' })
    if (Boolean(config.recoveredSystemDirectory) !== Boolean(config.recoveredCompilerExecutable)) throw new Error('Configure both the recovered system directory and its compatible compiler executable.')
    this.documents = new SceneStore(config.projectDirectory)
    ctx.effect(() => async () => {
      this.stopped.abort()
      for (const process of this.previews.keys()) process.kill('SIGKILL')
      await Promise.allSettled([...this.inFlight, ...this.previews.values()])
    }, 'vn-studio.preview-processes')
    ctx.tools.register(defineTool({
      name: 'vn_project',
      description: 'Create, read, edit, undo, or preview a visual novel project. Read before editing and pass its revision to save or undo. A project JSON has id, title, language (ko or ja), entry, scenes, and optional assets. Each scene has id, title, lines [{speaker,text}], choices [{text,target}] and optional visual; every target names an existing scene. Use vn_media to import/generate media, and refer to returned asset ids in visual={background?,characters:[{asset,x,y,scale}],music?,sound?}. Saving replaces the whole project: preserve all existing assets, visuals and unrelated scenes unless the user requested changing them. Preview compiles and opens the real game engine. Project ids and scene ids use lowercase letters, numbers, underscores and hyphens.',
      parameters: {
        action: { type: 'string', enum: ['list', 'create', 'read', 'save', 'undo', 'preview'], required: true },
        id: { type: 'string', description: 'Project id. Required except for list.' },
        title: { type: 'string', description: 'Title for a new project.' },
        language: { type: 'string', enum: ['ko', 'ja'], description: 'Language for a new project.' },
        revision: { type: 'number', description: 'Revision returned by read; required for save and undo.' },
        projectJson: { type: 'string', description: 'Complete project JSON for save. Literal dialogue is escaped by the compiler.' },
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

  /** Report which configured runtime owns actual game systems.
   * @returns Recovered original systems when configured, otherwise the legacy prototype.
   */
  @Remote
  async playbackMode(): Promise<'recovered' | 'prototype'> { return this.config.recoveredSystemDirectory ? 'recovered' : 'prototype' }

  /** Compile a snapshot and open it in the configured managed Siglus engine process. */
  @Remote
  async preview(id: string): Promise<{ revision: number; directory: string; processId: number }> {
    const signal = this.stopped.signal
    signal.throwIfAborted()
    let settle!: () => void
    const done = new Promise<void>(resolve => { settle = resolve })
    this.inFlight.add(done)
    try {
      const saved = await this.documents.read(id)
      const runtime = this.config.recoveredSystemDirectory && this.config.recoveredCompilerExecutable
        ? await compileRecoveredProject(saved.project, saved.revision, this.config.previewDirectory, join(this.config.recoveredSystemDirectory, saved.project.language), this.config.recoveredCompilerExecutable, this.config.projectDirectory, signal)
        : await (async () => {
          const directory = await compileProject(saved.project, saved.revision, this.config.previewDirectory, this.config.compilerDirectory, this.config.fontFile, signal, this.config.projectDirectory)
          return { directory, executable: join(this.config.compilerDirectory, 'siglus_engine.exe'), args: ['--project-dir', directory, '--scene', NATIVE_TITLE_SCENE] }
        })()
      const { directory } = runtime
      signal.throwIfAborted()
      const child = spawn(runtime.executable, runtime.args, { cwd: directory, stdio: 'ignore' })
      const closed = new Promise<void>(resolve => { child.once('close', () => { this.previews.delete(child); resolve() }) })
      this.previews.set(child, closed)
      await new Promise<void>((resolve, reject) => { child.once('spawn', () => { if (signal.aborted) child.kill('SIGKILL'); resolve() }); child.once('error', reject) })
      signal.throwIfAborted()
      if (child.pid === undefined) throw new Error('The game engine did not start.')
      return { revision: saved.revision, directory, processId: child.pid }
    } finally {
      this.inFlight.delete(done)
      settle()
    }
  }
}
