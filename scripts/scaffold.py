# -*- coding: utf-8 -*-
"""게임 프로젝트 스캐폴드 — 대상 폴더를 MOEGI 게임 루트로 만든다.

템플릿·스타터 에셋 목록은 엔진의 runtime_data/scaffold/ 를 읽는다
(엔진 createNewGame / moegi make 와 같은 데이터 — 파일 목록 이중 정의 금지).

멱등은 **파일 단위**다: 이미 있는 파일은 절대 덮어쓰지 않고, 없는 것만
채운다 — 그래서 assets/가 사라진 반파 프로젝트도 재실행 한 번으로 복구된다
(리허설에서 외부 임시폴더 정리가 assets를 지운 실사례 반영).

사용:  python scaffold.py --dest <게임 루트> [--name <표시 이름>]
"""
import argparse
import shutil
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moegi_engine  # noqa: E402


def copy_missing_tree(src: Path, dst: Path) -> int:
    """src 트리에서 dst에 없는 파일만 복사. 반환: 채운 파일 수."""
    filled = 0
    for f in src.rglob("*"):
        if not f.is_file():
            continue
        target = dst / f.relative_to(src)
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, target)
        filled += 1
    return filled


def scaffold(home: Path, dest: Path, name: str) -> int:
    tpl = home / "runtime_data" / "scaffold"
    files = {f: (tpl / f).read_text(encoding="utf-8")
             for f in ("main.mgs", "game.json", "characters.json",
                       "assets.list")}
    (dest / "scenario").mkdir(parents=True, exist_ok=True)
    (dest / "assets").mkdir(parents=True, exist_ok=True)
    src = home / "samples" / "hello_vn" / "assets"
    filled = 0
    for line in files["assets.list"].splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.endswith("/"):
            d = line.rstrip("/")
            if (src / d).is_dir():
                filled += copy_missing_tree(src / d, dest / "assets" / d)
        elif (src / line).is_file():
            target = dest / "assets" / line
            if not target.exists():
                shutil.copy2(src / line, target)
                filled += 1
    templates = {
        dest / "scenario" / "main.mgs":
            files["main.mgs"].replace("{name}", name, 1),
        dest / "game.json": files["game.json"].replace("{name}", name, 1),
        dest / "characters.json": files["characters.json"],
    }
    for path, content in templates.items():
        if not path.exists():
            path.write_text(content, encoding="utf-8")
            filled += 1
    return filled


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", required=True, help="게임 루트(보통 프로젝트 폴더)")
    ap.add_argument("--name", default="", help="게임 표시 이름(기본: 폴더명)")
    args = ap.parse_args()

    dest = Path(args.dest).resolve()
    home = moegi_engine.find_engine_home()
    if home is None:
        print(moegi_engine.INSTALL_HELP, file=sys.stderr)
        return 1
    filled = scaffold(home, dest, args.name or dest.name)
    if filled:
        print(f"✓ 스캐폴드 완료: {dest} (채운 파일 {filled}건 — 기존 파일 불변)")
    else:
        print(f"✓ 이미 완전한 MOEGI 게임입니다: {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
