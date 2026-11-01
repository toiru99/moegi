// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, expect, it, vi } from 'vitest'
import { ConversationPanel } from '../src/client/skeleton/ConversationPanel.tsx'

afterEach(cleanup)

it('lets a workspace contribution place the existing conversation beside its editor', () => {
  const renderSlot = vi.fn(() => <button>Existing conversation</button>)
  const renderSlotChain: PropsRenderSlots<'conversation.workspace'>['renderSlotChain'] = (_name, _owner, options) => <main><section>Scene editor</section><aside>{options?.fallback}</aside></main>
  render(<ConversationPanel renderSlot={renderSlot} renderSlotChain={renderSlotChain} SessionProvider={({ children }) => children} />)
  expect(screen.getByRole('main')).toBeTruthy()
  expect(screen.getByText('Scene editor')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Existing conversation' })).toHaveLength(1)
})
