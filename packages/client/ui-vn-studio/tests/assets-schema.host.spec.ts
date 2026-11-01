import { expect, it } from 'vitest'
import { parseProject } from '../src/store.ts'

const asset = { id: 'asset_abcd', name: '비 오는 서점', kind: 'background', mime: 'image/png', bytes: 120, width: 1280, height: 720 }
const project = { id: 'demo', title: '雨の本屋', language: 'ko', entry: 'start', scenes: [
  { id: 'start', title: '첫 장면', lines: [{ speaker: '서윤', text: '비가 오네요.' }], choices: [] },
] }

it('preserves old text documents and round-trips typed assets and scene composition', () => {
  expect(parseProject(project)).toEqual(project)
  const illustrated = { ...project, assets: [asset], scenes: [{ ...project.scenes[0], visual: { background: asset.id, characters: [] } }] }
  expect(parseProject(illustrated)).toEqual(illustrated)
})

it('round-trips optional original UI skin bindings while preserving legacy documents', () => {
  const skinned = { ...project, assets: [asset], uiSkin: { version: 1, brief: 'Original bookshop identity', title: asset.id, cursor: asset.id, dialogue: asset.id } }
  expect(parseProject(skinned)).toEqual(skinned)
  expect(parseProject(project)).not.toHaveProperty('uiSkin')
})

it('rejects invalid skin records and non-background or dangling skin assets', () => {
  for (const uiSkin of [
    { version: 2, brief: 'Original identity' }, { version: 1, brief: '' }, { version: 1, brief: 'x'.repeat(4001) },
    { version: 1, brief: 'Original identity', title: 'missing' },
  ]) expect(() => parseProject({ ...project, assets: [asset], uiSkin })).toThrow()
  expect(() => parseProject({ ...project, assets: [{ ...asset, kind: 'character' }],
    uiSkin: { version: 1, brief: 'Original identity', cursor: asset.id } })).toThrow(/skin|kind|background/i)
})

it('rejects dangling references and using a background as character or music', () => {
  for (const visual of [
    { background: 'missing', characters: [] },
    { characters: [{ asset: asset.id, x: 50, y: 100, scale: 0.9 }] },
    { characters: [], music: asset.id },
  ]) expect(() => parseProject({ ...project, assets: [asset], scenes: [{ ...project.scenes[0], visual }] })).toThrow(/asset|kind/i)
})

it('rejects unsafe asset metadata and out-of-range character placement', () => {
  for (const badAsset of [{ ...asset, id: '../outside' }, { ...asset, mime: 'image/svg+xml' }, { ...asset, width: 100000 }, { ...asset, width: 4096, height: 1 }]) {
    expect(() => parseProject({ ...project, assets: [badAsset] })).toThrow(/asset|id|media|dimension/i)
  }
  const character = { ...asset, kind: 'character' }
  for (const x of [NaN, -10, 101]) {
    expect(() => parseProject({ ...project, assets: [character], scenes: [{ ...project.scenes[0], visual: {
      characters: [{ asset: asset.id, x, y: 100, scale: 0.9 }],
    } }] })).toThrow(/position|placement/i)
  }
})
