# -*- coding: utf-8 -*-
"""엔진 홈 해석 — 플러그인의 모든 스크립트가 공유하는 단일 규칙.

"엔진 홈" = MOEGI 포터블 dist 또는 소스 트리의 루트. 판별 기준은
`tools/moegilib.py`의 존재(엔진 쪽 공용 모듈 — dist에도 동봉된다).

우선순위:
  1. MOEGI_HOME 환경변수                      (dev 모드 / 수동 지정)
  2. CLAUDE_PLUGIN_OPTION_ENGINE_HOME          (플러그인 userConfig)
  3. $MOEGI_PLUGIN_DATA/engine                 (릴리스 부트스트랩 설치 위치,
                                                .mcp.json이 ${CLAUDE_PLUGIN_DATA}를 주입)
  4. ~/.moegi/engine
"""
from __future__ import annotations

import os
import sys
from pathlib import Path


def is_engine_home(p: Path) -> bool:
    return (p / "tools" / "moegilib.py").is_file()


def candidates() -> list[tuple[str, Path]]:
    out: list[tuple[str, Path]] = []
    if os.environ.get("MOEGI_HOME"):
        out.append(("MOEGI_HOME", Path(os.environ["MOEGI_HOME"])))
    if os.environ.get("CLAUDE_PLUGIN_OPTION_ENGINE_HOME"):
        out.append(("플러그인 설정(engine_home)",
                    Path(os.environ["CLAUDE_PLUGIN_OPTION_ENGINE_HOME"])))
    if os.environ.get("MOEGI_PLUGIN_DATA"):
        out.append(("플러그인 데이터",
                    Path(os.environ["MOEGI_PLUGIN_DATA"]) / "engine"))
    out.append(("기본 위치", Path.home() / ".moegi" / "engine"))
    return out


def find_engine_home() -> Path | None:
    for _, p in candidates():
        if is_engine_home(p):
            return p.resolve()
    return None


INSTALL_HELP = """\
MOEGI 엔진을 찾지 못했습니다. 다음 중 하나로 해결하세요:

  1) 자동 설치 (권장):
       python <플러그인 폴더>/scripts/bootstrap.py
     최신 엔진 릴리스를 받아 설치합니다. (/moegi:doctor 가 대신 실행해 줄 수 있음)
  2) 이미 엔진(포터블 dist 또는 소스 트리)이 있다면 그 경로를 지정:
       환경변수  MOEGI_HOME=<엔진 경로>
       (또는 플러그인 설정의 engine_home)

확인 명령:  /moegi:doctor
"""


def load_moegilib(home: Path):
    """엔진의 moegilib을 임포트해 돌려준다 (find_bin 등 재사용)."""
    sys.path.insert(0, str(home / "tools"))
    import moegilib  # noqa: PLC0415
    return moegilib
