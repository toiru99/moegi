import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene } from '../types.ts'
import { characterRect, STAGE_HEIGHT, STAGE_WIDTH } from '../stage.ts'
import css from './StudioWorkbench.module.css'

/** Immediate authoring view of the same composition emitted to Siglus. */
export function Stage({ project, scene, line, urls, next, choose, textScale = 1, artOnly = false, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; scene: NovelScene; line: number; urls: Record<string, string>; next(): void; choose(target: string): void; textScale?: number; artOnly?: boolean
}) {
  const current = scene.lines[Math.min(line, scene.lines.length - 1)]
  const background = project.assets?.find(asset => asset.id === scene.visual?.background)
  const choices = line >= scene.lines.length ? scene.choices : []
  return <section className={css.stage} aria-label={t(artOnly ? 'compositionPreview' : 'gameStage')}>
    {background !== undefined && urls[background.id] && <img className={css.background} src={urls[background.id]} alt={background.name} />}
    {scene.visual?.characters.map((placement, index) => {
      const asset = project.assets?.find(asset => asset.id === placement.asset)
      if (!asset?.width || !asset.height || !urls[asset.id]) return null
      const rect = characterRect({ width: asset.width, height: asset.height }, placement)
      return <img key={`${asset.id}-${index}`} className={css.character} src={urls[asset.id]} alt={asset.name}
        style={{ left: `${rect.left / STAGE_WIDTH * 100}%`, top: `${rect.top / STAGE_HEIGHT * 100}%`, width: `${rect.width / STAGE_WIDTH * 100}%`, height: `${rect.height / STAGE_HEIGHT * 100}%` }} />
    })}
    {!artOnly && choices.length > 0 && <div className={css.stageChoices}>{choices.map((choice, index) => <button key={index} onClick={() => { choose(choice.target) }}>{choice.text}</button>)}</div>}
    {!artOnly && <button className={css.dialogueBox} onClick={next} aria-label={t('nextLine')} style={{ fontSize: `clamp(11px, ${2.4 * textScale}cqw, ${18 * textScale}px)` }}>
      {current?.speaker && <span className={css.speakerName}>{current.speaker}</span>}
      <span>{current?.text || t('emptyDialogue')}</span>
      <span className={css.advance} aria-hidden="true">▸</span>
    </button>}
  </section>
}
