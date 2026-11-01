/** Self-contained native shell using the recovered Siglus SYSCOM contract. */
import sharp from 'sharp'
export const NATIVE_TITLE_SCENE = 'vn_studio_title'

function literal(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '').replaceAll('\n', '\\n').replaceAll('\t', ' ')}"`
}

const controls = [
  ['저장', 'save', 0, 0], ['불러오기', 'load', 0, 1], ['빠른 저장', 'qsave', 0, 2], ['빠른 불러오기', 'qload', 0, 3],
  ['로그', 'msg_log', 0, 4], ['자동', 'auto_mode', 0, 5], ['자동 켜짐', 'auto_mode', 1, 5],
  ['읽은 글 넘김', 'read_skip', 0, 6], ['넘김 켜짐', 'read_skip', 1, 6], ['설정', 'config', 0, 7],
] as const
const japaneseControls = ['セーブ', 'ロード', 'クイックセーブ', 'クイックロード', 'ログ', 'オート', 'オート中', '既読スキップ', 'スキップ中', '設定'] as const

/** New button artwork rasterized with the configured font. No commercial game assets are needed. */
export async function nativeSystemAssets(fontFile?: string, language: 'ko' | 'ja' = 'ko'): Promise<{ name: string; bytes: Buffer }[]> {
  return Promise.all(controls.map(async ([label, , mode], index) => {
    const text = await sharp({ text: {
      text: `<span foreground="#eef2ff">${language === 'ja' ? japaneseControls[index] : label}</span>`, font: 'Noto Sans CJK KR, Malgun Gothic, sans 18',
      ...fontFile === undefined ? {} : { fontfile: fontFile }, rgba: true, dpi: 72,
    } }).png().toBuffer()
    const rendered = await sharp(text).resize({ width: 133, height: 26, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true })
    const bytes = await sharp({ create: { width: 143, height: 38, channels: 4, background: mode === 1 ? '#365a73' : '#1d3043' } })
      .composite([{ input: rendered.data, left: Math.floor((143 - rendered.info.width) / 2), top: Math.floor((38 - rendered.info.height) / 2) }]).png().toBuffer()
    return { name: `vn_control_${index}`, bytes }
  }))
}

/** Gameexe directives. Omit custom *_SCENE handlers so the engine opens its functional built-in dialogs. */
export function nativeSystemConfigLines(projectId: string): string[] {
  const source = [
    `#REGNAME=${literal(`VNStudio_${projectId}`)}`,
    `#START_SCENE=${literal(NATIVE_TITLE_SCENE)},0`, `#MENU_SCENE=${literal(NATIVE_TITLE_SCENE)},0`,
    '#SAVE.CNT=30', '#QUICK_SAVE.CNT=1', '#END_SAVE.CNT=1',
    '#MESSAGE_BACK_SAVE.CNT=500', '#MESSAGE_BACK_SAVE.INTERVAL=1', '#SAVE_THUMB.USE=1', '#SAVE_THUMB.SIZE=240,135',
    '#CONFIG.MESSAGE_SPEED=20',
    '#COLOR.000=238,242,255', '#COLOR.001=12,18,30',
    '#MWND.CNT=1', '#MWND.000.WINDOW_POS=32,490', '#MWND.000.WINDOW_SIZE=1216,170',
    '#MWND.000.MESSAGE_POS=24,16', '#MWND.000.MOJI_CNT=42,4', '#MWND.000.MOJI_SIZE=26',
    '#MWND.000.MOJI_SPACE=0,8', '#MWND.000.WAKU_NO=0',
    '#WAKU.CNT=1', `#WAKU.BTN.CNT=${controls.length}`, '#WAKU.000.FILTER_COLOR=12,18,30,235',
    '#WAKU.000.FILTER_CONFIG_COLOR=0', '#WAKU.000.FILTER_CONFIG_TR=0',
    '#BUTTON.ACTION.CNT=1', '#BUTTON.ACTION.000.NORMAL=0,0,0,255,0,0',
    '#BUTTON.ACTION.000.HIT=0,0,0,255,32,0', '#BUTTON.ACTION.000.PUSH=0,0,1,255,48,0',
    '#BUTTON.ACTION.000.SELECT=0,0,0,255,32,0', '#BUTTON.ACTION.000.DISABLE=0,0,0,128,0,32',
  ]
  controls.forEach(([, type, mode, column], index) => {
    const prefix = `#WAKU.000.BTN.${String(index).padStart(3, '0')}`
    source.push(`${prefix}.TYPE=${literal(type)},${mode}`, `${prefix}.FILE="vn_control_${index}"`,
      `${prefix}.CUT_NO=0`, `${prefix}.POS=0,${16 + column * 155},188`, `${prefix}.ACTION=0`, `${prefix}.SE=-1`)
  })
  return source
}

/** Install before the first dialogue/savepoint. Object 0 stays available for composed scene artwork. */
export function nativeScenePrologue(): string[] {
  return [
    'script.set_auto_savepoint_on()', 'syscom.set_syscom_menu_enable()',
    'syscom.set_save_enable_flag(1)', 'syscom.set_load_enable_flag(1)', 'syscom.set_msg_back_enable_flag(1)',
    'syscom.set_auto_mode_enable_flag(1)', 'syscom.set_read_skip_enable_flag(1)',
    'syscom.set_mwnd_btn_enable()', 'syscom.set_mwnd_btn_touch_enable()',
  ]
}

/** Capture the story state before printing the next line, never the transient menu state. */
export function nativeSavepoint(): string { return 'savepoint()' }

/** The native button types dispatch directly while dialogue waits; no user-command callbacks are required. */
export function nativeSystemCommands(): string {
  return ''
}

/** Standalone title scene; commercial title artwork and scripts are not bundled. */
export function nativeTitleSource(options: { title: string; startScene: string; fontName: string; language?: 'ko' | 'ja' }): string {
  const titleChoices = options.language === 'ja' ? ['はじめから', 'つづきから', '設定', '終了'] : ['새 게임', '불러오기', '설정', '종료']
  const source = [
    '#z00', `script.set_font_name(${literal(options.fontName)})`,
    'script.set_auto_savepoint_off()', 'clear_savepoint()', 'syscom.set_save_enable_flag(0)',
    'syscom.set_auto_mode_onoff_flag(0)', 'syscom.set_read_skip_onoff_flag(0)',
    'syscom.set_syscom_menu_disable()', 'syscom.set_load_enable_flag(1)',
  ]
  for (let index = 100; index <= 110; index++) source.push(`front.object[${index}].init()`)
  source.push(
    `front.object[110].create_string(${literal(options.title)}, 1, 120, 16)`,
    'front.object[110].set_string_param(40, 0, 0, 50, 0, 1, 0)',
    'while (1) {', `a[0] = selbtn(${titleChoices.map(literal).join(', ')})`, 'switch (a[0]) {',
    `case (0) front.object[110].init() jump(${literal(options.startScene)})`,
    'case (1) syscom.call_load_menu()', 'case (2) syscom.call_config_menu()', 'case (3) syscom.end_game(1)', '}', '}',
  )
  return `${source.join('\n')}\n`
}
