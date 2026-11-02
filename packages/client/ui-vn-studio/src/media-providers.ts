import type { AssetKind } from './types.ts'

/** Provider requests carry authored prompts and cancellation, never credential material. */
export interface MediaRequest {
  kind: AssetKind
  prompt: string
  signal: AbortSignal
  /** Validated project-owned images for consistent expressions, poses or event CGs. */
  references?: string[]
  /** Interface composition supersedes scene framing; references are validated project-owned local image paths. */
  presentation?: { purpose: 'interface'; transparent: boolean; references?: string[] }
}
/** Installed providers own readiness and generation; their caller owns project persistence. */
export interface MediaProvider {
  id: string
  kinds: AssetKind[]
  supportsReferences?: boolean
  ready(): Promise<boolean>
  generate(request: MediaRequest): Promise<Buffer>
}

/** Instance-owned, reversible registry available to installed media plugins. */
export class MediaProviders {
  private readonly entries = new Map<string, MediaProvider>()
  register(provider: MediaProvider): () => void {
    if (this.entries.has(provider.id)) throw new Error('Media provider is already registered.')
    this.entries.set(provider.id, provider)
    return () => { if (this.entries.get(provider.id) === provider) this.entries.delete(provider.id) }
  }
  async status(): Promise<{ id: string; kinds: AssetKind[]; ready: boolean; supportsReferences?: boolean }[]> {
    return Promise.all([...this.entries.values()].map(async provider => ({ id: provider.id, kinds: [...provider.kinds], ready: await provider.ready(), ...provider.supportsReferences === undefined ? {} : { supportsReferences: provider.supportsReferences } })))
  }
  async generate(id: string, request: MediaRequest): Promise<Buffer> {
    request.signal.throwIfAborted()
    const provider = this.entries.get(id)
    if (provider === undefined || !provider.kinds.includes(request.kind)) throw new Error('Media provider does not support this asset kind.')
    if ((request.references?.length || request.presentation?.references?.length) && provider.supportsReferences !== true) throw new Error('The selected provider does not support image references. Use ready Codex images or another reference-capable provider.')
    if (!await provider.ready()) throw new Error('The selected image provider is not ready. Check its Codex sign-in or optional Images API connection.')
    request.signal.throwIfAborted()
    const bytes = await provider.generate(request)
    request.signal.throwIfAborted()
    return bytes
  }
}

interface ImageOptions { readKey: () => Promise<string | undefined>; model: string; maxBytes: number; timeoutMs: number; transport?: typeof fetch }

async function boundedResponse(response: Response, limit: number): Promise<string> {
  if (response.body === null) throw new Error('Image provider returned an empty response.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > limit) { await reader.cancel(); throw new Error('Image response exceeds the size limit.') }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}

/** Official Images API adapter; credentials are resolved for each request and never returned. */
export function openAiImages(options: ImageOptions): MediaProvider {
  const transport = options.transport ?? fetch
  return {
    id: 'openai-images', kinds: ['background', 'character'],
    ready: async () => Boolean(await options.readKey()),
    async generate(request) {
      request.signal.throwIfAborted()
      if (request.references?.length || request.presentation?.references?.length) throw new Error('Reference image edits require the Codex image provider; this Images API adapter supports new generations only.')
      const key = await options.readKey()
      if (!key) throw new Error('Connect the image provider API key before generating.')
      if (request.prompt.trim() === '' || request.prompt.length > 4000) throw new Error('Expected an image prompt of 1–4000 characters.')
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs)])
      const response = await transport('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal,
        body: JSON.stringify({ model: options.model, prompt: request.prompt, n: 1, size: request.kind === 'character' ? '1024x1536' : '1536x1024', output_format: 'png', background: request.kind === 'character' ? 'transparent' : 'opaque' }),
      })
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Image provider returned HTTP ${response.status}. Check the connection, credits or request and retry.`) }
      const parsed: unknown = JSON.parse(await boundedResponse(response, Math.ceil(options.maxBytes * 4 / 3) + 65536))
      if (typeof parsed !== 'object' || parsed === null || !('data' in parsed) || !Array.isArray(parsed.data)) throw new Error('Image provider returned invalid media metadata.')
      const first: unknown = parsed.data[0]
      if (typeof first !== 'object' || first === null || !('b64_json' in first) || typeof first.b64_json !== 'string') throw new Error('Image provider did not return image bytes.')
      const bytes = Buffer.from(first.b64_json, 'base64')
      if (bytes.length === 0 || bytes.length > options.maxBytes) throw new Error('Generated image exceeds the size limit.')
      if (bytes.toString('base64').replace(/=+$/, '') !== first.b64_json.replace(/=+$/, '')) throw new Error('Image provider returned invalid base64 media.')
      signal.throwIfAborted()
      return bytes
    },
  }
}
