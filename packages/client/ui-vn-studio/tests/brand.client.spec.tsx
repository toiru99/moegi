// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { registerStudioBrand } from '../src/client/branding.ts'

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
