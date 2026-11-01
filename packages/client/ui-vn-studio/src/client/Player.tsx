import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NovelProject, NovelScene } from '../types.ts'
import { DEFAULT_PLAYER_SETTINGS } from '../playback-types.ts'
import type { GameSave, PlaybackPosition, PlayerSettings } from '../playback-types.ts'
import type { PlayerActions } from './player-actions.ts'
import { Stage } from './Stage.tsx'
import { advancePlayback, playbackFingerprint, rememberPlayback } from './player-state.ts'
import css from './Player.module.css'

/** Reusable rehearsal systems change gameplay position and never authored content. */
export function Player({ project, scene, line, urls, dirty, navigate, face, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; scene: NovelScene; line: number; urls: Record<string, string>; dirty: boolean
  navigate(position: PlaybackPosition): void; face: PlayerActions
}) {
  const [history, setHistory] = useState<PlaybackPosition[]>([])
  const [settings, setSettings] = useState<PlayerSettings>(DEFAULT_PLAYER_SETTINGS)
  const [saves, setSaves] = useState<GameSave[]>([])
  const [menu, setMenu] = useState<'title' | 'save' | 'load' | 'history' | 'settings'>()
  const [mode, setMode] = useState<'auto' | 'skip'>()
  const [sound, setSound] = useState(true)
  const [unlocked, setUnlocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const music = useRef<HTMLAudioElement | null>(null), effect = useRef<HTMLAudioElement | null>(null)
  const currentSettings = useRef(settings)
  currentSettings.current = settings
  const mounted = useRef(true), currentProject = useRef(project), currentDirty = useRef(dirty)
  currentProject.current = project; currentDirty.current = dirty
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const position = { sceneId: scene.id, line }
  const run = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await operation() } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : String(error)) }
    finally { if (mounted.current) setBusy(false) }
  }
  useEffect(() => {
    let live = true
    void face.playerSettings(project.id).then(value => { if (live) setSettings(value) }).catch((error: unknown) => { if (live) setNotice(String(error)) })
    return () => { live = false }
  }, [project.id, face.playerSettings])

  useEffect(() => {
    if (!sound || !unlocked || scene.visual?.music === undefined) return
    let live = true
    const audio = new Audio(); music.current = audio; audio.loop = true
    void face.assetData(project.id, scene.visual.music).then(async url => {
      if (!live) return
      audio.src = url; audio.volume = currentSettings.current.musicVolume
      await audio.play()
    }).catch(() => { if (live) { setUnlocked(false); setNotice(t('soundOn')) } })
    return () => { live = false; audio.pause(); audio.removeAttribute('src'); audio.load(); if (music.current === audio) music.current = null }
  }, [project.id, scene.visual?.music, sound, unlocked, face.assetData, t])
  useEffect(() => {
    if (!sound || !unlocked || scene.visual?.sound === undefined) return
    let live = true
    const audio = new Audio(); effect.current = audio
    void face.assetData(project.id, scene.visual.sound).then(async url => {
      if (!live) return
      audio.src = url; audio.volume = currentSettings.current.effectVolume
      await audio.play()
    }).catch(() => { if (live) setNotice(t('soundOn')) })
    return () => { live = false; audio.pause(); audio.removeAttribute('src'); audio.load(); if (effect.current === audio) effect.current = null }
  }, [project.id, scene.id, scene.visual?.sound, sound, unlocked, face.assetData, t])
  useEffect(() => { if (music.current) music.current.volume = settings.musicVolume; if (effect.current) effect.current.volume = settings.effectVolume }, [settings.musicVolume, settings.effectVolume])

  const advance = () => {
    setUnlocked(true)
    const next = advancePlayback(project, position)
    if (next === undefined) { setMode(undefined); return }
    setHistory(previous => rememberPlayback(previous, position)); navigate(next)
  }
  useEffect(() => {
    if (mode === undefined || menu !== undefined) return
    if (line >= scene.lines.length) { setMode(undefined); return }
    const timer = setTimeout(advance, mode === 'skip' ? 180 : settings.autoDelayMs)
    return () => { clearTimeout(timer) }
  }, [mode, menu, project, scene.id, line, settings.autoDelayMs])
  const stop = () => { setMode(undefined) }
  const save = (slot: number) => { stop(); void run(async () => {
    setSaves(await face.saveGame(project.id, slot, JSON.stringify({ ...position, history, fingerprint: await playbackFingerprint(project) }))); setNotice(t('gameSaved'))
  }) }
  const load = (slot: number) => { stop(); void run(async () => {
    const snapshot = project, expected = await playbackFingerprint(snapshot)
    const saved = await face.loadGame(project.id, slot)
    if (!mounted.current) return
    if (currentProject.current !== snapshot || currentDirty.current || saved.fingerprint !== expected) { setNotice(t('gameStale')); return }
    setHistory(saved.history); navigate({ sceneId: saved.sceneId, line: saved.line }); setMenu(undefined); setUnlocked(true); setNotice(t('gameLoaded'))
  }) }
  const open = (next: typeof menu) => { stop(); setMenu(next); if (next === 'save' || next === 'load') void run(async () => { setSaves(await face.gameSaves(project.id)) }) }
  const close = () => { setMenu(undefined) }
  return <div className={css.player}>
    <Stage project={project} scene={scene} line={line} urls={urls} next={advance} textScale={settings.textSize / 100} choose={sceneId => {
      stop(); setUnlocked(true); setHistory(previous => rememberPlayback(previous, position)); navigate({ sceneId, line: 0 })
    }} t={t} />
    <div className={css.controls} role="group" aria-label={t('gameControls')}>
      <Button size="sm" variant="ghost" onClick={() => { open('title') }}>{t('gameTitle')}</Button>
      <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => { open('save') }}>{t('gameSave')}</Button>
      <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => { open('load') }}>{t('gameLoad')}</Button>
      <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => { save(0) }}>{t('quickSave')}</Button>
      <Button size="sm" variant="ghost" disabled={busy || dirty} onClick={() => { load(0) }}>{t('quickLoad')}</Button>
      <Button size="sm" variant="ghost" onClick={() => { open('history') }}>{t('backlog')}</Button>
      <Button size="sm" variant={mode === 'auto' ? 'primary' : 'ghost'} aria-pressed={mode === 'auto'} onClick={() => { setMode(mode === 'auto' ? undefined : 'auto'); setUnlocked(true) }}>{t('autoPlay')}</Button>
      <Button size="sm" variant={mode === 'skip' ? 'primary' : 'ghost'} aria-pressed={mode === 'skip'} onClick={() => { setMode(mode === 'skip' ? undefined : 'skip'); setUnlocked(true) }}>{t('skipPlay')}</Button>
      <Button size="sm" variant="ghost" onClick={() => { open('settings') }}>{t('gameSettings')}</Button>
      <Button size="sm" variant="ghost" aria-pressed={sound && unlocked} onClick={() => { setSound(!(sound && unlocked)); setUnlocked(true) }}>{t(sound && unlocked ? 'soundOff' : 'soundOn')}</Button>
    </div>
    {dirty && <p className={css.hint}>{t('saveDraftFirst')}</p>}
    {notice !== '' && <p className={css.hint} role="status">{notice}</p>}
    <Modal open={menu !== undefined} onClose={close} title={menu === 'title' ? project.title : t(menu === 'save' ? 'saveSlots' : menu === 'load' ? 'loadSlots' : menu === 'history' ? 'backlog' : 'gameSettings')} closeLabel={t('closeGameMenu')} contentClassName={css.modalContent!}>
      {menu === 'title' && <div className={css.titleCard}><h3>{project.title}</h3><Button variant="primary" data-modal-autofocus onClick={() => { setHistory([]); navigate({ sceneId: project.entry, line: 0 }); close(); setUnlocked(true) }}>{t('gameStart')}</Button></div>}
      {(menu === 'save' || menu === 'load') && <div className={css.slots}>
        <p className={css.hint}>{t('gameSaveHint')}</p>
        {Array.from({ length: 6 }, (_, index) => index + 1).map(slot => {
          const saved = saves.find(saved => saved.slot === slot)
          return <div className={css.slot} key={slot}><div><strong>{t('gameSlot', { slot })}</strong><span>{saved === undefined ? t('slotEmpty') : `${saved.title} · ${new Date(saved.time).toLocaleString()}`}</span>{saved && <p>{saved.text}</p>}</div>
            <Button size="sm" variant="outline" disabled={busy || dirty || (menu === 'load' && saved === undefined)} onClick={() => { if (menu === 'save') save(slot); else load(slot) }}>{t(menu === 'save' ? 'saveHere' : 'loadHere')}</Button></div>
        })}
      </div>}
      {menu === 'history' && <div className={css.history}>{history.length === 0 ? <p>{t('noHistory')}</p> : history.map((visit, index) => {
        const row = project.scenes.find(scene => scene.id === visit.sceneId)?.lines[visit.line]
        return row === undefined ? null : <p key={index}><strong>{row.speaker}</strong><span>{row.text}</span></p>
      })}</div>}
      {menu === 'settings' && <div className={css.settings}>
        <label>{t('musicVolume')}<input type="range" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={event => { setSettings({ ...settings, musicVolume: Number(event.target.value) }) }} /></label>
        <label>{t('effectVolume')}<input type="range" min="0" max="1" step="0.05" value={settings.effectVolume} onChange={event => { setSettings({ ...settings, effectVolume: Number(event.target.value) }) }} /></label>
        <label>{t('autoDelay')}<input type="number" min="0.3" max="15" step="0.1" value={settings.autoDelayMs / 1000} onChange={event => { setSettings({ ...settings, autoDelayMs: Math.max(300, Math.min(15000, Math.round(Number(event.target.value) * 1000))) }) }} /></label>
        <label>{t('textSize')}<input type="range" min="75" max="150" step="5" value={settings.textSize} onChange={event => { setSettings({ ...settings, textSize: Number(event.target.value) }) }} /></label>
        <Button variant="primary" disabled={busy} onClick={() => { void run(async () => { setSettings(await face.savePlayerSettings(project.id, JSON.stringify(settings))); setNotice(t('settingsSaved')); close() }) }}>{t('saveGameSettings')}</Button>
      </div>}
    </Modal>
  </div>
}
