"""Screenshot the game in headless Chrome (dev helper): python tools/shot.py out.png '?demo=1' 9000"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from collector import serve

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def shot(out: str, query: str = "", budget_ms: int = 2000, size: str = "960,540", port: int = 8791):
    httpd = serve(port)
    out_p = Path(out)
    out_p.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as prof:
        p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                              f"--user-data-dir={prof}", f"--window-size={size}",
                              f"--virtual-time-budget={budget_ms}", f"--screenshot={out_p}",
                              f"http://127.0.0.1:{port}/index.html{query}"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        t0 = time.time()
        while not out_p.exists() and time.time() - t0 < 90:
            time.sleep(0.5)
        time.sleep(0.5)
        p.kill()
        p.wait()
    httpd.shutdown()
    return out_p.exists()


if __name__ == "__main__":
    print(shot(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "",
               int(sys.argv[3]) if len(sys.argv) > 3 else 2000))
