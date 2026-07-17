# MOEGI 플러그인 완성 (리허설 → P1 릴리스/부트스트랩 → P2 플레이어 배포) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "플러그인 설치 두 줄 + `/moegi:new` 한 줄"로 게임이 나오고, `/moegi:ship`으로 남에게 줄 수 있는 실행 폴더까지 나오는 상태.

**Architecture:** 플러그인(D:\moegi)은 얇게 유지 — 엔진 두뇌는 D:\game이 단일 진실. 엔진 바이너리는 **플러그인 레포의 GitHub Releases**(`engine-v*` 태그)로 배포한다(엔진 리포는 비공개 유지, 공개되는 건 바이너리뿐). bootstrap이 그걸 받아 플러그인 데이터 폴더에 설치한다.

**Tech Stack:** Python 3.11 stdlib only(플러그인 스크립트), gh CLI(릴리스), PowerShell Compress-Archive, 엔진 C++/CMake(이번엔 package.py만 수정).

## Global Constraints

- 플러그인 스크립트는 **순수 stdlib** (엔진 moegilib 임포트는 허용 — 엔진 홈에서).
- MCP 툴/컴파일러 코드를 플러그인에 **복사 금지** (shim 원칙).
- 게임 경로는 항상 **절대경로** (MCP 서버 기준 상대경로는 엔진 홈이다).
- 플랫폼: **win-x64 우선** (Linux는 CI 실증 후 후속).
- 태스크마다 검증(렌더 PNG 육안 / exit 0 / doctor green) 후 커밋. 엔진 리포 커밋은 빌드그린+227테스트+selftest 통과 후.
- 리허설의 AI 생성 비용: 브리프에 "AI 생성 금지" 명시 = $0. 생성 리허설은 P3 이후 오너 확인 후.

---

### Task 0: 리허설 A — 헤드리스 `/moegi:new` (무생성)

플러그인의 진짜 인터페이스는 커맨드 지시문이다. 다른 Claude 세션이 그 지시문만 보고
게임을 완성하는지 실전 확인하고, 어긋나는 문구를 고친다.

**Files:**
- Modify(발견 시): `D:\moegi\commands\new.md`, `D:\moegi\skills\vn-scene\SKILL.md`
- Test artifact: `<scratchpad>\rehearsal_a\` (게임 폴더)

- [ ] **Step 1: 리허설 실행**

```powershell
New-Item -ItemType Directory -Force <scratchpad>\rehearsal_a
cd <scratchpad>\rehearsal_a
$env:MOEGI_HOME='D:\game'
claude --plugin-dir D:\moegi --dangerously-skip-permissions --max-turns 100 -p `
  "/moegi:new AI 이미지·BGM 생성은 절대 쓰지 마(비용 0). 동봉 스타터 에셋(midori 캐릭터, bg_day.png, bg_night.png, bgm_day.wav)만 사용. 3장면 미니 청춘 스토리 + 선택지 1개."
```

`-p`+`--plugin-dir` 조합이 안 먹으면 폴백: `claude plugin marketplace add D:\moegi` 후
`claude -p ...` (로컬 마켓플레이스 설치 경로).

- [ ] **Step 2: 산출물 검증**

- `game.json`·`characters.json`·`scenario/main.mgs`·`story.md` 존재
- `story.md`에 5개 섹션(시놉시스·톤/아트 스타일/캐릭터/플롯 상태/제작 로그)
- `moegic.exe <scenario> --validate --json --game-root <절대경로>` → ok:true
- `moegi.exe <절대경로> --render-label start out.png` → PNG를 Read로 육안 확인
- 세션 로그에서: doctor 실행했나, write_scenario/render_scene을 썼나, 시각검증 없이 완료 보고하지 않았나

- [ ] **Step 3: 지시문 결함 수정 + 커밋**

발견된 어긋남(문구 모호, 빠진 단계, 잘못된 경로 안내)을 new.md/SKILL.md에 반영.

```powershell
cd D:\moegi; git add -A; git commit -m "fix(commands): 리허설 A 반영 — ..."
```

### Task 1: 리허설 B — `/moegi:continue` 왕복 (story.md 일관성 규약 실증)

**Files:**
- Modify(발견 시): `D:\moegi\commands\continue.md`
- Test artifact: Task 0의 `rehearsal_a` 게임 폴더 재사용

- [ ] **Step 1: 실행**

```powershell
cd <scratchpad>\rehearsal_a
claude --plugin-dir D:\moegi --dangerously-skip-permissions --max-turns 60 -p `
  "/moegi:continue 밤 배경(bg_night.png)의 에필로그 장면을 하나 추가해줘. AI 생성 금지."
```

- [ ] **Step 2: 검증**

- 세션이 **story.md를 먼저 읽었는지** (로그 확인 — 규약의 핵심)
- 기존 라벨 불변 + 새 라벨 추가, validate ok, 새 장면 render 육안 확인
- story.md 플롯 상태·제작 로그 갱신됐는지

- [ ] **Step 3: 수정 + 커밋** (Task 0과 동일 요령)

### Task 2: P1a — 엔진 dist 빌드 + `engine-v0.1.0` 릴리스 업로드

**Files:**
- Create: 릴리스 자산 `moegi-engine-win-x64-v0.1.0.zip` (toiru99/moegi Releases)
- 소스 변경 없음 (기존 package.py 그대로)

**Interfaces:**
- Produces: 공개 다운로드 URL — Task 3의 bootstrap이 `engine-v*` 태그의
  `*win-x64*.zip` 자산을 GitHub API로 찾는다.

- [ ] **Step 1: dist 생성**

```powershell
cd D:\game
.\build\release\tools\moegipak\moegipak.exe pack samples/hello_vn game.mpk
python tools\package.py           # -> D:\game\dist
```

- [ ] **Step 2: dist가 "엔진 홈"으로 완결인지 스모크**

```powershell
$env:MOEGI_HOME='D:\game\dist'
python D:\moegi\scripts\doctor.py                     # green (exe 평탄 배치 인식)
# 외부 게임 E2E: rehearsal_a를 dist 바이너리로 렌더 → PNG 육안
```

- [ ] **Step 3: zip + 릴리스 업로드**

```powershell
Compress-Archive D:\game\dist\* <scratchpad>\moegi-engine-win-x64-v0.1.0.zip
gh auth status    # 실패 시 오너에게 gh 로그인 요청 (블로커)
gh release create engine-v0.1.0 <zip경로> --repo toiru99/moegi `
  --title "MOEGI Engine win-x64 v0.1.0" --notes "플러그인용 엔진 런타임 (bootstrap이 자동 설치)"
```

- [ ] **Step 4: 무인증 다운로드 확인** — `Invoke-WebRequest`로 `browser_download_url` HEAD 200.

### Task 3: P1b — `scripts/bootstrap.py` + doctor 연결

**Files:**
- Create: `D:\moegi\scripts\bootstrap.py`
- Modify: `D:\moegi\scripts\moegi_engine.py` (INSTALL_HELP에 bootstrap 안내),
  `D:\moegi\commands\doctor.md` (엔진 없으면 bootstrap 실행 제안), `D:\moegi\README.md`

**Interfaces:**
- Consumes: Task 2의 릴리스 (`GET https://api.github.com/repos/toiru99/moegi/releases`)
- Produces: `<MOEGI_PLUGIN_DATA|~/.moegi>/engine/` 에 설치된 엔진 홈 —
  기존 `moegi_engine.candidates()` 3·4순위가 이미 이 위치를 본다(연결 코드 불필요).

- [ ] **Step 1: bootstrap.py 작성** — 핵심 로직 (stdlib only):

```python
def latest_engine_release() -> dict:      # api.github.com releases에서
    ...                                    # tag가 engine-v* 인 첫 항목
def pick_asset(rel) -> dict:               # name에 win-x64, .zip 포함
def install(url, dest: Path) -> None:      # urllib로 tmp에 받고 zipfile로
    ...                                    # dest에 풀기 (기존 설치는 백업 후 교체)
# dest = Path(os.environ.get("MOEGI_PLUGIN_DATA") or Path.home()/".moegi") / "engine"
# 끝나면 moegi_engine.is_engine_home(dest) 확인 후 성공 메시지 + /moegi:doctor 안내
# sys.platform != win32 면 명확한 미지원 메시지로 종료
```

- [ ] **Step 2: 격리 환경 테스트**

```powershell
$env:MOEGI_HOME=''; $env:MOEGI_PLUGIN_DATA='<scratchpad>\plugdata'
python D:\moegi\scripts\bootstrap.py      # 다운로드+설치
python D:\moegi\scripts\doctor.py         # green — MOEGI_HOME 없이!
# 설치된 엔진으로 외부 게임 렌더 E2E 1회 (PNG 육안)
```

- [ ] **Step 3: INSTALL_HELP/doctor.md/README 갱신 + 커밋**

### Task 4: P2 — `package.py --player` + `/moegi:ship` 완성

**Files:**
- Modify: `D:\game\tools\package.py` (player 모드), `D:\moegi\commands\ship.md`

**Interfaces:**
- Produces: `python tools/package.py --player --game <게임 절대경로> --out <출력 절대경로>`
  → 출력 폴더 = moegi.exe+DLL+runtime_data+game.mpk+시작하기.txt (저작 툴체인 없음)

- [ ] **Step 1: package.py에 --player/--game/--out 분기 추가**

```python
ap.add_argument("--player", action="store_true")
ap.add_argument("--game", default="")
# player 분기: exe+dll 복사, runtime_data 복사까지는 동일.
# 이후: moegilib.require_bin("moegipak")으로 <game>을 <out>/game.mpk로 팩,
# tools/docs/samples 복사·mcp 등록·moegi.cmd 전부 생략,
# 시작하기.txt는 플레이어용 문구(실행+조작만; [게임 만들기] 언급 제거).
# --out 기본값을 player 모드에선 dist_player로.
```

- [ ] **Step 2: 리허설 게임으로 실검증**

```powershell
cd D:\game
python tools\package.py --player --game <scratchpad>\rehearsal_a --out <scratchpad>\player_dist
cd <scratchpad>\player_dist
.\moegi.exe --render-label start check.png   # cwd의 game.mpk = 리허설 게임
# check.png가 리허설 게임 첫 장면인지 육안 확인 (hello_vn이면 실패)
```

- [ ] **Step 3: 엔진 회귀** — 기존 `python tools/package.py`(무옵션)가 이전과 동일 산출인지 목록 비교, 227테스트+selftest.

- [ ] **Step 4: ship.md를 실제 절차로 교체** — validate → `package.py --player` 호출 → 출력 폴더 안내. "v0 한계" 문구 삭제.

- [ ] **Step 5: 커밋** — 엔진 리포(package.py), 플러그인 리포(ship.md) 각각.

### Task 5: 마감 — 문서·버전·기록

- [ ] README 갱신: 설치 2줄+bootstrap 자동 설치, AI 키 온보딩(엔진 [설정→AI 설정] 또는 `<엔진 홈>/saves/llm.json`), ship 사용법.
- [ ] `설계.MD` 로드맵 P0/P1/P2 체크오프, `plugin.json` version 0.2.0.
- [ ] 엔진 CLAUDE.md·메모리 갱신, 양 레포 push, 오너 최종 보고
      (알려진 잔여: 플레이어 dist 타이틀의 [게임 만들기] 허브는 툴 없이는 동작 안 함 — 후속).
