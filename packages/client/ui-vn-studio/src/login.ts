import { randomUUID } from 'node:crypto'
import type { AuthorizationInteraction, AuthorizationOutcome } from '@deepseek-ai/dsh-authorization'
import type { ChatGptLoginSnapshot } from './types.ts'

type Begin = (interaction: AuthorizationInteraction, signal: AbortSignal) => Promise<AuthorizationOutcome>

/** Own one user-initiated login conversation; the existing provider owns OAuth and credential storage. */
export class ChatGptLogin {
  private state: ChatGptLoginSnapshot = { phase: 'idle', notices: [] }
  private attempt: { abort: AbortController; done: Promise<void> } | undefined
  private answerPrompt: ((value: string) => void) | undefined

  constructor(private readonly begin: Begin) {}

  snapshot(): ChatGptLoginSnapshot { return structuredClone(this.state) }

  start(): ChatGptLoginSnapshot {
    if (this.state.phase === 'pending') throw new Error('ChatGPT sign-in is already in progress.')
    const abort = new AbortController()
    this.state = { phase: 'pending', notices: [] }
    const result = this.begin({
      notify: (notice) => {
        if (!abort.signal.aborted) this.state = { ...this.state, notices: [...this.state.notices, notice].slice(-10) }
      },
      prompt: (prompt) => {
        if (prompt.kind === 'select' && prompt.options.some(option => option.id === 'browser')
          && prompt.options.some(option => option.id === 'device_code')) {
          if ((prompt.signal ?? abort.signal).aborted) return Promise.reject(new DOMException('Login cancelled', 'AbortError'))
          return Promise.resolve('browser')
        }
        if (prompt.kind === 'secret') return Promise.reject(new Error('This sign-in surface does not collect secret keys.'))
        const id = randomUUID()
        this.state = { ...this.state, prompt: {
          id, message: prompt.message,
          ...prompt.kind === 'select' ? { options: prompt.options.map(option => ({ id: option.id, label: option.label })) } : {},
        } }
        return new Promise<string>((resolve, reject) => {
          const signal = prompt.signal ?? abort.signal
          const withdraw = () => { clear(); reject(new DOMException('Login prompt withdrawn', 'AbortError')) }
          const clear = () => {
            signal.removeEventListener('abort', withdraw)
            this.answerPrompt = undefined
            delete this.state.prompt
          }
          this.answerPrompt = value => { clear(); resolve(value) }
          signal.addEventListener('abort', withdraw, { once: true })
          if (signal.aborted) withdraw()
        })
      },
    }, abort.signal)
    const done = result.then(outcome => { this.state = { phase: outcome.status, notices: [] } }, () => {
      this.state = { phase: abort.signal.aborted ? 'cancelled' : 'failed', notices: [] }
    }).finally(() => { this.answerPrompt = undefined })
    this.attempt = { abort, done }
    return this.snapshot()
  }

  answer(id: string, value: string): ChatGptLoginSnapshot {
    if (this.state.prompt?.id !== id || this.answerPrompt === undefined) throw new Error('The login question is no longer active.')
    this.answerPrompt(value)
    return this.snapshot()
  }

  cancel(): void { this.attempt?.abort.abort() }
  async settled(): Promise<void> { await this.attempt?.done }
}
