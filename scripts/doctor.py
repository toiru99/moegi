# -*- coding: utf-8 -*-
"""/moegi:doctor — 설치 진단. 사람이 읽는 상태 보고 + 해결 안내.

종료코드: 0 = 제작 가능, 1 = 엔진/바이너리 문제.
"""
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):  # Windows cp949 콘솔 대비
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moegi_engine  # noqa: E402


def main() -> int:
    print("MOEGI 플러그인 진단")
    print(f"  python: {sys.version.split()[0]}")

    home = moegi_engine.find_engine_home()
    if home is None:
        print("  엔진 홈: ✗ 없음")
        for label, p in moegi_engine.candidates():
            print(f"    - {label}: {p} (없음)")
        print()
        print(moegi_engine.INSTALL_HELP)
        return 1
    print(f"  엔진 홈: ✓ {home}")

    lib = moegi_engine.load_moegilib(home)
    ok = True
    for name in ("moegi", "moegic", "moegipak"):
        p = lib.find_bin(name)
        if p:
            print(f"  {name}: ✓ {p}")
        else:
            print(f"  {name}: ✗ 실행 파일 없음 — {lib.BUILD_HINT}")
            ok = False
    if not ok:
        return 1

    print()
    print("제작 준비 완료 — 빈 폴더에서 /moegi:new 로 시작하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
