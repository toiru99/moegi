# -*- coding: utf-8 -*-
"""게임 프로젝트 스캐폴드 — 대상 폴더를 MOEGI 게임 루트로 만든다.

템플릿·스타터 에셋 목록은 엔진의 runtime_data/scaffold/ 를 읽는다
(엔진 createNewGame / moegi make 와 같은 데이터 — 파일 목록 이중 정의 금지).

사용:  python scaffold.py --dest <게임 루트> [--name <표시 이름>]
대상에 이미 game.json이 있으면 아무것도 하지 않는다(멱등).
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


def scaffold(home: Path, dest: Path, name: str) -> None:
    tpl = home / "runtime_data" / "scaffold"
    files = {f: (tpl / f).read_text(encoding="utf-8")
             for f in ("main.mgs", "game.json", "characters.json",
                       "assets.list")}
    (dest / "scenario").mkdir(parents=True, exist_ok=True)
    (dest / "assets").mkdir(parents=True, exist_ok=True)
    src = home / "samples" / "hello_vn" / "assets"
    copied = 0
    for line in files["assets.list"].splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.endswith("/"):
            d = line.rstrip("/")
            if (src / d).is_dir():
                shutil.copytree(src / d, dest / "assets" / d,
                                dirs_exist_ok=True)
                copied += 1
        elif (src / line).is_file():
            shutil.copy2(src / line, dest / "assets" / line)
            copied += 1
    (dest / "scenario" / "main.mgs").write_text(
        files["main.mgs"].replace("{name}", name, 1), encoding="utf-8")
    (dest / "game.json").write_text(
        files["game.json"].replace("{name}", name, 1), encoding="utf-8")
    (dest / "characters.json").write_text(files["characters.json"],
                                          encoding="utf-8")
    print(f"✓ 스캐폴드 완료: {dest} (스타터 에셋 {copied}건)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", required=True, help="게임 루트(보통 프로젝트 폴더)")
    ap.add_argument("--name", default="", help="게임 표시 이름(기본: 폴더명)")
    args = ap.parse_args()

    dest = Path(args.dest).resolve()
    if (dest / "game.json").exists():
        print(f"✓ 이미 MOEGI 게임입니다: {dest} (스캐폴드 생략)")
        return 0

    home = moegi_engine.find_engine_home()
    if home is None:
        print(moegi_engine.INSTALL_HELP, file=sys.stderr)
        return 1
    scaffold(home, dest, args.name or dest.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
