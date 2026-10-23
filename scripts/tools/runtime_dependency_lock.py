#!/usr/bin/env python3
"""Generate and verify wheel-only locks on the actual production Alpine platform.

The existing development lock is a version constraint, never an install input.
No package upgrade, source build, cross-platform resolution, or hash fallback is
allowed. Candidate generation does not modify the production Dockerfile.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    from packaging.requirements import Requirement
    from packaging.utils import canonicalize_name
except ImportError:
    # The pinned pip bootstrap provides the parser in an otherwise empty image.
    from pip._vendor.packaging.requirements import Requirement
    from pip._vendor.packaging.utils import canonicalize_name

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
PIP_VERSION = "26.2.2"
LOCK_RELATIVE = "locks/cpython313-alpine324-x86_64"
TARGET = {"python": "3.13.16", "alpine": "3.24", "machine": "x86_64", "libc": "musl"}
INPUTS = {"runtime": "requirements-runtime.txt", "dbtasks": "requirements-db.txt"}
BASELINE = "requirements-dev-constraints.txt"
BOOTSTRAP = "requirements-lock-bootstrap.txt"
HASH_RE = re.compile(r"[0-9a-f]{64}")
MARKERS = {"python_full_version": "3.13.16", "python_version": "3.13", "sys_platform": "linux",
           "implementation_name": "cpython", "implementation_version": "3.13.16",
           "platform_machine": "x86_64", "platform_system": "Linux", "os_name": "posix",
           "platform_python_implementation": "CPython"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def base_image() -> str:
    images = re.findall(r"^FROM (python:\S+)", (BACKEND / "Dockerfile").read_text(), re.M)
    if not images or len(set(images)) != 1 or not re.fullmatch(
        r"python:3\.13\.16-alpine3\.24@sha256:[0-9a-f]{64}", images[0]
    ):
        raise ValueError("review the lock platform when the Docker Python/Alpine image changes")
    return images[0]


def assert_platform() -> None:
    release = Path("/etc/alpine-release")
    if (platform.python_version() != TARGET["python"] or platform.machine() != TARGET["machine"]
            or platform.python_implementation() != "CPython"
            or sys.platform != "linux" or not release.is_file()
            or not release.read_text().strip().startswith(TARGET["alpine"] + ".")
            or not list(Path("/lib").glob("ld-musl-*.so.1"))):
        raise ValueError("requires native CPython 3.13.16, Alpine 3.24, musl, linux/amd64; use CI")
    if importlib.metadata.version("pip") != PIP_VERSION:
        raise ValueError(f"requires resolver pip=={PIP_VERSION}")
    verify_pip_trust_bundle(sys.executable)


def verify_pip_trust_bundle(python: Path | str) -> None:
    """Check the resolver's vendored roots, independently of application certifi."""
    subprocess.run([str(python), "-c", """
import ssl
from pip._vendor import certifi

certificates = ssl.create_default_context(cafile=certifi.where()).get_ca_certs()
if not certificates:
    raise RuntimeError("pip's vendored CA bundle contains no trusted roots")
for certificate in certificates:
    for relative_name in certificate["subject"]:
        if ("commonName", "emSign ECC Root CA - G3") in relative_name:
            raise RuntimeError("pip's vendored CA bundle contains compromised emSign ECC Root CA - G3")
print("pip vendored CA bundle excludes the compromised emSign ECC Root CA - G3")
"""], check=True)


def requirements(path: Path, seen: frozenset[Path] = frozenset()) -> list[Requirement]:
    path = path.resolve()
    if path in seen or path.parent != BACKEND.resolve():
        raise ValueError(f"unsafe or recursive requirements include: {path}")
    result = []
    for raw in path.read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("-r "):
            result.extend(requirements(path.parent / line[3:], seen | {path}))
        else:
            requirement = Requirement(line)
            if requirement.url:
                raise ValueError("direct URLs are forbidden")
            result.append(requirement)
    return result


def baseline() -> dict[str, str]:
    result = {}
    for req in requirements(BACKEND / BASELINE):
        pins = list(req.specifier)
        name = canonicalize_name(req.name)
        if (len(pins) != 1 or pins[0].operator != "==" or "*" in pins[0].version
                or req.marker or req.extras or name in result):
            raise ValueError(f"invalid exact baseline pin: {req}")
        result[name] = pins[0].version
    return result


def bootstrap_hash() -> str:
    lines = [line for line in (BACKEND / BOOTSTRAP).read_text().splitlines()
             if line and not line.startswith("#")]
    match = re.fullmatch(r"pip==" + re.escape(PIP_VERSION) + r" --hash=sha256:([0-9a-f]{64})", "\n".join(lines))
    if match is None:
        raise ValueError("bootstrap must contain exactly one hashed canonical pip pin")
    return match.group(1)


def sources() -> dict[str, str]:
    return {name: digest(BACKEND / name) for name in [*INPUTS.values(), BASELINE, BOOTSTRAP]}


def pip_command(python: Path | str, *args: str) -> None:
    env = {key: value for key, value in os.environ.items() if not key.startswith("PIP_")}
    env.update(PIP_CONFIG_FILE=os.devnull, PIP_DISABLE_PIP_VERSION_CHECK="1")
    subprocess.run([str(python), "-m", "pip", *args], env=env, check=True)


def graph(packages: dict, roots: list[Requirement], environment: dict) -> dict[str, set[str]]:
    """Require the complete reachable closure, including recursively activated extras."""
    active: dict[str, set[str]] = {}
    pending = list(roots)
    while pending:
        req = pending.pop()
        name = canonicalize_name(req.name)
        if req.url or name not in packages or not req.specifier.contains(packages[name]["version"], prereleases=True):
            raise ValueError(f"missing or incompatible transitive requirement: {req}")
        extras = {canonicalize_name(extra) for extra in req.extras}
        old = active.get(name)
        if old is not None and extras <= old:
            continue
        active.setdefault(name, set()).update(extras)
        provides = set(packages[name]["provides_extra"])
        if not active[name] <= provides:
            raise ValueError(f"unknown requested extras: {name}")
        for raw in packages[name]["requires_dist"]:
            dependency = Requirement(raw)
            if dependency.marker is None or any(
                dependency.marker.evaluate({**environment, "extra": extra})
                for extra in {"", *active[name]}
            ):
                pending.append(dependency)
    if set(active) != set(packages):
        raise ValueError(f"unreachable packages in runtime graph: {sorted(set(packages) - set(active))}")
    return active


def roots_for(lane: str, environment: dict) -> list[Requirement]:
    roots = [Requirement(f"pip=={PIP_VERSION}")] if lane == "pip" else requirements(BACKEND / INPUTS[lane])
    return [req for req in roots if req.marker is None or req.marker.evaluate(environment)]


def lock_text(packages: dict, extras: dict[str, set[str]]) -> str:
    lines = ["# Generated by scripts/tools/runtime_dependency_lock.py; do not edit.",
             "# CPython 3.13.16 / Alpine 3.24 / musl / linux/amd64; wheels only."]
    for name, package in sorted(packages.items()):
        suffix = "[" + ",".join(sorted(extras[name])) + "]" if extras[name] else ""
        lines.append(f"{name}{suffix}=={package['version']} --hash=sha256:{package['sha256']}")
    return "\n".join(lines) + "\n"


def normalize_report(report: dict, lane: str) -> dict:
    if report.get("version") != "1" or report.get("pip_version") != PIP_VERSION:
        raise ValueError("unsupported pip installation report or resolver version")
    environment = report["environment"]
    if any(environment.get(key) != value for key, value in MARKERS.items()):
        raise ValueError("pip report was not produced on the supported platform")
    # Kernel-specific markers cannot be locked consistently across runners.
    environment = dict(MARKERS)
    packages = {}
    versions = baseline()
    for item in report["install"]:
        metadata = item["metadata"]
        name = canonicalize_name(metadata["name"])
        version = metadata["version"]
        archive = item["download_info"]
        url = urlsplit(archive["url"])
        wheel = unquote(url.path.rsplit("/", 1)[-1])
        sha = archive.get("archive_info", {}).get("hashes", {}).get("sha256", "")
        if (item.get("is_direct") or item.get("is_yanked") or url.scheme != "https"
                or url.hostname != "files.pythonhosted.org" or url.username or url.password
                or not wheel.endswith(".whl") or not HASH_RE.fullmatch(sha)):
            raise ValueError(f"requires a non-yanked PyPI wheel with SHA256: {name}")
        if versions.get(name) != version:
            raise ValueError(f"unreviewed new/changed baseline pin: {name}=={version}")
        dependencies = sorted(metadata.get("requires_dist", []))
        if any(re.search(r"\bplatform_(release|version)\b", req) for req in dependencies):
            raise ValueError(f"kernel-specific dependency needs explicit review: {name}")
        if name in packages:
            raise ValueError(f"duplicate report package: {name}")
        packages[name] = {"version": version, "sha256": sha, "wheel": wheel,
                          "requires_dist": dependencies,
                          "provides_extra": sorted(canonicalize_name(e) for e in metadata.get("provides_extra", []))}
    graph(packages, roots_for(lane, environment), environment)
    if lane == "pip" and packages["pip"]["sha256"] != bootstrap_hash():
        raise ValueError("resolved pip artifact differs from the reviewed bootstrap hash")
    return {"environment": environment, "packages": dict(sorted(packages.items()))}


def validate(directory: Path) -> dict:
    manifest = json.loads((directory / "manifest.json").read_text())
    if (manifest.get("schema") != 1 or manifest.get("target") != TARGET
            or manifest.get("image") != base_image() or manifest.get("pip") != PIP_VERSION
            or manifest.get("sources") != sources()
            or manifest.get("generator_sha256") != digest(Path(__file__))):
        raise ValueError("stale or incompatible lock provenance; regenerate on the target platform")
    if set(manifest["lanes"]) != {"runtime", "dbtasks", "pip"}:
        raise ValueError("exactly runtime, dbtasks and pip lock lanes are required")
    versions = baseline()
    for lane, data in manifest["lanes"].items():
        packages, environment = data["packages"], data["environment"]
        if environment != MARKERS:
            raise ValueError("unsupported environment marker provenance")
        for name, package in packages.items():
            if (name != canonicalize_name(name) or package["version"] != versions.get(name)
                    or not HASH_RE.fullmatch(package["sha256"]) or not package["wheel"].endswith(".whl")):
                raise ValueError(f"invalid or changed baseline artifact: {name}")
        extras = graph(packages, roots_for(lane, environment), environment)
        if lane == "pip" and packages["pip"]["sha256"] != bootstrap_hash():
            raise ValueError("pip lock must match the reviewed bootstrap hash")
        if (directory / f"requirements-{lane}.lock").read_text() != lock_text(packages, extras):
            raise ValueError(f"non-canonical or tampered {lane} lock")
    runtime = manifest["lanes"]["runtime"]["packages"]
    dbtasks = manifest["lanes"]["dbtasks"]["packages"]
    if any(dbtasks.get(name) != value for name, value in runtime.items()):
        raise ValueError("DB-task lock must extend the identical runtime artifact graph")
    return manifest


def validate_activation(directory: Path) -> None:
    """Never regenerate away missing inputs already required by production."""
    dockerfile = (BACKEND / "Dockerfile").read_text()
    activated = LOCK_RELATIVE in dockerfile or re.search(
        r"requirements-(?:runtime|dbtasks|pip)\.lock", dockerfile
    )
    if activated and not directory.is_dir():
        raise ValueError("activated Dockerfile requires committed runtime locks and provenance")
    if directory.exists():
        # In CI this runs before generated files are copied into the checkout.
        # Missing/partial/stale committed provenance must fail, even when a
        # freshly generated candidate is valid and available for review.
        validate(directory)


def generate(directory: Path) -> None:
    assert_platform()
    manifest = {"schema": 1, "target": TARGET, "image": base_image(), "pip": PIP_VERSION,
                "sources": sources(), "generator_sha256": digest(Path(__file__)), "lanes": {}}
    with tempfile.TemporaryDirectory(prefix="riskhub-runtime-lock-") as tmp:
        staging = Path(tmp)
        for lane in ["runtime", "dbtasks", "pip"]:
            report = staging / "report.json"
            request = [f"pip=={PIP_VERSION}"] if lane == "pip" else ["-r", str(BACKEND / INPUTS[lane])]
            pip_command(sys.executable, "install", "--dry-run", "--ignore-installed", "--no-cache-dir",
                        "--only-binary=:all:", "--index-url", "https://pypi.org/simple", "--report", str(report),
                        "-c", str(BACKEND / BASELINE), *request)
            data = normalize_report(json.loads(report.read_text()), lane)
            manifest["lanes"][lane] = data
            extras = graph(data["packages"], roots_for(lane, data["environment"]), data["environment"])
            (staging / f"requirements-{lane}.lock").write_text(lock_text(data["packages"], extras))
        (staging / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
        validate(staging)
        directory.mkdir(parents=True, exist_ok=True)
        for path in staging.glob("*.lock"):
            (directory / path.name).write_bytes(path.read_bytes())
        (directory / "manifest.json").write_bytes((staging / "manifest.json").read_bytes())


def verify(directory: Path) -> None:
    assert_platform()
    manifest = validate(directory)
    # Resolve only once; two fresh, cache-free installs must consume identical
    # reviewed wheel hashes, including the pip bootstrap. Force consumption even
    # when ensurepip/the base image already contains the locked version; pip
    # otherwise skips artifact hash validation for satisfied requirements.
    for lane in INPUTS:
        for attempt in range(2):
            with tempfile.TemporaryDirectory(prefix=f"riskhub-{lane}-{attempt}-") as tmp:
                subprocess.run([sys.executable, "-m", "venv", tmp], check=True)
                python = Path(tmp) / "bin/python"
                for requirements_file in ["requirements-pip.lock", f"requirements-{lane}.lock"]:
                    pip_command(python, "install", "--force-reinstall", "--no-cache-dir", "--require-hashes", "--only-binary=:all:",
                                "--index-url", "https://pypi.org/simple", "-r", str(directory / requirements_file))
                verify_pip_trust_bundle(python)
                pip_command(python, "check")
                installed = json.loads(subprocess.check_output(
                    [str(python), "-m", "pip", "list", "--format=json", "--disable-pip-version-check"], text=True))
                actual = {canonicalize_name(item["name"]): item["version"] for item in installed}
                expected = {name: item["version"] for name, item in manifest["lanes"][lane]["packages"].items()}
                if actual != {**expected, "pip": PIP_VERSION}:
                    raise ValueError(f"unexpected installed package set: {lane}")
    print("Two clean, hash-enforced installs and pip check passed for each production lane")


def candidate_dockerfile(directory: Path, output: Path) -> None:
    validate(directory)
    text = (BACKEND / "Dockerfile").read_text()
    start = text.index("FROM builder-base AS builder-runtime\n")
    end = text.index("# =============================================================================\n# Stage 2", start)
    blocks = []
    for lane in INPUTS:
        blocks.append(
            f"FROM builder-base AS builder-{lane}\n\n"
            f"COPY {LOCK_RELATIVE}/requirements-pip.lock ./requirements-pip.lock\n"
            f"COPY {LOCK_RELATIVE}/requirements-{lane}.lock ./requirements-{lane}.lock\n"
            "RUN python -m pip install --force-reinstall --no-cache-dir --require-hashes --only-binary=:all: -r requirements-pip.lock && \\\n"
            f"    python -m pip install --force-reinstall --no-cache-dir --user --require-hashes --only-binary=:all: -r requirements-{lane}.lock && \\\n"
            "    python -m pip check\n\n"
        )
    output.write_text(text[:start] + "".join(blocks) + text[end:])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["generate", "validate", "verify", "dockerfile", "preflight"])
    parser.add_argument("--lock-dir", type=Path, default=BACKEND / LOCK_RELATIVE)
    parser.add_argument("--output", type=Path, help="candidate Dockerfile destination; never the production Dockerfile")
    args = parser.parse_args()
    try:
        directory = args.lock_dir.resolve()
        if args.command == "generate":
            generate(directory)
        elif args.command == "verify":
            verify(directory)
        elif args.command == "preflight":
            validate_activation(directory)
            print("Production lock activation contract: valid")
        elif args.command == "validate":
            validate(directory)
            print("Runtime and DB-task lock provenance, hashes and dependency closure: valid")
        else:
            if args.output is None or args.output.resolve() == (BACKEND / "Dockerfile").resolve():
                raise ValueError("provide a separate --output path for the candidate Dockerfile")
            candidate_dockerfile(directory, args.output)
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print(f"runtime-lock error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
