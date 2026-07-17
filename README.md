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

**AI 에셋 생성(캐릭터/배경/BGM)을 쓰려면**: 엔진을 한 번 실행해
[설정 → AI 설정]에서 프로바이더 키를 넣거나, `<엔진 홈>/saves/llm.json`에
직접 기록한다. 키가 없어도 대본·연출 제작과 동봉 스타터 에셋은 그대로 쓸 수 있다.

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

## 개발자 모드

엔진 소스 트리에서 작업 중이라면:

```
set MOEGI_HOME=D:\game        (빌드: cmake --preset win-release)
claude --plugin-dir <이 리포 경로>
```

설계 문서: [설계.MD](./설계.MD)
