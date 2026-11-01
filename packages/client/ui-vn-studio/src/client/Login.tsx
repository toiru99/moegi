import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatGptConnection, ChatGptLoginSnapshot } from '../types.ts'
import css from './Editor.module.css'

/** User-driven OAuth actions; no credential value is available to the component. */
export interface LoginActions {
  status: () => Promise<ChatGptConnection>
  start: () => Promise<ChatGptLoginSnapshot>
  answer: (id: string, value: string) => Promise<ChatGptLoginSnapshot>
  cancel: () => Promise<void>
}

function loginUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    return ['https://auth.openai.com', 'https://chatgpt.com'].includes(url.origin) ? url.href : undefined
  } catch { return undefined }
}

/** Poll only presentation state while the authoritative authorization flow is running. */
export function Login({ t, status, start, answer, cancel }: PropsLocale<'vnStudio'> & InjectFace<LoginActions>) {
  const [state, setState] = useState<ChatGptConnection>()
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const [generation, setGeneration] = useState(0)
  const popup = useRef<Window | null>(null)
  const openedUrl = useRef<string>()
  useEffect(() => {
    let retired = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      try {
        const next = await status()
        if (retired) return
        setState(next)
        if (next.login.phase === 'pending') timer = setTimeout(() => { void refresh() }, 500)
      } catch { if (!retired) setError(t('loginFailed')) }
    }
    void refresh()
    return () => { retired = true; clearTimeout(timer) }
  }, [status, generation, t])
  const run = async (action: () => Promise<unknown>) => {
    setError('')
    try { await action(); setGeneration(value => value + 1) }
    catch { setError(t('loginFailed')) }
  }
  const pending = state?.login.phase === 'pending'
  const prompt = state?.login.prompt
  const notice = state?.login.notices.findLast(value => loginUrl(value.url) !== undefined)
  const url = loginUrl(notice?.url)
  useEffect(() => {
    if (url !== undefined && popup.current !== null && !popup.current.closed && openedUrl.current !== url) {
      popup.current.location.href = url
      openedUrl.current = url
    }
    if (state?.connected || state?.login.phase === 'cancelled') {
      popup.current?.close()
      popup.current = null
    }
  }, [url, state?.connected, state?.login.phase])
  useEffect(() => () => { if (openedUrl.current === undefined) popup.current?.close() }, [])
  const begin = () => {
    popup.current?.close()
    popup.current = window.open('about:blank', '_blank')
    if (popup.current !== null) popup.current.opener = null
    openedUrl.current = undefined
    void run(start)
  }
  return <div className={css.line}>
    <div className={css.toolbar}>
      {state?.connected ? <span>{t('connected')}</span> : <button disabled={pending} onClick={begin}>{t('signIn')}</button>}
      {pending && <button onClick={() => { void run(cancel) }}>{t('cancelLogin')}</button>}
      {url !== undefined && <a href={url} target="_blank" rel="noopener noreferrer">{t('continueLogin')}</a>}
    </div>
    {prompt !== undefined && <label>{prompt.message}
      {prompt.options === undefined ? <input aria-label={t('loginAnswer')} value={response} onChange={event => { setResponse(event.target.value) }} />
        : <select aria-label={t('loginAnswer')} value={response} onChange={event => { setResponse(event.target.value) }}>
          <option value="">{t('loginAnswer')}</option>{prompt.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>}
      <button disabled={response === ''} onClick={() => { void run(async () => { await answer(prompt.id, response); setResponse('') }) }}>{t('submitAnswer')}</button>
    </label>}
    {(error !== '' || state?.login.phase === 'failed') && <p role="status">{error || t('loginFailed')}</p>}
  </div>
}
