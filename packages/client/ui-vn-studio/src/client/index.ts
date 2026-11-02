import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import novelRemote from '@deepseek-ai/dsh-client-ui-vn-studio/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { PluginArtworkTerminal } from '@deepseek-ai/dsh-client-ui-primitives'
import { CreatorShortcut } from './CreatorShortcut.tsx'
import { Title } from './Title.tsx'
import type { LoginActions } from './Login.tsx'
import type { EditorActions } from './Editor.tsx'
import { en, zh, ko, ja } from './locales.ts'
import { registerStudioBrand } from './branding.ts'
import { ConnectionSettings } from './ConnectionSettings.tsx'
import { StudioWorkbench } from './StudioWorkbench.tsx'
import { createStudioStore } from './studio-store.ts'
import type { StudioBinding } from './studio-store.ts'
import type { CreatorActions } from './creator-actions.ts'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap { novel: Record<string, never> }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap { vnStudio: unknown }
}

export const inject = ['slots', 'locale', 'remote', 'sidebarRightTabs']

function value<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Contribute one editor tab to the existing sidebar, using the generated Host API. */
export async function apply(ctx: Context): Promise<void> {
  const unmount = await ctx.remote.$mount(novelRemote)
  ctx.effect(() => unmount, 'vn-studio.remote')
  ctx.inject(['remote.vnStudio', 'remote.vnChatGpt', 'remote.vnMedia', 'remote.vnPlayback', 'sessions', 'layout', 'sidebarRight', 'uiWorkspace'], registerEditor)
}

function registerEditor(ctx: Context): void {
  const id = '@deepseek-ai/dsh-client-ui-vn-studio'
  const t = ctx.locale.bind('vnStudio')
  ctx.effect(() => ctx.locale.register('vnStudio', { en, zh, ko, ja }), 'vn-studio.locale')
  if (!ctx.locale.getLocale().locales.some(locale => locale.id === 'ko')) ctx.effect(() => ctx.locale.addLanguage({ id: 'ko', label: '한국어', fallback: 'en' }), 'vn-studio.korean')
  registerStudioBrand(ctx)
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id, kind: 'novel', multiple: false, keepMounted: true, priority: 'builtin', title: () => t('title'),
    guide: [{ id: 'new', order: 5, title: () => t('title'), description: () => t('description'), icon: PluginArtworkTerminal }],
  }), 'vn-studio.tab')
  const actions: EditorActions = {
    list: async () => value(await ctx.remote.vnStudio.list()),
    read: async id => value(await ctx.remote.vnStudio.read(id)),
    create: async (id, title, language) => value(await ctx.remote.vnStudio.create(id, title, language)),
    save: async (id, revision, project) => value(await ctx.remote.vnStudio.save(id, revision, JSON.stringify(project))),
    undo: async (id, revision) => value(await ctx.remote.vnStudio.undo(id, revision)),
    preview: async (id) => { value(await ctx.remote.vnStudio.preview(id)) },
    exportGame: async id => value(await ctx.remote.vnStudio.exportGame(id)),
  }
  const loginActions: LoginActions = {
    status: async () => value(await ctx.remote.vnChatGpt.status()),
    start: async () => value(await ctx.remote.vnChatGpt.start()),
    answer: async (id, response) => value(await ctx.remote.vnChatGpt.answer(id, response)),
    cancel: async () => { value(await ctx.remote.vnChatGpt.cancel()) },
  }
  const instance = createStudioStore().create()
  const studioStore: StudioBinding = { actions: instance.actions, hooks: { studio: instance } }
  let inspectProduction: CreatorActions['productionStatus'] | undefined
  ctx.inject(['remote.vnDirector'], scope => {
    const read: CreatorActions['productionStatus'] = async id => value(await scope.remote.vnDirector.status(id))
    inspectProduction = read
    scope.effect(() => () => { if (inspectProduction === read) inspectProduction = undefined }, 'vn-studio.director-capability')
  })
  const creator: Omit<CreatorActions, 'ask' | 'prepareAssistant'> = {
    ...actions, chatGpt: loginActions, current: () => instance.getSnapshot(),
    playbackMode: async () => value(await ctx.remote.vnStudio.playbackMode()),
    gameSaves: async id => value(await ctx.remote.vnPlayback.slots(id)),
    saveGame: async (id, slot, json) => value(await ctx.remote.vnPlayback.save(id, slot, json)),
    loadGame: async (id, slot) => value(await ctx.remote.vnPlayback.load(id, slot)),
    playerSettings: async id => value(await ctx.remote.vnPlayback.settings(id)),
    savePlayerSettings: async (id, json) => value(await ctx.remote.vnPlayback.saveSettings(id, json)),
    productionStatus: async id => {
      if (inspectProduction === undefined) throw new Error(t('directorUnavailable'))
      return inspectProduction(id)
    },
    head: async id => value(await ctx.remote.vnStudio.head(id)),
    mediaStatus: async () => value(await ctx.remote.vnMedia.status()),
    importAsset: async (id, revision, kind, name, dataUrl) => value(await ctx.remote.vnMedia.importAsset(id, revision, kind, name, dataUrl)),
    assetData: async (id, asset) => value(await ctx.remote.vnMedia.assetData(id, asset)),
    generateImage: async (id, revision, kind, name, prompt, provider) => value(await ctx.remote.vnMedia.generateImage(id, revision, kind, name, prompt, provider)),
    saveImageKey: async key => { value(await ctx.remote.vnMedia.saveImageKey(key)) },
    effect: async (id, revision, name, preset) => value(await ctx.remote.vnMedia.effect(id, revision, name, preset)),
  }
  ctx.slots.inject('conversation.workspace', () => ctx.slots.register({
    name: 'conversation.workspace', locale: 'vnStudio', select: () => ({}),
    inject: (sessionId: SessionId | undefined): CreatorActions & typeof studioStore => ({ ...creator, ...studioStore,
      prepareAssistant: async () => {
        const target = sessionId ?? await ctx.sessions.create()
        await ctx.sessions.using(target, { source: 'vnStudio' }, async reference => { await reference.ready; ctx.uiWorkspace.openSession(target) })
        return target
      },
      ask: async (prompt, target = sessionId) => {
        if (target === undefined) throw new Error(t('requiresChat'))
        await ctx.sessions.using(target, { source: 'vnStudio' }, async reference => {
          await reference.ready
          const conversation = ctx.sessions.scope(target)?.get('conversation')
          if (conversation === undefined) throw new Error(t('requiresChat'))
          await conversation.send(prompt)
        })
      },
    }),
  }, StudioWorkbench))
  ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'vn-chatgpt', order: -5, label: () => t('connectionTitle'), locale: 'vnStudio',
    inject: () => loginActions,
  }, ConnectionSettings)), 'vn-studio.connection-settings')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: id, locale: 'vnStudio',
    inject: () => ({ open: () => { ctx.layout.selectPanel(null); if (ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded() } }),
  }, CreatorShortcut)), 'vn-studio.editor')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title', key: id, locale: 'vnStudio',
  }, Title)), 'vn-studio.title')
}
