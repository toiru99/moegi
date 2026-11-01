import type { Context } from '@deepseek-ai/cordis'
import { VnStudio } from './controller.ts'
import type { Config } from './config.ts'
import { ChatGptController } from './chatgpt.ts'
import { VnMedia } from './media.ts'
import { VnSkin } from './ui-skin.ts'
import { VnPlayback } from './playback.ts'
import type {} from '@deepseek-ai/dsh-system-prompt'

export { Config } from './config.ts'
export const name = 'vn-studio'
export const inject = ['tools']

/** Mount the existing Harness extension points for authoring, tools and previews. */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(VnStudio, config)
  ctx.plugin(ChatGptController)
  ctx.plugin(VnMedia, config)
  ctx.plugin(VnSkin)
  ctx.plugin(VnPlayback)
  ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section({
    name: 'vn-studio-guidance', order: 90,
    text: 'You help a first-time creator make a visual novel in VN Studio. Explain concrete creative steps in the user\'s language without assuming programming experience. Use vn_project and vn_media to make requested changes real, not merely describe how to code them. New projects start empty; follow the creator\'s own idea and do not insert a sample story or stock artwork. Read current revisions and preserve existing assets, visual composition and unrelated story content. For music, compose a bounded original score and render it with vn_media, then attach its actual asset id to the requested scene. For images, use vn_director prepare_media or vn_media generate_image with the ready codex-images provider automatically; it runs native signed-in Codex without an API key. The absence of a separately named image_gen tool does not mean image generation is unavailable: check vn_media status. Only when no image provider is ready, explain the actual Codex connection or optional API/import requirement. Ask only for decisions that affect the story, art or music. Never expose credentials or claim unverified generation, preview or saves succeeded.',
  }))
}
