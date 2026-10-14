#!/usr/bin/env python3
"""Check real responses from a built frontend image without replacing its config."""

from __future__ import annotations

import argparse
import http.client
import json
import subprocess
import time
from html.parser import HTMLParser
from pathlib import Path

EXPECTED_HEADERS = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "content-security-policy": (
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; "
        "img-src 'self' data: https: blob:; connect-src 'self' https://login.microsoftonline.com; "
        "frame-src 'self' https://login.microsoftonline.com; frame-ancestors 'none'; "
        "form-action 'self'; base-uri 'self'; object-src 'none';"
    ),
}


def docker(*args: str) -> str:
    return subprocess.check_output(["docker", *args], text=True, stderr=subprocess.STDOUT).strip()


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.assets: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        source = attributes.get("src") if tag == "script" else attributes.get("href") if tag == "link" else None
        if source and source.startswith("/") and not source.startswith("//"):
            for extension in ("js", "css"):
                if source.endswith(f".{extension}"):
                    self.assets.setdefault(extension, source)


def request(port: int, path: str, method: str = "GET", headers: dict[str, str] | None = None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        response_headers: dict[str, list[str]] = {}
        for key, value in response.getheaders():
            response_headers.setdefault(key.lower(), []).append(value)
        return response.status, response_headers, body
    finally:
        connection.close()


def verify(image: str, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    evidence: list[dict] = []
    # The production config resolves backend even though this frontend-only check
    # never proxies requests. Keep the image's config, files, and non-root user.
    container = docker("run", "-d", "--add-host", "backend:127.0.0.1", "-p", "127.0.0.1::80", image)
    try:
        (output / "image-id.txt").write_text(docker("image", "inspect", "--format", "{{.Id}}", image) + "\n")
        (output / "nginx-version.txt").write_text(docker("exec", container, "nginx", "-V") + "\n")
        (output / "nginx-config.txt").write_text(docker("exec", container, "nginx", "-T") + "\n")
        port = int(docker("port", container, "80/tcp").split(":")[-1])
        for attempt in range(30):
            try:
                if request(port, "/nginx-health")[0] == 200:
                    break
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(1)
        else:
            raise AssertionError("nginx did not become ready within 30 seconds")

        def check(path: str, status: int, method: str = "GET", headers: dict[str, str] | None = None):
            actual_status, actual_headers, body = request(port, path, method, headers)
            evidence.append({"path": path, "method": method, "status": actual_status, "headers": actual_headers})
            assert actual_status == status, (path, actual_status, status)
            for name, value in EXPECTED_HEADERS.items():
                assert actual_headers.get(name) == [value], (path, name, actual_headers.get(name))
            print(f"PASS {method} {path}: {status}, all security headers present exactly once", flush=True)
            return actual_headers, body

        _, index = check("/", 200)
        _, spa = check("/risks/42?tab=details", 200)
        assert spa == index, "SPA fallback no longer serves index.html"
        check("/risks/42", 200, "HEAD")
        parser = AssetParser()
        parser.feed(index.decode("utf-8"))
        assert set(parser.assets) == {"js", "css"}, "built index must reference real JS and CSS assets"
        for extension, path in parser.assets.items():
            headers, body = check(path, 200)
            assert body and body != index, (path, "asset must not be the SPA fallback")
            assert headers.get("content-type") == ["application/javascript" if extension == "js" else "text/css"]
            cache_control = ", ".join(headers.get("cache-control", []))
            assert "max-age=31536000" in cache_control and "public, immutable" in cache_control, cache_control
            assert "expires" in headers, (path, "missing expiry")
            check(path, 200, "HEAD")
            assert len(headers.get("etag", [])) == 1, (path, "missing ETag")
            check(path, 304, headers={"If-None-Match": headers["etag"][0]})
        for path in ("/assets/__missing_security_probe__.js", "/assets/__missing_security_probe__.css"):
            headers, body = check(path, 404)
            assert body != index, "missing assets must remain 404 rather than SPA fallback"
            assert "immutable" not in ", ".join(headers.get("cache-control", [])), "404 must not be cached as immutable"
        headers, body = check("/nginx-health", 200)
        assert body == b"healthy\n", body
        assert headers.get("content-type") == ["text/plain"], headers.get("content-type")
        check("/nginx-health", 200, "HEAD")
        check("/.git/config", 403)
    finally:
        (output / "responses.json").write_text(json.dumps(evidence, indent=2) + "\n")
        try:
            (output / "container.log").write_text(docker("logs", container) + "\n")
        finally:
            docker("rm", "-f", container)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="already-built production frontend image")
    parser.add_argument("--output", type=Path, default=Path("tests/results/frontend/nginx-security"))
    args = parser.parse_args()
    verify(args.image, args.output)


if __name__ == "__main__":
    main()
