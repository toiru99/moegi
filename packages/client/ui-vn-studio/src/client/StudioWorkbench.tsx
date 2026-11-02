import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelAsset, NovelProject, NovelScene, ProjectRevision } from '../types.ts'
import { resolveSceneDirection } from '../direction.ts'
import type { CreatorActions } from './creator-actions.ts'
import type { StudioBinding } from './studio-store.ts'
import { Player } from './Player.tsx'
import { ProductionPanel } from './ProductionPanel.tsx'
import { DialogueEditor } from './DialogueEditor.tsx'
import { SceneSettings } from './SceneSettings.tsx'
import { AssetLibrary } from './AssetLibrary.tsx'
import { AssistantPanel } from './AssistantPanel.tsx'
import { Login } from './Login.tsx'
import css from './StudioWorkbench.module.css'

type WorkbenchProps = { conversation: ReactNode } & PropsLocale<'vnStudio'> & InjectFace<CreatorActions & StudioBinding>

function selectProjectUrl(id?: string): void {
  const url = new URL(location.href)
  if (id === undefined) url.searchParams.delete('project')
  else url.searchParams.set('project', id)
  history.replaceState(history.state, '', url)
}

/** Main creation surface; the existing conversation is supplied by its owning plugin. */
export function StudioWorkbench(props: WorkbenchProps) {
  const { actions, t } = props
  const state = props.useStudio(state => state)
  const { draft, loaded, dirty, busy } = state
  const playbackIdentity = useMemo(() => loaded === undefined ? '' : JSON.stringify({ id: loaded.project.id, language: loaded.project.language, entry: loaded.project.entry, scenes: loaded.project.scenes }), [loaded?.project])
  const title = state.welcome.title ?? '', idea = state.welcome.idea, language = state.welcome.language
  const setTitle = (title: string) => { actions.welcome({ title }) }
  const setIdea = (idea: string) => { actions.welcome({ idea }) }
  const setLanguage = (language: 'ko' | 'ja') => { actions.welcome({ language }) }
  const [artwork, setArtwork] = useState<{ id: string; urls: Record<string, string>; active: string[] }>({ id: '', urls: {}, active: [] })
  const urls = artwork.id === draft?.id ? artwork.urls : {}
  const [assistantArtwork, setAssistantArtwork] = useState('')
  const [playbackMode, setPlaybackMode] = useState<'recovered' | 'prototype'>()
  const scene = draft?.scenes.find(scene => scene.id === state.sceneId) ?? draft?.scenes[0]

  const adopt = (saved: ProjectRevision, replaceDirty = false) => { actions.adopt(saved, replaceDirty); selectProjectUrl(saved.project.id) }
  const run = (operation: () => Promise<void>, notice = '') => {
    if (props.current().busy) return
    actions.busy(true); actions.notice(notice)
    void operation().catch((error: unknown) => { actions.notice(error instanceof Error ? error.message : String(error)) }).finally(() => { actions.busy(false) })
  }
  const runSaved = (operation: (id: string) => Promise<void>) => {
    const current = props.current(), id = current.loaded?.project.id
    if (current.dirty || id === undefined) return
    run(async () => { await operation(id) })
  }
  const edit = (change: (project: NovelProject) => void) => {
    if (draft === undefined) return
    const next = structuredClone(draft); change(next); actions.edit(next)
  }
  const editScene = (change: (scene: NovelScene) => void) => edit(project => {
    const selected = project.scenes.find(value => value.id === scene?.id)
    if (selected !== undefined) change(selected)
  })

  useEffect(() => {
    let live = true
    void props.playbackMode().then(mode => { if (live) setPlaybackMode(mode) })
      .catch((error: unknown) => { if (live) actions.notice(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [props.playbackMode, actions])

  useEffect(() => {
    if (props.current().initialized) return
    let live = true
    void (async () => {
      const projects = await props.list()
      if (!live) return
      actions.projects(projects)
      const previous = new URL(location.href).searchParams.get('project')
      if (previous && projects.some(project => project.id === previous)) {
        const saved = await props.read(previous)
        if (live && !props.current().dirty && props.current().loaded === undefined) adopt(saved)
      }
      if (live) actions.initialize()
    })().catch((error: unknown) => { if (live) { actions.notice(error instanceof Error ? error.message : String(error)); actions.initialize() } })
    return () => { live = false }
  }, [props.list, props.read, actions])

  useEffect(() => {
    if (loaded === undefined) return
    const id = loaded.project.id
    let live = true, reading = false
    const poll = async () => {
      if (reading || props.current().busy) return
      reading = true
      try {
        const revision = await props.head(id)
        const current = props.current()
        if (!live || current.loaded?.project.id !== id || current.loaded.revision === revision) return
        if (current.dirty) { actions.external(revision); return }
        const saved = await props.read(id)
        if (live && !props.current().dirty && !props.current().busy && props.current().loaded?.project.id === id) adopt(saved)
      } catch (error) { if (live) actions.notice(error instanceof Error ? error.message : String(error)) }
      finally { reading = false }
    }
    const timer = setInterval(() => { void poll() }, 1800)
    return () => { live = false; clearInterval(timer) }
  }, [loaded?.project.id, props.head, props.read, actions])

  const visual = scene === undefined ? undefined : resolveSceneDirection(scene, state.line).visual
  const background = visual?.cg ?? visual?.background
  const titleAsset = draft?.uiSkin?.title
  useEffect(() => {
    let live = true
    setAssistantArtwork('')
    if (draft !== undefined && titleAsset !== undefined) void props.assetData(draft.id, titleAsset)
      .then(url => { if (live) setAssistantArtwork(url) })
      .catch((error: unknown) => { if (live) actions.notice(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [draft?.id, titleAsset, props.assetData, actions])
  const characterIds = visual?.cg === undefined ? visual?.characters.map(character => character.asset).join(',') ?? '' : ''
  useEffect(() => {
    let live = true
    if (draft !== undefined) {
      const ids = [...new Set([background, ...characterIds.split(',')].filter((id): id is string => Boolean(id)))]
      void Promise.all(ids.map(async id => [id, await props.assetData(draft.id, id)] as const)).then(entries => {
        if (live) setArtwork(previous => ({ id: draft.id, active: ids, urls: {
          ...Object.fromEntries(Object.entries(previous.id === draft.id ? previous.urls : {}).filter(([id]) => previous.active.includes(id))),
          ...Object.fromEntries(entries),
        } }))
      })
        .catch((error: unknown) => { if (live) actions.notice(error instanceof Error ? error.message : String(error)) })
    }
    return () => { live = false }
  }, [draft?.id, background, characterIds, props.assetData, actions])

  const useAsset = (asset: NovelAsset) => {
    editScene(scene => {
      const visual = scene.visual ??= { characters: [] }
      if (asset.kind === 'character') {
        if (visual.characters.length < 3) visual.characters.push({ asset: asset.id, x: 50, y: 100, scale: 0.95 })
      } else visual[asset.kind === 'background' ? 'background' : asset.kind === 'music' ? 'music' : 'sound'] = asset.id
    })
    actions.tab('scene')
  }
  const requestMusic = (idea: string) => {
    if (draft === undefined || scene === undefined) return
    actions.assistant('open')
    run(async () => {
      if (!(await props.chatGpt.status()).connected) throw new Error(t('requiresChat'))
      const target = await props.prepareAssistant()
      await props.ask(t('musicPrompt', { title: draft.title, id: draft.id, idea, scene: scene.id }), target); actions.notice(t('aiSent'))
    })
  }
  const valid = draft !== undefined && draft.title.trim() !== '' && draft.scenes.every(scene => scene.title.trim() !== '' && scene.lines.every(line => line.text.trim() !== '') && scene.choices.every(choice => choice.text.trim() !== ''))
  const continueProduction = () => {
    if (draft === undefined) return
    actions.assistant('open')
    run(async () => {
      if (!(await props.chatGpt.status()).connected) throw new Error(t('requiresChat'))
      const target = await props.prepareAssistant()
      await props.ask(t('directorRequest', { title: draft.title, id: draft.id }), target)
      actions.notice(t('aiSent'))
    }, t('productionPreparing'))
  }

  return <div className={css.shell}>
    <header className={css.toolbar}>
      <div className={css.heading}><strong>{t('workbench')}</strong>{draft && <span>{draft.title}</span>}</div>
      <div className={css.toolbarActions}>
        <select aria-label={t('open')} value={draft?.id ?? ''} disabled={busy || dirty} onChange={event => { const id = event.target.value; if (id !== '') run(async () => { adopt(await props.read(id)) }) }}>
          <option value="">{t('open')}</option>{state.projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
        </select>
        <Button size="sm" disabled={busy || dirty} onClick={() => { actions.startNew(); selectProjectUrl() }}>{t('newStory')}</Button>
        <Button size="sm" aria-label={t('toggleAssistant')} onClick={() => { actions.assistant(state.assistant === 'open' ? 'closed' : 'open') }}>{t('assistant')}</Button>
      </div>
    </header>
    {dirty && <div className={css.draftNotice}><span>{t('dirty')}{!valid ? ` — ${t('completeFields')}` : ''}</span><Button size="sm" onClick={() => { actions.discard() }}>{t('discard')}</Button></div>}
    {state.externalRevision !== undefined && <p className={css.notice}>{t('pendingExternal')}</p>}
    {(busy || state.notice !== '') && <div className={css.notice} role="status">{state.notice || t('working')}</div>}
    <div className={css.workspace} data-assistant={draft === undefined && state.assistant === 'auto' ? 'closed' : state.assistant}>
      <main className={css.creator}>
        {draft === undefined || loaded === undefined || scene === undefined ? <div className={css.welcome}>
          <div className={css.startForm}>
            <h1>{t('welcome')}</h1><p className={css.hint}>{t('welcomeHint')}</p>
            <label>{t('projectTitle')}<input value={title} maxLength={256} placeholder={t('projectTitleHint')} onChange={event => { setTitle(event.target.value) }} /></label>
            <label>{t('language')}<select value={language} onChange={event => { setLanguage(event.target.value === 'ja' ? 'ja' : 'ko') }}><option value="ko">{t('korean')}</option><option value="ja">{t('japanese')}</option></select></label>
            <label>{t('storyIdea')}<textarea value={idea} maxLength={4000} placeholder={t('storyIdeaHint')} onChange={event => { setIdea(event.target.value) }} /></label>
            <p className={css.hint}>{t('creationHint')}</p>
            <Button variant="primary" disabled={busy || title.trim() === '' || idea.trim() === ''} onClick={() => { run(async () => {
              if (!(await props.chatGpt.status()).connected) throw new Error(t('requiresChat'))
              const target = await props.prepareAssistant()
              const saved = await props.create(`story_${Date.now().toString(36)}`, title, language)
              adopt(saved); actions.projects(await props.list()); actions.assistant('open'); actions.tab('production')
              await props.ask(t('storyPrompt', { title, id: saved.project.id, language: t(language === 'ko' ? 'korean' : 'japanese'), idea }), target); actions.notice(t('aiSent'))
            }) }}>{t('askStory')}</Button>
            <Button variant="ghost" disabled={busy || title.trim() === ''} onClick={() => { run(async () => {
              adopt(await props.create(`story_${Date.now().toString(36)}`, title, language))
              actions.projects(await props.list()); actions.assistant('closed'); actions.tab('dialogue')
            }) }}>{t('createBlank')}</Button>
            <Login t={t} {...props.chatGpt} />
          </div>
        </div> : <div className={css.authoring}>
          <nav className={css.sceneList} aria-label={t('sceneList')}>
            <strong>{t('sceneList')}</strong>
            {draft.scenes.map((value, index) => <button key={value.id} aria-current={value.id === scene.id ? 'step' : undefined} onClick={() => { actions.scene(value.id) }}><span>{index + 1}</span><strong>{value.title}</strong></button>)}
            <Button size="sm" variant="outline" disabled={busy || draft.scenes.length >= 128} onClick={() => {
              let number = draft.scenes.length + 1
              while (draft.scenes.some(scene => scene.id === `scene_${number}`)) number++
              const id = `scene_${number}`
              edit(project => { project.scenes.push({ id, title: `${t('scene')} ${number}`, lines: [], choices: [], ...scene.visual === undefined ? {} : { visual: structuredClone(scene.visual) } }) }); actions.scene(id)
            }}>{t('addScene')}</Button>
          </nav>
          <div className={css.sceneMain}>
            <Player key={`${playbackIdentity}:${state.playbackRun}`} project={draft} scene={scene} line={state.line} urls={urls} dirty={dirty} navigate={position => { actions.scene(position.sceneId); actions.line(position.line) }} face={props} t={t} />
            <p className={css.stageHint}>{t('stageHint')}</p>
            <div className={css.editorTabs} role="group" aria-label={t('scene')}>
              {(['production', 'dialogue', 'scene', 'assets'] as const).map(tab => <Button key={tab} size="sm" variant={state.tab === tab ? 'primary' : 'ghost'} aria-pressed={state.tab === tab} onClick={() => { actions.tab(tab) }}>{t(tab === 'dialogue' ? 'dialogue' : tab === 'scene' ? 'sceneTab' : tab === 'production' ? 'productionTab' : 'assetsTab')}</Button>)}
            </div>
            <fieldset className={css.editing} disabled={busy}>
              {state.tab === 'dialogue' && <DialogueEditor project={draft} scene={scene} line={state.line} edit={editScene} focusLine={index => { actions.line(index) }} t={t} />}
              {state.tab === 'scene' && <SceneSettings project={draft} scene={scene} edit={editScene} t={t} />}
              {state.tab === 'assets' && <AssetLibrary project={draft} revision={loaded.revision} busy={busy} dirty={dirty} face={props} adopt={adopt} run={run} useAsset={useAsset} requestMusic={requestMusic} mediaDraft={state.mediaDraft} changeMediaDraft={actions.mediaDraft} t={t} />}
              {state.tab === 'production' && <ProductionPanel project={draft} revision={loaded.revision} face={props} disabled={busy || dirty} continueProduction={continueProduction} t={t} />}
            </fieldset>
          </div>
        </div>}
      </main>
      <aside className={css.assistant} aria-label={t('assistant')}><AssistantPanel project={draft} scene={scene} titleImage={assistantArtwork} showPlan={() => { actions.tab('production'); actions.assistant('auto') }} showScene={() => { actions.tab('dialogue'); actions.assistant('auto') }} t={t}>{props.conversation}</AssistantPanel></aside>
    </div>
    {draft && loaded && <footer className={css.projectFooter} aria-label={t('projectActions')}>
      <span>{t(dirty ? 'dirty' : 'saved')}</span><div>
        <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => { run(async () => { adopt(await props.read(draft.id)) }) }}>{t('reloadProject')}</Button>
        <Button size="sm" variant="outline" disabled={busy || dirty || !loaded.canUndo} onClick={() => { run(async () => { adopt(await props.undo(draft.id, loaded.revision)) }) }}>{t('undoProject')}</Button>
        <Button size="sm" variant={dirty ? 'primary' : 'outline'} disabled={busy || !dirty || !valid} onClick={() => { run(async () => { adopt(await props.save(draft.id, loaded.revision, draft), true); actions.projects(await props.list()) }) }}>{t('saveProject')}</Button>
        <Button size="sm" variant={playbackMode === 'recovered' ? 'ghost' : 'primary'} disabled={busy || dirty} icon={<IconPlayOutlineRegular size={14} />} onClick={() => { actions.restartPlayback() }}>{t('restartPlayback')}</Button>
        {playbackMode === 'recovered' && props.exportGame !== undefined && <Button size="sm" variant="outline" disabled={busy || dirty} onClick={() => {
          const exportGame = props.exportGame
          if (exportGame !== undefined) runSaved(async id => { const receipt = await exportGame(id); actions.notice(t('gameExported', { path: receipt.archivePath })) })
        }}>{t('exportGame')}</Button>}
        {playbackMode === 'recovered' && <Button size="sm" variant="primary" disabled={busy || dirty} icon={<IconPlayOutlineRegular size={14} />} onClick={() => { runSaved(props.preview) }}>{t('runGame')}</Button>}
      </div>
    </footer>}
  </div>
}
