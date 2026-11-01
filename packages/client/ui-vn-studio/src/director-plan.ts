/** Production planning, safe scene patches and evidence-based readiness. */
import { parseProduction, SceneStore } from './store.ts'
import type { MediaStatus, NovelAsset, NovelScene, ProductionMedia, ProductionStatus, ProductionWarning, ProjectRevision } from './types.ts'

const productionMessages = {
  ko: {
    missingPlan: '장면을 쓰기 전에 제작 계획을 저장하세요.',
    insufficientScenes: (actual: number, minimum: number) => `계획된 장면은 ${actual}개이며, 요청한 최소 장면은 ${minimum}개입니다.`,
    missingCast: '등장인물과 각 인물의 말투, 바라는 것을 기록하세요.',
    missingScene: '계획에는 있지만 저장된 장면이 없습니다.',
    unreachableScene: '현재 저장된 선택지로는 시작 장면에서 이 장면에 도달할 수 없습니다.',
    insufficientBeats: (actual: number, minimum: number) => `저장된 대사·서술은 ${actual}개이며, 요청한 최소 분량은 ${minimum}개입니다. 개요만으로 장면이 완성되지는 않습니다.`,
    longScene: (actual: number, maximum: number) => `저장된 대사·서술 ${actual}개가 요청한 ${maximum}개를 넘습니다. 장면의 호흡을 확인하세요.`,
    thinOutline: '장면을 쓰기 전에 행동과 반응의 흐름을 더 구체적으로 계획하세요.',
    missingActivity: '인물이 함께 하는 구체적인 활동이나 갈등을 정하세요.',
    relationshipJump: '도입부에 큰 관계 변화가 계획되어 있습니다. 행동과 반응으로 충분히 쌓였는지 확인하세요.',
    relationshipContinuity: (predecessor: string) => `이 장면의 관계 시작 상태가 앞서 연결된 「${predecessor}」 장면의 종료 상태와 다릅니다. 이어지는 흐름을 확인하세요.`,
    missingMediaPlan: (kind: string) => `${kind === 'background' ? '배경' : kind === 'character' ? '인물 이미지' : '배경음악'} 계획이 없습니다. 기존 자산을 지정하거나 생성 작업을 계획하세요.`,
    unassignedMedia: '실제 자산은 있지만 필요한 모든 장면에 지정되지 않았습니다.',
    imagePending: '이미지 작업이 남아 있습니다. 생성하거나 파일을 가져와 필요한 장면에 지정하세요.',
    imageBlocked: '이미지 작업이 대기 중입니다. 이미지 연결 화면에서 공급자를 연결하거나 파일을 가져와 필요한 장면에 지정하세요.',
    audioPending: '음악·효과음 작업이 남아 있습니다. 원본 악보나 지원하는 효과음을 준비해 실제 파일을 만드세요.',
    missingFile: (id: string) => `장면에 지정된 자산 ${id}의 실제 파일을 확인할 수 없습니다.`,
  },
  ja: {
    missingPlan: 'シーンを書く前に制作計画を保存してください。',
    insufficientScenes: (actual: number, minimum: number) => `計画は${actual}シーンです。指定された最小数は${minimum}シーンです。`,
    missingCast: '登場人物と、それぞれの話し方や望みを記録してください。',
    missingScene: '計画にはありますが、保存されたシーンがありません。',
    unreachableScene: '保存された選択肢では、開始シーンからこのシーンに到達できません。',
    insufficientBeats: (actual: number, minimum: number) => `保存された台詞・地の文は${actual}個です。指定された最小数は${minimum}個です。概要だけではシーンは完成しません。`,
    longScene: (actual: number, maximum: number) => `台詞・地の文${actual}個が指定の${maximum}個を超えています。シーンのテンポを確認してください。`,
    thinOutline: '執筆する前に、行動と反応の流れを具体的に計画してください。',
    missingActivity: '人物が共に取り組む具体的な作業や対立を決めてください。',
    relationshipJump: '導入で大きな関係の変化が計画されています。行動と反応で十分に積み重ねられているか確認してください。',
    relationshipContinuity: (predecessor: string) => `このシーンの関係の開始状態が、直前に接続された「${predecessor}」の終了状態と異なります。つながりを確認してください。`,
    missingMediaPlan: (kind: string) => `${kind === 'background' ? '背景' : kind === 'character' ? '人物画像' : 'BGM'}の計画がありません。既存の素材を指定するか、生成を計画してください。`,
    unassignedMedia: '実際の素材はありますが、必要なすべてのシーンに設定されていません。',
    imagePending: '画像の作業が残っています。生成またはファイルの読み込みを行い、必要なシーンに設定してください。',
    imageBlocked: '画像の作業は待機中です。画像接続画面でプロバイダーを接続するか、ファイルを読み込み、必要なシーンに設定してください。',
    audioPending: '音楽・効果音の作業が残っています。オリジナルの楽譜や対応する効果音を用意し、実際のファイルを作成してください。',
    missingFile: (id: string) => `シーンに設定された素材${id}の実際のファイルを確認できません。`,
  },
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected an object.')
  return value as Record<string, unknown>
}

function assertRevision(saved: ProjectRevision, revision: number): void {
  if (saved.revision !== revision) throw new Error('Revision conflict. Reload the project before editing production.')
}

/** Persist a complete bible, retaining existing content and adding only missing outline placeholders.
 * @param store - Authoritative project revisions and undo history.
 * @param id - Existing project id.
 * @param revision - Revision read by the caller.
 * @param input - Complete production metadata from JSON intake.
 * @param signal - Optional cancellation; absence leaves cancellation to the store owner.
 * @returns The committed project revision.
 */
export async function saveProductionPlan(store: SceneStore, id: string, revision: number, input: unknown, signal?: AbortSignal): Promise<ProjectRevision> {
  signal?.throwIfAborted()
  const saved = await store.read(id)
  assertRevision(saved, revision)
  const production = parseProduction(input, 'plan')
  for (const scene of production.scenes) if (scene.id === 'vn_studio_title') throw new Error('Scene id is reserved for the native title menu.')
  production.media = production.media.map(task => {
    const previous = saved.project.production?.media.find(old => old.id === task.id && old.kind === task.kind)
    return task.assetId === undefined && previous?.assetId !== undefined ? { ...task, assetId: previous.assetId } : task
  })
  const existing = new Set(saved.project.scenes.map(scene => scene.id))
  const placeholders = production.scenes.filter(scene => !existing.has(scene.id)).map(scene => ({ id: scene.id, title: scene.title, lines: [], choices: [] }))
  return store.save(id, revision, { ...saved.project, production, scenes: [...saved.project.scenes, ...placeholders] }, 'agent', signal)
}

/** Write one scene; omitted fields and omitted visual roles retain the saved value.
 * @param store - Authoritative project revisions and undo history.
 * @param id - Existing project id.
 * @param revision - Revision read by the caller.
 * @param input - Scene id and complete lines; title, choices and individual visual roles are optional patches.
 * @param signal - Optional cancellation; absence leaves cancellation to the store owner.
 * @returns The committed project, after whole-graph and asset validation.
 */
export async function writeProductionScene(store: SceneStore, id: string, revision: number, input: unknown, signal?: AbortSignal): Promise<ProjectRevision> {
  signal?.throwIfAborted()
  const saved = await store.read(id)
  assertRevision(saved, revision)
  const patch = record(input)
  const previous = saved.project.scenes.find(scene => scene.id === patch.id)
  if (previous === undefined) throw new Error('Scene does not exist. Add it to the production plan first.')
  if (!Array.isArray(patch.lines)) throw new Error('Complete scene lines are required.')
  const next: Record<string, unknown> = { ...previous, ...patch, id: previous.id }
  if (patch.visual !== undefined) next.visual = { ...previous.visual, ...record(patch.visual), characters: previous.visual?.characters ?? [],
    ...record(patch.visual).characters === undefined ? {} : { characters: record(patch.visual).characters } }
  return store.save(id, revision, { ...saved.project, scenes: saved.project.scenes.map(scene => scene.id === previous.id ? next : scene) }, 'agent', signal)
}

/** Whether one visual role actually references the requested admitted asset.
 * @param scene - Saved scene, or absent when the planned scene was removed.
 * @param task - Planned media use.
 * @returns Whether the scene uses the task's asset in its declared role.
 */
export function sceneUsesMedia(scene: NovelScene | undefined, task: ProductionMedia): boolean {
  if (scene?.visual === undefined || task.assetId === undefined) return false
  switch (task.kind) {
    case 'background': return scene.visual.background === task.assetId
    case 'character': return scene.visual.characters.some(character => character.asset === task.assetId)
    case 'music': return scene.visual.music === task.assetId
    case 'sound': return scene.visual.sound === task.assetId
  }
}

/** Compute inspectable progress from saved content, verified files and current providers.
 * @param saved - Current project and revision.
 * @param providers - Credential-free provider readiness.
 * @param availableAssets - Asset ids whose project-owned bytes passed integrity checks.
 * @returns Scene and media progress with concrete pacing/reference warnings; no literary score.
 */
export function deriveProductionStatus(saved: ProjectRevision, providers: MediaStatus['providers'], availableAssets: ReadonlySet<string>): ProductionStatus {
  const { project } = saved, production = project.production
  const copy = productionMessages[project.language]
  const warnings: ProductionWarning[] = []
  if (production === undefined) return { revision: saved.revision, planned: false, plannedScenes: 0, writtenScenes: 0, ready: false, scenes: [], media: [],
    warnings: [{ code: 'missing-plan', message: copy.missingPlan }], providers }
  const { minScenes, minBeats, maxBeats } = production.pacing
  if (production.scenes.length < minScenes) warnings.push({ code: 'insufficient-scenes', message: copy.insufficientScenes(production.scenes.length, minScenes) })
  if (production.cast.length === 0) warnings.push({ code: 'missing-cast', message: copy.missingCast })
  const reachable = new Set<string>(), queue = [project.entry]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const choice of project.scenes.find(scene => scene.id === id)?.choices ?? []) queue.push(choice.target)
  }
  const scenes: ProductionStatus['scenes'] = production.scenes.map((planned, index) => {
    const scene = project.scenes.find(scene => scene.id === planned.id)
    const beatCount = scene?.lines.length ?? 0
    if (scene === undefined) warnings.push({ code: 'missing-scene', sceneId: planned.id, message: copy.missingScene })
    else if (!reachable.has(planned.id)) warnings.push({ code: 'unreachable-scene', sceneId: planned.id, message: copy.unreachableScene })
    if (beatCount < minBeats) warnings.push({ code: 'insufficient-beats', sceneId: planned.id, message: copy.insufficientBeats(beatCount, minBeats) })
    if (beatCount > maxBeats) warnings.push({ code: 'long-scene', sceneId: planned.id, message: copy.longScene(beatCount, maxBeats) })
    if (planned.beats.length < minBeats) warnings.push({ code: 'thin-outline', sceneId: planned.id, message: copy.thinOutline })
    if (planned.sharedActivity.trim() === '') warnings.push({ code: 'missing-shared-activity', sceneId: planned.id, message: copy.missingActivity })
    if (planned.relationshipChange === 'major' && index < 2 && minScenes >= 5) warnings.push({ code: 'relationship-jump', sceneId: planned.id, message: copy.relationshipJump })
    for (const predecessor of project.scenes.filter(scene => scene.choices.some(choice => choice.target === planned.id))) {
      const prior = production.scenes.find(scene => scene.id === predecessor.id)
      if (prior !== undefined && prior.relationshipAfter !== planned.relationshipBefore) warnings.push({ code: 'relationship-continuity', sceneId: planned.id, message: copy.relationshipContinuity(predecessor.title) })
    }
    return { id: planned.id, title: scene?.title ?? planned.title, phase: beatCount === 0 ? 'planned' : beatCount < minBeats ? 'draft' : 'written', beatCount, minBeats, maxBeats }
  })
  for (const kind of ['background', 'music', ...production.cast.length > 0 ? ['character'] : []]) {
    if (!production.media.some(task => task.kind === kind)) warnings.push({ code: 'missing-media-plan', message: copy.missingMediaPlan(kind) })
  }
  const media: ProductionStatus['media'] = production.media.map(task => {
    const asset = project.assets?.find(asset => asset.id === task.assetId && asset.kind === task.kind)
    const exists = asset !== undefined && availableAssets.has(asset.id)
    const assigned = exists && task.sceneIds.every(id => sceneUsesMedia(project.scenes.find(scene => scene.id === id), task))
    const canGenerate = task.kind === 'music' ? task.scoreJson !== undefined : task.kind === 'sound' ? task.preset !== undefined
      : task.prompt !== undefined && providers.some(provider => provider.ready && provider.kinds.includes(task.kind))
    const state = assigned ? 'ready' : exists ? 'unassigned' : canGenerate ? 'pending' : 'blocked'
    if (state !== 'ready') warnings.push({ code: state === 'unassigned' ? 'unassigned-media' : 'missing-media', mediaId: task.id,
      message: exists ? copy.unassignedMedia : task.kind === 'background' || task.kind === 'character'
        ? canGenerate ? copy.imagePending : copy.imageBlocked : copy.audioPending })
    return { id: task.id, name: task.name, kind: task.kind, sceneIds: task.sceneIds, ...task.assetId === undefined ? {} : { assetId: task.assetId }, state }
  })
  const used = new Set<string>()
  for (const scene of project.scenes) if (scene.visual !== undefined) {
    for (const id of [scene.visual.background, scene.visual.music, scene.visual.sound, ...scene.visual.characters.map(character => character.asset)]) if (id !== undefined) used.add(id)
  }
  for (const id of used) if (!availableAssets.has(id)) warnings.push({ code: 'missing-asset-file', message: copy.missingFile(id) })
  const writtenScenes = scenes.filter(scene => scene.phase === 'written').length
  return { revision: saved.revision, planned: true, plannedScenes: scenes.length, writtenScenes, ready: writtenScenes === scenes.length && scenes.length >= minScenes && warnings.length === 0, scenes, media, warnings, providers }
}

/** Attach verified generated/reused media without replacing occupied visual roles.
 * @param store - Authoritative project storage.
 * @param saved - Current revision after media import.
 * @param taskId - Durable media requirement id.
 * @param asset - Actual admitted asset to bind.
 * @param signal - Cancellation checked by the common authoring save.
 * @returns A revision containing the binding and compatible scene assignments.
 */
export async function bindProductionMedia(store: SceneStore, saved: ProjectRevision, taskId: string, asset: NovelAsset, signal?: AbortSignal): Promise<ProjectRevision> {
  const production = saved.project.production
  const original = production?.media.find(task => task.id === taskId)
  if (production === undefined || original === undefined || original.kind !== asset.kind) throw new Error('Production media task changed. Reload before binding the asset.')
  const task = { ...original, assetId: asset.id }
  let changed = original.assetId !== asset.id
  const scenes = saved.project.scenes.map(scene => {
    if (!task.sceneIds.includes(scene.id)) return scene
    const visual = { ...scene.visual, characters: scene.visual?.characters ?? [] }
    let assigned = false
    switch (task.kind) {
      case 'character':
        if (!visual.characters.some(character => character.asset === asset.id) && visual.characters.length < 3) {
          const x = [50, 25, 75][visual.characters.length]!
          visual.characters = [...visual.characters, { asset: asset.id, x, y: 100, scale: 0.85 }]
          assigned = true
        }
        break
      case 'background': if (visual.background === undefined) { visual.background = asset.id; assigned = true }; break
      case 'music': if (visual.music === undefined) { visual.music = asset.id; assigned = true }; break
      case 'sound': if (visual.sound === undefined) { visual.sound = asset.id; assigned = true }; break
    }
    if (!assigned) return scene
    changed = true
    return { ...scene, visual }
  })
  if (!changed) return saved
  return store.save(saved.project.id, saved.revision, { ...saved.project, scenes, production: { ...production, media: production.media.map(row => row.id === task.id ? task : row) } }, 'agent', signal)
}
