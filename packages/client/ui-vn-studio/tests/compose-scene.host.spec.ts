import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { SceneStore } from '../src/store.ts'
import { AssetStore } from '../src/assets.ts'
import { composeScene } from '../src/compose-scene.ts'

it('uses the same bottom-centre placement and clipped edges as the authoring stage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vn-composite-'))
  try {
    const scenes = new SceneStore(root), assets = new AssetStore(scenes)
    await scenes.create('demo', 'Stage', 'ko')
    const image = async (color: string) => sharp({ create: { width: 100, height: 100, channels: 4, background: color } }).png().toBuffer()
    let saved = await assets.import('demo', 0, 'background', 'Red room', await image('#ff0000'))
    saved = await assets.import('demo', saved.revision, 'character', 'Blue character', await image('#0000ff'))
    const [background, character] = saved.project.assets!
    const scene = { ...saved.project.scenes[0]!, visual: { background: background!.id, characters: [{ asset: character!.id, x: 0, y: 100, scale: 0.5 }] } }
    const png = await composeScene(saved.project, scene, assets)
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([1280, 720])
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)]
    expect(pixel(50, 500)).toEqual([0, 0, 255])
    expect(pixel(300, 500)).toEqual([255, 0, 0])
    expect(pixel(50, 100)).toEqual([255, 0, 0])
    scene.visual.characters[0]!.y = 0
    const above = await sharp(await composeScene(saved.project, scene, assets)).removeAlpha().raw().toBuffer()
    expect([...above.subarray(0, 3)]).toEqual([255, 0, 0])
  } finally { await rm(root, { recursive: true, force: true }) }
})
