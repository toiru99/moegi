import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

const mocks = vi.hoisted(() => ({ compile: vi.fn(), recovered: vi.fn(), spawn: vi.fn() }))
vi.mock('../src/compiler.ts', () => ({ compileProject: mocks.compile }))
vi.mock('../src/recovered-compiler.ts', () => ({ compileRecoveredProject: mocks.recovered }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.spawn }))
const { VnStudio } = await import('../src/controller.ts')

function player() { return Object.assign(new EventEmitter(), { pid: 123, kill: vi.fn<() => boolean>() }) }

it('does not launch a player when disposal occurs while compilation is pending', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-preview-'))
  const ctx = new Context()
  let finish!: (directory: string) => void
  mocks.compile.mockImplementation(() => new Promise<string>(resolve => { finish = resolve }))
  mocks.spawn.mockImplementation(() => {
    const child = player()
    child.kill.mockImplementation(() => { queueMicrotask(() => { child.emit('close') }); return true })
    queueMicrotask(() => { child.emit('spawn') })
    return child
  })
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, previewDirectory: root, compilerDirectory: root, fontFile: 'test.ttf' })
    const studio = ctx.get('vnStudio')!
    await studio.create('demo', 'Demo', 'ko')
    const pending = studio.preview('demo')
    await vi.waitFor(() => { expect(mocks.compile).toHaveBeenCalledOnce() })
    const disposed = ctx.fiber.dispose()
    await vi.waitFor(() => { expect(mocks.compile.mock.calls[0]?.[5]?.aborted).toBe(true) })
    finish(root)
    await expect(pending).rejects.toThrow(/abort|disposed/i)
    await disposed
    expect(mocks.spawn).not.toHaveBeenCalled()
  } finally {
    finish?.(root)
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    mocks.compile.mockReset()
    mocks.spawn.mockReset()
  }
})

it('waits for the owned player to close before disposal completes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-preview-'))
  const ctx = new Context()
  let child!: ReturnType<typeof player>
  mocks.compile.mockResolvedValue(root)
  mocks.spawn.mockImplementation(() => {
    child = player()
    child.kill.mockReturnValue(true)
    queueMicrotask(() => { child.emit('spawn') })
    return child
  })
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, previewDirectory: root, compilerDirectory: root, fontFile: 'test.ttf' })
    const studio = ctx.get('vnStudio')!
    await studio.create('demo', 'Demo', 'ko')
    await studio.preview('demo')
    let finished = false
    const disposed = ctx.fiber.dispose().then(() => { finished = true })
    await vi.waitFor(() => { expect(child.kill).toHaveBeenCalled() })
    expect(finished).toBe(false)
    child.emit('close')
    await disposed
    expect(finished).toBe(true)
  } finally {
    child?.emit('close')
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    mocks.compile.mockReset()
    mocks.spawn.mockReset()
  }
})

it('launches the recovered original runtime and never falls back to generated prototype menus', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-recovered-preview-'))
  const ctx = new Context()
  let child!: ReturnType<typeof player>
  mocks.recovered.mockResolvedValue({ directory: join(root, 'runtime'), executable: join(root, 'runtime', 'Original.exe'), args: [] })
  mocks.spawn.mockImplementation(() => {
    child = player(); child.kill.mockImplementation(() => { queueMicrotask(() => child.emit('close')); return true })
    queueMicrotask(() => child.emit('spawn')); return child
  })
  try {
    await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime)
    await ctx.plugin(VnStudio, { projectDirectory: root, previewDirectory: root, compilerDirectory: root, fontFile: 'test.ttf', recoveredSystemDirectory: join(root, 'systems'), recoveredCompilerExecutable: join(root, 'ssu.exe') })
    const studio = ctx.get('vnStudio')!
    await studio.create('original', 'My own story', 'ko')
    expect(await studio.playbackMode()).toBe('recovered')
    await studio.preview('original')
    expect(mocks.recovered).toHaveBeenCalledWith(expect.objectContaining({ id: 'original' }), 0, root, join(root, 'systems', 'ko'), join(root, 'ssu.exe'), root, expect.any(AbortSignal))
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.spawn).toHaveBeenCalledWith(join(root, 'runtime', 'Original.exe'), [], expect.objectContaining({ cwd: join(root, 'runtime') }))
    mocks.recovered.mockRejectedValue(new Error('Recovered UI resource missing'))
    await expect(studio.preview('original')).rejects.toThrow('Recovered UI resource missing')
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.spawn).toHaveBeenCalledTimes(1)
  } finally {
    child?.emit('close'); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true })
    mocks.compile.mockReset(); mocks.recovered.mockReset(); mocks.spawn.mockReset()
  }
})
