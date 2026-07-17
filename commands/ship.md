---
description: 게임을 남에게 줄 수 있는 실행 폴더로 패키징한다 (엔진+게임 동봉, 저작 도구 제외)
---

현재 프로젝트 폴더의 MOEGI 게임을 플레이어 전용 배포 폴더로 패키징하라.

## 절차

1. `validate_project`로 게임이 깨끗한지 확인 (에러 0이어야 진행. 경고는 사용자에게 알리고 계속).
2. 엔진 홈에서 플레이어 패키저 실행 (경로는 전부 절대경로):
   ```
   python "<엔진 홈>/tools/package.py" --player --game "<프로젝트 절대경로>" --out "<프로젝트 절대경로>/dist/<게임이름>"
   ```
   결과 폴더 = `moegi.exe` + DLL + `runtime_data/` + `game/`(대본·에셋·레지스트리, story.md·생성캐시·세이브는 자동 제외) + `시작하기.txt` + `CREDITS.md`(있으면 — CC-BY/AI 생성 고지이므로 지우지 말 것).
3. 검증: 결과 폴더에서 `moegi.exe --render-label start check.png`를 실행해 **동봉 게임의 첫 장면**이 찍히는지 Read로 직접 확인 (엔진 데모가 찍히면 실패). 확인 후 check.png는 삭제.
4. 사용자에게 안내: 그 폴더를 zip으로 묶어 전달하면 받는 사람은 `moegi.exe` 더블클릭만으로 플레이할 수 있다 (설치 불요).
