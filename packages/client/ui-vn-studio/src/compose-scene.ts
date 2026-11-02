import sharp, { type OverlayOptions } from 'sharp'
import type { AssetStore } from './assets.ts'
import type { NovelProject, NovelScene } from './types.ts'
import { characterRect, STAGE_HEIGHT, STAGE_WIDTH } from './stage.ts'
import { resolveSceneDirection } from './direction.ts'

/** Rasterize authored direction using the canonical stage geometry.
 * @param project Project containing admitted image metadata.
 * @param scene Scene supplying the default visual and full line snapshots.
 * @param assets Project-owned image storage.
 * @param line Optional dialogue index; omission composes the scene default.
 * @returns Canonical 1280 by 720 PNG with framing, focus and CG direction.
 */
export async function composeScene(project: NovelProject, scene: NovelScene, assets: AssetStore, line?: number): Promise<Buffer> {
  const visual = line === undefined ? scene.visual : resolveSceneDirection(scene, line).visual
  const background = visual?.cg ?? visual?.background
  const base = background === undefined
    ? await sharp({ create: { width: STAGE_WIDTH, height: STAGE_HEIGHT, channels: 4, background: '#243649' } }).png().toBuffer()
    : await sharp(await assets.bytes(project.id, background)).resize(STAGE_WIDTH, STAGE_HEIGHT, { fit: 'cover' }).png().toBuffer()
  const overlays: OverlayOptions[] = []
  for (const [index, placement] of (visual?.cg === undefined ? visual?.characters ?? [] : []).entries()) {
    const image = project.assets?.find(asset => asset.id === placement.asset)
    if (!image?.width || !image.height) throw new Error('Character image dimensions are missing.')
    const rect = characterRect({ width: image.width, height: image.height }, placement)
    const zoom = visual?.shot === 'close' ? 1.5 : visual?.shot === 'medium' ? 1.18 : 1
    const originY = visual?.shot === 'medium' ? .72 : .5
    rect.left = Math.round(rect.left - rect.width * (zoom - 1) / 2)
    rect.top = Math.round(rect.top - rect.height * (zoom - 1) * originY)
    rect.width = Math.round(rect.width * zoom); rect.height = Math.round(rect.height * zoom)
    if (rect.width > 8192 || rect.height > 4096 || rect.width * rect.height > 4096 * 4096) throw new Error('Character placement exceeds the intermediate image size limit.')
    const left = Math.max(0, rect.left), top = Math.max(0, rect.top)
    const right = Math.min(STAGE_WIDTH, rect.left + rect.width), bottom = Math.min(STAGE_HEIGHT, rect.top + rect.height)
    if (right <= left || bottom <= top) continue
    let pixels = sharp(await assets.bytes(project.id, image.id)).resize(rect.width, rect.height, { fit: 'fill' })
      .extract({ left: left - rect.left, top: top - rect.top, width: right - left, height: bottom - top })
    if (visual?.focus !== undefined && visual.focus !== index) {
      // CSS saturate(.75) and brightness(.55), applied to RGB while retaining alpha.
      const saturation = .75, brightness = .55
      const red = brightness * (1 - saturation) * .213
      const green = brightness * (1 - saturation) * .715
      const blue = brightness * (1 - saturation) * .072
      const diagonal = brightness * saturation
      pixels = pixels.recomb([[red + diagonal, green, blue], [red, green + diagonal, blue], [red, green, blue + diagonal]])
    }
    const input = await pixels.png().toBuffer()
    overlays.push({ input, left, top })
  }
  return sharp(base).composite(overlays).png().toBuffer()
}
