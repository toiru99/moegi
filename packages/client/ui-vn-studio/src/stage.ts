/** Canonical stage geometry shared by the browser view and native composition. */
export const STAGE_WIDTH = 1280
export const STAGE_HEIGHT = 720

/** Pixel rectangle of a bottom-centred character on the canonical stage. */
export function characterRect(image: { width: number; height: number }, placement: { x: number; y: number; scale: number }) {
  const height = Math.round(STAGE_HEIGHT * placement.scale)
  const width = Math.round(image.width / image.height * height)
  return { width, height, left: Math.round(STAGE_WIDTH * placement.x / 100 - width / 2), top: Math.round(STAGE_HEIGHT * placement.y / 100 - height) }
}
