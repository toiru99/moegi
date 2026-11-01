// @vitest-environment jsdom
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Editor } from '../src/client/Editor.tsx'
import type { EditorActions } from '../src/client/Editor.tsx'
import { en } from '../src/client/locales.ts'

it('edits Korean dialogue and saves against the loaded project revision', async () => {
  const initial = { revision: 4, canUndo: false, project: {
    id: 'demo', title: 'Demo', language: 'ko' as const, entry: 'start',
    scenes: [{ id: 'start', title: 'Start', lines: [{ speaker: '하루', text: '안녕' }], choices: [] }],
  } }
  const save = vi.fn<EditorActions['save']>(async (_id, _revision, project) => ({ ...initial, revision: 5, canUndo: true, project }))
  render(<Editor t={key => key in en ? en[key as keyof typeof en] : key} list={async () => [{ id: 'demo', title: 'Demo', language: 'ko' }]} read={async () => initial} save={save}
    create={async () => initial} undo={async () => initial} preview={async () => {}}
    chatGpt={{ status: async () => ({ connected: false, login: { phase: 'idle', notices: [] } }), start: async () => ({ phase: 'pending', notices: [] }), answer: async () => ({ phase: 'pending', notices: [] }), cancel: async () => {} }} />)
  await waitFor(() => expect(screen.getByRole('option', { name: 'Demo' })).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Open project'), { target: { value: 'demo' } })
  await waitFor(() => expect(screen.getByDisplayValue('안녕')).toBeTruthy())
  fireEvent.change(screen.getByLabelText('Dialogue'), { target: { value: '다시 만나서 반가워!' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('demo', 4, expect.objectContaining({
    scenes: [expect.objectContaining({ lines: [{ speaker: '하루', text: '다시 만나서 반가워!' }] })],
  })))
})
