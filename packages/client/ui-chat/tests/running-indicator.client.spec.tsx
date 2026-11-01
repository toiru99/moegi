// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningIndicator } from '../src/client/chat/RunningIndicator.tsx'

afterEach(cleanup)

describe('Running indicator', () => {
  it('uses the decorative loading glyph without an image mask', () => {
    const view = render(<RunningIndicator />)
    const icon = view.container.firstElementChild!
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.querySelector('[data-icon="dsw-icon-loading-outline-regular"]')).not.toBeNull()
    expect(icon.querySelector('span')).toBeNull()
    expect(icon.querySelector('img, animate, image')).toBeNull()
    expect(view.container.querySelector('[style]')).toBeNull()
  })
})
