---
name: vn-scene
description: MOEGI 비주얼노벨 씬을 제작·수정한다. 사용자가 "씬 만들어줘", "장면 추가", "연출 바꿔줘", "캐릭터 위치 조정" 등 게임 콘텐츠 제작을 요청할 때 사용. 작성→컴파일→렌더→시각검증 루프를 규격화.
---

# MOEGI 씬 제작 워크플로우

moegi MCP 툴로 아래 루프를 돈다.
**시각 검증 없이 완료 보고 금지** — 렌더를 눈으로 확인하는 것까지가 제작이다.

**경로 규약**: 게임 루트 = 현재 프로젝트 폴더. 모든 툴 호출에서 `game_root`·
`path`·`out_path`는 **절대경로**를 쓴다 (MCP 서버의 상대경로 기준은 사용자
프로젝트가 아니라 엔진 홈이다 — 상대경로를 쓰면 엉뚱한 곳에 파일이 생긴다).

## 절차

1. **문법 확인**: 처음이면 `<엔진 홈>/docs/mgs_spec.md`를 읽는다 (명령 목록, 표정 문법, 태그). 엔진 홈은 `/moegi:doctor`가 알려준다.
2. **작성**: `write_scenario(path, content)` — 원자적이라 컴파일 실패 시 파일이 바뀌지 않고
   `errors[].suggestion`이 온다. 제안을 반영해 통과할 때까지 재작성.
3. **정합 검증**: `validate_project(path, game_root)` — 미도달 라벨/누락 에셋 경고를 해소.
4. **시각 확인**: `render_scene(label, out_path, game_root)` → **Read로 PNG를 열어 직접 본다.**
   배치·표정·연출이 의도와 다르면 .mgs를 고치고 다시 렌더.
   ⚠ 렌더는 라벨로 **콜드 점프**한다 — 앞 장면에서 깐 @bg/BGM이 승계되지 않으니,
   렌더로 검증할 라벨은 배경을 라벨 안에서 자급(@bg 명시 — 같은 이미지면 실플레이 무해)
   하거나, 상태 승계가 중요한 장면은 playtest 스크린샷으로 검증한다.
   검게 나오면 엔진 로그의 `texture not found`와 assets/ 실재부터 확인.
5. **플레이 검증** (분기 있는 씬): `playtest(inputs=[{jump},{advance:N},{choose:i}], out_path)`
   → 최종 state.label이 기대 라벨인지 + 스크린샷 확인. 타이틀 화면은 playtest가
   자동으로 장면 시작해 준다 — 그래도 최종 state의 `mode`가 `title`이면 진행 실패로 봐라.
   - `advance` N = 클릭 N회이며 타이핑 중이면 클릭이 완성에 소모된다 — 특정 컷을
     잡으려면 `{"wait": 초}`를 섞고 state.pc로 위치를 보정하라(스크린샷은 마지막 상태에서 1장).
   - `port`는 세션 고유 값을 써라(기본 7871; Studio는 7767) — 동시 세션/연속 호출 충돌 방지.
6. 배포 요청 시에만: `pack_game(game_dir, out_mpk)` (또는 `/moegi:ship`).

## 규칙

- 게임 구조: `{게임 루트}/assets/` + `{게임 루트}/scenario/main.mgs`, 진입 라벨 `:: start`
- 표정 문법: `@show yuki smile` = `yuki_base.png` + `yuki_smile.png` 합성
- 위치명(`at ...`)은 그리드 이름만 유효: `left/mid-left/center/mid-right/right`,
  `far-*`(5종), `near-left/near-center/near-right`, `close` — 없는 이름(예: mid-center)은
  경고 후 중앙 폴백된다. 좌표 직접 지정은 `x=0.3 y=1.0 scale=1.1`.
- 샷 프레이밍: `@show ID EXPR shot=full/knees/bust/close` — 전신으로 멍하니 세우지
  말고 대화 씬은 bust/close를 적극 사용. 몸짓 강조는 `@anim ID shake/nod/jump/...`.
- **⚠ 스탠딩은 계속 남는다(persistence).** `@show`한 캐릭터는 `@hide`/`@exit`/`@hideall`
  전까지 무대에 그대로 유지된다 — `@bg`(배경 전환)도 `@jump`(라벨 이동)도 캐릭터를
  치우지 않는다. **장면·장소가 바뀌면 반드시 `@hideall`(모든 스탠딩 퇴장)로 무대를 비운 뒤
  새 장면에 필요한 인물만 다시 `@show` 하라.** 이걸 빠뜨리면 이전 장면의 인물이 새 배경 위에
  겹쳐 남는다(AI 대본의 가장 흔한 버그). 한 명만 내보낼 땐 `@hide ID`.
  - 예: `@jump wolf_scene` 직후의 라벨 첫 줄은 `@bg ...` → `@hideall dissolve 0.3` →
    그 장면에 등장하는 인물만 `@show`.
  - 엔딩 뒤 `@jump start`처럼 재시작할 때도 시작 라벨 초반에 `@hideall`로 정리.
  - 검증 팁: `playtest`의 state로 각 라벨에서 무대 인원을 확인하면 잔류를 잡을 수 있다.
- `@llm`은 반드시 `fallback=라벨` (컴파일러가 강제)
- CG는 `@cg` 사용 (배경 @bg와 구분 — 갤러리 해금이 걸림)
- 에셋이 없으면: ①**AI 생성**(아래) ②사용자에게 요청

## AI 에셋 생성 (이미지/BGM을 직접 만든다)

에셋이 없을 때 프롬프트로 생성한다. 실제 생성은 소액 과금이니 **생성 전
`estimate_asset_cost`로 비용을 확인**하고 사용자에게 알린다. 판권 캐릭터/작품명은
오리지널로 자동 변환된다(반환의 `copyright_note` 확인). 생성물은 SynthID
워터마크가 있고 CREDITS.md에 자동 기록된다. 모두 캐시되어 같은 프롬프트
재요청은 무과금.

- **스타일 일관성**: 이미지 프롬프트에는 항상 게임 루트 `story.md`의
  `## 아트 스타일` 공통 프롬프트를 붙인다. 사용한 프롬프트는 story.md
  `## 제작 로그`에 기록한다 — 다음 세션이 같은 화풍을 재현하는 근거다.
- **배경/CG**: `generate_image(prompt, kind="bg"|"cg", out_path, game_root)`
  → 게임 해상도에 맞춰 저장. 예: `@bg`로 바로 사용.
- **캐릭터 세트**: `generate_character_set(name, base_prompt, expressions,
  display, name_color, game_root)` → 기본+표정 스프라이트를 **같은 얼굴로**
  생성(레퍼런스 편집), 크로마키 투명 처리, characters.json 자동 등록.
  `name`은 ASCII 스프라이트 id. 이후 `@show {name} {expr}`로 사용.
  기존 캐릭터에 표정을 추가할 땐 **같은 name + story.md에 기록된 base 프롬프트**로
  호출하면 캐시된 base를 레퍼런스로 써 같은 얼굴이 유지된다.
- **스프라이트 1장**: `generate_image(prompt, kind="sprite", out_path)` (그린스크린→투명)
- **BGM**: `generate_bgm(prompt, out_path, loop=true, game_root)` → Lyria로
  ~30초 인스트루멘탈 생성 후 심리스 루프 가공. `@bgm ... loop`로 사용.
- 생성 후에는 반드시 **render_scene으로 눈 확인**(위 4단계) — 프롬프트를 고쳐
  재생성하는 루프를 돈다. 프로바이더/키는 엔진의 [AI 설정] 화면 또는
  `<엔진 홈>/saves/llm.json`.
