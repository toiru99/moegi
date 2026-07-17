# MOEGI — AI 비주얼노벨 제작 플러그인

말 한마디로 비주얼노벨을 만드는 [Claude Code](https://claude.com/claude-code) 플러그인.
스토리·캐릭터 일러스트·배경·BGM을 에이전트가 생성하고, [MOEGI 엔진](https://github.com/toiru99)이
컴파일·렌더·검증·패키징을 담당한다.

## 설치

```
/plugin marketplace add toiru99/moegi
/plugin install moegi@moegi
```

이후 `/moegi:doctor` 한 번 — 엔진 런타임이 없으면 최신 릴리스를 자동으로
받아 설치해 준다(win-x64). 이미 엔진(포터블 배포본/소스 트리)이 있다면
환경변수 `MOEGI_HOME` 또는 플러그인 설정 `engine_home`으로 지정해도 된다.

AI 에셋 생성을 쓰려면 API 키가 필요하다 — 아래 [AI 생성과 API 키](#ai-생성과-api-키) 참고.

## 사용법

```
mkdir my-game && cd my-game
claude
> /moegi:new 여름 바닷가 배경의 청춘 미연시. 주인공은 전학생.
```

| 커맨드 | 설명 |
|---|---|
| `/moegi:new [브리프]` | 현재 폴더에 새 게임 제작 (스캐폴드 → 스토리 바이블 → AI 에셋·대본 → 시각 검증) |
| `/moegi:continue [요청]` | 기존 게임 수정·다음 에피소드 제작 — `story.md` 바이블로 얼굴·화풍·톤 일관성 유지 |
| `/moegi:ship` | 남에게 줄 실행 폴더 패키징 — 엔진+게임 동봉, `moegi.exe` 더블클릭으로 플레이(설치 불요) |
| `/moegi:doctor` | 설치 진단 |

게임 폴더는 완전 자기서술이다: `scenario/`(대본) + `assets/` + `game.json` +
`characters.json` + `story.md`(스토리 바이블 — 생성 프롬프트·플롯 상태 기록) +
`CREDITS.md`. 폴더째 옮겨도, 몇 달 뒤 다시 열어도 이어 만들 수 있다.

## AI 생성과 API 키

| | 키 필요? |
|---|---|
| 대본·연출 제작, 컴파일·렌더 검증, 동봉 스타터 에셋, `/moegi:ship` 배포 | **불필요** |
| 캐릭터/배경/CG 이미지 생성, BGM 생성, `@llm` 동적 대사 | **필요** |

**설정 방법 (권장)**: 엔진을 한 번 실행(`moegi.exe`) → **[설정 → AI 설정]** →
프로바이더 선택 후 키 입력 — 즉시 적용된다. Gemini API 키, Google Vertex
서비스계정, OpenAI, Anthropic, 로컬 엔드포인트를 지원한다.
설정 여부는 `/moegi:doctor`가 보여준다.

**키는 어디에 저장되나**: 내 PC의 `<엔진 홈>/saves/llm.json` **한 곳뿐**이다
(평문이니 이 파일을 공유하지 말 것). 게임 프로젝트 폴더·플러그인·`/moegi:ship`
배포 폴더·엔진 릴리스 zip 어디에도 키가 들어가지 않으며, 엔진을 업데이트해도
`saves/`는 보존된다.

**비용**: 이미지/BGM 생성은 소액 과금이다. 에이전트는 생성 전에
`estimate_asset_cost`로 예상 비용을 알려주고, 같은 프롬프트 재요청은
캐시로 무과금이다. 키가 없으면 생성만 꺼질 뿐 나머지 제작은 전부 동작한다.

## 개발자 모드

엔진 소스 트리에서 작업 중이라면:

```
set MOEGI_HOME=D:\game        (빌드: cmake --preset win-release)
claude --plugin-dir <이 리포 경로>
```

설계 문서: [설계.MD](./설계.MD)
