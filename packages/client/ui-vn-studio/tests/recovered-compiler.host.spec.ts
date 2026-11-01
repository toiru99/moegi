import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { AssetStore } from '../src/assets.ts'
import { renderMusic } from '../src/music.ts'
import { SceneStore } from '../src/store.ts'
import type { NovelProject } from '../src/types.ts'
import { compileRecoveredProject } from '../src/recovered-compiler.ts'

const compilerFailure = vi.hoisted(() => ({ error: undefined as Error | undefined }))

// SSU is a private native dependency; retain real manifest, snapshot and save filesystem operations.
vi.mock('node:child_process', () => ({
  execFile: (_file: string, args: string[], _options: object, callback: (error: Error | null) => void) => {
    const child = new EventEmitter()
    void (async () => {
      await Promise.resolve()
      try {
        if (compilerFailure.error !== undefined) throw compilerFailure.error
        const target = args.at(-1)!
        if (args.includes('--gei')) await writeFile(join(target, 'Gameexe.dat'), 'compiled-config')
        else if (args.includes('-g') && args.includes('--x')) {
          const input = args.at(-2)!, layout: unknown = JSON.parse(await readFile(input, 'utf8'))
          await mkdir(target, { recursive: true })
          await writeFile(join(target, `${basename(input, '.g00')}.type2.json`), JSON.stringify(layout))
        } else if (args.includes('-g')) await writeFile(target, await readFile(args.at(-2)!))
        else {
          const source = args.at(-2)!
          const names = (await readdir(source)).sort()
          await writeFile(target, Buffer.concat(await Promise.all(names.map(name => readFile(join(source, name))))))
        }
        callback(null)
      } catch (error) { callback(error instanceof Error ? error : new Error(String(error))) }
      finally { child.emit('close', 0, null) }
    })()
    return child
  },
}))

const roots: string[] = []
afterEach(async () => {
  compilerFailure.error = undefined
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

const project = (): NovelProject => ({ id: 'story', title: '새 작품', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: '첫 장면', lines: Array.from({ length: 97 }, (_, index) => ({ speaker: '가이드', text: index === 0 ? '안녕!\n"); jump("evil") // \\끝' : `새 대사 ${index}` })), choices: [
    { text: '첫 번째', target: 'left' }, { text: '두 번째', target: 'right' },
  ] },
  { id: 'left', title: '왼쪽', lines: [{ speaker: '', text: '왼쪽 결과' }], choices: [] },
  { id: 'right', title: '오른쪽', lines: [{ speaker: '', text: '오른쪽 결과' }], choices: [] },
] })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vn-recovered-')); roots.push(root)
  const base = join(root, 'base'), builds = join(root, 'builds'), storage = join(root, 'projects')
  await mkdir(storage, { recursive: true })
  const contents: Record<string, string> = {
    'src/__app.ss': 'original app macros\n',
    'src/__decompiled.inc': 'original declarations\n',
    'src/_config.ss': 'original config UI\n',
    'src/_storage.ss': 'original save/load UI\n',
    'src/_menu.ss': '#z00\njump("00_シナリオフロー", 0)\njump("00_シナリオフロー", 5)\njump("00_シナリオフロー", 50)\n',
    'runtime/Original.exe': 'original engine',
    'runtime/g00/_sys_sel_btn.g00': 'original choice art',
    'runtime/font/original.ttf': 'original glyph coverage',
    'config/Gameexe.ini': '#START_SCENE="old"\n#CAPTION="original"\n#SCREEN_SIZE=1920,1080\n#TWITTER.CONSUMER_KEY="private-secret"\n#BGM.CNT=0\n#MWND.000.POS=0,700\n',
  }
  const files = []
  for (const [path, content] of Object.entries(contents)) {
    await mkdir(dirname(join(base, path)), { recursive: true }); await writeFile(join(base, path), content)
    files.push({ path, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex'),
      role: path.startsWith('src/') ? 'common-source' : path.endsWith('.ini') ? 'gameexe-config' : path.endsWith('.exe') ? 'original-engine-copy' : path.endsWith('.g00') ? 'original-ui-texture' : 'font' })
  }
  const manifest = { schemaVersion: 1, language: 'ko', privateLocalBase: true, sourceDirectory: 'src', runtimeDirectory: 'runtime', configSource: 'config/Gameexe.ini', engineFile: 'runtime/Original.exe', saveDirectoryName: 'savedata_ko', files }
  await writeFile(join(base, 'manifest.json'), JSON.stringify(manifest))
  return { root, base, builds, storage, manifest, contents }
}

async function skinFixture() {
  const f = await fixture(), scenes = new SceneStore(f.storage), assets = new AssetStore(scenes)
  const slots = [
    ['_menu_bg', 1920, 1080, 6, 959, 539], ['_menu_character', 1920, 1080, 4, 0, 0],
    ['_menu_title_logo', 802, 185, 1, 400, 92], ['_sys_mousecursor01', 32, 32, 1, 0, 0],
    ['_sys_mw_filter', 1920, 292, 1, 0, 0],
  ] as const
  for (const [name, width, height, count, x, y] of slots) {
    const value = JSON.stringify({ type: 2, canvas: { width, height }, default_center: { x, y },
      cuts: Array.from({ length: count }, (_, index) => ({ index, source: `original-${index}.png`,
        source_rect: { x: 0, y: 0, w: width, h: height }, canvas_rect: { x0: 0, y0: 0, x1: width - 1, y1: height - 1 } })) })
    const path = `runtime/g00/${name}.g00`
    await writeFile(join(f.base, path), value)
    f.manifest.files.push({ path, bytes: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex'), role: 'original-ui-texture' })
  }
  await writeFile(join(f.base, 'manifest.json'), JSON.stringify(f.manifest))
  await scenes.create('story', '새 작품', 'ko')
  let saved = await assets.import('story', 0, 'background', 'AI title', await sharp({ create: {
    width: 1920, height: 1080, channels: 4, background: '#ff0000',
  } }).png().toBuffer())
  const cursor = await sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 16, height: 32, channels: 4, background: '#00ff00' } }).png().toBuffer(), left: 48, top: 16 }]).png().toBuffer()
  saved = await assets.import('story', saved.revision, 'background', 'AI cursor', cursor)
  const dialogue = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 1920, height: 292, channels: 4, background: '#0000ff' } }).png().toBuffer(), left: 0, top: 788 }]).png().toBuffer()
  saved = await assets.import('story', saved.revision, 'background', 'AI dialogue', dialogue)
  const authored = project(); authored.assets = saved.project.assets!
  const [title, pointer, frame] = authored.assets!
  authored.uiSkin = { version: 1, brief: 'Own generated theme', title: title!.id, cursor: pointer!.id, dialogue: frame!.id }
  await scenes.save('story', saved.revision, authored, 'manual')
  return { ...f, authored, scenes }
}

it('uses the original menus and art, preserves all authored lines and escapes text into separate hashed scenes', async () => {
  const f = await fixture()
  const result = await compileRecoveredProject(project(), 2, f.builds, f.base, process.execPath, f.storage)
  expect(result.args).toEqual([])
  expect(result.executable).toBe(join(result.directory, 'Original.exe'))
  expect(await readFile(join(result.directory, 'g00/_sys_sel_btn.g00'), 'utf8')).toBe('original choice art')
  const snapshot = dirname(result.directory), names = await readdir(join(snapshot, 'src'))
  const storyNames = names.filter(name => /^vn_s_[a-f0-9]{24}\.ss$/.test(name))
  expect(storyNames).toHaveLength(3)
  const sources = await Promise.all(storyNames.map(name => readFile(join(snapshot, 'src', name), 'utf8')))
  const start = sources.find(source => source.includes('새 대사 96'))!
  expect(start.match(/set_namae\(/g)).toHaveLength(97)
  expect(start).toContain('set_namae("가이드")\n"안녕!\\n\\"); jump(\\"evil\\") // \\\\끝" r()')
  expect(start).toContain('a[10] = selbtn("첫 번째", "두 번째")\nclear()')
  for (const name of storyNames.filter(name => !sources[storyNames.indexOf(name)]!.includes('새 대사 96'))) expect(start).toContain(`jump("${name.slice(0, -3)}")`)
  expect(await readFile(join(snapshot, 'src/_storage.ss'), 'utf8')).toBe(f.contents['src/_storage.ss'])
  expect(await readFile(join(snapshot, 'src/_config.ss'), 'utf8')).toBe(f.contents['src/_config.ss'])
  const menu = await readFile(join(snapshot, 'src/_menu.ss'), 'utf8')
  expect(menu).not.toContain('00_シナリオフロー')
  expect((await readFile(join(snapshot, 'src/_vn_studio_start.ss'), 'utf8'))).toContain('jump("_menu")')
  const config = await readFile(join(snapshot, 'config/Gameexe.ini'), 'utf8')
  expect(config).toContain('#START_SCENE="_vn_studio_start"')
  expect(config).toContain('#GAMENAME="새 작품"')
  expect(config).not.toContain('#CAPTION')
  expect(config).toContain('#MWND.000.POS=0,700')
  expect(config).not.toContain('private-secret')
  expect(config).not.toContain('TWITTER')
  expect(await readdir(result.directory)).toContain('Gameexe.dat')
  expect(await readdir(f.builds)).toEqual(['story'])
})

it('refuses a tampered or traversing template before publishing a runtime snapshot', async () => {
  const f = await fixture()
  await writeFile(join(f.base, 'runtime/g00/_sys_sel_btn.g00'), 'tampered')
  await expect(compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage)).rejects.toThrow(/integrity|hash/i)
  f.manifest.files[0]!.path = '../outside.ss'
  await writeFile(join(f.base, 'manifest.json'), JSON.stringify(f.manifest))
  await expect(compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage))
    .rejects.toThrow(/relative|confined|path/i)
})

it('shares only compatible project saves and never copies old template save data', async () => {
  const f = await fixture()
  await mkdir(join(f.base, 'runtime/savedata_ko'))
  await writeFile(join(f.base, 'runtime/savedata_ko/save0000.sav'), 'original user save')
  const first = await compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage)
  expect(await readdir(join(first.directory, 'savedata_ko'))).toEqual([])
  await writeFile(join(first.directory, 'savedata_ko/save0000.sav'), 'authored save')
  const identical = await compileRecoveredProject(project(), 2, f.builds, f.base, process.execPath, f.storage)
  expect(await realpath(join(identical.directory, 'savedata_ko'))).toBe(await realpath(join(first.directory, 'savedata_ko')))
  expect(await readFile(join(identical.directory, 'savedata_ko/save0000.sav'), 'utf8')).toBe('authored save')
  const edited = project(); edited.scenes[0]!.lines[0]!.text = '새 버전'
  const changed = await compileRecoveredProject(edited, 3, f.builds, f.base, process.execPath, f.storage)
  expect(await realpath(join(changed.directory, 'savedata_ko'))).not.toBe(await realpath(join(first.directory, 'savedata_ko')))
  expect(await readdir(join(changed.directory, 'savedata_ko'))).toEqual([])
})

it('rejects linked template directories and cancelled builds without a fallback runtime', async () => {
  const f = await fixture(), linked = join(f.root, 'linked')
  await symlink(f.base, linked, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(compileRecoveredProject(project(), 1, f.builds, linked, process.execPath, f.storage))
    .rejects.toThrow(/symlink|regular|canonical/i)
  const signal = AbortSignal.abort(new Error('cancelled'))
  await expect(compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage, signal)).rejects.toThrow('cancelled')
})

it('uses authored entry music for the original title and converts authored artwork to the original full canvas', async () => {
  const f = await fixture(), store = new SceneStore(f.storage), assets = new AssetStore(store)
  await store.create('story', '새 작품', 'ko')
  const audio = renderMusic({ tempo: 120, instrument: 'piano', notes: [{ midi: 60, beat: 0, duration: 1, velocity: 0.7 }] })
  let saved = await assets.import('story', 0, 'music', '새 음악', audio)
  saved = await assets.import('story', saved.revision, 'background', '새 배경', await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#ff0000' } }).png().toBuffer())
  const authored = project(); authored.assets = saved.project.assets!
  authored.scenes[0]!.visual = { music: saved.project.assets![0]!.id, background: saved.project.assets![1]!.id, characters: [] }
  await store.save('story', saved.revision, authored, 'manual')
  const result = await compileRecoveredProject(authored, 3, f.builds, f.base, process.execPath, f.storage)
  expect(createHash('sha256').update(await readFile(join(result.directory, 'bgm/BGM81.wav'))).digest('hex')).toBe(createHash('sha256').update(audio).digest('hex'))
  const report = JSON.parse(await readFile(join(dirname(result.directory), 'recovered-build.json'), 'utf8')) as {
    titleAudio: { kind: string; assetId: string; file: string }
    sourceNames: { start: string }
  }
  expect(report.titleAudio).toEqual({ kind: 'project-asset', assetId: saved.project.assets![0]!.id, file: 'bgm/BGM81.wav' })
  const graphic = (await readdir(join(result.directory, 'g00'))).find(name => name.startsWith(report.sourceNames.start))!
  const info = await sharp(await readFile(join(result.directory, 'g00', graphic))).metadata()
  expect([info.width, info.height]).toEqual([1920, 1080])
})

it('binds original Japanese title starts with zero-padded scene labels to authored content', async () => {
  const f = await fixture(), menu = f.manifest.files.find(file => file.path === 'src/_menu.ss')!
  const header = f.manifest.files.find(file => file.path === 'src/__decompiled.inc')!
  await rename(join(f.base, header.path), join(f.base, 'src/___app_macro.inc')); header.path = 'src/___app_macro.inc'
  const text = f.contents['src/_menu.ss']!.replace(', 0)', ', 00)').replace(', 5)', ', 05)')
  await writeFile(join(f.base, menu.path), text)
  menu.bytes = Buffer.byteLength(text); menu.sha256 = createHash('sha256').update(text).digest('hex')
  await writeFile(join(f.base, 'manifest.json'), JSON.stringify({ ...f.manifest, language: 'ja', saveDirectoryName: 'savedata' }))
  const authored = project(); authored.language = 'ja'
  const result = await compileRecoveredProject(authored, 1, f.builds, f.base, process.execPath, f.storage)
  expect(await readFile(join(dirname(result.directory), 'src/_menu.ss'), 'utf8')).not.toContain('00_シナリオフロー')
  expect(await readdir(result.directory)).toContain('savedata')
})

it('preserves authored tabs without emitting unsupported SSU escape sequences', async () => {
  const f = await fixture(), authored = project()
  authored.scenes[0]!.lines[0]!.text = '탭\t뒤 대사'
  const result = await compileRecoveredProject(authored, 1, f.builds, f.base, process.execPath, f.storage)
  expect(await readFile(join(result.directory, 'Scene.pck'), 'utf8')).toContain('"탭\t뒤 대사" r()')
})

it('removes the unpublished snapshot when the private compiler fails', async () => {
  const f = await fixture()
  compilerFailure.error = new Error('private compiler exited unsuccessfully')
  await expect(compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage)).rejects.toThrow(/compiler failed/)
  expect(await readdir(join(f.builds, 'story'))).toEqual([])
  expect(await readdir(f.storage)).toEqual([])
})

it('isolates saves when the original glyph resources change', async () => {
  const f = await fixture()
  const first = await compileRecoveredProject(project(), 1, f.builds, f.base, process.execPath, f.storage)
  const font = f.manifest.files.find(file => file.role === 'font')!, replacement = 'updated original glyph coverage'
  await writeFile(join(f.base, font.path), replacement)
  font.bytes = Buffer.byteLength(replacement); font.sha256 = createHash('sha256').update(replacement).digest('hex')
  await writeFile(join(f.base, 'manifest.json'), JSON.stringify(f.manifest))
  const changed = await compileRecoveredProject(project(), 2, f.builds, f.base, process.execPath, f.storage)
  expect(await realpath(join(changed.directory, 'savedata_ko'))).not.toBe(await realpath(join(first.directory, 'savedata_ko')))
})

it('binds admitted AI skin images to original texture cuts while preserving native button atlases and common code', async () => {
  const f = await skinFixture()
  const result = await compileRecoveredProject(f.authored, 1, f.builds, f.base, process.execPath, f.storage)
  const snapshot = dirname(result.directory)
  const layout = JSON.parse(await readFile(join(result.directory, 'g00/_menu_bg.g00'), 'utf8')) as {
    canvas: { width: number; height: number }
    default_center: { x: number; y: number }
    cuts: { index: number; source: string; canvas_rect: object; source_rect: object }[]
  }
  expect(layout.canvas).toEqual({ width: 1920, height: 1080 })
  expect(layout.default_center).toEqual({ x: 959, y: 539 })
  expect(layout.cuts.map(cut => cut.index)).toEqual([0, 1, 2, 3, 4, 5])
  for (const cut of layout.cuts) {
    expect(cut.canvas_rect).toEqual({ x0: 0, y0: 0, x1: 1919, y1: 1079 })
    expect(cut.source_rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
    const { data } = await sharp(join(snapshot, 'skin/_menu_bg', cut.source)).raw().toBuffer({ resolveWithObject: true })
    expect([...data.subarray(0, 4)]).toEqual(cut.index === 5 ? [255, 0, 0, 255] : [0, 0, 0, 0])
  }
  const cursorLayout = JSON.parse(await readFile(join(result.directory, 'g00/_sys_mousecursor01.g00'), 'utf8')) as {
    default_center: object
    cuts: { source: string }[]
  }
  expect(cursorLayout.default_center).toEqual({ x: 0, y: 0 })
  const cursor = await sharp(join(snapshot, 'skin/_sys_mousecursor01', cursorLayout.cuts[0]!.source)).raw().toBuffer()
  expect([...cursor.subarray(0, 4)]).toEqual([0, 255, 0, 255])
  expect([...cursor.subarray(31 * 4, 32 * 4)]).toEqual([0, 0, 0, 0])
  const dialogueLayout = JSON.parse(await readFile(join(result.directory, 'g00/_sys_mw_filter.g00'), 'utf8')) as {
    canvas: object
    cuts: { source: string }[]
  }
  expect(dialogueLayout.canvas).toEqual({ width: 1920, height: 292 })
  const dialogue = await sharp(join(snapshot, 'skin/_sys_mw_filter', dialogueLayout.cuts[0]!.source)).raw().toBuffer()
  expect([...dialogue.subarray(0, 4)]).toEqual([0, 0, 255, 255])
  expect(await readFile(join(result.directory, 'g00/_sys_sel_btn.g00'), 'utf8')).toBe('original choice art')
  expect(await readFile(join(snapshot, 'src/_storage.ss'), 'utf8')).toBe(f.contents['src/_storage.ss'])
  const report = JSON.parse(await readFile(join(snapshot, 'recovered-build.json'), 'utf8')) as { skinBindings: { file: string }[] }
  expect(report.skinBindings.map(binding => basename(binding.file)).sort()).toEqual([
    '_menu_bg.g00', '_menu_character.g00', '_menu_title_logo.g00', '_sys_mousecursor01.g00', '_sys_mw_filter.g00',
  ].sort())
})

it('fails missing skin images or changed original cut layouts without publishing a substitute', async () => {
  const f = await skinFixture()
  const missing = { ...f.authored, uiSkin: { version: 1 as const, brief: 'Missing', title: 'asset_missing' } }
  await expect(compileRecoveredProject(missing, 1, f.builds, f.base, process.execPath, f.storage)).rejects.toThrow(/skin|asset/i)
  const file = f.manifest.files.find(file => file.path === 'runtime/g00/_menu_bg.g00')!
  const invalid = JSON.stringify({ type: 2, canvas: { width: 1920, height: 1080 }, default_center: { x: 959, y: 539 }, cuts: [] })
  await writeFile(join(f.base, file.path), invalid)
  file.bytes = Buffer.byteLength(invalid); file.sha256 = createHash('sha256').update(invalid).digest('hex')
  await writeFile(join(f.base, 'manifest.json'), JSON.stringify(f.manifest))
  await expect(compileRecoveredProject(f.authored, 1, f.builds, f.base, process.execPath, f.storage)).rejects.toThrow(/cut|layout|skin/i)
  expect(await readdir(join(f.builds, 'story'))).toEqual([])
})
