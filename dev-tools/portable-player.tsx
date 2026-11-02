/** Standalone mount reuses the production Player, Stage and controls. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Player } from '../packages/client/ui-vn-studio/src/client/Player.tsx'
import { ko, ja } from '../packages/client/ui-vn-studio/src/client/locales.ts'
import type { NovelProject } from '../packages/client/ui-vn-studio/src/types.ts'
import { ICON_SYMBOLS } from '../packages/client/ui-primitives/src/icons/artwork.ts'
import { portableActions } from './portable-storage.ts'

const embedded = document.getElementById('vn-game-data')
if (embedded?.textContent === undefined) throw new Error('게임 데이터가 없습니다.')
const { project, urls } = JSON.parse(embedded.textContent) as { project: NovelProject; urls: Record<string, string> }
const copy = project.language === 'ja' ? ja : ko
const t: PropsLocale<'vnStudio'>['t'] = (key, values) => {
  let text = copy[key as keyof typeof copy] ?? String(key)
  for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value))
  return text
}
const face = portableActions(project, urls, { getItem: key => localStorage.getItem(key), setItem: (key, value) => { localStorage.setItem(key, value) } })
// The shared modal close icon references this static product-owned SVG symbol.
const svgRoot = new DOMParser().parseFromString(ICON_SYMBOLS['dsw-icon-close-outline-regular'], 'image/svg+xml').documentElement
const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), symbol = document.createElementNS(sprite.namespaceURI, 'symbol')
symbol.id = 'dsw-icon-close-outline-regular'; symbol.setAttribute('viewBox', svgRoot.getAttribute('viewBox') ?? '0 0 16 16')
symbol.append(...[...svgRoot.childNodes].map(node => document.importNode(node, true)))
sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'; sprite.setAttribute('aria-hidden', 'true'); sprite.append(symbol); document.body.append(sprite)

function Game() {
  const [started, setStarted] = useState(false)
  const [position, navigate] = useState({ sceneId: project.entry, line: 0 })
  const scene = project.scenes.find(scene => scene.id === position.sceneId)!
  return <main className="portable-game">
    <header><h1>{project.title}</h1><button onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => {}) }}>{project.language === 'ja' ? '全画面' : '전체 화면'}</button></header>
    {started ? <Player project={project} scene={scene} line={position.line} urls={urls} dirty={false} navigate={navigate} face={face} t={t} />
      : <section className="portable-cover" aria-label={project.title}>
        {project.uiSkin?.title && <img src={urls[project.uiSkin.title]} alt={project.title} />}
        <button onClick={() => { setStarted(true) }}>{project.language === 'ja' ? '物語を始める' : '이야기 시작'}</button>
      </section>}
    <p className="portable-note">{project.language === 'ja' ? '進行はこのブラウザに保存されます。' : '진행 기록은 이 브라우저에 저장됩니다.'}</p>
  </main>
}
createRoot(document.getElementById('root')!).render(<Game />)
