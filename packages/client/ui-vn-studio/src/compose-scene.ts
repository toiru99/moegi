import sharp, { type OverlayOptions } from 'sharp'
import type { AssetStore } from './assets.ts'
import type { NovelProject, NovelScene } from './types.ts'
import { characterRect, STAGE_HEIGHT, STAGE_WIDTH } from './stage.ts'

/** Rasterize the same cover background and bottom-centred placements shown by the authoring stage. */
export async function composeScene(project: NovelProject, scene: NovelScene, assets: AssetStore): Promise<Buffer> {
  const background = scene.visual?.background
  const base = background === undefined
    ? await sharp({ create: { width: STAGE_WIDTH, height: STAGE_HEIGHT, channels: 4, background: '#243649' } }).png().toBuffer()
    : await sharp(await assets.bytes(project.id, background)).resize(STAGE_WIDTH, STAGE_HEIGHT, { fit: 'cover' }).png().toBuffer()
  const overlays: OverlayOptions[] = []
  for (const placement of scene.visual?.characters ?? []) {
    const image = project.assets?.find(asset => asset.id === placement.asset)
    if (!image?.width || !image.height) throw new Error('Character image dimensions are missing.')
    const rect = characterRect({ width: image.width, height: image.height }, placement)
    if (rect.width > 8192 || rect.height > 4096 || rect.width * rect.height > 4096 * 4096) throw new Error('Character placement exceeds the intermediate image size limit.')
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top)
    const right = Math.min(STAGE_WIDTH, rect.left + rect.width), bottom = Math.min(STAGE_HEIGHT, rect.top + rect.height)
    if (right <= left || bottom <= top) continue
    const input = await sharp(await assets.bytes(project.id, image.id)).resize(rect.width, rect.height, { fit: 'fill' })
      .extract({ left: left - rect.left, top: top - rect.top, width: right - left, height: bottom - top }).png().toBuffer()
    overlays.push({ input, left, top })
  }
  return sharp(base).composite(overlays).png().toBuffer()
}
