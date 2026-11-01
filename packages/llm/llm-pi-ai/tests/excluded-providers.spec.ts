import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import * as PiAi from '../src/index.ts'

it('excludes deployment-disabled providers from settings and active routes while preserving ChatGPT', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(PiAi, { providers: { deepseek: {}, 'openai-codex': {} }, excludedProviders: ['deepseek'] })
    expect(ctx.llm.listConfigurableProviders().map(value => value.provider)).not.toContain('deepseek')
    expect(ctx.llm.listProviders().map(value => value.id)).not.toContain('deepseek')
    expect(ctx.llm.listProviders().map(value => value.id)).toContain('openai-codex')
  } finally { await ctx.fiber.dispose() }
})
