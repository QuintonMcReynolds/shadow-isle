"""Simulated players for testing the pipeline end to end, with the real game code.

Starts the dev collector, opens the game in headless Chrome with ?bot=N, waits until the bots
report done, and leaves their events in data/raw/bots.jsonl (every row has is_bot = true).

Bot *play* is the real simulation driven by a simple AI (game.js: BotBrain). Bot *behaviour*
(whether a bot plays another run or comes back another day) is an ASSUMED model, so bot data
tests the pipeline and the analysis code; it says nothing about real players.

    python tools/run_bots.py 400
"""

import subprocess
import sys
import tempfile
import time

from collector import DONE, DONE_MSG, RAW, serve

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def main(players: int = 300, seed: int = 1, port: int = 8788) -> None:
    out = RAW / "bots.jsonl"
    RAW.mkdir(parents=True, exist_ok=True)
    out.unlink(missing_ok=True)
    httpd = serve(port, out)
    url = (f"http://127.0.0.1:{port}/index.html?bot={players}&seed={seed}"
           f"&collector=http://127.0.0.1:{port}")
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
             "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
             f"--user-data-dir={profile}", url],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        t0 = time.time()
        try:
            if not DONE.wait(timeout=3600):
                raise SystemExit("bots did not finish within an hour")
        finally:
            chrome.terminate()
            chrome.wait(10)
            httpd.shutdown()
    if DONE_MSG and DONE_MSG[-1].startswith("ERROR"):
        raise SystemExit(f"bot run failed: {DONE_MSG[-1]}")
    with open(out) as f:
        n = sum(1 for _ in f)
    print(f"{players} bots, {n:,} events in {time.time() - t0:.0f}s -> {out}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 300)
