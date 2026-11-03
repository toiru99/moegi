/** Resolve managed Windows desktop CLI updates without overriding unrelated custom executables. */
import { lstat, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

async function regular(path: string): Promise<boolean> {
  try { const info = await lstat(path); return info.isFile() && !info.isSymbolicLink() }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) return false; throw error }
}

/** Keep an existing explicit selection; recover only known desktop-cache paths or the default command. */
export async function resolveCodexExecutable(configured: string, environment: { platform?: NodeJS.Platform; localAppData?: string } = {}): Promise<string> {
  if ((environment.platform ?? process.platform) !== 'win32') return configured
  if (isAbsolute(configured) && await regular(configured)) return configured
  const local = environment.localAppData ?? process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const bin = resolve(local, 'OpenAI', 'Codex', 'bin')
  const defaultCommand = configured === 'codex' || configured === 'codex.exe'
  if (!defaultCommand && (!isAbsolute(configured) || basename(configured).toLowerCase() !== 'codex.exe'
    || !/^[a-f0-9]{16,64}$/i.test(basename(dirname(configured))) || relative(bin, dirname(dirname(resolve(configured)))) !== '')) return configured
  let names: string[], canonical: string
  try { names = await readdir(bin); canonical = await realpath(bin) }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code))) return configured; throw error }
  const candidates: { file: string; modified: number }[] = []
  for (const name of names.filter(name => /^[a-f0-9]{16,64}$/i.test(name))) {
    const directory = join(bin, name), file = join(directory, 'codex.exe')
    if ((await lstat(directory)).isSymbolicLink() || !await regular(file)) continue
    const rel = relative(canonical, await realpath(file))
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) continue
    candidates.push({ file, modified: (await lstat(file)).mtimeMs })
  }
  candidates.sort((a, b) => b.modified - a.modified || b.file.localeCompare(a.file))
  return candidates[0]?.file ?? configured
}
