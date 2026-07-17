# -*- coding: utf-8 -*-
"""MCP shim — 엔진 홈을 해석해 그 안의 MCP 서버를 이 프로세스로 실행한다.

플러그인의 .mcp.json이 이 파일을 가리킨다. MCP 툴의 실제 구현
(tools/mcp/server.py + moegi_tools.py)의 단일 진실은 엔진 쪽이며,
플러그인은 위치만 찾아 넘긴다 — 코드 복사 없음, 드리프트 없음.
"""
import runpy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moegi_engine  # noqa: E402


def main() -> int:
    home = moegi_engine.find_engine_home()
    if home is None:
        sys.stderr.write(moegi_engine.INSTALL_HELP)
        return 1
    server = home / "tools" / "mcp" / "server.py"
    if not server.is_file():
        sys.stderr.write(
            f"엔진 홈({home})에 tools/mcp/server.py가 없습니다 — "
            "손상되었거나 너무 오래된 엔진입니다. 최신 릴리스로 교체하세요.\n")
        return 1
    # runpy는 일반 스크립트 실행과 달리 스크립트 폴더를 sys.path에 넣지
    # 않으므로, server.py가 형제(moegi_tools)·상위(moegilib)를 임포트할 수
    # 있게 직접 보강한다.
    sys.path.insert(0, str(server.parent))
    sys.path.insert(0, str(home / "tools"))
    runpy.run_path(str(server), run_name="__main__")
    return 0


if __name__ == "__main__":
    sys.exit(main())
