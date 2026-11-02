import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeTools from '@deepseek-ai/dsh-tool-executor-native'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { Config } from '../src/config.ts'

const mocks = vi.hoisted(() => ({ compile: vi.fn(), recovered: vi.fn(), spawn: vi.fn() }))
vi.mock('../src/compiler.ts', () => ({ compileProject: mocks.compile }))
vi.mock('../src/recovered-compiler.ts', () => ({ compileRecoveredProject: mocks.recovered }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.spawn }))
const { VnStudio } = await import('../src/controller.ts')

afterEach(() => { vi.clearAllMocks() })

it.each([
  { label: 'without any engine paths', legacy: {} },
])('describes browser playback $label without compiling, spawning or editing the story', async ({ legacy }) => {
  const root = await mkdtemp(join(tmpdir(), 'vn-browser-preview-')), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, ...legacy })
    const studio = ctx.get('vnStudio')!
    const original = await studio.create('my_story-2', 'My own story', 'ko')
    const saved = await studio.save('my_story-2', original.revision, JSON.stringify({ ...original.project, scenes: [{ ...original.project.scenes[0]!, lines: [{ speaker: 'Guide', text: 'Keep this authored line.' }] }] }))
    expect(await studio.playbackMode()).toBe('prototype')
    expect(await studio.preview('my_story-2')).toEqual({ revision: saved.revision, projectId: 'my_story-2', playback: 'browser', url: '/?project=my_story-2' })
    expect(await studio.read('my_story-2')).toEqual(saved)
    expect(await readdir(root)).toEqual(['my_story-2.json'])
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.recovered).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

it('accepts the authoring directory as the only required path', () => {
  expect(Config({ projectDirectory: 'stories' })).toMatchObject({ projectDirectory: 'stories' })
})

it('returns the browser preview URL through the project tool without claiming a native process started', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-browser-preview-tool-')), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeTools)
    await ctx.plugin(VnStudio, { projectDirectory: root })
    await ctx.vnStudio.create('demo', 'My own story', 'ja')
    const result = await executeToolFixture(ctx, { callId: ToolCallId('browser-preview'), name: 'vn_project', arguments: { action: 'preview', id: 'demo' }, signal: new AbortController().signal })
    expect(result.isError).not.toBe(true)
    const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
    expect(JSON.parse(text)).toEqual({ revision: 0, projectId: 'demo', playback: 'browser', url: '/?project=demo' })
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.recovered).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

it('reports a missing project instead of returning a playable browser URL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-browser-preview-missing-')), ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root })
    await expect(ctx.vnStudio.preview('missing')).rejects.toThrow()
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.recovered).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})

it('runs the configured recovered common-system build and owns process cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-recovered-preview-')), ctx = new Context()
  const child = Object.assign(new EventEmitter(), { pid: 12345, kill: vi.fn(() => { queueMicrotask(() => child.emit('close')); return true }) })
  mocks.spawn.mockImplementation(() => { queueMicrotask(() => child.emit('spawn')); return child })
  mocks.recovered.mockResolvedValue({ directory: join(root, 'runtime'), executable: join(root, 'runtime', 'Game.exe'), args: [] })
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, recoveredSystemDirectory: join(root, 'templates'), recoveredCompilerExecutable: join(root, 'compiler.exe') })
    const saved = await ctx.vnStudio.create('demo', 'Story', 'ko')
    expect(await ctx.vnStudio.playbackMode()).toBe('recovered')
    expect(await ctx.vnStudio.preview('demo')).toMatchObject({ revision: 0, directory: join(root, 'runtime'), processId: 12345, playback: 'recovered' })
    expect(mocks.recovered).toHaveBeenCalledWith(saved.project, 0, expect.any(String), join(root, 'templates', 'ko'), join(root, 'compiler.exe'), root, expect.any(AbortSignal))
    expect(mocks.spawn).toHaveBeenCalledWith(join(root, 'runtime', 'Game.exe'), [], expect.objectContaining({ cwd: join(root, 'runtime'), stdio: 'ignore' }))
    expect(await ctx.vnStudio.read('demo')).toEqual(saved)
    await ctx.fiber.dispose()
    expect(child.kill).toHaveBeenCalledOnce()
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
