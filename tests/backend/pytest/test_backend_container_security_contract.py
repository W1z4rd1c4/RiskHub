from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SECURITY_DIR = REPO_ROOT / "backend" / "security"
FIXED_IMAGE = (
    "python:3.13.16-alpine3.24@sha256:"
    "2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a"
)


def _runtime_verifier():
    spec = importlib.util.spec_from_file_location(
        "verify_runtime_security", SECURITY_DIR / "verify_runtime_security.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_all_backend_image_lanes_require_fixed_official_packages() -> None:
    dockerfile = (REPO_ROOT / "backend" / "Dockerfile").read_text()
    images = re.findall(r"^FROM (python:\S+) AS (\S+)$", dockerfile, re.MULTILINE)
    assert images == [
        (FIXED_IMAGE, "builder-base"),
        (FIXED_IMAGE, "runtime"),
        (FIXED_IMAGE, "dbtasks"),
    ]
    assert dockerfile.rstrip().endswith("FROM runtime AS final")
    for stage in ("builder-base", "runtime", "dbtasks"):
        body = dockerfile.split(f" AS {stage}\n", maxsplit=1)[1].split(
            "\nFROM ", maxsplit=1
        )[0]
        assert '"zlib>=1.3.2-r1"' in body
        if stage != "builder-base":
            assert "RUN python /tmp/verify_runtime_security.py" in body
    assert "builder-security" not in dockerfile
    assert (
        "COPY --from=builder-base /usr/local/lib/python3.13/tarfile.py"
        not in dockerfile
    )
    assert not (SECURITY_DIR / "apply_cpython_backport.py").exists()


@pytest.mark.parametrize("version", [(3, 13, 15), (3, 12, 15), (3, 14, 8)])
def test_runtime_verifier_rejects_unreviewed_python_releases(
    monkeypatch, version
) -> None:
    verifier = _runtime_verifier()
    monkeypatch.setattr(verifier.sys, "version_info", version)
    with pytest.raises(RuntimeError, match=r"fixed Python 3\.13\.16"):
        verifier.verify_python_release()


@pytest.mark.parametrize("version", [(3, 13, 16), (3, 13, 17)])
def test_runtime_verifier_accepts_fixed_python_release(monkeypatch, version) -> None:
    verifier = _runtime_verifier()
    monkeypatch.setattr(verifier.sys, "version_info", version)
    verifier.verify_python_release()


def test_hostname_regression_rejects_silent_verification_bypass(monkeypatch) -> None:
    verifier = _runtime_verifier()

    class BrokenContext:
        check_hostname = True

        def wrap_bio(self, *_args, **_kwargs):
            return object()

    monkeypatch.setattr(verifier.ssl, "SSLContext", lambda _protocol: BrokenContext())
    with pytest.raises(AssertionError, match="missing verification hostname"):
        verifier.verify_ssl_hostname_validation()


@pytest.mark.skipif(
    sys.version_info[:2] != (3, 13) or sys.version_info[:3] < (3, 13, 16),
    reason="The runtime regressions require the fixed container's Python 3.13.16+",
)
def test_fixed_python_passes_tls_and_tarfile_regressions() -> None:
    verifier = _runtime_verifier()
    verifier.verify_python_release()
    verifier.verify_ssl_hostname_validation()
    verifier.verify_ssl_sni_context_release()
    verifier.verify_tarfile_filters()
