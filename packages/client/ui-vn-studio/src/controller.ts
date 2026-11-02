import type { Context } from '@deepseek-ai/cordis'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { SceneStore } from './store.ts'
import type { ProjectRevision, ProjectSummary } from './types.ts'
import { compileRecoveredProject } from './recovered-compiler.ts'
import { exportRecoveredRuntime } from './recovered-export.ts'

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
  private readonly stopped = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  private readonly previews = new Map<ChildProcess, Promise<void>>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'vnStudio', { namespace: 'vnStudio' })
    this.documents = new SceneStore(config.projectDirectory)
    if (Boolean(config.recoveredSystemDirectory) !== Boolean(config.recoveredCompilerExecutable)) throw new Error('Configure both the recovered system directory and its compatible compiler executable.')
    ctx.effect(() => async () => {
      this.stopped.abort()
      for (const child of this.previews.keys()) child.kill()
      await Promise.allSettled([...this.operations, ...this.previews.values()])
    }, 'vn-studio.game-operations')
    ctx.tools.register(defineTool({
      name: 'vn_project',
      description: 'Create, read, edit, undo, preview or export a visual novel project. Read before editing and use its revision. Preserve all existing assets, visuals, line staging, choices and unrelated scenes. With configured recovered common systems, preview compiles and opens the actual game and returns playback:"recovered", directory and processId; export creates a local standalone Windows ZIP and returns archivePath, bytes and revision. These final games include the configured common menus, saves and settings plus authored story/media. Without that configuration, preview returns playback:"browser" and a browser project URL; export reports the missing connection. Never claim the browser preview executes the recovered game engine. Project and scene ids use lowercase letters, numbers, underscores and hyphens.',
      parameters: {
        action: { type: 'string', enum: ['list', 'create', 'read', 'save', 'undo', 'preview', 'export'], required: true },
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
          case 'export': return JSON.stringify(await this.exportGame(args.id))
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

  /** Report whether configured recovered common systems own final game execution.
   * @returns Recovered game execution or browser-only preview.
   */
  @Remote
  async playbackMode(): Promise<'recovered' | 'prototype'> { return this.config.recoveredSystemDirectory ? 'recovered' : 'prototype' }

  private async perform<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = this.stopped.signal; signal.throwIfAborted()
    const pending = operation(signal); this.operations.add(pending)
    try { return await pending } finally { this.operations.delete(pending) }
  }

  private async recovered(id: string, signal: AbortSignal) {
    if (!this.config.recoveredSystemDirectory || !this.config.recoveredCompilerExecutable) throw new Error('Configure the local recovered common game systems before running or exporting this game.')
    const saved = await this.documents.read(id)
    const runtime = await compileRecoveredProject(saved.project, saved.revision, this.config.previewDirectory ?? join(this.config.projectDirectory, '.game-builds'), join(this.config.recoveredSystemDirectory, saved.project.language), this.config.recoveredCompilerExecutable, this.config.projectDirectory, signal)
    return { saved, runtime }
  }

  /** Create a local standalone Windows archive from the configured recovered common systems. */
  @Remote
  exportGame(id: string): Promise<{ archivePath: string; bytes: number; revision: number }> {
    return this.perform(async signal => {
      const { saved, runtime } = await this.recovered(id, signal)
      const result = await exportRecoveredRuntime(runtime, id, saved.revision, join(this.config.previewDirectory ?? join(this.config.projectDirectory, '.game-builds'), 'exports'), signal)
      if (process.platform === 'win32') {
        const folder = spawn('explorer.exe', ['/select,', result.archivePath], { stdio: 'ignore', windowsHide: true })
        folder.on('error', () => {}); folder.unref()
      }
      return result
    })
  }

  /** Run the configured recovered game, or return a browser preview when unconfigured.
   * @param id - Existing project id.
   * @returns The actual native process receipt or browser URL; authoring content stays unchanged.
   */
  @Remote
  async preview(id: string): Promise<{ revision: number; projectId: string; playback: 'browser'; url: string } | { revision: number; directory: string; processId: number; playback: 'recovered' }> {
    if (this.config.recoveredSystemDirectory) return this.perform(async signal => {
      const { saved, runtime } = await this.recovered(id, signal)
      signal.throwIfAborted()
      const child = spawn(runtime.executable, runtime.args, { cwd: runtime.directory, stdio: 'ignore', windowsHide: false })
      const closed = new Promise<void>(resolve => { child.once('close', () => { this.previews.delete(child); resolve() }) })
      this.previews.set(child, closed)
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
      if (signal.aborted) { child.kill(); signal.throwIfAborted() }
      if (child.pid === undefined) throw new Error('The compiled game did not start.')
      return { revision: saved.revision, directory: runtime.directory, processId: child.pid, playback: 'recovered' }
    })
    const saved = await this.documents.read(id)
    return { revision: saved.revision, projectId: saved.project.id, playback: 'browser', url: `/?project=${encodeURIComponent(saved.project.id)}` }
  }
}
