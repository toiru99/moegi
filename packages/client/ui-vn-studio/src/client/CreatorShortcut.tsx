import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './Editor.module.css'

/** Legacy sidebar tabs lead to the single shared creator instead of owning another draft. */
export function CreatorShortcut({ t, open }: PropsLocale<'vnStudio'> & InjectFace<{ open(): void }>) {
  return <div className={css.root}><p>{t('workbench')}</p><Button variant="primary" onClick={open}>{t('openCreator')}</Button></div>
}
