"""Run game/test.html in headless Chrome and report (exit 1 on failure)."""
import json
import subprocess
import sys
import tempfile

from collector import DONE, DONE_MSG, serve

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

httpd = serve(8792)
with tempfile.TemporaryDirectory() as prof:
    p = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}",
                          "http://127.0.0.1:8792/test.html?collector=http://127.0.0.1:8792"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = DONE.wait(120)
    p.kill()
    p.wait()
httpd.shutdown()
if not ok:
    sys.exit("JS tests did not report back")
results = json.loads(DONE_MSG[-1])
for r in results:
    print(("PASS " if r["ok"] else "FAIL ") + r["name"] + ("" if r["ok"] else "  -> " + r["err"]))
print(f"{sum(r['ok'] for r in results)}/{len(results)} JS tests passed")
sys.exit(0 if all(r["ok"] for r in results) else 1)
