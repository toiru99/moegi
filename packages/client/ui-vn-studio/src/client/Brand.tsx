import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { STUDIO_FRAME, STUDIO_PLAY } from './brand-art.ts'

/** Render the story-frame mark at the size requested by the existing shell. */
export function StudioMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
    <path d={STUDIO_FRAME} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d={STUDIO_PLAY} fill="currentColor" />
  </svg>
}

/** Render the product name independently of the surrounding mark and controls. */
export function StudioName({ t }: PropsLocale<'vnStudio'>) { return <span>{t('brandName')}</span> }
