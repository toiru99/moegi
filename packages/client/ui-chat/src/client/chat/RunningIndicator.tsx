/** Decorative activity glyph for the running Chat status. */
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/** Render the shared loading glyph; CSS respects motion and forced-color preferences. */
export function RunningIndicator() {
  return <span className={css.runningIcon} aria-hidden="true"><IconLoadingOutlineRegular size={14} /></span>
}
