import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ChatGptLogin } from './login.ts'
import type { ChatGptConnection, ChatGptLoginSnapshot } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { vnChatGpt: ChatGptController }
}

/** Project-independent UI adapter for the existing ChatGPT authorization flow. */
export class ChatGptController extends TypertRemoteService {
  static inject = ['authorization', 'credentials']
  private readonly login: ChatGptLogin
  private readonly key = credentialKey('llm-pi-ai', 'openai-codex')

  constructor(ctx: Context) {
    super(ctx, 'vnChatGpt', { namespace: 'vnChatGpt' })
    this.login = new ChatGptLogin((interaction, signal) => ctx.authorization.begin({ key: this.key, method: 'oauth', interaction, signal }))
    ctx.effect(() => async () => { this.login.cancel(); await this.login.settled() }, 'vn-studio.login')
  }

  /** Report whether this Host has a stored grant; never return the grant itself. */
  @Remote
  async status(): Promise<ChatGptConnection> {
    const record = await this.ctx.credentials.readRecord(this.key)
    return { connected: record?.kind === 'grant', login: this.login.snapshot() }
  }

  /** Start only the configured ChatGPT OAuth method. */
  @Remote
  start(): ChatGptLoginSnapshot { return this.login.start() }

  /** Answer one still-active callback-code or account-choice question. */
  @Remote
  answer(id: string, value: string): ChatGptLoginSnapshot { return this.login.answer(id, value) }

  /** Cancel the owned attempt without deleting an existing credential. */
  @Remote
  cancel(): void { this.login.cancel() }
}
