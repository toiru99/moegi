/** Root-scoped main occupant; Session binding belongs to its Conversation child. */
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../contract/slots.ts'

/**
 * Render the Conversation with optional current-Session binding.
 * @param props - main-slot inputs and the declared Conversation renderer.
 * @returns the Conversation subtree.
 */
export function ConversationPanel({ renderSlot, renderSlotChain }: PropsRenderSlots<'main.conversation' | 'conversation.workspace'>) {
  const conversation = renderSlot('main.conversation', {})
  return renderSlotChain('conversation.workspace', { conversation }, { fallback: conversation })
}
