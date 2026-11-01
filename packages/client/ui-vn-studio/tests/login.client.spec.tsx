// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Login } from '../src/client/Login.tsx'
import { en } from '../src/client/locales.ts'
import type { ChatGptConnection } from '../src/types.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('preopens the browser during the click and retains a manual link if popups are blocked', async () => {
  const order: string[] = []
  vi.spyOn(window, 'open').mockImplementation(() => { order.push('popup'); return null })
  let state: ChatGptConnection = { connected: false, login: { phase: 'idle', notices: [] } }
  render(<Login t={key => key in en ? en[key as keyof typeof en] : key}
    status={async () => state} start={async () => {
      order.push('request')
      state = { connected: false, login: { phase: 'pending', notices: [{ message: 'Continue', url: 'https://auth.openai.com/authorize' }] } }
      return state.login
    }} answer={async () => state.login} cancel={async () => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT' }))
  expect(order).toEqual(['popup', 'request'])
  await waitFor(() => expect(screen.getByRole('link', { name: 'Continue in browser' }).getAttribute('href')).toBe('https://auth.openai.com/authorize'))
})
