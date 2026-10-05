"""Local development server: serves the game and collects telemetry into data/raw/*.jsonl.

    python tools/collector.py            # http://localhost:8787/index.html?collector=http://localhost:8787

POST /events  -> appends rows (same JSON as the Supabase insert) to data/raw/events.jsonl
POST /done    -> bot runs report completion here
Everything else is served from game/.
"""

import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DONE = threading.Event()
DONE_MSG: list[str] = []
LOCK = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    out_file = RAW / "events.jsonl"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT / "game"), **kw)

    def log_message(self, *args):  # quiet
        pass

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if self.path.startswith("/events"):
            rows = json.loads(body or b"[]")
            with LOCK, open(self.out_file, "a") as f:
                f.writelines(json.dumps(r) + "\n" for r in (rows if isinstance(rows, list) else [rows]))
            self.send_response(201)
        elif self.path.startswith("/done"):
            DONE_MSG.append(body.decode())
            DONE.set()
            self.send_response(200)
        else:
            self.send_response(404)
        self.end_headers()


def serve(port: int = 8787, out_file: Path | None = None) -> ThreadingHTTPServer:
    RAW.mkdir(parents=True, exist_ok=True)
    if out_file:
        Handler.out_file = out_file
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    serve(port)
    print(f"Shadow Isle dev server: http://localhost:{port}/index.html?collector=http://localhost:{port}")
    threading.Event().wait()
