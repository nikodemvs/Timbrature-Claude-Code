from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


class ExpoStaticHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        route = unquote(parsed.path)
        route = route.split("?", 1)[0].split("#", 1)[0]

        if route == "/":
            return str((self.directory_path / "index.html").resolve())

        candidate = (self.directory_path / route.lstrip("/")).resolve()
        if candidate.exists():
            return str(candidate)

        if not candidate.suffix:
            html_candidate = candidate.with_suffix(".html")
            if html_candidate.exists():
                return str(html_candidate)

        return str((self.directory_path / "index.html").resolve())

    @property
    def directory_path(self) -> Path:
        return Path(self.directory or ".").resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve una export web di Expo con rewrite delle route.")
    parser.add_argument("--dir", default="dist", help="Cartella da servire")
    parser.add_argument("--host", default="127.0.0.1", help="Host di bind")
    parser.add_argument("--port", type=int, default=8081, help="Porta HTTP")
    args = parser.parse_args()

    directory = Path(args.dir).resolve()
    if not directory.exists():
        raise SystemExit(f"Directory non trovata: {directory}")

    handler = lambda *handler_args, **handler_kwargs: ExpoStaticHandler(
        *handler_args,
        directory=str(directory),
        **handler_kwargs,
    )

    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {directory} on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
