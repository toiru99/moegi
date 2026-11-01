/** Host-side login lifecycle. */
import { expect, it } from 'vitest'
import { ChatGptLogin } from '../src/login.ts'

it('reports authorization only after the flow settles and clears transient login details', async () => {
  let finish!: (value: { status: 'authorized' }) => void
  const login = new ChatGptLogin(async (interaction) => {
    interaction.notify({ message: 'Continue in browser', url: 'https://auth.openai.com/example' })
    return new Promise(resolve => { finish = resolve })
  })
  login.start()
  expect(login.snapshot().phase).toBe('pending')
  expect(login.snapshot().notices[0]?.url).toContain('auth.openai.com')
  finish({ status: 'authorized' })
  await login.settled()
  expect(login.snapshot()).toEqual({ phase: 'authorized', notices: [] })
})

it('cancels the owned attempt and permits a subsequent login', async () => {
  const login = new ChatGptLogin((_interaction, signal) => new Promise(resolve => {
    signal.addEventListener('abort', () => { resolve({ status: 'cancelled' }) }, { once: true })
  }))
  login.start()
  expect(() => login.start()).toThrow(/progress/i)
  login.cancel()
  await login.settled()
  expect(login.snapshot().phase).toBe('cancelled')
  login.start()
  login.cancel()
  await login.settled()
})

it('selects the browser PKCE method without presenting a second login-type question', async () => {
  let selected: string | undefined
  const login = new ChatGptLogin(async interaction => {
    selected = await interaction.prompt({ kind: 'select', message: 'Sign-in method', options: [
      { id: 'browser', label: 'Browser login (default)' }, { id: 'device_code', label: 'Device code login (headless)' },
    ] })
    return { status: 'authorized' }
  })
  try {
    login.start()
    await Promise.resolve()
    expect(selected).toBe('browser')
    await login.settled()
  } finally { login.cancel(); await login.settled() }
})
