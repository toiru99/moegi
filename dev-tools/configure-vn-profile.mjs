import { readFile, writeFile, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import yaml from './profile-yaml.mjs'

const home = process.env.DSH_HOME
if (!home) throw new Error('Set DSH_HOME to the local development profile directory.')
const file = join(resolve(home), 'profiles', 'web', 'cordis.patch.yml')
const rows = yaml.load(await readFile(file, 'utf8'))
if (!Array.isArray(rows)) throw new Error('The profile patch must be an array.')
const upsert = (id, update) => {
  const existing = rows.find(row => row.id === id)
  if (existing) update(existing)
  else { const row = { id }; update(row); rows.push(row) }
}
upsert('vn-studio', row => {
  row.disabled ??= false
  row.config = {
    projectDirectory: 'D:/VNStudio/projects', previewDirectory: 'D:/VNStudio/previews',
    compilerDirectory: 'D:/VNStudio/siglus-target/debug', fontFile: 'D:/VNStudio/fonts/NotoSansCJKkr-Regular.otf',
    ...row.config,
  }
})
upsert('llm-pi-ai', row => {
  row.config ??= {}
  row.config.providers = { 'openai-codex': {}, ...row.config.providers }
  row.config.providers['openai-codex'].displayName ??= 'ChatGPT'
  row.config.excludedProviders = [...new Set([...(row.config.excludedProviders ?? []), 'deepseek'])]
})
for (const id of ['deepseek-account', 'account-controller', 'ui-settings-account', 'ui-settings-web-search',
  'ui-brand-official', 'llm-deepseek', 'llm-deepseek-account', 'web-search-deepseek', 'web-deepseek-api',
  'message-feedback', 'ui-message-feedback', 'command-feedback']) upsert(id, row => { row.disabled = true })
upsert('web', row => { row.config = { fetchProvider: 'http' } })
upsert('tool-web', row => { row.config = { search: false, fetch: true, searchTimeoutMs: 60000 } })
for (const mode of ['standard', 'ptc', 'cordis']) {
  const source = new URL(`../packages/bundle/web-app/presets/${mode}.patch.yml`, import.meta.url)
  const definition = yaml.load(await readFile(source, 'utf8'))[0].insert.find(row => row.id === `preset-${mode}`)
  upsert(`preset-${mode}`, row => {
    row.config ??= definition.config
    const web = row.config.plugins.find(plugin => plugin.name === '@deepseek-ai/dsh-tool-web')
    if (!web) throw new Error(`The ${mode} preset has no web-tool declaration.`)
    web.config = { ...web.config, search: false, fetch: true }
  })
}
const temporary = `${file}.${randomUUID()}.tmp`
await writeFile(temporary, yaml.dump(rows, { lineWidth: -1, noRefs: true }), { flag: 'wx' })
await rename(temporary, file)
console.log('Saved novel studio and ChatGPT provider configuration in the managed web profile.')
