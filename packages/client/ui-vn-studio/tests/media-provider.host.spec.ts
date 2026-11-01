import { expect, it, vi } from 'vitest'
import { MediaProviders, openAiImages } from '../src/media-providers.ts'

const request = { kind: 'background' as const, prompt: '비 오는 서점', signal: new AbortController().signal }
it('registers providers reversibly and reports unconfigured generation honestly', async () => {
  const providers = new MediaProviders()
  const transport = vi.fn<typeof fetch>()
  const provider = openAiImages({ readKey: async () => undefined, model: 'test-image', maxBytes: 1024, timeoutMs: 1000, transport })
  const release = providers.register(provider)
  expect(await providers.status()).toEqual([{ id: 'openai-images', kinds: ['background', 'character'], ready: false }])
  await expect(providers.generate('openai-images', request)).rejects.toThrow(/connect|key/i)
  expect(transport).not.toHaveBeenCalled()
  release()
  expect(await providers.status()).toEqual([])
  await expect(providers.generate('openai-images', request)).rejects.toThrow(/provider/i)
})

it('uses the Images API protocol and admits only a bounded base64 result', async () => {
  const bytes = Buffer.from('example-result')
  const transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [{ b64_json: bytes.toString('base64') }] })))
  const provider = openAiImages({ readKey: async () => 'test-key', model: 'test-image', maxBytes: 1024, timeoutMs: 1000, transport })
  expect(await provider.generate(request)).toEqual(bytes)
  const [url, init] = transport.mock.calls[0]!
  expect(url).toBe('https://api.openai.com/v1/images/generations')
  expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'test-image', prompt: request.prompt, output_format: 'png', background: 'opaque' })
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-key')
  transport.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ b64_json: Buffer.alloc(2048).toString('base64') }] })))
  await expect(provider.generate(request)).rejects.toThrow(/size|limit/i)
})

it('contains provider error details and cancels before sending an aborted request', async () => {
  const transport = vi.fn<typeof fetch>(async () => new Response('secret-test-key', { status: 429 }))
  const provider = openAiImages({ readKey: async () => 'secret-test-key', model: 'test-image', maxBytes: 1024, timeoutMs: 1000, transport })
  await expect(provider.generate(request)).rejects.toThrow('HTTP 429')
  const aborted = new AbortController(); aborted.abort()
  await expect(provider.generate({ ...request, signal: aborted.signal })).rejects.toThrow(/abort/i)
  expect(transport).toHaveBeenCalledOnce()
})

it('never admits a late provider result after the caller cancels', async () => {
  const providers = new MediaProviders(), controller = new AbortController()
  let finish!: (bytes: Buffer) => void
  providers.register({ id: 'deferred', kinds: ['background'], ready: async () => true, generate: async () => new Promise<Buffer>(resolve => { finish = resolve }) })
  const pending = providers.generate('deferred', { ...request, signal: controller.signal })
  await Promise.resolve()
  controller.abort()
  finish(Buffer.from('late-result'))
  await expect(pending).rejects.toThrow(/abort/i)
})
