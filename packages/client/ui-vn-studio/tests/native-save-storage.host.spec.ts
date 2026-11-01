import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { attachNativeSaves } from '../src/native-save-storage.ts'

it('shares native saves across identical builds but isolates changed bytecode and runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-native-saves-'))
  try {
    const storage = join(root, 'projects'), engine = join(root, 'engine.exe')
    await mkdir(storage); await writeFile(engine, 'engine-v1')
    const prepare = async (name: string, bytecode: string) => {
      const path = join(root, name); await mkdir(path); await writeFile(join(path, 'Scene.pck'), bytecode); await writeFile(join(path, 'Gameexe.ini'), '#SCREEN_SIZE=1280,720')
      return { path, saves: await attachNativeSaves(path, storage, 'story', engine) }
    }
    const first = await prepare('first', 'scene-v1')
    await writeFile(join(first.path, 'savedata', 'save0000.sav'), 'actual-runtime-save')
    const identical = await prepare('identical', 'scene-v1')
    expect(await readFile(join(identical.path, 'savedata', 'save0000.sav'), 'utf8')).toBe('actual-runtime-save')
    expect(await realpath(join(identical.path, 'savedata'))).toBe(first.saves)
    const edited = await prepare('edited', 'scene-v2')
    expect(edited.saves).not.toBe(first.saves)
    await writeFile(engine, 'engine-v2')
    expect((await prepare('new-runtime', 'scene-v1')).saves).not.toBe(first.saves)
  } finally { await rm(root, { recursive: true, force: true }) }
})
