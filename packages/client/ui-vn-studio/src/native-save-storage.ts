import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, symlink } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { assertId } from './store.ts'

/** Share native saves only across byte-identical game/runtime builds; native snapshots contain instruction offsets. */
export async function attachNativeSaves(build: string, storage: string, id: string, engine: string): Promise<string> {
  assertId(id)
  const digest = createHash('sha256')
  const add = async (file: string, name: string) => { digest.update(`${name.length}:${name}:`); digest.update(await readFile(file)) }
  await add(engine, 'runtime')
  await add(join(build, 'Scene.pck'), 'Scene.pck')
  await add(join(build, 'Gameexe.ini'), 'Gameexe.ini')
  for (const directory of ['font', 'g00', 'bgm', 'wav']) {
    const path = join(build, directory)
    const files = await readdir(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
    for (const file of files.sort()) {
      const entry = join(path, file)
      const info = await lstat(entry)
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Native game inputs must be regular files.')
      await add(entry, `${directory}/${basename(file)}`)
    }
  }
  const base = await realpath(resolve(storage)), saveRoot = join(base, `${id}.native-saves`)
  await mkdir(saveRoot, { recursive: true })
  const info = await lstat(saveRoot)
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(saveRoot) !== saveRoot) throw new Error('Native save storage must be a project-owned directory.')
  const target = join(saveRoot, digest.digest('hex'))
  await mkdir(target, { recursive: true })
  const child = await lstat(target), located = await realpath(target)
  if (!child.isDirectory() || child.isSymbolicLink() || relative(saveRoot, located).startsWith(`..${sep}`) || located !== target) throw new Error('Native saves escape project storage.')
  await symlink(target, join(build, 'savedata'), process.platform === 'win32' ? 'junction' : 'dir')
  return target
}
