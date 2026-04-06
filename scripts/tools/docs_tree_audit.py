#!/usr/bin/env python3
"""Audit repository documentation topology and markdown-link integrity."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO_ROOT = Path(__file__).resolve().parents[2]
DOCS_DIR = REPO_ROOT / "docs"
PLANNING_DIR = REPO_ROOT / ".planning"

LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
MD_EXTENSIONS = {".md", ".markdown"}
MD_REPORT_MAX_ITEMS = 200

REQUIRED_ENTRYPOINTS = [
    Path("AGENTS.md"),
    Path("docs/README.md"),
    Path("docs/DOCUMENTATION_TREE.md"),
    Path("docs/agent/README.md"),
    Path(".planning/README.md"),
    Path(".planning/phases/README.md"),
]

REQUIRED_CROSSLINKS = [
    (Path("AGENTS.md"), Path("docs/DOCUMENTATION_TREE.md")),
    (Path("AGENTS.md"), Path(".planning/README.md")),
    (Path("docs/README.md"), Path("docs/DOCUMENTATION_TREE.md")),
    (Path("docs/README.md"), Path(".planning/README.md")),
    (Path("docs/agent/README.md"), Path("docs/DOCUMENTATION_TREE.md")),
    (Path("docs/DOCUMENTATION_TREE.md"), Path(".planning/README.md")),
    (Path(".planning/README.md"), Path(".planning/phases/README.md")),
    (Path(".planning/phases/README.md"), Path("docs/reference/LEGACY_PATH_MAP.md")),
]

ROOT_REACHABILITY_ROOTS = [
    Path("AGENTS.md"),
    Path("docs/README.md"),
    Path(".planning/README.md"),
]


@dataclass(frozen=True)
class LinkResult:
    source: str
    line: int
    target: str
    status: str
    reason: str
    resolved_path: str | None
    bucket: str

    @property
    def unresolved(self) -> bool:
        return self.status == "unresolved"

    @property
    def counts_for_crosslink(self) -> bool:
        return self.status == "resolved_repo" and self.resolved_path is not None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Audit docs tree topology and markdown links."
    )
    parser.add_argument(
        "--scope",
        choices=("canonical", "full"),
        default="canonical",
        help="Audit scope. canonical excludes phase archive bodies.",
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help="Optional output directory. Defaults to tests/results/docs/docs-tree-audit-<timestamp>.",
    )
    parser.add_argument(
        "--max-root-hops",
        type=int,
        default=3,
        help="Maximum allowed hop distance from root entrypoints for canonical documentation reachability checks.",
    )
    parser.add_argument(
        "--fail-on-unreachable",
        action="store_true",
        help="Fail the audit when canonical docs are unreachable or exceed --max-root-hops from root entrypoints.",
    )
    return parser.parse_args()


def utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def run_id_now() -> str:
    return datetime.now(timezone.utc).strftime("docs-tree-audit-%Y%m%d-%H%M%S")


def canonical_scope_files() -> list[Path]:
    files: set[Path] = set()
    files.add(Path("AGENTS.md"))
    files.update(
        path.relative_to(REPO_ROOT) for path in DOCS_DIR.rglob("*.md") if path.is_file()
    )

    planning_roots = [
        Path(".planning/README.md"),
        Path(".planning/PROJECT.md"),
        Path(".planning/STATE.md"),
        Path(".planning/ROADMAP.md"),
        Path(".planning/phases/README.md"),
    ]
    for rel in planning_roots:
        abs_path = REPO_ROOT / rel
        if abs_path.is_file():
            files.add(rel)

    files.update(
        path.relative_to(REPO_ROOT)
        for path in (PLANNING_DIR / "codebase").rglob("*.md")
        if path.is_file()
    )
    return sorted(files, key=lambda path: path.as_posix())


def full_scope_files() -> list[Path]:
    files = set(canonical_scope_files())
    files.update(
        path.relative_to(REPO_ROOT)
        for path in (PLANNING_DIR / "phases").rglob("*.md")
        if path.is_file()
    )
    return sorted(files, key=lambda path: path.as_posix())


def bucket_for_source(source: Path) -> str:
    parts = source.parts
    if (
        len(parts) >= 2
        and parts[0] == ".planning"
        and parts[1] == "phases"
        and source.name != "README.md"
    ):
        return "archival"
    return "canonical"


def normalize_target(raw_target: str) -> str:
    value = raw_target.strip()
    if value.startswith("<") and value.endswith(">"):
        value = value[1:-1].strip()

    titled_match = re.match(r"""^(\S+)\s+["'][^"']*["']$""", value)
    if titled_match:
        value = titled_match.group(1).strip()
    elif value and any(char.isspace() for char in value):
        value = value.split()[0].strip()
    return value


def candidate_with_readme(path: Path) -> Path | None:
    if path.is_file():
        return path
    if path.is_dir():
        readme = path / "README.md"
        if readme.is_file():
            return readme
    return None


def as_repo_relative(path: Path) -> str | None:
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return None


def resolve_target(source_rel: Path, target: str) -> tuple[str, str, str | None]:
    if not target:
        return ("ignored", "empty_target", None)

    if target.startswith("#"):
        return ("ignored", "anchor", None)

    if target.startswith(("http://", "https://", "mailto:", "tel:", "data:")):
        return ("ignored", "external", None)

    if target.startswith("javascript:"):
        return ("unresolved", "forbidden_scheme", None)

    raw_no_fragment = target.split("#", 1)[0]
    raw_no_fragment = raw_no_fragment.split("?", 1)[0]

    if re.match(r"^[A-Za-z]:\\Users\\", raw_no_fragment):
        return ("unresolved", "forbidden_local_path_target", raw_no_fragment)

    if target.startswith("file://"):
        parsed = urlparse(target)
        return ("unresolved", "forbidden_local_path_target", unquote(parsed.path))

    if target.startswith("/"):
        if raw_no_fragment.startswith("/Users/") or raw_no_fragment.startswith(
            "/home/"
        ):
            return ("unresolved", "forbidden_local_path_target", raw_no_fragment)

        if Path(raw_no_fragment).suffix.lower() not in MD_EXTENSIONS:
            return ("ignored", "app_route", None)

        repo_path = REPO_ROOT / raw_no_fragment.lstrip("/")
        resolved = candidate_with_readme(repo_path)
        if not resolved:
            return ("unresolved", "missing_repo_absolute_target", None)
        rel = as_repo_relative(resolved)
        if rel is None:
            return ("unresolved", "resolved_outside_repo", str(resolved))
        return ("resolved_repo", "ok", rel)

    if raw_no_fragment == "":
        return ("ignored", "anchor_or_query_only", None)

    source_abs = (REPO_ROOT / source_rel).resolve()
    candidate = (source_abs.parent / raw_no_fragment).resolve()
    resolved = candidate_with_readme(candidate)
    if not resolved:
        return ("unresolved", "missing_relative_target", str(candidate))

    rel = as_repo_relative(resolved)
    if rel is None:
        return ("unresolved", "relative_target_outside_repo", str(resolved))
    return ("resolved_repo", "ok", rel)


def extract_links(source_rel: Path) -> list[tuple[int, str]]:
    source_abs = REPO_ROOT / source_rel
    text = source_abs.read_text(encoding="utf-8")
    links: list[tuple[int, str]] = []
    for match in LINK_RE.finditer(text):
        target = normalize_target(match.group(1))
        line = text.count("\n", 0, match.start()) + 1
        links.append((line, target))
    return links


def check_required_entrypoints() -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for rel in REQUIRED_ENTRYPOINTS:
        records.append(
            {
                "path": rel.as_posix(),
                "exists": (REPO_ROOT / rel).is_file(),
            }
        )
    return records


def evaluate_required_crosslinks(
    resolved_targets_by_source: dict[str, set[str]]
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for source, target in REQUIRED_CROSSLINKS:
        source_key = source.as_posix()
        target_key = target.as_posix()
        records.append(
            {
                "source": source_key,
                "target": target_key,
                "present": target_key
                in resolved_targets_by_source.get(source_key, set()),
            }
        )
    return records


def evaluate_reachability(
    resolved_targets_by_source: dict[str, set[str]], max_root_hops: int
) -> dict[str, object]:
    canonical_files = {path.as_posix() for path in canonical_scope_files()}
    roots = [
        path.as_posix()
        for path in ROOT_REACHABILITY_ROOTS
        if path.as_posix() in canonical_files
    ]
    adjacency: dict[str, set[str]] = {source: set() for source in canonical_files}

    for source, targets in resolved_targets_by_source.items():
        if source not in canonical_files:
            continue
        for target in targets:
            if target in canonical_files:
                adjacency[source].add(target)

    distance: dict[str, int] = {root: 0 for root in roots}
    queue: deque[str] = deque(roots)
    while queue:
        current = queue.popleft()
        for target in adjacency.get(current, set()):
            if target in distance:
                continue
            distance[target] = distance[current] + 1
            queue.append(target)

    unreachable = sorted(canonical_files - set(distance.keys()))
    weakly_connected = sorted(
        path for path, hops in distance.items() if hops > max_root_hops
    )
    return {
        "roots": roots,
        "max_root_hops": max_root_hops,
        "canonical_files_count": len(canonical_files),
        "reachable_count": len(distance),
        "unreachable_count": len(unreachable),
        "weakly_connected_count": len(weakly_connected),
        "unreachable_files": unreachable,
        "weakly_connected_files": [
            {"path": path, "hops": distance[path]} for path in weakly_connected
        ],
    }


def render_markdown_report(payload: dict[str, object]) -> str:
    summary = payload["summary"]
    entrypoints = payload["required_entrypoints"]
    crosslinks = payload["required_crosslinks"]
    unresolved = payload["unresolved"]
    reachability = payload["reachability"]

    lines: list[str] = []
    lines.append("# Documentation Tree Audit")
    lines.append("")
    lines.append(f"- Generated at: `{payload['generated_at_utc']}`")
    lines.append(f"- Run ID: `{payload['run_id']}`")
    lines.append(f"- Scope: `{payload['scope']}`")
    lines.append(f"- Status: `{summary['status']}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Files scanned: `{summary['files_scanned']}`")
    lines.append(f"- Links scanned: `{summary['links_scanned']}`")
    lines.append(
        f"- Missing required entrypoints: `{summary['entrypoint_missing_count']}`"
    )
    lines.append(
        f"- Missing required cross-links: `{summary['crosslink_missing_count']}`"
    )
    lines.append(
        f"- Canonical unresolved links: `{summary['canonical_unresolved_count']}`"
    )
    lines.append(
        f"- Archival unresolved links: `{summary['archival_unresolved_count']}`"
    )
    lines.append(
        f"- Reachability unreachable count: `{summary['reachability_unreachable_count']}`"
    )
    lines.append(
        f"- Reachability weakly connected count: `{summary['reachability_weakly_connected_count']}`"
    )
    lines.append("")
    lines.append("## Required Entrypoints")
    lines.append("")
    lines.append("| Path | Exists |")
    lines.append("|---|---|")
    for item in entrypoints:
        lines.append(f"| `{item['path']}` | `{item['exists']}` |")
    lines.append("")
    lines.append("## Required Cross-Links")
    lines.append("")
    lines.append("| Source | Target | Present |")
    lines.append("|---|---|---|")
    for item in crosslinks:
        lines.append(
            f"| `{item['source']}` | `{item['target']}` | `{item['present']}` |"
        )
    lines.append("")

    lines.append("## Reachability")
    lines.append("")
    lines.append(f"- Roots: `{', '.join(reachability['roots'])}`")
    lines.append(f"- Max root hops: `{reachability['max_root_hops']}`")
    lines.append(f"- Canonical files: `{reachability['canonical_files_count']}`")
    lines.append(f"- Reachable files: `{reachability['reachable_count']}`")
    lines.append(f"- Unreachable files: `{reachability['unreachable_count']}`")
    lines.append(
        f"- Weakly connected files: `{reachability['weakly_connected_count']}`"
    )
    lines.append("")
    if reachability["unreachable_files"]:
        lines.append("### Unreachable Canonical Files")
        lines.append("")
        for path in reachability["unreachable_files"]:
            lines.append(f"- `{path}`")
        lines.append("")
    if reachability["weakly_connected_files"]:
        lines.append("### Weakly Connected Canonical Files")
        lines.append("")
        lines.append("| Path | Hops |")
        lines.append("|---|---:|")
        for item in reachability["weakly_connected_files"]:
            lines.append(f"| `{item['path']}` | `{item['hops']}` |")
        lines.append("")

    for bucket_name in ("canonical", "archival"):
        rows = unresolved.get(bucket_name, [])
        lines.append(f"## Unresolved ({bucket_name})")
        lines.append("")
        lines.append(f"- Count: `{len(rows)}`")
        if rows:
            lines.append("")
            lines.append("| Source | Line | Target | Reason |")
            lines.append("|---|---:|---|---|")
            for item in rows[:MD_REPORT_MAX_ITEMS]:
                lines.append(
                    f"| `{item['source']}` | `{item['line']}` | `{item['target']}` | `{item['reason']}` |"
                )
            if len(rows) > MD_REPORT_MAX_ITEMS:
                lines.append("")
                lines.append(
                    f"- Output truncated in markdown to `{MD_REPORT_MAX_ITEMS}` rows. See JSON for full list."
                )
        lines.append("")

    return "\n".join(lines)


def run_audit(
    scope: str, run_id: str, max_root_hops: int, fail_on_unreachable: bool
) -> tuple[dict[str, object], int]:
    files = canonical_scope_files() if scope == "canonical" else full_scope_files()

    link_results: list[LinkResult] = []
    resolved_targets_by_source: dict[str, set[str]] = {}
    links_scanned = 0

    for source in files:
        source_key = source.as_posix()
        resolved_targets_by_source.setdefault(source_key, set())
        for line, target in extract_links(source):
            links_scanned += 1
            status, reason, resolved_path = resolve_target(source, target)
            result = LinkResult(
                source=source_key,
                line=line,
                target=target,
                status=status,
                reason=reason,
                resolved_path=resolved_path,
                bucket=bucket_for_source(source),
            )
            link_results.append(result)
            if result.counts_for_crosslink:
                resolved_targets_by_source[source_key].add(result.resolved_path)

    required_entrypoints = check_required_entrypoints()
    required_crosslinks = evaluate_required_crosslinks(resolved_targets_by_source)
    reachability = evaluate_reachability(resolved_targets_by_source, max_root_hops)

    unresolved_canonical = [
        result
        for result in link_results
        if result.unresolved and result.bucket == "canonical"
    ]
    unresolved_archival = [
        result
        for result in link_results
        if result.unresolved and result.bucket == "archival"
    ]

    entrypoint_missing_count = sum(
        1 for item in required_entrypoints if not item["exists"]
    )
    crosslink_missing_count = sum(
        1 for item in required_crosslinks if not item["present"]
    )

    has_canonical_violations = (
        entrypoint_missing_count > 0
        or crosslink_missing_count > 0
        or len(unresolved_canonical) > 0
    )
    has_reachability_violations = (
        reachability["unreachable_count"] > 0
        or reachability["weakly_connected_count"] > 0
    )
    if fail_on_unreachable:
        has_canonical_violations = (
            has_canonical_violations or has_reachability_violations
        )
    status = "fail" if has_canonical_violations else "pass"
    exit_code = 1 if has_canonical_violations else 0

    payload: dict[str, object] = {
        "run_id": run_id,
        "generated_at_utc": utc_now_iso(),
        "scope": scope,
        "repo_root": str(REPO_ROOT),
        "required_entrypoints": required_entrypoints,
        "required_crosslinks": required_crosslinks,
        "summary": {
            "status": status,
            "files_scanned": len(files),
            "links_scanned": links_scanned,
            "entrypoint_missing_count": entrypoint_missing_count,
            "crosslink_missing_count": crosslink_missing_count,
            "canonical_unresolved_count": len(unresolved_canonical),
            "archival_unresolved_count": len(unresolved_archival),
            "reachability_unreachable_count": reachability["unreachable_count"],
            "reachability_weakly_connected_count": reachability[
                "weakly_connected_count"
            ],
            "fail_on_unreachable_enabled": fail_on_unreachable,
        },
        "reachability": reachability,
        "unresolved": {
            "canonical": [
                {
                    "source": item.source,
                    "line": item.line,
                    "target": item.target,
                    "reason": item.reason,
                    "resolved_path": item.resolved_path,
                }
                for item in unresolved_canonical
            ],
            "archival": [
                {
                    "source": item.source,
                    "line": item.line,
                    "target": item.target,
                    "reason": item.reason,
                    "resolved_path": item.resolved_path,
                }
                for item in unresolved_archival
            ],
        },
    }
    return payload, exit_code


def resolve_output_dir(arg_output_dir: str, run_id: str) -> Path:
    if arg_output_dir:
        return Path(arg_output_dir).resolve()
    return REPO_ROOT / "tests" / "results" / "docs" / run_id


def main() -> int:
    args = parse_args()
    try:
        run_id = run_id_now()
        payload, audit_exit_code = run_audit(
            args.scope,
            run_id,
            max_root_hops=args.max_root_hops,
            fail_on_unreachable=args.fail_on_unreachable,
        )
        output_dir = resolve_output_dir(args.output_dir, run_id)
        output_dir.mkdir(parents=True, exist_ok=True)

        json_path = output_dir / "docs-tree-audit.json"
        md_path = output_dir / "docs-tree-audit.md"

        json_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
        )
        md_path.write_text(render_markdown_report(payload) + "\n", encoding="utf-8")

        print(f"docs_tree_audit_scope={args.scope}")
        print(f"docs_tree_audit_status={payload['summary']['status']}")
        print(f"docs_tree_audit_json={json_path}")
        print(f"docs_tree_audit_md={md_path}")
        return audit_exit_code
    except (
        Exception
    ) as exc:  # pragma: no cover - defensive path for CLI runtime failures
        print(f"ERROR: docs tree audit runtime failure: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
