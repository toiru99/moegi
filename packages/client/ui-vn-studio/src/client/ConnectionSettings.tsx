import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Login, type LoginActions } from './Login.tsx'
import css from './Editor.module.css'

/** Keep model-account connection separate from the game document editor. */
export function ConnectionSettings(props: PropsLocale<'vnStudio'> & InjectFace<LoginActions>) {
  return <div className={css.root}><p>{props.t('connectionHint')}</p><Login {...props} /></div>
}
