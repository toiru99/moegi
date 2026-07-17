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

    print_ai_status(home)
    print()
    print("제작 준비 완료 — 빈 폴더에서 /moegi:new 로 시작하세요.")
    return 0


def print_ai_status(home) -> None:
    """AI 생성 키 설정 여부 — 프로바이더/모델 이름만, 키 값은 절대 출력 금지."""
    import json
    cfg = home / "saves" / "llm.json"
    try:
        d = json.loads(cfg.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print("  AI 생성: – 미설정 (선택 기능) — 엔진 실행 → [설정 → AI 설정]에서")
        print("           프로바이더 키를 넣으면 캐릭터/배경/BGM 생성이 켜집니다.")
        print("           키 없이도 대본·연출 제작과 스타터 에셋은 그대로 사용 가능.")
        return
    text = d.get("provider") or "-"
    image = d.get("imageProvider") or text
    model = d.get("imageModel") or ""
    print(f"  AI 생성: ✓ 설정됨 (텍스트={text}, 이미지={image}"
          + (f", 모델={model}" if model else "") + ")")


if __name__ == "__main__":
    sys.exit(main())
