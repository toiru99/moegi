# MOEGI — AI 비주얼노벨 제작 플러그인

말 한마디로 비주얼노벨을 만드는 [Claude Code](https://claude.com/claude-code) 플러그인.
스토리·캐릭터 일러스트·배경·BGM을 에이전트가 생성하고, [MOEGI 엔진](https://github.com/toiru99)이
컴파일·렌더·검증·패키징을 담당한다.

## 설치

```
/plugin marketplace add toiru99/moegi
/plugin install moegi@moegi
```

엔진 런타임이 따로 필요하다 (플러그인은 인터페이스, 엔진은 실행기):

- MOEGI 포터블 배포본(또는 소스 트리)이 있다면 환경변수 `MOEGI_HOME`으로
  경로를 지정하거나, 플러그인 설정 `engine_home`에 입력한다.
- 설치 상태 확인: `/moegi:doctor`

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
| `/moegi:ship` | 배포용 패키징 (`dist/game.mpk`) |
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
