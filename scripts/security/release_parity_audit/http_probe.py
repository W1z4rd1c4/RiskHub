from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def http_json(url: str, timeout: float = 8.0) -> tuple[int, Any]:
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=timeout) as response:
        status = response.getcode()
        body = response.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = {"_raw": body}
        return status, payload


def http_status(url: str, timeout: float = 8.0) -> int:
    req = Request(url, headers={"Accept": "*/*"})
    with urlopen(req, timeout=timeout) as response:
        return response.getcode()


def wait_http(
    url: str,
    timeout_sec: int = 90,
    expect_status: int | None = None,
    *,
    http_status_func: Callable[[str, float], int] = http_status,
) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            status = http_status_func(url, 4.0)
            if expect_status is None or status == expect_status:
                return True
        except (URLError, HTTPError, TimeoutError, ConnectionError, OSError):
            pass
        time.sleep(1.0)
    return False
