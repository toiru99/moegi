import z from '@deepseek-ai/schemastery'

/** Explicit local paths; no installed game is ever changed by this plugin. */
export interface Config {
  projectDirectory: string
  previewDirectory: string
  compilerDirectory: string
  fontFile: string
  maxAssetBytes?: number
  imageModel?: string
  imageTimeoutMs?: number
  codexImageEnabled?: boolean
  codexExecutable?: string
  codexImageTimeoutMs?: number
  recoveredSystemDirectory?: string
  recoveredCompilerExecutable?: string
}

/** Local authoring storage and the separately built Siglus toolchain. */
export const Config: z<Config> = z.object({
  projectDirectory: z.string().required(),
  previewDirectory: z.string().required(),
  compilerDirectory: z.string().required(),
  fontFile: z.string().required(),
  maxAssetBytes: z.number().min(1).max(20 * 1024 * 1024).default(8 * 1024 * 1024),
  imageModel: z.string().default('gpt-image-2.5-sunburst'),
  imageTimeoutMs: z.number().min(1000).max(300000).default(120000),
  codexImageEnabled: z.boolean().default(true),
  codexExecutable: z.string().default('codex'),
  codexImageTimeoutMs: z.number().min(1000).max(900000).default(300000),
  recoveredSystemDirectory: z.string(),
  recoveredCompilerExecutable: z.string(),
})
