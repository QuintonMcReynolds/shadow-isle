"""Zip a game for itch.io (HTML5 upload), with index.html at the root.

    python tools/package.py              # dist/shadow-isle-web.zip
    python tools/package.py lighthouse   # dist/last-lighthouse-web.zip
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {"test.html"}


ZIPS = {"game": "shadow-isle-web.zip", "lighthouse": "last-lighthouse-web.zip"}


def main(web: str = "game"):
    cfg = (ROOT / web / "config.js").read_text()
    if 'SUPABASE_URL: ""' in cfg:
        print("warning: SUPABASE_URL is empty, so this build won't send telemetry (docs/SETUP.md)")
    out = ROOT / "dist" / ZIPS[web]
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted((ROOT / web).iterdir()):  # follows the shared-file symlinks
            if f.is_file() and f.name not in SKIP:
                z.write(f, f.name)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "game")
