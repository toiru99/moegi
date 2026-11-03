import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { resolveCodexExecutable } from '../src/codex-executable.ts'

it('recovers a removed desktop-version executable from the same managed installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-codex-path-')), bin = join(root, 'OpenAI', 'Codex', 'bin')
  try {
    const older = join(bin, 'aaaaaaaaaaaaaaaa', 'codex.exe'), current = join(bin, 'bbbbbbbbbbbbbbbb', 'codex.exe')
    for (const file of [older, current]) { await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, 'test executable') }
    await utimes(older, new Date(1000), new Date(1000))
    const removed = join(bin, '1111111111111111', 'codex.exe')
    expect(await resolveCodexExecutable(removed, { platform: 'win32', localAppData: root })).toBe(current)
    expect(await resolveCodexExecutable('codex', { platform: 'win32', localAppData: root })).toBe(current)
    expect(await resolveCodexExecutable(older, { platform: 'win32', localAppData: root })).toBe(older)
    expect(await resolveCodexExecutable(join(root, 'custom.exe'), { platform: 'win32', localAppData: root })).toBe(join(root, 'custom.exe'))
    expect(await resolveCodexExecutable('custom-codex', { platform: 'win32', localAppData: root })).toBe('custom-codex')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('does not treat arbitrary sibling executables as managed desktop updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-codex-unmanaged-')), bin = join(root, 'OpenAI', 'Codex', 'bin')
  try {
    await mkdir(join(bin, 'not-a-version'), { recursive: true }); await writeFile(join(bin, 'not-a-version', 'codex.exe'), 'not a managed update')
    const removed = join(bin, '1111111111111111', 'codex.exe')
    expect(await resolveCodexExecutable(removed, { platform: 'win32', localAppData: root })).toBe(removed)
    expect(await resolveCodexExecutable('/custom/codex', { platform: 'darwin', localAppData: root })).toBe('/custom/codex')
  } finally { await rm(root, { recursive: true, force: true }) }
})
