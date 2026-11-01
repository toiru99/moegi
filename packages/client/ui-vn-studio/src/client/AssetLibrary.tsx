import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { AssetKind, MediaStatus, NovelAsset, NovelProject, ProjectRevision } from '../types.ts'
import type { CreatorActions } from './creator-actions.ts'
import type { StudioState } from './studio-store.ts'
import css from './StudioWorkbench.module.css'

function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') resolve(reader.result); else reject(new Error('Invalid media file.')) }
    reader.onerror = () => { reject(reader.error ?? new Error('Cannot read the selected file.')) }
    reader.readAsDataURL(file)
  })
}

/** Import, preview and create real project media, with explicit provider readiness. */
export function AssetLibrary({ project, revision, busy, dirty, face, adopt, run, useAsset, requestMusic, mediaDraft, changeMediaDraft, t }: PropsLocale<'vnStudio'> & {
  project: NovelProject; revision: number; busy: boolean; dirty: boolean; face: CreatorActions
  adopt(saved: ProjectRevision): void; run(operation: () => Promise<void>, notice?: string): void; useAsset(asset: NovelAsset): void; requestMusic(idea: string): void
  mediaDraft: StudioState['mediaDraft']; changeMediaDraft(value: Partial<StudioState['mediaDraft']>): void
}) {
  const kind = mediaDraft.kind, prompt = mediaDraft.imagePrompt, musicIdea = mediaDraft.musicIdea
  const setKind = (kind: AssetKind) => { changeMediaDraft({ kind }) }
  const setPrompt = (imagePrompt: string) => { changeMediaDraft({ imagePrompt }) }
  const setMusicIdea = (musicIdea: string) => { changeMediaDraft({ musicIdea }) }
  const [selectedId, setSelectedId] = useState('')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [status, setStatus] = useState<MediaStatus>()
  const [key, setKey] = useState('')
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [preset, setPreset] = useState<'bell' | 'rain' | 'steps'>('bell')
  const skinAssets = new Set([project.uiSkin?.title, project.uiSkin?.cursor, project.uiSkin?.dialogue])
  const assets = project.assets?.filter(asset => asset.kind === kind && !skinAssets.has(asset.id)) ?? []
  const selected = assets.find(asset => asset.id === selectedId) ?? assets[0]
  const image = kind === 'background' || kind === 'character'
  const provider = status?.providers.find(provider => provider.id === 'codex-images' && provider.ready && provider.kinds.includes(kind)) ?? status?.providers.find(provider => provider.ready && provider.kinds.includes(kind))

  useEffect(() => { let live = true; void face.mediaStatus().then(value => { if (live) setStatus(value) }).catch((error: unknown) => { if (live) setPreviewError(error instanceof Error ? error.message : String(error)) }); return () => { live = false } }, [face])
  useEffect(() => {
    let live = true
    setPreview('')
    setPreviewError('')
    if (selected !== undefined) void face.assetData(project.id, selected.id).then(url => { if (live) setPreview(url) }).catch((error: unknown) => { if (live) setPreviewError(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [face, project.id, selected?.id])

  const accept = (saved: ProjectRevision) => { adopt(saved); setSelectedId(saved.project.assets?.at(-1)?.id ?? '') }
  return <div className={css.assetLibrary}>
    <div className={css.assetKinds} role="group" aria-label={t('assetsTab')}>
      {(['background', 'character', 'music', 'sound'] as const).map(value => <Button key={value} size="sm" variant={kind === value ? 'primary' : 'ghost'} aria-pressed={kind === value} onClick={() => { setKind(value); setSelectedId('') }}>{t(value)}</Button>)}
    </div>
    {dirty && <p className={css.hint}>{t('saveBeforeMedia')}</p>}
    {previewError !== '' && <p role="status" className={css.hint}>{previewError}</p>}
    <label className={css.fileImport}>{t('importFile')}<input type="file" disabled={busy || dirty} accept={image ? 'image/png,image/jpeg,image/webp' : 'audio/wav,audio/ogg,.wav,.ogg'} onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file !== undefined) run(async () => {
        if (file.size > (status?.maxAssetBytes ?? 8 * 1024 * 1024)) throw new Error(t('uploadTooLarge'))
        accept(await face.importAsset(project.id, revision, kind, file.name, await fileData(file)))
      })
    }} /></label>
    <div className={css.assetBrowser}>
      <div className={css.assetList}>
        {assets.length === 0 ? <p className={css.hint}>{t('noFilesYet')}</p> : assets.map(asset => <button key={asset.id} aria-pressed={selected?.id === asset.id} onClick={() => { setSelectedId(asset.id) }}><strong>{asset.name}</strong><span>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : t(asset.kind)}</span></button>)}
      </div>
      {selected !== undefined && <div className={css.assetPreview}>
        {preview !== '' && (image ? <img src={preview} alt={selected.name} /> : <audio controls preload="none" src={preview} aria-label={`${t('listen')} ${selected.name}`} onError={() => { setPreviewError(t('audioError')); setPreview('') }} />)}
        <strong>{selected.name}</strong>
        <Button variant="outline" disabled={busy} onClick={() => { useAsset(selected) }}>{t('useAsset')}</Button>
      </div>}
    </div>
    {image && <div className={css.creationForm}>
      <h3>{t('generateImage')}</h3>
      <p className={css.hint}>{t(provider === undefined ? 'imageNotConnected' : provider.id === 'codex-images' ? 'codexImageConnected' : 'imageConnected')}</p>
      <label>{t('imagePrompt')}<textarea value={prompt} maxLength={4000} placeholder={t('imagePromptHint')} onChange={event => { setPrompt(event.target.value) }} /></label>
      <Button variant="primary" disabled={busy || dirty || (provider !== undefined && prompt.trim() === '')} onClick={() => {
        if (provider === undefined) { run(async () => { setStatus(await face.mediaStatus()) }); return }
        run(async () => { accept(await face.generateImage(project.id, revision, kind, prompt.trim().slice(0, 80), prompt, provider.id)) }, t('imageBusy'))
      }}>{t(provider === undefined ? 'retryImageConnection' : 'generateImage')}</Button>
      <details open={connectionOpen} onToggle={event => { setConnectionOpen(event.currentTarget.open) }}>
        <summary>{t('imageApiConnection')}</summary><p className={css.hint}>{t('imageConnectionHint')}</p>
        <label>{t('imageKey')}<input type="password" value={key} autoComplete="off" onChange={event => { setKey(event.target.value) }} /></label>
        <Button variant="outline" disabled={busy || key.trim() === ''} onClick={() => { run(async () => {
          await face.saveImageKey(key.trim()); setKey(''); setStatus(await face.mediaStatus()); setConnectionOpen(false)
        }) }}>{t('saveImageKey')}</Button>
      </details>
    </div>}
    {kind === 'music' && <div className={css.creationForm}>
      <h3>{t('generateMusic')}</h3><p className={css.hint}>{t('scoreHint')}</p>
      <label>{t('musicIdea')}<textarea value={musicIdea} maxLength={1000} placeholder={t('musicIdeaHint')} onChange={event => { setMusicIdea(event.target.value) }} /></label>
      <Button variant="primary" disabled={busy || dirty} onClick={() => { requestMusic(musicIdea.trim() || t('musicIdeaHint')) }}>{t('generateMusic')}</Button>
    </div>}
    {kind === 'sound' && <div className={css.creationForm}>
      <label>{t('effectPreset')}<select value={preset} onChange={event => { const value = event.target.value; if (value === 'bell' || value === 'rain' || value === 'steps') setPreset(value) }}>{(['bell', 'rain', 'steps'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <Button variant="primary" disabled={busy || dirty} onClick={() => { run(async () => { accept(await face.effect(project.id, revision, t(preset), preset)) }) }}>{t('createEffect')}</Button>
    </div>}
  </div>
}
