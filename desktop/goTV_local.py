#!/usr/bin/env python3
"""goTV_local.py - Local server for the Go TV desktop app.

Serves the production build (build-desktop/) on 127.0.0.1 only, so the app
can run in a browser window without any remote exposure.

KGS access is proxied through /json/access: the regular JSON endpoint for
non-browser clients (measured: POST with Origin https://shin.gokgs.com ->
200, Origin http://127.0.0.1:8788 -> HTTP 403; no Origin -> 200 + cookie).
Even /json/access enforces the CORS origin whitelist, so the proxy keeps
stripping the Origin header - forwarding it breaks the login (403).
So the desktop build is compiled with REACT_APP_API_URL=/json/access
and this server forwards POST/GET/OPTIONS to
https://www.gokgs.com/json/access, passing session cookies (JSESSIONID,
Path=/json matches the local /json/access) and keeping GET requests open
for long-polling. Measurement + rationale: AGENTS.md.

/igs-bridge is reserved for a future IGS source (TCP->WebSocket bridge) and
deliberately returns 501. See AGENTS.md roadmap ("IgsTvSource - BLOCKIERT").

Usage:
    python3 goTV_local.py [--build DIR] [--port N]
Environment:
    GOTV_BUILD_DIR, GOTV_PORT
"""

import argparse
import http.client
import http.server
import os
import re
import socketserver
import sys
import urllib.parse

DEFAULT_PORT = 8788
DEFAULT_BUILD_DIR = "build-desktop"

KGS_UPSTREAM_HOST = "www.gokgs.com"
KGS_UPSTREAM_PATH = "/json/access"
PROXY_PATH = "/json/access"

# Long-polling: KGS keeps GET open until messages arrive. No read timeout.
KGS_GET_TIMEOUT = None

# Headers passed from the browser to KGS and back. Everything else is dropped
# (host, content-length etc. are handled by the http library). The Origin
# header is deliberately NOT forwarded: even the regular /json/access endpoint
# enforces the CORS origin whitelist and rejects 127.0.0.1 with HTTP 403
# (measured); server-side requests need no Origin.
REQUEST_HEADERS = {
    "accept",
    "accept-encoding",
    "accept-language",
    "content-type",
    "cookie",
    "user-agent",
    "x-requested-with",
}
RESPONSE_HEADERS = {
    "content-type",
    "set-cookie",
    "content-length",
    "cache-control",
    "expires",
    "pragma",
}

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".txt": "text/plain; charset=utf-8",
    ".sgf": "application/x-go-sgf",
    ".xml": "application/xml",
}

# Anything outside these characters in a URL path is refused outright.
SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_\-./]+$")


class GoTvHandler(http.server.BaseHTTPRequestHandler):
    server_version = "GoTvLocal/1.0"

    build_dir = DEFAULT_BUILD_DIR

    def do_GET(self):
        if self._maybe_proxy("GET"):
            return
        self._handle("GET")

    def do_POST(self):
        if self._maybe_proxy("POST"):
            return
        self._handle("POST")

    def do_OPTIONS(self):
        if self._maybe_proxy("OPTIONS"):
            return
        self.send_error(404, "Not found")

    def do_HEAD(self):
        self._handle("HEAD")

    def _maybe_proxy(self, method):
        """Forward KGS API requests; returns True if handled."""
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != PROXY_PATH:
            return False
        self._proxy_request(method)
        return True

    def _proxy_request(self, method):
        body = None
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            body = self.rfile.read(length)

        headers = {}
        for name, value in self.headers.items():
            if name.lower() in REQUEST_HEADERS:
                headers[name] = value

        timeout = None if method == "GET" else 60
        try:
            conn = http.client.HTTPSConnection(
                KGS_UPSTREAM_HOST, timeout=timeout
            )
            conn.request(method, KGS_UPSTREAM_PATH, body=body, headers=headers)
            resp = conn.getresponse()
            resp_body = resp.read()
        except Exception as err:
            sys.stderr.write("gotv-local proxy error: %s\n" % err)
            self.send_error(502, "KGS proxy error")
            return

        self.send_response(resp.status)
        for name, value in resp.getheaders():
            if name.lower() in RESPONSE_HEADERS:
                self.send_header(name, value)
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(resp_body)
        except BrokenPipeError:
            pass
        conn.close()

    def _handle(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/igs-bridge",) or path.startswith("/igs-bridge/"):
            self._not_implemented()
            return

        if not SAFE_PATH_RE.match(path):
            self.send_error(400, "Bad request")
            return

        rel = path.lstrip("/")
        if not rel:
            rel = "index.html"

        file_path = os.path.normpath(os.path.join(self.build_dir, rel))
        if not file_path.startswith(os.path.abspath(self.build_dir)):
            self.send_error(403, "Forbidden")
            return

        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, "index.html")

        if os.path.isfile(file_path):
            self._serve_file(file_path, method)
        else:
            # SPA fallback: the app uses history-based routing (/tv, /watch)
            index = os.path.join(self.build_dir, "index.html")
            if os.path.isfile(index):
                self._serve_file(index, method)
            else:
                self.send_error(404, "Not found: " + self.path)

    def _serve_file(self, file_path, method):
        ext = os.path.splitext(file_path)[1].lower()
        content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
        try:
            with open(file_path, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_error(404, "Not found: " + self.path)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        if method != "HEAD":
            self.wfile.write(data)

    def _not_implemented(self):
        body = (
            b"501 Not Implemented\n\n"
            b"/igs-bridge ist reserviert fuer eine kuenftige IGS-Quelle "
            b"(TCP<->WebSocket-Bruecke). Solange die IGS-Nutzungsbedingungen "
            b"nicht geprueft sind, wird nichts implementiert. Siehe AGENTS.md "
            b"(Roadmap: IgsTvSource - BLOCKIERT)."
        )
        self.send_response(501)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002 - http.server API
        sys.stderr.write("gotv-local %s - %s\n" % (self.address_string(), format % args))


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main(argv=None):
    parser = argparse.ArgumentParser(description="Go TV local server")
    parser.add_argument(
        "--build",
        default=os.environ.get("GOTV_BUILD_DIR", DEFAULT_BUILD_DIR),
        help="directory with the production build (default: build-desktop)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("GOTV_PORT", DEFAULT_PORT)),
        help="port to listen on (default: 8788)",
    )
    args = parser.parse_args(argv)

    build_dir = os.path.abspath(args.build)
    if not os.path.isfile(os.path.join(build_dir, "index.html")):
        sys.stderr.write(
            "No build found in %s. Run install.sh first "
            "(it builds with REACT_APP_API_URL=.../json-cors/access).\n" % build_dir
        )
        return 1

    GoTvHandler.build_dir = build_dir
    server = ThreadingServer(("127.0.0.1", args.port), GoTvHandler)
    sys.stderr.write(
        "Go TV local server: http://127.0.0.1:%d (build: %s, 127.0.0.1 only)\n"
        % (args.port, build_dir)
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
