/** Host-side Siglus literal generation. */
import { expect, it } from 'vitest'
import { sceneSource } from '../src/compiler.ts'

it('compiles literal dialogue and declared branches without treating user text as script', () => {
  const source = sceneSource({ id: 'start', title: 'Start', lines: [
    { speaker: '하루', text: '안녕!\njump("evil")' },
    { speaker: '春', text: 'おはよう。' },
  ], choices: [{ text: '같이 간다', target: 'next' }] })
  expect(source).toContain('print("【하루】안녕!\\njump(\\"evil\\")")')
  expect(source).toContain('print("【春】おはよう。")')
  expect(source).toContain('selbtn("같이 간다")')
  expect(source).toContain('jump("next")')
})

it('uses rendered button choices and maps both results to their distinct destinations', () => {
  const source = sceneSource({ id: 'start', title: 'Select', lines: [], choices: [
    { text: '첫 번째 길', target: 'left' }, { text: '二番目の道', target: 'right' },
  ] })
  expect(source).toContain('selbtn("첫 번째 길", "二番目の道")')
  expect(source).toContain('case (0) jump("left")')
  expect(source).toContain('case (1) jump("right")')
})

it('selects the supplied authoring font for Korean and Japanese glyph coverage', () => {
  const source = sceneSource({ id: 'start', title: 'Font', lines: [], choices: [] }, 'NotoSansCJKkr-Regular')
  expect(source).toContain('script.set_font_name("NotoSansCJKkr-Regular")')
})

it('loads composed artwork and registered audio before authored dialogue', () => {
  const source = sceneSource({ id: 'start', title: 'Stage', lines: [{ speaker: '서윤', text: '어서 와요.' }], choices: [] }, 'Font', {
    image: 'stage_start', music: 'asset_music', sound: 'asset_bell',
  })
  expect(source).toContain('front.object[0].create("stage_start", 1)')
  expect(source).toContain('bgm.play("asset_music")')
  expect(source).toContain('pcm.play("asset_bell")')
  expect(source.indexOf('front.object')).toBeLessThan(source.indexOf('print('))
})

it('installs reusable game systems and captures a savepoint before each spoken line and choice', () => {
  const source = sceneSource({ id: 'start', title: 'System', lines: [{ speaker: '서윤', text: '천천히 읽어 주세요.' }], choices: [{ text: '계속', target: 'next' }] })
  expect(source).toContain('syscom.set_mwnd_btn_enable()')
  expect(source).toContain('savepoint()\nprint(')
  expect(source).toContain('savepoint()\na[0] = selbtn(')
})
