import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene } from '../types.ts'
import css from './StudioWorkbench.module.css'

/** Dialogue and branch edits use ordinary fields, never source code. */
export function DialogueEditor({ project, scene, line, edit, focusLine, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; scene: NovelScene; line: number; edit(change: (scene: NovelScene) => void): void; focusLine(index: number): void
}) {
  return <div className={css.dialogueEditor}>
    {scene.lines.map((row, index) => <fieldset key={index} data-active={index === line || undefined} className={css.lineEditor}>
      <div className={css.lineHeader}><label>{t('speaker')}<input aria-label={`${t('speaker')} ${index + 1}`} value={row.speaker} onFocus={() => { focusLine(index) }} onChange={event => { const next = event.target.value; edit(scene => { scene.lines[index]!.speaker = next }) }} /></label>
        <Button size="sm" onClick={() => { edit(scene => { scene.lines.splice(index, 1) }) }}>{t('remove')}</Button></div>
      <label>{t('dialogue')}<textarea aria-label={`${t('dialogue')} ${index + 1}`} value={row.text} onFocus={() => { focusLine(index) }} onChange={event => { const next = event.target.value; edit(scene => { scene.lines[index]!.text = next }) }} /></label>
    </fieldset>)}
    <Button variant="outline" onClick={() => { edit(scene => { scene.lines.push({ speaker: '', text: '' }) }); focusLine(scene.lines.length) }}>{t('addLine')}</Button>
    <div className={css.choiceEditor}>
      {scene.choices.map((choice, index) => <div className={css.choiceRow} key={index}>
        <label>{t('choice')}<input aria-label={`${t('choice')} ${index + 1}`} value={choice.text} onChange={event => { const next = event.target.value; edit(scene => { scene.choices[index]!.text = next }) }} /></label>
        <label>{t('destination')}<select value={choice.target} onChange={event => { const next = event.target.value; edit(scene => { scene.choices[index]!.target = next }) }}>{project.scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.title}</option>)}</select></label>
        <Button size="sm" onClick={() => { edit(scene => { scene.choices.splice(index, 1) }) }}>{t('remove')}</Button>
      </div>)}
      <Button variant="outline" disabled={scene.choices.length >= 16} onClick={() => { edit(scene => { scene.choices.push({ text: '', target: project.scenes.find(other => other.id !== scene.id)?.id ?? scene.id }) }) }}>{t('addChoice')}</Button>
    </div>
  </div>
}
