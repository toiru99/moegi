/** Private original-runtime compilation; copyrighted inputs remain in the configured local template. */
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'
import { AssetStore, assetExtension } from './assets.ts'
import { composeScene } from './compose-scene.ts'
import { parseProject, SceneStore } from './store.ts'
import type { NovelProject, NovelScene, UiSkinRole } from './types.ts'

const START_SCENE = '_vn_studio_start'
interface TemplateFile { path: string; bytes: number; sha256: string; role: string }
interface Template {
  language: 'ko' | 'ja'
  sourceDirectory: string
  runtimeDirectory: string
  configSource: string
  engineFile: string
  saveDirectoryName: string
  files: TemplateFile[]
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid recovered template manifest.')
  return value as Record<string, unknown>
}

function pathValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240 || isAbsolute(value) || value.includes('\\') || value.split('/').some(part => !/^[\p{L}\p{N}_. -]+$/u.test(part) || part === '.' || part === '..' || part.endsWith('.') || part.endsWith(' '))) throw new Error('Recovered template paths must be confined relative paths.')
  return value
}

function parseTemplate(value: unknown): Template {
  const row = object(value)
  if (row.schemaVersion !== 1 || row.privateLocalBase !== true || (row.language !== 'ko' && row.language !== 'ja') || !Array.isArray(row.files) || row.files.length === 0 || row.files.length > 4096) throw new Error('A validated private original-runtime template is required.')
  const template: Template = {
    language: row.language,
    sourceDirectory: pathValue(row.sourceDirectory), runtimeDirectory: pathValue(row.runtimeDirectory),
    configSource: pathValue(row.configSource), engineFile: pathValue(row.engineFile), saveDirectoryName: pathValue(row.saveDirectoryName),
    files: row.files.map((value: unknown) => {
      const file = object(value), path = pathValue(file.path)
      if (typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 128 * 1024 * 1024 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.role !== 'string') throw new Error('Invalid recovered template file integrity metadata.')
      return { path, bytes: file.bytes, sha256: file.sha256, role: file.role }
    }) }
  if (template.sourceDirectory.includes('/') || template.runtimeDirectory.includes('/') || template.sourceDirectory === template.runtimeDirectory || template.saveDirectoryName.includes('/')) throw new Error('Invalid recovered template directory paths.')
  const seen = new Set<string>()
  const allowedRoles = new Set(['common-source', 'gameexe-config', 'font', 'engine-data', 'engine-animation', 'original-engine-copy', 'original-system-sfx', 'original-ui-texture'])
  for (const file of template.files) {
    const folded = file.path.toLowerCase()
    if (seen.has(folded) || !allowedRoles.has(file.role)) throw new Error('Duplicate or unsupported recovered template file.')
    seen.add(folded)
    if (file.role === 'common-source') {
      if (!file.path.startsWith(`${template.sourceDirectory}/_`) || !/\.(ss|inc)$/.test(file.path) || file.path.slice(template.sourceDirectory.length + 1).includes('/')) throw new Error('Only recovered common sources may enter the template.')
    } else if (file.role === 'gameexe-config') {
      if (file.path !== template.configSource) throw new Error('Recovered template configuration does not match its manifest.')
    } else if (!file.path.startsWith(`${template.runtimeDirectory}/`) || file.path.toLowerCase().split('/').some(part => part.startsWith('savedata')) || /\.(ss|inc|pck|sav)$/i.test(file.path)) throw new Error('Recovered runtime files must exclude story archives and user saves.')
  }
  const required = [template.configSource, template.engineFile, ...['__app.ss', '_menu.ss', '_config.ss', '_storage.ss'].map(name => `${template.sourceDirectory}/${name}`)]
  if (required.some(path => !seen.has(path.toLowerCase())) || !template.files.some(file => file.role === 'common-source' && file.path.endsWith('.inc')) || !template.files.some(file => file.path === template.engineFile && file.role === 'original-engine-copy') || !template.files.some(file => file.role === 'font') || !template.files.some(file => file.role === 'original-ui-texture')) throw new Error('Recovered template is missing original common systems, engine, UI or fonts.')
  if (template.files.reduce((total, file) => total + file.bytes, 0) > 1024 * 1024 * 1024) throw new Error('Recovered template exceeds the private input byte limit.')
  return template
}

function confined(root: string, path: string): string {
  const target = resolve(root, path), rel = relative(root, target)
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Recovered runtime path is outside its configured root.')
  return target
}

async function canonicalDirectory(path: string): Promise<string> {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Recovered runtime directories must be canonical directories without symlinks.')
  const located = await realpath(path)
  if (relative(resolve(path), located) !== '') throw new Error('Recovered runtime directory is not canonical.')
  return located
}

async function regularFile(root: string, path: string): Promise<string> {
  const target = confined(root, path), parts = path.split('/')
  let cursor = root
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part)
    const info = await lstat(cursor)
    if (info.isSymbolicLink() || (index === parts.length - 1 ? !info.isFile() : !info.isDirectory())) throw new Error('Recovered template inputs must be confined regular files without symlinks.')
  }
  if (relative(target, await realpath(target)) !== '') throw new Error('Recovered template file is not canonical.')
  return target
}

function literal(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\\n')}"`
}

function sceneName(id: string): string { return `vn_s_${createHash('sha256').update(id).digest('hex').slice(0, 24)}` }
function mediaName(id: string): string { return `vn_a_${createHash('sha256').update(id).digest('hex').slice(0, 24)}` }

function sceneSource(scene: NovelScene, image: string): string {
  const output = ['#z00', '$$init_script()', '$$user_control_enabled()', 'script.set_auto_savepoint_on()', 'syscom.set_auto_mode_onoff_flag(0)', 'syscom.set_read_skip_onoff_flag(0)', 'script.set_ctrl_skip_disable()', `set_title(${literal(scene.title)})`,
    'if(1){close()}', `$$set_bg_object(back.object[1], ${literal(image)})`, '$$set_front_wipe_copy_bs_all(0)', '$$set_front_wipe_copy_cg(0)', '$$set_front_wipe_copy_cutin_all(0)', `$$execute_bg_offset_pos(back.object[1], ${literal(image)})`, '$$wipe(3)',
    scene.visual?.music === undefined ? 'bgm.stop()' : `bgm.play(${literal(mediaName(scene.visual.music))})`]
  if (scene.visual?.sound !== undefined) output.push(`$$se_play(${literal(mediaName(scene.visual.sound))}, 0, 0, 0, 0)`)
  for (const line of scene.lines) output.push('savepoint()', `set_namae(${literal(line.speaker)})`, `${literal(line.text)} r()`)
  if (scene.choices.length !== 0) {
    output.push('savepoint()', `a[10] = selbtn(${scene.choices.map(choice => literal(choice.text)).join(', ')})`, 'clear()')
    scene.choices.forEach((choice, index) => { output.push(`if(a[10] == ${index}){jump(${literal(sceneName(choice.target))})}`) })
  }
  output.push('#l1', 'timewait(100000000)', 'goto #l1')
  return `${output.join('\n')}\n`
}

function bindMenu(source: string, entry: string): string {
  let count = 0
  const bound = source.replace(/jump\("00_シナリオフロー",\s*(?:0+|0*5|50)\)/g, () => { count++; return `jump(${literal(entry)})` })
  if (count !== 3) throw new Error('Original title start bindings differ from the validated recovered template.')
  return bound
}

function silence(): Buffer {
  const data = Buffer.alloc(44 + 44100 * 4)
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(44100, 24)
  data.writeUInt32LE(176400, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40)
  return data
}

async function runCompiler(executable: string, args: string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  await new Promise<void>((resolveOperation, rejectOperation) => {
    let failure: Error | null = null
    const child = execFile(executable, args, {
      windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024, ...signal === undefined ? {} : { signal },
    }, (error) => { failure = error })
    child.once('close', () => {
      if (failure === null) resolveOperation()
      else rejectOperation(new Error('The recovered Siglus compiler failed; no runtime snapshot was published.', { cause: failure }))
    })
  })
  signal?.throwIfAborted()
}

interface SkinTexture {
  name: string
  width: number
  height: number
  count: number
  center: { x: number; y: number }
  replacementCut?: number
}

interface SkinBinding {
  role: UiSkinRole
  assetId: string
  file: string
  replacedCuts: number[]
  blankedCuts: number[]
  originalSha256: string
  sha256: string
}

function skinLayout(value: unknown, texture: SkinTexture) {
  const row = object(value), canvas = object(row.canvas), center = object(row.default_center)
  if (row.type !== 2 || canvas.width !== texture.width || canvas.height !== texture.height
    || center.x !== texture.center.x || center.y !== texture.center.y
    || !Array.isArray(row.cuts) || row.cuts.length !== texture.count) throw new Error('Original skin texture canvas, center or cut count changed.')
  return { type: 2, canvas: { width: texture.width, height: texture.height }, default_center: texture.center,
    cuts: row.cuts.map((value: unknown, index: number) => {
      const cut = object(value), source = object(cut.source_rect), destination = object(cut.canvas_rect)
      if (cut.index !== index || source.x !== 0 || source.y !== 0 || source.w !== texture.width || source.h !== texture.height
        || destination.x0 !== 0 || destination.y0 !== 0 || destination.x1 !== texture.width - 1 || destination.y1 !== texture.height - 1) {
        throw new Error('Original skin texture cut layout changed.')
      }
      if (cut.center !== undefined) {
        const override = object(cut.center)
        if (override.x !== texture.center.x || override.y !== texture.center.y) throw new Error('Original skin texture cut center changed.')
      }
      return { index, source: `skin_cut${String(index).padStart(3, '0')}.png`,
        source_rect: { x: 0, y: 0, w: texture.width, h: texture.height },
        canvas_rect: { x0: 0, y0: 0, x1: texture.width - 1, y1: texture.height - 1 },
        ...cut.center === undefined ? {} : { center: texture.center } }
    }) }
}

async function skinImage(role: UiSkinRole, bytes: Buffer): Promise<Buffer> {
  if (role === 'title') return sharp(bytes).resize(1920, 1080, { fit: 'cover' }).ensureAlpha().png().toBuffer()
  if (role === 'dialogue') return sharp(bytes).resize(1920, 1080, { fit: 'fill' })
    .extract({ left: 0, top: 788, width: 1920, height: 292 }).ensureAlpha().png().toBuffer()
  const image = sharp(bytes)
  if (!(await image.metadata()).hasAlpha) throw new Error('Cursor skin must have a transparent background.')
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width, top = info.height, right = -1, bottom = -1, transparent = false
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels + info.channels - 1] === 0) { transparent = true; continue }
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  if (!transparent || right < left || bottom < top) throw new Error('Cursor skin requires visible artwork surrounded by transparency.')
  return sharp(bytes).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(32, 32, { fit: 'contain', position: 'northwest', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().png().toBuffer()
}

async function applySkin(
  project: NovelProject, assets: AssetStore | undefined, template: Template, staging: string, compiler: string, signal?: AbortSignal,
): Promise<SkinBinding[]> {
  const requested: [UiSkinRole, string | undefined][] = [
    ['title', project.uiSkin?.title], ['cursor', project.uiSkin?.cursor], ['dialogue', project.uiSkin?.dialogue],
  ]
  const bindings: SkinBinding[] = []
  for (const [role, assetId] of requested) {
    if (assetId === undefined) continue
    if (assets === undefined) throw new Error('Project image storage is required for an authored UI skin.')
    const pixels = await skinImage(role, await assets.bytes(project.id, assetId))
    const textures: SkinTexture[] = role === 'title' ? [
      { name: '_menu_bg', width: 1920, height: 1080, count: 6, center: { x: 959, y: 539 }, replacementCut: 5 },
      { name: '_menu_character', width: 1920, height: 1080, count: 4, center: { x: 0, y: 0 } },
      { name: '_menu_title_logo', width: 802, height: 185, count: 1, center: { x: 400, y: 92 } },
    ] : role === 'cursor' ? [
      { name: '_sys_mousecursor01', width: 32, height: 32, count: 1, center: { x: 0, y: 0 }, replacementCut: 0 },
    ] : [
      { name: '_sys_mw_filter', width: 1920, height: 292, count: 1, center: { x: 0, y: 0 }, replacementCut: 0 },
    ]
    for (const texture of textures) {
      signal?.throwIfAborted()
      const file = `${template.runtimeDirectory}/g00/${texture.name}.g00`
      const original = template.files.find(entry => entry.path === file && entry.role === 'original-ui-texture')
      if (original === undefined) throw new Error(`Original skin texture is missing from the validated template: ${texture.name}`)
      const target = await regularFile(staging, file), work = confined(staging, `skin/${texture.name}`)
      await mkdir(work, { recursive: true })
      await runCompiler(compiler, ['-g', '--x', target, work], signal)
      const descriptorPath = await regularFile(work, `${texture.name}.type2.json`)
      if ((await lstat(descriptorPath)).size > 64 * 1024) throw new Error('Original skin texture descriptor exceeds its byte limit.')
      const layout = skinLayout(JSON.parse(await readFile(descriptorPath, 'utf8')), texture)
      const blank = await sharp({ create: {
        width: texture.width, height: texture.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
      } }).png().toBuffer()
      for (const cut of layout.cuts) await writeFile(join(work, cut.source), texture.replacementCut === cut.index ? pixels : blank)
      await writeFile(descriptorPath, JSON.stringify(layout, null, 2), 'utf8')
      await runCompiler(compiler, ['-g', '--c', '--type', '2', descriptorPath, target], signal)
      bindings.push({ role, assetId, file,
        replacedCuts: layout.cuts.filter(cut => cut.index === texture.replacementCut).map(cut => cut.index),
        blankedCuts: layout.cuts.filter(cut => cut.index !== texture.replacementCut).map(cut => cut.index), originalSha256: original.sha256,
        sha256: createHash('sha256').update(await readFile(target)).digest('hex') })
    }
  }
  return bindings
}

async function attachSaves(runtime: string, storage: string, id: string, saveDirectory: string): Promise<string> {
  const digest = createHash('sha256')
  const visit = async (directory: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const file = join(directory, name), info = await lstat(file)
      if (info.isSymbolicLink()) throw new Error('Compiled runtime must not contain linked inputs.')
      if (info.isDirectory()) await visit(file)
      else if (info.isFile()) { digest.update(`${relative(runtime, file).split(sep).join('/')}:`); digest.update(await readFile(file)) }
      else throw new Error('Compiled runtime must contain regular files.')
    }
  }
  await visit(runtime)
  const base = await canonicalDirectory(resolve(storage)), saveRoot = confined(base, `${id}.recovered-saves`)
  await mkdir(saveRoot, { recursive: true }); await canonicalDirectory(saveRoot)
  const target = confined(saveRoot, digest.digest('hex'))
  await mkdir(target, { recursive: true }); await canonicalDirectory(target)
  await symlink(target, join(runtime, saveDirectory), process.platform === 'win32' ? 'junction' : 'dir')
  return target
}

/** Build an atomic private snapshot using original common scripts, UI resources and engine; never substitute generated system screens.
 * @param project - Authored project; dialogue and names are emitted only as string literals.
 * @param revision - Nonnegative saved revision recorded with the snapshot.
 * @param root - Private output directory; each successful compilation gets a unique immutable child.
 * @param templateDirectory - Language-specific private template with a validated manifest.json.
 * @param compilerExecutable - Installed siglus-ssu executable; compilation failure leaves no playable snapshot.
 * @param projectDirectory - Existing project storage for media and compatible saves; absent means no imported media and saves under root.
 * @param signal - Optional caller cancellation; absent leaves only compiler process timeouts.
 * @returns Runtime working directory, copied original executable and its empty native argument list.
 */
export async function compileRecoveredProject(
  project: NovelProject, revision: number, root: string, templateDirectory: string, compilerExecutable: string,
  projectDirectory?: string, signal?: AbortSignal,
): Promise<{ directory: string; executable: string; args: string[] }> {
  signal?.throwIfAborted()
  const validated = parseProject(project)
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid recovered project revision.')
  if (validated.scenes.some(scene => scene.choices.length > 5)) throw new Error('The original choice UI supports at most five choices per scene.')
  if (validated.assets?.length && projectDirectory === undefined) throw new Error('Project media storage is required for recovered compilation.')
  const base = await canonicalDirectory(resolve(templateDirectory))
  const manifestPath = await regularFile(base, 'manifest.json')
  if ((await lstat(manifestPath)).size > 2 * 1024 * 1024) throw new Error('Recovered template manifest exceeds the byte limit.')
  const manifestBytes = await readFile(manifestPath)
  const template = parseTemplate(JSON.parse(manifestBytes.toString('utf8')))
  if (template.language !== validated.language) throw new Error('Recovered runtime language does not match the authored project.')
  const compiler = await realpath(compilerExecutable)
  if (!(await lstat(compiler)).isFile()) throw new Error('Recovered compiler must be a regular executable file.')
  await mkdir(root, { recursive: true })
  const buildRoot = await canonicalDirectory(resolve(root)), projectRoot = confined(buildRoot, validated.id)
  await mkdir(projectRoot, { recursive: true }); await canonicalDirectory(projectRoot)
  const output = confined(projectRoot, `revision-${revision}-${randomUUID()}`), staging = `${output}.building`
  await mkdir(staging)
  const source = join(staging, template.sourceDirectory), runtime = join(staging, template.runtimeDirectory)
  try {
    for (const file of template.files) {
      signal?.throwIfAborted()
      const original = await regularFile(base, file.path), info = await lstat(original)
      if (info.size !== file.bytes) throw new Error(`Recovered template integrity check failed: ${file.path}`)
      const bytes = await readFile(original)
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Recovered template hash check failed: ${file.path}`)
      const destination = confined(staging, file.path)
      await mkdir(dirname(destination), { recursive: true }); await writeFile(destination, bytes, { flag: 'wx' })
    }
    const menu = join(source, '_menu.ss')
    await writeFile(menu, bindMenu(await readFile(menu, 'utf8'), sceneName(validated.entry)), 'utf8')
    await writeFile(join(source, `${START_SCENE}.ss`), `#z00\n$$first_boot()\nset_title(${literal(validated.title)})\njump("_menu")\n`, 'utf8')
    const assetStore = projectDirectory === undefined ? undefined : new AssetStore(new SceneStore(projectDirectory), 20 * 1024 * 1024)
    await Promise.all(['g00', 'bgm', 'wav'].map(directory => mkdir(join(runtime, directory), { recursive: true })))
    const skinBindings = await applySkin(validated, assetStore, template, staging, compiler, signal)
    const entry = validated.scenes.find(scene => scene.id === validated.entry)
    if (entry === undefined) throw new Error('The authored entry scene is missing.')
    const entryMusic = entry.visual?.music
    const titleAsset = validated.assets?.find(asset => asset.id === entryMusic)
    const titleAudio = titleAsset === undefined ? { kind: 'generated-silence', file: 'bgm/BGM81.wav' } : { kind: 'project-asset', assetId: titleAsset.id, file: `bgm/BGM81.${assetExtension(titleAsset)}` }
    if (titleAsset === undefined) await writeFile(join(runtime, titleAudio.file), silence())
    else {
      if (assetStore === undefined) throw new Error('Project music storage is unavailable.')
      await writeFile(join(runtime, titleAudio.file), await assetStore.bytes(validated.id, titleAsset.id))
    }
    const music: string[] = []
    const used = new Set(validated.scenes.flatMap(scene => [scene.visual?.music, scene.visual?.sound]).filter(id => id !== undefined))
    for (const asset of validated.assets ?? []) {
      if (!used.has(asset.id)) continue
      if (assetStore === undefined) throw new Error('Project asset storage is unavailable.')
      const directory = asset.kind === 'music' ? 'bgm' : 'wav', name = mediaName(asset.id)
      await writeFile(join(runtime, directory, `${name}.${assetExtension(asset)}`), await assetStore.bytes(validated.id, asset.id))
      if (asset.kind === 'music') music.push(name)
    }
    for (const scene of validated.scenes) {
      signal?.throwIfAborted()
      const image = `${sceneName(scene.id)}_bg`
      const pixels = assetStore === undefined ? await sharp({ create: { width: 1920, height: 1080, channels: 4, background: '#243649' } }).png().toBuffer() : await sharp(await composeScene(validated, scene, assetStore)).resize(1920, 1080, { fit: 'fill' }).png().toBuffer()
      const png = join(staging, `${image}.png`)
      await writeFile(png, pixels)
      await runCompiler(compiler, ['-g', '--c', '--type', '0', png, join(runtime, 'g00', `${image}.g00`)], signal)
      await writeFile(join(source, `${sceneName(scene.id)}.ss`), sceneSource(scene, image), 'utf8')
    }
    const configPath = join(staging, template.configSource), originalConfig = await readFile(configPath, 'utf8')
    const config = originalConfig.split(/\r?\n/).filter(line => !/^\s*#(?:TWITTER[.\w]*|START_SCENE|CAPTION|GAMENAME|BGM\.(?:CNT|\d+))\s*=/i.test(line)).join('\n')
    const bgm = ['BGM81', ...music]
    await writeFile(configPath, `${config}\n#START_SCENE=${literal(START_SCENE)}\n#GAMENAME=${literal(validated.title)}\n#BGM.CNT=${bgm.length}\n${bgm.map((name, index) => `#BGM.${String(index).padStart(3, '0')}=${literal(name)},${literal(name)},0,-1,0`).join('\n')}\n`, 'utf8')
    await runCompiler(compiler, ['--const-profile', '0', '-c', '--serial', '--charset', 'utf8', source, join(runtime, 'Scene.pck')], signal)
    await runCompiler(compiler, ['-c', '--gei', '--charset', 'utf8', configPath, runtime], signal)
    for (const generated of ['Scene.pck', 'Gameexe.dat']) if ((await lstat(await regularFile(runtime, generated))).size === 0) throw new Error('Recovered compiler produced an empty runtime artifact.')
    const saveTarget = await attachSaves(runtime, projectDirectory ?? buildRoot, validated.id, template.saveDirectoryName)
    await writeFile(join(staging, 'authoring.json'), JSON.stringify({ revision, project: validated }, null, 2), 'utf8')
    await writeFile(join(staging, 'recovered-build.json'), JSON.stringify({ schemaVersion: 1, templateManifestSha256: createHash('sha256').update(manifestBytes).digest('hex'), language: template.language, entryScene: sceneName(validated.entry), startupScene: START_SCENE, sourceNames: Object.fromEntries(validated.scenes.map(scene => [scene.id, sceneName(scene.id)])), modifiedCommonSources: [{ path: `${template.sourceDirectory}/_menu.ss`, binding: 'Three original scenario-flow jumps redirected to authored entry.' }], titleAudio, skinBindings, saveTarget }, null, 2), 'utf8')
    signal?.throwIfAborted()
    await rename(staging, output)
    return { directory: join(output, template.runtimeDirectory), executable: join(output, template.engineFile), args: [] }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}
