---
description: MOEGI 설치 상태를 진단하고 문제 해결을 안내한다
---

`python "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.py"` 를 실행하고 결과를 사용자에게 전하라.

- 정상이면: 제작 준비 완료 — 빈 폴더에서 `/moegi:new`로 시작하라고 안내.
- 엔진 홈이 없으면: 사용자에게 자동 설치 여부를 물은 뒤 `python "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.py"` 를 실행해 최신 엔진 릴리스를 설치하고, 끝나면 doctor를 다시 실행해 green을 확인하라. 사용자가 이미 엔진을 갖고 있다면 `MOEGI_HOME` 환경변수(또는 플러그인 설정 `engine_home`) 지정을 도와줘라.
- 바이너리가 없으면(소스 트리인 경우): 엔진 빌드가 필요하다 — 출력의 빌드 힌트를 전하라.
