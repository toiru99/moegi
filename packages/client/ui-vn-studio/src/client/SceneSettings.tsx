import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene, SceneVisual } from '../types.ts'
import css from './StudioWorkbench.module.css'

/** Plain position controls and media assignments for one scene. */
export function SceneSettings({ project, scene, edit, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; scene: NovelScene; edit(change: (scene: NovelScene) => void): void
}) {
  const visual = scene.visual ?? { characters: [] }
  const set = (change: (visual: SceneVisual) => void) => edit(scene => { change(scene.visual ??= { characters: [] }) })
  const select = (key: 'background' | 'music' | 'sound', kind: 'background' | 'music' | 'sound') => <label>{t(kind)}<select value={visual[key] ?? ''} onChange={event => {
    const id = event.target.value
    set(value => { if (id === '') delete value[key]; else value[key] = id })
  }}><option value="">{t('noAsset')}</option>{project.assets?.filter(asset => asset.kind === kind && ![project.uiSkin?.title, project.uiSkin?.cursor, project.uiSkin?.dialogue].includes(asset.id)).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
  const characters = project.assets?.filter(asset => asset.kind === 'character') ?? []
  return <div className={css.settings}>
    <label>{t('sceneTitle')}<input value={scene.title} onChange={event => { const title = event.target.value; edit(scene => { scene.title = title }) }} /></label>
    {select('background', 'background')}{select('music', 'music')}{select('sound', 'sound')}
    {visual.characters.map((placement, index) => <fieldset key={index} className={css.placement}>
      <legend>{project.assets?.find(asset => asset.id === placement.asset)?.name ?? t('character')}</legend>
      {(['x', 'y', 'scale'] as const).map((field) => <label key={field}>{t(field === 'x' ? 'positionX' : field === 'y' ? 'positionY' : 'characterSize')}
        <input type="range" min={field === 'scale' ? 0.1 : 0} max={field === 'scale' ? 2 : 100} step={field === 'scale' ? 0.05 : 1} value={placement[field]}
          onChange={event => { const next = Number(event.target.value); set(value => { value.characters[index]![field] = next }) }} />
      </label>)}
      <Button size="sm" variant="outline" onClick={() => { set(value => { value.characters.splice(index, 1) }) }}>{t('removeCharacter')}</Button>
    </fieldset>)}
    <label>{t('addCharacter')}<select value="" disabled={visual.characters.length >= 3 || characters.length === 0} onChange={event => {
      const id = event.target.value
      if (id !== '') set(value => { value.characters.push({ asset: id, x: 50, y: 100, scale: 0.95 }) })
    }}><option value="">{t('addCharacter')}</option>{characters.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
  </div>
}
