import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { exportRecoveredRuntime } from '../src/recovered-export.ts'

it.skipIf(process.platform !== 'win32')('packages relocated game files without linked user saves or authoring metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-recovered-export-')), source = join(root, 'runtime'), saves = join(root, 'private-saves')
  try {
    await mkdir(source); await mkdir(saves); await writeFile(join(saves, 'private.sav'), 'PRIVATE_SAVE_DATA')
    for (const name of ['KinkoiKO.exe', 'Scene.pck', 'Gameexe.dat', 'authoring.json']) await writeFile(join(source, name), name)
    await symlink(saves, join(source, 'savedata_ko'), 'junction')
    const result = await exportRecoveredRuntime({ directory: source, executable: join(source, 'KinkoiKO.exe') }, 'demo', 38, join(root, 'exports'))
    expect(result).toMatchObject({ revision: 38, bytes: expect.any(Number) })
    const listed = await promisify(execFile)('tar.exe', ['-tf', result.archivePath])
    expect(listed.stdout).toContain('Game.exe')
    expect(listed.stdout).toContain('Start-Game.cmd')
    expect(listed.stdout).toContain('savedata_ko/')
    expect(listed.stdout).not.toMatch(/private.sav|KinkoiKO.exe|authoring.json/)
    expect(await readFile(join(saves, 'private.sav'), 'utf8')).toBe('PRIVATE_SAVE_DATA')
    const cancelled = new AbortController(); cancelled.abort()
    await expect(exportRecoveredRuntime({ directory: source, executable: join(source, 'KinkoiKO.exe') }, 'demo', 38, join(root, 'exports'), cancelled.signal)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})
