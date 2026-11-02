import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NovelProject, NovelScene, SceneVisual } from '../types.ts'
import { choiceFlagsMatch, resolveSceneDirection } from '../direction.ts'
import { characterRect, STAGE_HEIGHT, STAGE_WIDTH } from '../stage.ts'
import css from './StudioWorkbench.module.css'

/** Independent game stage uses only authored scene media and project-owned interface artwork. */
export function Stage({ project, scene, line, urls, next, choose, flags = {}, textScale = 1, artOnly = false, dialogueFrame, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; scene: NovelScene; line: number; urls: Record<string, string>; next(): void; choose(target: string, originalChoiceIndex?: number): void; flags?: Record<string, boolean>; textScale?: number; artOnly?: boolean; dialogueFrame?: string | undefined
}) {
  const current = scene.lines[Math.min(line, scene.lines.length - 1)]
  const { visual, cueIndex } = resolveSceneDirection(scene, line)
  const imageIds = visual?.cg === undefined ? [visual?.background, ...visual?.characters.map(value => value.asset) ?? []] : [visual.cg]
  const ready = imageIds.every(id => id === undefined || Boolean(urls[id]))
  const cue = `${project.id}:${scene.id}:${cueIndex}`
  const [layers, setLayers] = useState<{ cue: string; displayed: SceneVisual | undefined; previous?: SceneVisual }>({ cue, displayed: ready ? visual : undefined })
  if (layers.cue !== cue || (ready && layers.displayed !== visual)) {
    const previous = !ready || visual?.transition === 'dissolve' ? layers.displayed : undefined
    setLayers({ cue, displayed: ready ? visual : layers.displayed, ...(previous === undefined ? {} : { previous }) })
  }
  useEffect(() => {
    if (layers.previous === undefined || !ready) return
    const timer = setTimeout(() => { setLayers(value => value.cue === cue ? { cue, displayed: value.displayed } : value) }, 280)
    return () => { clearTimeout(timer) }
  }, [cue, layers.previous, ready])
  const choices = line >= scene.lines.length ? scene.choices.map((choice, index) => ({ choice, index })).filter(({ choice }) => choiceFlagsMatch(choice.when, flags)) : []
  const artwork = (snapshot: SceneVisual | undefined) => {
    const background = project.assets?.find(asset => asset.id === (snapshot?.cg ?? snapshot?.background))
    return <>
      {background !== undefined && urls[background.id] && <img className={css.background} src={urls[background.id]} alt={background.name} />}
      {snapshot?.cg === undefined && snapshot?.characters.map((placement, index) => {
      const asset = project.assets?.find(asset => asset.id === placement.asset)
      if (!asset?.width || !asset.height || !urls[asset.id]) return null
      const rect = characterRect({ width: asset.width, height: asset.height }, placement)
      return <img key={`${asset.id}-${index}`} className={css.character} src={urls[asset.id]} alt={asset.name}
        data-dimmed={snapshot.focus !== undefined && snapshot.focus !== index}
        style={{ left: `${rect.left / STAGE_WIDTH * 100}%`, top: `${rect.top / STAGE_HEIGHT * 100}%`, width: `${rect.width / STAGE_WIDTH * 100}%`, height: `${rect.height / STAGE_HEIGHT * 100}%` }} />
      })}
    </>
  }
  return <section className={css.stage} data-shot={visual?.shot ?? 'wide'} data-skinned={Boolean(dialogueFrame) && !artOnly} aria-label={t(artOnly ? 'compositionPreview' : 'gameStage')}>
    {layers.previous !== undefined && <div className={css.visualLayer} data-shot={layers.previous.shot ?? 'wide'} aria-hidden="true">{artwork(layers.previous)}</div>}
    <div key={cue} className={css.visualLayer} data-shot={visual?.shot ?? 'wide'} data-transition={ready ? visual?.transition ?? 'cut' : 'cut'} style={{ visibility: ready ? 'visible' : 'hidden' }}>{artwork(visual)}</div>
    {!artOnly && dialogueFrame && <img className={css.dialogueFrame} src={dialogueFrame} alt={t('dialogueArtwork')} />}
    {!artOnly && choices.length > 0 && <div className={css.stageChoices}>{choices.map(({ choice, index }) => <Button variant="outline" key={index} onClick={() => { choose(choice.target, index) }}>{choice.text}</Button>)}</div>}
    {!artOnly && <button className={css.dialogueBox} onClick={next} aria-label={t('nextLine')} style={{ fontSize: `clamp(11px, ${2.4 * textScale}cqw, ${18 * textScale}px)` }}>
      {current?.speaker && <span className={css.speakerName}>{current.speaker}</span>}
      <span>{current?.text || t('emptyDialogue')}</span>
      <span className={css.advance} aria-hidden="true">▸</span>
    </button>}
  </section>
}
