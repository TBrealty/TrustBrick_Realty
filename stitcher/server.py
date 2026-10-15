"""The stitching service: one HTTP endpoint the website calls when an agent's photos are all uploaded.

POST /stitch   JSON {"hfov": 52.5, "shots": [{"yaw": 0, "pitch": 0, "roll": 0, "data": "<base64 JPEG>"}, …]}
               → 200 image/jpeg (the panorama), with X-Stitch-Info (JSON: photos, matches, aligned)
               → 422 {"error": "…"} when it can't be made
GET  /health   → 200 "ok"

One stitch at a time: joining 30 photos takes a minute or two and most of a gigabyte of memory.
Only the website talks to it (it's not published outside Docker's network in production).
"""

import base64
import binascii
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from stitch import StitchError, stitch_files

MAX_BODY = 120 * 1024 * 1024
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def error(self, status: int, message: str) -> None:
        self.reply(status, json.dumps({"error": message}).encode(), "application/json")

    def do_GET(self) -> None:
        if self.path == "/health":
            self.reply(200, b"ok", "text/plain")
        else:
            self.error(404, "Not found")

    def do_POST(self) -> None:
        if self.path != "/stitch":
            return self.error(404, "Not found")
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.error(413, "Too large")
        try:
            payload = json.loads(self.rfile.read(length))
            hfov = float(payload["hfov"])
            shots = [(base64.b64decode(s["data"], validate=True), float(s["yaw"]), float(s["pitch"]), float(s.get("roll", 0))) for s in payload["shots"]]
        except (ValueError, KeyError, TypeError, binascii.Error):
            return self.error(400, "Expected {hfov, shots: [{yaw, pitch, roll, data}]}")
        if not 20 <= hfov <= 120:
            return self.error(400, "hfov must be between 20 and 120 degrees")
        with LOCK:
            try:
                data, info = stitch_files(shots, hfov)
            except StitchError as e:
                return self.error(422, str(e))
        self.reply(200, data, "image/jpeg", {"X-Stitch-Info": json.dumps(info)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[stitcher] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8090"))
    print(f"[stitcher] listening on {port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
