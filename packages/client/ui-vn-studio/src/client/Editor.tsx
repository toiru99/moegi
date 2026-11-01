import { useEffect, useState } from 'react'
import type { PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene, ProjectRevision } from '../types.ts'
import css from './Editor.module.css'
import { Login } from './Login.tsx'
import type { LoginActions } from './Login.tsx'

/** Narrow authoring actions supplied by the registered Remote capability. */
export interface EditorActions {
  list: () => Promise<{ id: string; title: string; language: 'ko' | 'ja' }[]>
  read: (id: string) => Promise<ProjectRevision>
  create: (id: string, title: string, language: 'ko' | 'ja') => Promise<ProjectRevision>
  save: (id: string, revision: number, project: NovelProject) => Promise<ProjectRevision>
  undo: (id: string, revision: number) => Promise<ProjectRevision>
  preview: (id: string) => Promise<void>
}

type EditorProps = PropsLocale<'vnStudio'> & InjectFace<EditorActions & { chatGpt: LoginActions }>

/** Structured scene editor inside the existing Harness sidebar. */
export function Editor({ t, list, read, create, save, undo, preview, chatGpt }: EditorProps) {
  const [projects, setProjects] = useState<Awaited<ReturnType<EditorActions['list']>>>([])
  const [loaded, setLoaded] = useState<ProjectRevision>()
  const [draft, setDraft] = useState<NovelProject>()
  const [sceneId, setSceneId] = useState('start')
  const [newId, setNewId] = useState('novel')
  const [newTitle, setNewTitle] = useState('')
  const [language, setLanguage] = useState<'ko' | 'ja'>('ko')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const dirty = loaded !== undefined && JSON.stringify(loaded.project) !== JSON.stringify(draft)
  const scene = draft?.scenes.find(value => value.id === sceneId)

  const adopt = (value: ProjectRevision) => {
    setLoaded(value)
    setDraft(value.project)
    setSceneId(current => value.project.scenes.some(scene => scene.id === current) ? current : value.project.entry)
    localStorage.setItem('vn-studio.project', value.project.id)
  }
  useEffect(() => {
    const controller = new AbortController()
    void list().then(async (values) => {
      if (controller.signal.aborted) return
      setProjects(values)
      const previous = localStorage.getItem('vn-studio.project')
      if (previous !== null && values.some(value => value.id === previous)) {
        const saved = await read(previous)
        if (!controller.signal.aborted) adopt(saved)
      }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : String(error)) })
    return () => { controller.abort() }
  }, [list, read])

  const run = (action: () => Promise<void>) => {
    setBusy(true)
    setNotice('')
    void action().catch((error: unknown) => { setNotice(error instanceof Error ? error.message : String(error)) }).finally(() => { setBusy(false) })
  }
  const edit = (change: (project: NovelProject) => void) => {
    if (draft === undefined) return
    const next = structuredClone(draft)
    change(next)
    setDraft(next)
  }
  const editScene = (change: (value: NovelScene) => void) => edit(project => {
    const value = project.scenes.find(item => item.id === sceneId)
    if (value !== undefined) change(value)
  })

  return <div className={css.root}>
    <Login t={t} {...chatGpt} />
    <p className={css.muted}>{t('hint')}</p>
    <label>{t('open')}<select aria-label={t('open')} value={loaded?.project.id ?? ''} disabled={busy || dirty}
      onChange={event => { const id = event.target.value; if (id !== '') run(async () => { adopt(await read(id)) }) }}>
      <option value="">{t('open')}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
    </select></label>
    <details open={loaded === undefined}><summary>{t('newProject')}</summary><fieldset disabled={busy || dirty}>
      <label>{t('projectId')}<input value={newId} onChange={event => { setNewId(event.target.value) }} /></label>
      <label>{t('projectTitle')}<input value={newTitle} onChange={event => { setNewTitle(event.target.value) }} /></label>
      <label>{t('language')}<select value={language} onChange={event => { setLanguage(event.target.value as 'ko' | 'ja') }}>
        <option value="ko">{t('korean')}</option><option value="ja">{t('japanese')}</option>
      </select></label>
      <button disabled={newTitle.trim() === ''} onClick={() => { run(async () => {
        adopt(await create(newId, newTitle, language)); setProjects(await list()); setNotice(t('saved'))
      }) }}>{t('create')}</button>
    </fieldset></details>
    {loaded !== undefined && draft !== undefined ? <>
      <div className={css.toolbar}>
        <button disabled={busy || dirty} onClick={() => { run(async () => { adopt(await read(draft.id)) }) }}>{t('reload')}</button>
        <button disabled={busy || !dirty} onClick={() => { run(async () => { adopt(await save(draft.id, loaded.revision, draft)); setProjects(await list()); setNotice(t('saved')) }) }}>{t('save')}</button>
        <button disabled={busy || dirty || !loaded.canUndo} onClick={() => { run(async () => { adopt(await undo(draft.id, loaded.revision)); setNotice(t('saved')) }) }}>{t('undo')}</button>
        <button disabled={busy || dirty} onClick={() => { run(async () => { await preview(draft.id); setNotice(t('playing')) }) }}>{t('preview')}</button>
        {dirty && <button disabled={busy} onClick={() => { setDraft(loaded.project) }}>{t('discard')}</button>}
      </div>
      <p className={css.muted}>{t('revision')} {loaded.revision} — {dirty ? t('dirty') : t('saved')}</p>
      <fieldset disabled={busy}>
        <label>{t('projectTitle')}<input value={draft.title} onChange={event => { edit(project => { project.title = event.target.value }) }} /></label>
        <label>{t('entry')}<select value={draft.entry} onChange={event => { edit(project => { project.entry = event.target.value }) }}>
          {draft.scenes.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}
        </select></label>
      </fieldset>
      <div className={css.row}><label>{t('scene')}<select value={sceneId} onChange={event => { setSceneId(event.target.value) }}>
        {draft.scenes.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}
      </select></label><button disabled={busy} onClick={() => {
        let index = draft.scenes.length + 1
        while (draft.scenes.some(value => value.id === `scene_${index}`)) index++
        const id = `scene_${index}`
        edit(project => { project.scenes.push({ id, title: `${t('scene')} ${index}`, lines: [], choices: [] }) }); setSceneId(id)
      }}>{t('addScene')}</button></div>
      {scene !== undefined && <fieldset disabled={busy}><legend>{scene.id}</legend>
        <label>{t('sceneTitle')}<input value={scene.title} onChange={event => { editScene(value => { value.title = event.target.value }) }} /></label>
        {scene.lines.map((line, index) => <div className={css.line} key={index}>
          <div className={css.row}><label>{t('speaker')}<input value={line.speaker} onChange={event => { editScene(value => { value.lines[index]!.speaker = event.target.value }) }} /></label>
            <button onClick={() => { editScene(value => { value.lines.splice(index, 1) }) }}>{t('remove')}</button></div>
          <label>{t('dialogue')}<textarea value={line.text} onChange={event => { editScene(value => { value.lines[index]!.text = event.target.value }) }} /></label>
        </div>)}
        <button onClick={() => { editScene(value => { value.lines.push({ speaker: '', text: '' }) }) }}>{t('addLine')}</button>
        {scene.choices.map((choice, index) => <div className={css.line} key={index}>
          <label>{t('choice')}<input value={choice.text} onChange={event => { editScene(value => { value.choices[index]!.text = event.target.value }) }} /></label>
          <div className={css.row}><label>{t('destination')}<select value={choice.target} onChange={event => { editScene(value => { value.choices[index]!.target = event.target.value }) }}>
            {draft.scenes.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}
          </select></label><button onClick={() => { editScene(value => { value.choices.splice(index, 1) }) }}>{t('remove')}</button></div>
        </div>)}
        <button onClick={() => { editScene(value => { value.choices.push({ text: '', target: draft.entry }) }) }}>{t('addChoice')}</button>
      </fieldset>}
    </> : <p className={css.muted}>{t('empty')}</p>}
    {(busy || notice !== '') && <div role="status" className={css.notice}>{busy ? t('working') : notice}</div>}
  </div>
}
