"""Zip the game for itch.io (HTML5 upload): dist/shadow-isle-web.zip with index.html at the root."""
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {"test.html"}


def main():
    cfg = (ROOT / "game" / "config.js").read_text()
    if 'SUPABASE_URL: ""' in cfg:
        print("warning: SUPABASE_URL is empty, so this build won't send telemetry (docs/SETUP.md)")
    out = ROOT / "dist" / "shadow-isle-web.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted((ROOT / "game").iterdir()):
            if f.is_file() and f.name not in SKIP:
                z.write(f, f.name)
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
