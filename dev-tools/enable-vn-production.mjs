/** Select the verified native systems runtime and default director in the managed development profile. */
import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from './profile-yaml.mjs'

if (!process.env.DSH_HOME) throw new Error('DSH_HOME is required.')
const file = join(resolve(process.env.DSH_HOME), 'profiles', 'web', 'cordis.patch.yml')
const rows = yaml.load(await readFile(file, 'utf8'))
if (!Array.isArray(rows)) throw new Error('The managed profile patch must be an array.')
const row = rows.find(row => row.id === 'vn-studio')
if (row === undefined) throw new Error('Enable the existing VN Studio profile first.')
const runtime = 'D:/VNStudio/native-runtime'
await Promise.all(['siglus_engine.exe', 'siglus_script_compiler.exe', 'siglus_scene_linker.exe'].map(file => access(join(runtime, file))))
row.config = { ...row.config, compilerDirectory: runtime }
const director = rows.find(row => row.id === 'vn-director')
if (director !== undefined) director.disabled = false
else rows.push({ id: 'vn-director', disabled: false })
const temporary = `${file}.${randomUUID()}.tmp`
await writeFile(temporary, yaml.dump(rows, { lineWidth: -1, noRefs: true }), { flag: 'wx' })
await rename(temporary, file)
console.log('Enabled the VN director and verified common-system native runtime.')
