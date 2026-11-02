import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { NovelProject, ProjectRevision, ProjectSummary } from '../types.ts'
import type { AssetKind } from '../types.ts'

/** Root-owned authoring state survives Session and global-panel navigation. */
export interface StudioState {
  initialized: boolean
  projects: ProjectSummary[]
  loaded: ProjectRevision | undefined
  draft: NovelProject | undefined
  dirty: boolean
  busy: boolean
  notice: string
  sceneId: string
  line: number
  playbackRun: number
  tab: 'dialogue' | 'scene' | 'assets' | 'production'
  assistant: 'auto' | 'open' | 'closed'
  externalRevision: number | undefined
  welcome: { title: string | undefined; idea: string; language: 'ko' | 'ja' }
  mediaDraft: { kind: AssetKind; imagePrompt: string; musicIdea: string }
}

/** Bare product-owned source; the renderer supplies the component's useStudio hook. */
export interface StudioBinding {
  hooks: { studio: ObservableSnapshot<StudioState> }
  actions: ReturnType<ReturnType<typeof createStudioStore>['create']>['actions']
}

/** One shared instance is created by the plugin registration, not by each mounted editor. */
export function createStudioStore() {
  return defineStore({
    init: (): StudioState => ({ initialized: false, projects: [], loaded: undefined, draft: undefined, dirty: false, busy: false, notice: '', sceneId: 'start', line: 0, playbackRun: 0, tab: 'dialogue', assistant: 'auto', externalRevision: undefined,
      welcome: { title: undefined, idea: '', language: 'ko' }, mediaDraft: { kind: 'background', imagePrompt: '', musicIdea: '' },
    }),
    actions: {
      initialize: (state) => { state.initialized = true },
      projects: (state, projects: ProjectSummary[]) => { state.projects = projects },
      adopt: (state, saved: ProjectRevision, replaceDirty = false) => {
        if (state.dirty && !replaceDirty) throw new Error('Unsaved changes must be saved or discarded before reloading.')
        const previous = state.loaded?.project
        const storyChanged = previous === undefined || previous.id !== saved.project.id || previous.language !== saved.project.language || previous.entry !== saved.project.entry || JSON.stringify(previous.scenes) !== JSON.stringify(saved.project.scenes)
        if (storyChanged && !replaceDirty) { state.sceneId = saved.project.entry; state.line = 0 }
        state.loaded = saved; state.draft = saved.project; state.dirty = false; state.externalRevision = undefined
        if (!saved.project.scenes.some(scene => scene.id === state.sceneId)) state.sceneId = saved.project.entry
        state.line = Math.min(state.line, saved.project.scenes.find(scene => scene.id === state.sceneId)?.lines.length ?? 0)
      },
      edit: (state, project: NovelProject) => { state.draft = project; state.dirty = true },
      discard: (state) => { state.draft = state.loaded?.project; state.dirty = false; state.sceneId = state.loaded?.project.entry ?? 'start'; state.line = 0; state.playbackRun++ },
      restartPlayback: (state) => {
        if (state.draft === undefined) return
        state.sceneId = state.draft.entry; state.line = 0; state.playbackRun++
      },
      startNew: (state) => {
        if (state.dirty) throw new Error('Unsaved changes must be saved or discarded before starting another project.')
        state.loaded = undefined; state.draft = undefined; state.line = 0; state.notice = ''
        state.welcome = { title: undefined, idea: '', language: state.welcome.language }; state.assistant = 'auto'; state.externalRevision = undefined
      },
      busy: (state, busy: boolean) => { state.busy = busy },
      notice: (state, notice: string) => { state.notice = notice },
      scene: (state, id: string) => { state.sceneId = id; state.line = 0 },
      line: (state, index: number) => { state.line = index },
      tab: (state, tab: StudioState['tab']) => { state.tab = tab },
      assistant: (state, mode: StudioState['assistant']) => { state.assistant = mode },
      external: (state, revision: number) => { state.externalRevision = revision },
      welcome: (state, value: Partial<StudioState['welcome']>) => { Object.assign(state.welcome, value) },
      mediaDraft: (state, value: Partial<StudioState['mediaDraft']>) => { Object.assign(state.mediaDraft, value) },
    },
  })
}
