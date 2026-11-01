/** Bind the managed VN profile to an explicitly selected installed Codex executable. */
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from './profile-yaml.mjs'

const executable = process.env.VN_STUDIO_CODEX_EXECUTABLE
if (!process.env.DSH_HOME || executable === undefined || !isAbsolute(executable)) throw new Error('DSH_HOME and an absolute VN_STUDIO_CODEX_EXECUTABLE are required.')
await access(executable)
const file = join(resolve(process.env.DSH_HOME), 'profiles', 'web', 'cordis.patch.yml')
const rows = yaml.load(await readFile(file, 'utf8'))
if (!Array.isArray(rows)) throw new Error('The managed profile must be an array.')
const row = rows.find(row => row.id === 'vn-studio')
if (row === undefined) throw new Error('Configure VN Studio before connecting Codex images.')
row.config = { ...row.config, codexImageEnabled: true, codexExecutable: resolve(executable) }
const temporary = `${file}.${randomUUID()}.tmp`
await writeFile(temporary, yaml.dump(rows, { lineWidth: -1, noRefs: true }), { flag: 'wx' })
await rename(temporary, file)
console.log('Enabled native images with the selected installed Codex CLI; other profile settings were preserved.')
