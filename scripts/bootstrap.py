# -*- coding: utf-8 -*-
"""MOEGI 엔진 자동 설치 — 릴리스 zip을 받아 엔진 홈을 만든다.

기본: github.com/toiru99/moegi Releases에서 최신 `engine-v*` 태그의
win-x64 zip을 받아 <플러그인 데이터|~/.moegi>/engine 에 설치.
오프라인/검증용: `--zip <파일>` 로 로컬 zip을 같은 위치에 설치.

설치 위치는 moegi_engine.candidates()의 3·4순위와 같은 곳이라,
설치가 끝나면 doctor/MCP shim이 즉시 찾는다.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moegi_engine  # noqa: E402

REPO = "toiru99/moegi"
API = f"https://api.github.com/repos/{REPO}/releases"


def install_dir() -> Path:
    base = os.environ.get("MOEGI_PLUGIN_DATA")
    return (Path(base) if base else Path.home() / ".moegi") / "engine"


def http_json(url: str):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "moegi-bootstrap",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def latest_engine_release() -> dict:
    for rel in http_json(API):
        if rel.get("tag_name", "").startswith("engine-v") and not rel.get("draft"):
            return rel
    raise SystemExit("engine-v* 릴리스를 찾지 못했습니다 — "
                     f"https://github.com/{REPO}/releases 확인")


def pick_asset(rel: dict) -> dict:
    for a in rel.get("assets", []):
        name = a.get("name", "")
        if "win-x64" in name and name.endswith(".zip"):
            return a
    raise SystemExit(f"릴리스 {rel['tag_name']}에 win-x64 zip 자산이 없습니다")


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "moegi-bootstrap"})
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            got += len(chunk)
            if total:
                print(f"\r  다운로드 {got / 1048576:.1f}/{total / 1048576:.1f} MB",
                      end="", flush=True)
        print()


# 엔진 교체 시 살아남아야 하는 사용자 데이터 — API 키(saves/llm.json),
# 세이브·해금(saves/), 엔진 홈에서 만든 게임(games/).
PRESERVE_DIRS = ("saves", "games")


def install_zip(zip_path: Path, dest: Path) -> None:
    """zip을 dest에 설치. 기존 설치는 .old로 밀어두고 교체(실패 시 복원).
    교체 후 PRESERVE_DIRS(키·세이브·게임)를 이전 설치에서 이어받는다."""
    backup = None
    if dest.exists():
        backup = dest.with_name(dest.name + ".old")
        if backup.exists():
            shutil.rmtree(backup)
        dest.rename(backup)
    try:
        dest.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(dest)
        if not moegi_engine.is_engine_home(dest):
            raise SystemExit("압축은 풀렸지만 엔진 홈 형태가 아닙니다 "
                             "(tools/moegilib.py 없음) — zip이 올바른지 확인")
        if backup is not None:
            for d in PRESERVE_DIRS:
                src = backup / d
                if src.is_dir() and not (dest / d).exists():
                    shutil.copytree(src, dest / d)
                    print(f"  · 기존 {d}/ 이어받음 (키·세이브·게임 보존)")
    except BaseException:
        shutil.rmtree(dest, ignore_errors=True)
        if backup is not None:
            backup.rename(dest)
            print("문제가 생겨 기존 설치를 복원했습니다.", file=sys.stderr)
        raise
    if backup is not None:
        shutil.rmtree(backup, ignore_errors=True)


def main() -> int:
    if sys.platform != "win32":
        print("아직 win-x64 릴리스만 제공됩니다 — 다른 플랫폼은 엔진을 직접 "
              "빌드한 뒤 MOEGI_HOME으로 지정하세요.", file=sys.stderr)
        return 1
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", default="",
                    help="로컬 엔진 zip으로 설치 (다운로드 생략)")
    args = ap.parse_args()

    dest = install_dir()
    if args.zip:
        print(f"로컬 zip 설치: {args.zip} → {dest}")
        install_zip(Path(args.zip), dest)
    else:
        rel = latest_engine_release()
        asset = pick_asset(rel)
        print(f"{rel['tag_name']} ({asset['name']}, "
              f"{asset['size'] / 1048576:.1f} MB) → {dest}")
        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td) / asset["name"]
            download(asset["browser_download_url"], tmp)
            install_zip(tmp, dest)

    print(f"✓ 엔진 설치 완료: {dest}")
    print("확인: /moegi:doctor  ·  시작: 빈 폴더에서 /moegi:new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
