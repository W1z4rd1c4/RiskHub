from pathlib import Path


ENDPOINTS_DIR = Path(__file__).resolve().parents[3] / "backend" / "app" / "api" / "v1" / "endpoints"
AUTH_DIR = ENDPOINTS_DIR / "auth"
FORBIDDEN_401_PATTERNS = (
    "HTTP_401",
    "status.HTTP_401",
    "status_code=401",
    "status_code = 401",
)


def test_non_auth_endpoints_do_not_hardcode_401_responses() -> None:
    offenders: list[str] = []

    for path in ENDPOINTS_DIR.rglob("*.py"):
        if path.is_relative_to(AUTH_DIR):
            continue

        text = path.read_text(encoding="utf-8")
        if any(pattern in text for pattern in FORBIDDEN_401_PATTERNS):
            offenders.append(str(path.relative_to(ENDPOINTS_DIR.parent.parent.parent.parent)))

    assert offenders == [], f"Non-auth endpoints must not hardcode 401 responses: {offenders}"
