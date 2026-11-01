import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene } from '../types.ts'
import css from './AssistantPanel.module.css'

/** Project context and navigation around the conversation supplied by its owning plugin. */
export function AssistantPanel({ project, scene, titleImage, children, showPlan, showScene, t }: PropsLocale<'vnStudio'> & {
  project?: NovelProject | undefined
  scene?: NovelScene | undefined
  titleImage?: string | undefined
  children: ReactNode
  showPlan(): void
  showScene(): void
}) {
  const beats = project?.scenes.reduce((total, scene) => total + scene.lines.length, 0) ?? 0
  return <section className={css.panel} aria-label={t('assistantCompanion')}>
    <header className={css.header}>
      <div className={css.introduction}><h2>{t('assistantCompanion')}</h2><p>{t('assistantContextHint')}</p></div>
      {project === undefined ? <div className={css.empty}>
        <h3>{t('assistantNoProject')}</h3><p>{t('assistantNoProjectHint')}</p>
      </div> : <>
        <div className={css.identity} data-art={Boolean(titleImage)}>
          <div className={css.project}>
            <h3 title={project.title}>{project.title}</h3>
            {scene !== undefined && <p className={css.scene}><span>{t('assistantCurrentScene')}</span><strong title={scene.title}>{scene.title}</strong></p>}
          </div>
          {titleImage && <img className={css.artwork} src={titleImage} alt={project.title} />}
        </div>
        <dl className={css.counts}>
          <div><dt>{t('assistantScenes')}</dt><dd>{project.scenes.length}</dd></div>
          <div><dt>{t('assistantBeats')}</dt><dd>{beats}</dd></div>
          <div><dt>{t('assistantMedia')}</dt><dd>{project.assets?.length ?? 0}</dd></div>
        </dl>
        <div className={css.shortcuts}>
          <Button size="sm" variant="outline" onClick={showPlan}>{t('assistantShowPlan')}</Button>
          {scene !== undefined && <Button size="sm" variant="outline" onClick={showScene}>{t('assistantShowScene')}</Button>}
        </div>
      </>}
    </header>
    <div className={css.conversation}>{children}</div>
  </section>
}
