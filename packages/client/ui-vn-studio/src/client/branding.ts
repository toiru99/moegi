import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { StudioMark, StudioName } from './Brand.tsx'
import { STUDIO_TAB_ICON } from './brand-art.ts'

/** Register product identity and own the tab icon until the plugin is disposed. */
export function registerStudioBrand(ctx: Context): void {
  ctx.effect(() => {
    const previous = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.setAttribute('sizes', 'any')
    // Inline artwork bypasses browser favicon databases retaining an older product at this origin.
    icon.href = `data:image/svg+xml,${encodeURIComponent(STUDIO_TAB_ICON)}`
    previous.forEach(link => { link.remove() })
    document.head.append(icon)
    return () => {
      icon.remove()
      document.head.append(...previous)
    }
  }, 'vn-studio.tab-icon')
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, StudioMark)
    yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'vnStudio' }, StudioName)
  }))
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark' }, StudioMark))
}
