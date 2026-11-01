/** Select verified private local common-system templates without changing other profile settings. */
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from './profile-yaml.mjs'

const directory = process.env.VN_STUDIO_RECOVERED_SYSTEMS
const compiler = process.env.VN_STUDIO_RECOVERED_COMPILER
if (!process.env.DSH_HOME || !directory || !compiler || !isAbsolute(directory) || !isAbsolute(compiler)) throw new Error('DSH_HOME and absolute VN_STUDIO_RECOVERED_SYSTEMS / VN_STUDIO_RECOVERED_COMPILER are required.')
for (const language of ['ko', 'ja']) await access(join(directory, language, 'manifest.json'))
await access(compiler)
const file = join(resolve(process.env.DSH_HOME), 'profiles', 'web', 'cordis.patch.yml')
const rows = yaml.load(await readFile(file, 'utf8'))
if (!Array.isArray(rows)) throw new Error('The managed profile must be an array.')
const row = rows.find(row => row.id === 'vn-studio')
if (!row) throw new Error('Configure VN Studio before selecting recovered game systems.')
row.config = { ...row.config, recoveredSystemDirectory: resolve(directory), recoveredCompilerExecutable: resolve(compiler) }
const temporary = `${file}.${randomUUID()}.tmp`
await writeFile(temporary, yaml.dump(rows, { lineWidth: -1, noRefs: true }), { flag: 'wx' })
await rename(temporary, file)
console.log('Enabled private Korean/Japanese recovered game systems; other profile settings were preserved.')
