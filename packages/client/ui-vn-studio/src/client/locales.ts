import { creatorEn, creatorZh, creatorKo, creatorJa } from './creator-locales.ts'

/** Typed editor copy; project content remains in the author's language. */
export const en = {
  ...creatorEn,
  brandName: 'VN Studio', connectionTitle: 'ChatGPT', connectionHint: 'Connect your ChatGPT account to write scenes with the agent.',
  title: 'Novel studio', description: 'Write scenes and preview in Siglus',
  newProject: 'New project', projectId: 'Project id', projectTitle: 'Project title',
  language: 'Language', korean: 'Korean', japanese: 'Japanese', create: 'Create',
  open: 'Open project', reload: 'Reload', save: 'Save', undo: 'Undo saved edit', preview: 'Play game',
  scene: 'Scene', addScene: 'Add scene', sceneTitle: 'Scene title', entry: 'Opening scene',
  speaker: 'Speaker', dialogue: 'Dialogue', addLine: 'Add line', remove: 'Remove',
  choice: 'Choice', destination: 'Go to scene', addChoice: 'Add choice',
  hint: 'Ask the agent in chat to use vn_project. Reload to see its saved changes.',
  saved: 'Saved', working: 'Working…', revision: 'Revision', empty: 'Create or open a project to start writing.',
  signIn: 'Sign in with ChatGPT', connected: 'ChatGPT connected', cancelLogin: 'Cancel sign-in',
  continueLogin: 'Continue in browser', loginAnswer: 'Sign-in response', submitAnswer: 'Continue', loginFailed: 'Sign-in failed. Please try again.',
  dirty: 'Unsaved changes', discard: 'Discard unsaved changes?', playing: 'Opened in Siglus',
} satisfies Record<string, string>

export type VnStudioKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { vnStudio: VnStudioKey }
}

export const zh = {
  ...creatorZh,
  brandName: 'VN Studio', connectionTitle: 'ChatGPT', connectionHint: '连接ChatGPT账号，使用智能体编写场景。',
  title: '视觉小说工作室', description: '编写场景并在Siglus中运行',
  newProject: '新建项目', projectId: '项目ID', projectTitle: '作品标题',
  language: '语言', korean: '韩语', japanese: '日语', create: '创建',
  open: '打开项目', reload: '重新加载', save: '保存', undo: '撤销已保存的更改', preview: '运行游戏',
  scene: '场景', addScene: '添加场景', sceneTitle: '场景标题', entry: '开始场景',
  speaker: '说话者', dialogue: '对白', addLine: '添加对白', remove: '删除',
  choice: '选项', destination: '目标场景', addChoice: '添加选项',
  hint: '在聊天中请智能体使用vn_project。重新加载以查看已保存的更改。',
  saved: '已保存', working: '正在处理…', revision: '修订', empty: '创建或打开项目以开始编写。',
  signIn: '使用ChatGPT登录', connected: '已连接ChatGPT', cancelLogin: '取消登录',
  continueLogin: '在浏览器中继续', loginAnswer: '登录回复', submitAnswer: '继续', loginFailed: '登录失败，请重试。',
  dirty: '未保存的更改', discard: '放弃未保存的更改', playing: '已在Siglus中打开',
} satisfies Record<VnStudioKey, string>

export const ko = {
  ...creatorKo,
  brandName: 'VN Studio', connectionTitle: 'ChatGPT', connectionHint: 'ChatGPT 계정을 연결해 에이전트와 장면을 작성하세요.',
  title: '미연시 스튜디오', description: '장면을 만들고 Siglus로 실행하기',
  newProject: '새 프로젝트', projectId: '프로젝트 ID', projectTitle: '작품 제목',
  language: '언어', korean: '한국어', japanese: '일본어', create: '만들기',
  open: '프로젝트 열기', reload: '새로 읽기', save: '저장', undo: '저장한 변경 되돌리기', preview: '게임 실행',
  scene: '장면', addScene: '장면 추가', sceneTitle: '장면 제목', entry: '시작 장면',
  speaker: '화자', dialogue: '대사', addLine: '대사 추가', remove: '삭제',
  choice: '선택지', destination: '이동할 장면', addChoice: '선택지 추가',
  hint: '채팅에서 에이전트에게 vn_project 사용을 요청하세요. 저장된 변경은 새로 읽기로 확인할 수 있어요.',
  saved: '저장됨', working: '처리 중…', revision: '버전', empty: '프로젝트를 만들거나 열어 이야기를 시작하세요.',
  signIn: 'ChatGPT로 로그인', connected: 'ChatGPT 연결됨', cancelLogin: '로그인 취소',
  continueLogin: '브라우저에서 계속', loginAnswer: '로그인 응답', submitAnswer: '계속', loginFailed: '로그인에 실패했어요. 다시 시도해 주세요.',
  dirty: '저장하지 않은 변경', discard: '저장하지 않은 변경을 버릴까요?', playing: 'Siglus에서 실행 중',
} satisfies Record<VnStudioKey, string>

export const ja = {
  ...creatorJa,
  brandName: 'VN Studio', connectionTitle: 'ChatGPT', connectionHint: 'ChatGPTアカウントを接続してエージェントとシーンを作成します。',
  title: 'ノベルスタジオ', description: 'シーンを作りSiglusで実行',
  newProject: '新規プロジェクト', projectId: 'プロジェクトID', projectTitle: '作品名',
  language: '言語', korean: '韓国語', japanese: '日本語', create: '作成',
  open: 'プロジェクトを開く', reload: '再読込', save: '保存', undo: '保存した変更を元に戻す', preview: 'ゲーム実行',
  scene: 'シーン', addScene: 'シーンを追加', sceneTitle: 'シーン名', entry: '開始シーン',
  speaker: '話者', dialogue: 'セリフ', addLine: 'セリフを追加', remove: '削除',
  choice: '選択肢', destination: '移動先', addChoice: '選択肢を追加',
  hint: 'チャットでエージェントにvn_projectの使用を依頼してください。再読込で保存内容を確認できます。',
  saved: '保存済み', working: '処理中…', revision: 'リビジョン', empty: 'プロジェクトを作成または開いてください。',
  signIn: 'ChatGPTでログイン', connected: 'ChatGPT接続済み', cancelLogin: 'ログインをキャンセル',
  continueLogin: 'ブラウザで続ける', loginAnswer: 'ログインの回答', submitAnswer: '続ける', loginFailed: 'ログインに失敗しました。再試行してください。',
  dirty: '未保存の変更', discard: '未保存の変更を破棄しますか？', playing: 'Siglusで実行中',
} satisfies Record<VnStudioKey, string>
