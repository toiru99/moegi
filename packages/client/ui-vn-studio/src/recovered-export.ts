/** Private local game packaging; keeps authoring files and linked user saves out of the archive. */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, open, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

/** Package an immutable recovered runtime with an independent empty save directory. */
export async function exportRecoveredRuntime(runtime: { directory: string; executable: string }, id: string, revision: number, outputRoot: string, signal?: AbortSignal): Promise<{ archivePath: string; bytes: number; revision: number }> {
  signal?.throwIfAborted()
  if (process.platform !== 'win32') throw new Error('The configured recovered game runtime currently exports Windows games.')
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id) || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid export identity.')
  const source = await realpath(runtime.directory), engine = await realpath(runtime.executable)
  if (dirname(engine) !== source) throw new Error('Game executable must belong to the compiled runtime.')
  const root = resolve(outputRoot); await mkdir(root, { recursive: true })
  const output = join(root, `${id}-r${revision}-${randomUUID()}`), staging = `${output}.building`
  const zip = `${output}.zip`, temporaryZip = `${output}.building.zip`
  await mkdir(staging)
  let count = 0, bytes = 0
  const copy = async (directory: string, target: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      signal?.throwIfAborted()
      const input = join(directory, name), destination = join(target, name), info = await lstat(input)
      if (directory === source && /^savedata(?:_|$)/i.test(name)) { await mkdir(destination); continue }
      if (info.isSymbolicLink()) throw new Error('A game export cannot contain linked files.')
      if (input === engine) continue
      if (info.isDirectory()) { await mkdir(destination); await copy(input, destination) }
      else if (info.isFile()) {
        if (['authoring.json', 'recovered-build.json', 'manifest.json'].includes(name.toLowerCase())) continue
        const rel = relative(source, await realpath(input))
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('A game export file escaped its runtime.')
        if (++count > 8192 || (bytes += info.size) > 2 * 1024 * 1024 * 1024) throw new Error('Game export exceeds the local package limit.')
        await copyFile(input, destination)
      } else throw new Error('A game export requires regular files.')
    }
  }
  try {
    for (const required of ['Scene.pck', 'Gameexe.dat']) if (!(await stat(join(source, required))).isFile()) throw new Error('Compiled game data is missing.')
    await copy(source, staging)
    await copyFile(engine, join(staging, 'Game.exe'))
    await writeFile(join(staging, 'Start-Game.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nstart "" "%~dp0Game.exe"\r\n', 'utf8')
    await writeFile(join(staging, 'README.txt'), '이 폴더 전체를 압축 해제한 뒤 Game.exe 또는 Start-Game.cmd를 실행하세요.\r\n제작툴이나 localhost 서버 없이 실행됩니다.\r\n진행 기록은 이 실행 폴더의 savedata 폴더에 새로 저장됩니다. 기존 제작/게임 세이브는 포함되지 않습니다.\r\n이 실행본은 이 PC에 구성된 개인용 복원 시스템을 사용합니다.\r\n', 'utf8')
    signal?.throwIfAborted()
    const windows = process.env.SystemRoot ?? 'C:/Windows'
    await promisify(execFile)(join(windows, 'System32', 'tar.exe'), ['-a', '-c', '-f', temporaryZip, '-C', staging, '.'], { windowsHide: true, timeout: 300000, maxBuffer: 1024 * 1024, ...signal === undefined ? {} : { signal } })
    signal?.throwIfAborted()
    const handle = await open(temporaryZip, 'r')
    try { const header = Buffer.alloc(2); await handle.read(header, 0, 2, 0); if (!header.equals(Buffer.from('PK'))) throw new Error('Game archive creation failed.') } finally { await handle.close() }
    await rename(staging, output); await rename(temporaryZip, zip)
    return { archivePath: zip, bytes: (await stat(zip)).size, revision }
  } catch (error) {
    await rm(staging, { recursive: true, force: true }); await rm(temporaryZip, { force: true }); throw error
  }
}
