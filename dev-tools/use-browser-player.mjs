/** Retire private native-engine bindings while preserving authoring data and account settings. */
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from './profile-yaml.mjs'

if (!process.env.DSH_HOME) throw new Error('DSH_HOME is required.')
const file = join(resolve(process.env.DSH_HOME), 'profiles', 'web', 'cordis.patch.yml')
const rows = yaml.load(await readFile(file, 'utf8'))
if (!Array.isArray(rows)) throw new Error('The managed profile must be an array.')
const studio = rows.find(row => row.id === 'vn-studio')
if (!studio?.config) throw new Error('Configure VN Studio before selecting browser playback.')
for (const key of ['recoveredSystemDirectory', 'recoveredCompilerExecutable', 'compilerDirectory', 'fontFile']) delete studio.config[key]
const temporary = `${file}.${randomUUID()}.tmp`
await writeFile(temporary, yaml.dump(rows, { lineWidth: -1, noRefs: true }), { flag: 'wx' })
await rename(temporary, file)
console.log('Selected independent browser playback; projects, native saves and account settings were preserved.')
