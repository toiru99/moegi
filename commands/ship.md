---
description: 게임을 배포용으로 패키징한다 (v0 — game.mpk 아카이브 생성)
---

현재 프로젝트 폴더의 MOEGI 게임을 배포용으로 패키징하라.

## 절차 (v0)

1. `validate_project`로 게임이 깨끗한지 확인 (에러 0이어야 진행).
2. moegi MCP `pack_game(game_dir=<프로젝트 절대경로>, out_mpk=<프로젝트 절대경로>/dist/game.mpk)` 실행.
3. 사용자에게 안내: 생성된 `dist/game.mpk`를 MOEGI 엔진 포터블 배포본의 `game.mpk` 자리에 넣으면 그 게임이 실행된다. (`python <엔진 홈>/tools/package.py`로 엔진 배포본을 만들 수 있다.)

> 참고: 게임+엔진을 한 번에 담는 "플레이어 전용" 원클릭 배포는 로드맵 P2다.
> 현재는 위 2단계(아카이브 생성)까지가 자동이다 — 과장해서 보고하지 마라.
