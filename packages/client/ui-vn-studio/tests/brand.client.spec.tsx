// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { registerStudioBrand } from '../src/client/branding.ts'
import { STUDIO_FRAME, STUDIO_PLAY } from '../src/client/brand-art.ts'

it('replaces a cached upstream tab icon independently of theme and session activity, then restores it on disposal', async () => {
  const upstream = document.createElement('link')
  const originalTitle = document.title
  upstream.rel = 'shortcut icon'
  upstream.href = '/favicon.svg'
  document.head.append(upstream)
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const fiber = ctx.plugin({ inject: ['slots'], apply: registerStudioBrand })
  try {
    await fiber.await()
    const icons = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    expect(icons()).toHaveLength(1)
    const icon = icons()[0]!
    expect(icon.href).toMatch(/^data:image\/svg\+xml,/)
    const svg = decodeURIComponent(icon.href.slice(icon.href.indexOf(',') + 1))
    expect(svg).toContain(STUDIO_FRAME)
    expect(svg).toContain(STUDIO_PLAY)
    expect(svg).toContain('<rect')
    expect(icon.media).toBe('')
    for (const theme of ['dark', 'light']) {
      document.documentElement.dataset.theme = theme
      for (const title of ['Working — VN Studio', 'VN Studio']) {
        document.title = title
        expect(icons()).toEqual([icon])
        expect(icon.href).toContain(encodeURIComponent(STUDIO_FRAME))
      }
    }
    await fiber.dispose()
    expect(icons()).toEqual([upstream])
  } finally {
    await ctx.fiber.dispose()
    upstream.remove()
    document.title = originalTitle
    delete document.documentElement.dataset.theme
  }
})

it('replaces all product mark slots across declaration order and withdraws them on disposal', async () => {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots')!
  const names = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const
  const declare = () => slots.register({ name: 'root', children: Object.fromEntries(names.map(name => [name, { kind: 'single', scope: 'root' }])) } as never, () => null)
  const fiber = ctx.plugin({ inject: ['slots'], apply: registerStudioBrand })
  await fiber.await()
  const remove = declare()
  await Promise.resolve()
  for (const name of names) expect(slots.entries(name)).toHaveLength(1)
  remove()
  for (const name of names) expect(slots.entries(name)).toHaveLength(0)
  declare()
  await Promise.resolve()
  for (const name of names) expect(slots.entries(name)).toHaveLength(1)
  await fiber.dispose()
  for (const name of names) expect(slots.entries(name)).toHaveLength(0)
  await ctx.fiber.dispose()
})
