import { expect, it } from 'vitest'
import { NATIVE_TITLE_SCENE, nativeScenePrologue, nativeSavepoint, nativeSystemAssets, nativeSystemCommands, nativeSystemConfigLines, nativeTitleSource } from '../src/native-template.ts'
import sharp from 'sharp'

it('creates a separate native title with literal author text and the declared story entry', () => {
  const source = nativeTitleSource({ title: '별빛 "학교"\njump("bad")', startScene: 'chapter_1', fontName: 'NotoSansCJKkr-Regular' })
  expect(NATIVE_TITLE_SCENE).toBe('vn_studio_title')
  expect(source).toContain('script.set_font_name("NotoSansCJKkr-Regular")')
  expect(source).toContain('별빛 \\"학교\\"\\njump(\\"bad\\")')
  expect(source).toContain('jump("chapter_1")')
  expect(source).toContain('syscom.call_load_menu()')
  expect(source).toContain('syscom.call_config_menu()')
  expect(source).toContain('script.set_auto_savepoint_off()')
  expect(source).not.toMatch(/^savepoint\(\)/m)
})

it('uses engine fallback dialogs and project-specific save identity without commercial resources', () => {
  const config = nativeSystemConfigLines('moon_school').join('\n')
  expect(config).toContain('#REGNAME="VNStudio_moon_school"')
  expect(config).toContain('#SAVE.CNT=30')
  expect(config).toContain('#QUICK_SAVE.CNT=1')
  expect(config).toContain(`#START_SCENE="${NATIVE_TITLE_SCENE}",0`)
  expect(config).toContain(`#MENU_SCENE="${NATIVE_TITLE_SCENE}",0`)
  expect(config).not.toMatch(/#(?:CANCEL|SAVE|LOAD|CONFIG)_SCENE|_sys_|\.g00|kinkoi/i)
})

it('binds bottom message-window buttons directly to native system types without blocked script callbacks', () => {
  const prologue = nativeScenePrologue().join('\n')
  expect(prologue).toContain('script.set_auto_savepoint_on()')
  expect(prologue).toContain('syscom.set_syscom_menu_enable()')
  expect(prologue).toContain('syscom.set_save_enable_flag(1)')
  expect(prologue).not.toContain('set_button_call')
  const config = nativeSystemConfigLines('moon_school').join('\n')
  for (const type of ['save', 'load', 'qsave', 'qload', 'msg_log', 'auto_mode', 'read_skip', 'config']) {
    expect(config).toMatch(new RegExp(`\\.TYPE="${type}"`))
  }
  expect(config).toContain('#WAKU.000.BTN.000.POS=0,16,188')
  expect(config).toContain('#MWND.000.WAKU_NO=0')
  expect(config).not.toContain('.CALL=')
  expect(nativeSystemCommands()).toBe('')
  expect(nativeSavepoint()).toBe('savepoint()')
})

it('renders original button labels into bounded PNG assets for every native button state', async () => {
  const assets = await nativeSystemAssets()
  expect(assets).toHaveLength(10)
  expect(new Set(assets.map(asset => asset.name)).size).toBe(10)
  for (const asset of assets) {
    const info = await sharp(asset.bytes).metadata()
    expect(info.format).toBe('png')
    expect(info.width).toBe(143)
    expect(info.height).toBe(38)
  }
})

it('uses Japanese title and native toolbar labels for a Japanese project', async () => {
  const source = nativeTitleSource({ title: '星の学校', startScene: 'start', fontName: 'Font', language: 'ja' })
  expect(source).toContain('selbtn("はじめから", "つづきから", "設定", "終了")')
  const korean = await nativeSystemAssets(undefined, 'ko')
  const japanese = await nativeSystemAssets(undefined, 'ja')
  expect(japanese).toHaveLength(korean.length)
  expect(japanese[0]?.bytes.equals(korean[0]!.bytes)).toBe(false)
})
