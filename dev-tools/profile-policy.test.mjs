import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

test('deployment excludes legacy routes and search in actual preset declarations while preserving JS tags', async () => {
  const home = await mkdtemp(join(tmpdir(), 'vn-profile-'))
  const profile = join(home, 'profiles/web')
  try {
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'cordis.patch.yml'), '- id: sample\n  disabled: !!js process.platform === "test-only"\n')
    const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./configure-vn-profile.mjs', import.meta.url))], { env: { ...process.env, DSH_HOME: home } })
    await run()
    const text = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
    assert.match(text, /!!js/)
    const { default: yaml } = await import('./profile-yaml.mjs')
    const rows = yaml.load(text)
    for (const mode of ['standard', 'ptc', 'cordis']) {
      const row = rows.find(row => row.id === `preset-${mode}`)
      assert.ok(row)
      const search = row.config.plugins.find(row => row.name === '@deepseek-ai/dsh-tool-web')
      assert.equal(search.config.search, false)
      assert.equal(search.config.fetch, true)
    }
    assert.equal(rows.find(row => row.id === 'ui-settings-account').disabled, true)
    assert.deepEqual(rows.find(row => row.id === 'llm-pi-ai').config.excludedProviders, ['deepseek'])
    await run()
    assert.equal(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'), text)
  } finally {
    assert.ok(resolve(home).startsWith(resolve(tmpdir()) + sep))
    await rm(home, { recursive: true, force: true })
  }
})
