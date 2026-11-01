import { execFile } from 'node:child_process'
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { assertId, parseProject, SceneStore } from './store.ts'
import type { NovelProject, NovelScene } from './types.ts'
import { AssetStore, assetExtension } from './assets.ts'
import { composeScene } from './compose-scene.ts'
import { NATIVE_TITLE_SCENE, nativeSavepoint, nativeScenePrologue, nativeSystemAssets, nativeSystemConfigLines, nativeTitleSource } from './native-template.ts'
import { attachNativeSaves } from './native-save-storage.ts'

const execute = promisify(execFile)

/** Quote authored text as a Siglus string, never as source statements. */
function literal(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '').replaceAll('\n', '\\n').replaceAll('\t', ' ')}"`
}

interface Presentation { image?: string; music?: string; sound?: string }

/** Emit literal text, declared media and named scene choices. */
export function sceneSource(scene: NovelScene, fontName = 'Malgun Gothic', presentation?: Presentation): string {
  assertId(scene.id)
  const output = ['#z00', `script.set_font_name(${literal(fontName)})`]
  if (presentation?.image !== undefined) output.push(`front.object[0].create(${literal(presentation.image)}, 1)`)
  if (presentation !== undefined) output.push(presentation.music === undefined ? 'bgm.stop()' : `bgm.play(${literal(presentation.music)})`)
  if (presentation?.sound !== undefined) output.push(`pcm.play(${literal(presentation.sound)})`)
  output.push(...nativeScenePrologue(), 'open()')
  for (const line of scene.lines) {
    output.push(nativeSavepoint(), `print(${literal(`${line.speaker === '' ? '' : `【${line.speaker}】`}${line.text}`)})`, 'r()')
  }
  if (scene.choices.length > 0) {
    // SELBTN supplies rendered choices and returns their zero-based index.
    output.push(nativeSavepoint(), `a[0] = selbtn(${scene.choices.map(choice => literal(choice.text)).join(', ')})`, 'switch (a[0]) {')
    scene.choices.forEach((choice, index) => { assertId(choice.target); output.push(`case (${index}) jump(${literal(choice.target)})`) })
    output.push('}')
  } else {
    output.push('timewait(100000000)')
  }
  return `${output.join('\n')}\n`
}

/** Build a fresh snapshot. A supplied signal cancels compiler children; without one only per-process timeouts apply. */
export async function compileProject(project: NovelProject, revision: number, root: string, compilerDirectory: string, fontFile: string, signal?: AbortSignal, projectDirectory?: string): Promise<string> {
  signal?.throwIfAborted()
  const validated = parseProject(project)
  if (validated.scenes.some(scene => scene.id === NATIVE_TITLE_SCENE)) throw new Error('vn_studio_title is reserved for the native title screen.')
  if (validated.assets?.length && projectDirectory === undefined) throw new Error('Project media storage is required for illustrated compilation.')
  const assets = projectDirectory === undefined ? undefined : new AssetStore(new SceneStore(projectDirectory), 20 * 1024 * 1024)
  const fontName = basename(fontFile, extname(fontFile))
  const buildRoot = resolve(root)
  const output = resolve(buildRoot, validated.id, `revision-${revision}-${randomUUID()}`)
  const staging = `${output}.building`
  if (!staging.startsWith(`${buildRoot}${sep}`)) throw new Error('Build directory escapes the configured root.')
  await mkdir(staging, { recursive: true })
  const run = async (executable: string, args: string[]): Promise<void> => {
    const operation = execute(join(compilerDirectory, executable), args, {
      windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024,
      ...signal === undefined ? {} : { signal },
    })
    const closed = new Promise<void>(resolve => { operation.child.once('close', () => { resolve() }) })
    try { await operation }
    finally { await closed }
  }
  try {
    await mkdir(join(staging, 'font'))
    await copyFile(fontFile, join(staging, 'font', `authoring${extname(fontFile)}`))
    const music: string[] = []
    await mkdir(join(staging, 'g00'))
    for (const asset of await nativeSystemAssets(fontFile, validated.language)) await writeFile(join(staging, 'g00', `${asset.name}.png`), asset.bytes)
    const usedAudio = new Set(validated.scenes.flatMap(scene => [scene.visual?.music, scene.visual?.sound]).filter(value => value !== undefined))
    if (assets !== undefined) {
      await Promise.all(['bgm', 'wav'].map(directory => mkdir(join(staging, directory))))
      for (const asset of validated.assets ?? []) {
        signal?.throwIfAborted()
        if (!usedAudio.has(asset.id)) continue
        const directory = asset.kind === 'music' ? 'bgm' : 'wav'
        await writeFile(join(staging, directory, `${asset.id}.${assetExtension(asset)}`), await assets.bytes(validated.id, asset.id))
        if (asset.kind === 'music') music.push(asset.id)
      }
    }
    const scenes: string[] = []
    const titlePath = join(staging, `${NATIVE_TITLE_SCENE}.ss`), titleDat = join(staging, `${NATIVE_TITLE_SCENE}.dat`)
    await writeFile(titlePath, nativeTitleSource({ title: validated.title, startScene: validated.entry, fontName, language: validated.language }), 'utf8')
    await run('siglus_script_compiler.exe', ['compile', titlePath, '-o', titleDat, '--encoding', 'utf8'])
    scenes.push(titleDat)
    for (const scene of validated.scenes) {
      signal?.throwIfAborted()
      const path = join(staging, `${scene.id}.ss`)
      const compiled = join(staging, `${scene.id}.dat`)
      let presentation: Presentation | undefined
      if (assets !== undefined && validated.scenes.some(scene => scene.visual !== undefined)) {
        const image = `stage_${scene.id}`
        await writeFile(join(staging, 'g00', `${image}.png`), await composeScene(validated, scene, assets))
        presentation = { image, ...scene.visual?.music === undefined ? {} : { music: scene.visual.music }, ...scene.visual?.sound === undefined ? {} : { sound: scene.visual.sound } }
      }
      await writeFile(path, sceneSource(scene, fontName, presentation), 'utf8')
      await run('siglus_script_compiler.exe', ['compile', path, '-o', compiled, '--encoding', 'utf8'])
      scenes.push(compiled)
    }
    await run('siglus_scene_linker.exe', ['link', ...scenes, '-o', join(staging, 'Scene.pck'), '--no-compress'])
    const bgm = `#BGM.CNT=${music.length}\n${music.map((id, index) => `#BGM.${String(index).padStart(3, '0')}=${literal(id)},${literal(id)},0,-1,0`).join('\n')}\n`
    await writeFile(join(staging, 'Gameexe.ini'), `#CAPTION=${literal(validated.title)}\n#SCREEN_SIZE=1280,720\n#CONFIG.FONT.TYPE=3\n#CONFIG.FONT.NAME=${literal(fontName)}\n${nativeSystemConfigLines(validated.id).join('\n')}\n#SELBTN.000.BASE_POS=120,80\n#SELBTN.000.REP_POS=0,36\n#SELBTN.000.OPEN_ANIME=0,0\n#SELBTN.000.CLOSE_ANIME=0,0\n#SELBTN.000.DECIDE_ANIME=0,0\n${bgm}`, 'utf8')
    await writeFile(join(staging, 'authoring.json'), JSON.stringify({ revision, project: validated }, null, 2), 'utf8')
    await attachNativeSaves(staging, projectDirectory ?? buildRoot, validated.id, join(compilerDirectory, 'siglus_engine.exe'))
    signal?.throwIfAborted()
    await rename(staging, output)
    return output
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}
