import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { StudioMark, StudioName } from './Brand.tsx'

/** Register product identity through the shell's replaceable brand slots. */
export function registerStudioBrand(ctx: Context): void {
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, StudioMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'vnStudio' }, StudioName)
  }))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, StudioMark))
}
