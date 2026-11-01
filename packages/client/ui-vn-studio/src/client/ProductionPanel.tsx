import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, ProductionStatus } from '../types.ts'
import type { CreatorActions } from './creator-actions.ts'
import css from './ProductionPanel.module.css'

/** Saved planning and derived evidence make the director's remaining work visible. */
export function ProductionPanel({ project, revision, face, disabled, continueProduction, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; revision: number; face: CreatorActions; disabled: boolean; continueProduction(): void
}) {
  const [status, setStatus] = useState<ProductionStatus>()
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    void face.productionStatus(project.id).then(value => { if (live) { setStatus(value); setError('') } }).catch((error: unknown) => { if (live) setError(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [project.id, revision, face.productionStatus])
  const plan = project.production
  return <section className={css.panel} aria-label={t('productionPack')}>
    <div className={css.header}><div><h2>{t('productionPack')}</h2><p>{t('productionHint')}</p></div><Button variant="primary" disabled={disabled} onClick={continueProduction}>{t('continueProduction')}</Button></div>
    {error !== '' && <p role="status">{error}</p>}
    {plan === undefined ? <p>{t('planMissing')}</p> : <>
      <div className={css.brief}><h3>{project.title}</h3><p>{plan.premise}</p><p>{plan.tone}</p></div>
      {status && <p className={css.progress}>{t('productionProgress', { written: status.writtenScenes, planned: status.plannedScenes })}</p>}
      <section><h3>{t('productionCast')}</h3><div className={css.cast}>{plan.cast.map(character => <article key={character.id}><strong>{character.name}</strong><p>{character.voice}</p><p>{character.desire}</p></article>)}</div></section>
      <ol className={css.scenes}>{plan.scenes.map(planned => {
        const current = status?.scenes.find(scene => scene.id === planned.id)
        return <li key={planned.id}><div><h3>{planned.title}</h3><span>{t(current?.phase === 'written' ? 'writtenScene' : current?.phase === 'draft' ? 'draftScene' : 'plannedScene')}{current ? ` · ${current.beatCount}/${current.minBeats}` : ''}</span></div><p><strong>{t('scenePurpose')}</strong> {planned.purpose}</p><p>{planned.sharedActivity}</p><p><strong>{t('relationship')}</strong> {planned.relationshipBefore} → {planned.relationshipAfter}</p></li>
      })}</ol>
      <section><h3>{t('productionMedia')}</h3><div className={css.media}>{status?.media.map(task => <div key={task.id}><strong>{task.name}</strong><span>{t(task.kind)}</span><span data-ready={task.state === 'ready'}>{t(task.state === 'ready' ? 'mediaReady' : task.state === 'blocked' ? 'mediaBlocked' : task.state === 'unassigned' ? 'mediaUnassigned' : 'mediaPending')}</span></div>)}</div></section>
      {status?.uiSkin && <section aria-label={t('interfaceArtwork')}><h3>{t('interfaceArtwork')}</h3><p>{t('interfaceArtworkHint')}</p><div className={css.media}>{status.uiSkin.roles.map(role => <div key={role.role}><strong>{t(role.role === 'title' ? 'titleArtwork' : role.role === 'cursor' ? 'cursorArtwork' : 'dialogueArtwork')}</strong><span data-ready={role.state === 'ready'}>{t(role.state === 'ready' ? 'mediaReady' : role.state === 'blocked' ? 'mediaBlocked' : 'mediaPending')}</span></div>)}</div></section>}
      {(status?.warnings.length ?? 0) > 0 && <details className={css.warnings}><summary>{t('productionWarnings')} ({status?.warnings.length})</summary><ul>{status?.warnings.map((warning, index) => <li key={index}>{warning.sceneId && <strong>{plan.scenes.find(scene => scene.id === warning.sceneId)?.title}: </strong>}{warning.message}</li>)}</ul></details>}
    </>}
  </section>
}
